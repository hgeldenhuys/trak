#!/usr/bin/env bun
/**
 * Notification Hook - Direct Event Posting (NOTIFY-012)
 *
 * Simplified hook that POSTs all events directly to notify-service.
 * No more JSONL file writing or local orchestrator needed.
 *
 * Uses:
 * - claude-hooks-sdk for event handling
 * - ProjectIdentityManager for persistent project UUID
 * - Direct HTTP POST to notify-service /events endpoint
 *
 * Events: SessionStart, UserPromptSubmit, PostToolUse, Stop
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  HookManager,
  success,
  createLogger,
  FileChangeTracker,
  SessionNamer,
  PersistentState,
  getGitContext,
  type GitContext,
} from 'claude-hooks-sdk';
import { getOrCreateProjectIdentity, type ProjectIdentity } from './project-identity';
import { loadConfig, type NotificationConfig } from './config';

// Configuration
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const DEBUG = process.env.NOTIFICATION_HOOK_DEBUG === 'true';
const LOG_DIR = path.join(PROJECT_DIR, '.claude/logs');

// Config hot-reload: cache config but invalidate when file changes
const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.claude-notify', 'config.json');
let cachedConfig: NotificationConfig | null = null;
let configMtime: number = 0;

function getNotificationConfig(): NotificationConfig {
  // Check if config file has changed (hot-reload support)
  try {
    const stats = fs.statSync(GLOBAL_CONFIG_PATH);
    const currentMtime = stats.mtimeMs;

    if (cachedConfig && currentMtime === configMtime) {
      // File unchanged, use cache
      return cachedConfig;
    }

    // File changed or first load - reload config
    cachedConfig = loadConfig();
    configMtime = currentMtime;

    if (DEBUG) {
      console.log(`[notify-hook] Config reloaded (mtime: ${new Date(currentMtime).toISOString()})`);
    }

    return cachedConfig;
  } catch {
    // Config file doesn't exist yet, load from env/defaults
    if (!cachedConfig) {
      cachedConfig = loadConfig();
    }
    return cachedConfig;
  }
}

// Get the service URL - use remoteUrl from config if set, otherwise fall back to env/default
function getServiceUrl(): string {
  const config = getNotificationConfig();
  // If remoteUrl is explicitly configured and not the default, use it
  if (config.remoteUrl && config.remoteUrl !== 'http://127.0.0.1:7777') {
    return config.remoteUrl;
  }
  // Fall back to env var or default
  return process.env.NOTIFY_SERVICE_URL || 'http://127.0.0.1:7777';
}

// Initialize logger
const logger = createLogger('notification-hook');

// Initialize SDK components
const fileTracker = new FileChangeTracker();
const sessionState = new PersistentState({
  storage: 'file',
  path: path.join(LOG_DIR, 'main-session.json'),
});

// Cache project identity
let cachedProjectIdentity: ProjectIdentity | null = null;

// Types
interface MainSessionData {
  sessionId: string;
  sessionName: string;
  startedAt: string;
  userPromptReceived?: boolean;
  filesModified: string[];
  toolsUsed: string[];
}

// Get or create project identity
function getProjectIdentity(): ProjectIdentity {
  if (!cachedProjectIdentity) {
    cachedProjectIdentity = getOrCreateProjectIdentity(PROJECT_DIR);
  }
  return cachedProjectIdentity;
}

// Convert SDK GitContext to EventPayload format
function formatGitContext(git: GitContext | null): Record<string, unknown> | undefined {
  if (!git) return undefined;
  return {
    repo: git.remote,
    branch: git.branch,
    commit: git.commit,
    dirty: git.isDirty,
  };
}

/**
 * Post event to notify-service
 */
async function postEvent(event: Record<string, unknown>): Promise<void> {
  const url = getServiceUrl();
  const config = getNotificationConfig();

  try {
    // Build headers - include Bearer token if SDK key is configured
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.sdkKey) {
      headers['Authorization'] = `Bearer ${config.sdkKey}`;
    }

    const response = await fetch(`${url}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    // Handle 401 gracefully - log warning but don't crash
    if (response.status === 401) {
      logger.error('[notify-hook] Authentication failed - check SDK key in ~/.claude-notify/config.json');
      return;
    }

    if (DEBUG) {
      const result = await response.json();
      logger.info(`Posted ${event.eventType}: ${result.success ? 'OK' : result.error}`);
    }
  } catch (error) {
    // Non-blocking: log error but don't fail the hook
    if (DEBUG) {
      logger.error(`Failed to post event: ${error}`);
    }
  }
}

// Session state helpers using PersistentState
async function getMainSession(): Promise<MainSessionData | null> {
  return await sessionState.get<MainSessionData>('main');
}

async function setMainSession(sessionId: string, sessionName: string): Promise<MainSessionData> {
  const data: MainSessionData = {
    sessionId,
    sessionName,
    startedAt: new Date().toISOString(),
    filesModified: [],
    toolsUsed: [],
  };
  await sessionState.set('main', data);
  return data;
}

async function addTrackedFile(filePath: string): Promise<void> {
  const main = await getMainSession();
  if (main && !main.filesModified.includes(filePath)) {
    main.filesModified.push(filePath);
    await sessionState.set('main', main);
  }
}

async function addTrackedTool(toolName: string): Promise<void> {
  const main = await getMainSession();
  if (main && !main.toolsUsed.includes(toolName)) {
    main.toolsUsed.push(toolName);
    await sessionState.set('main', main);
  }
}

async function clearTurnTracking(): Promise<void> {
  const main = await getMainSession();
  if (main) {
    main.filesModified = [];
    main.toolsUsed = [];
    main.userPromptReceived = true;
    await sessionState.set('main', main);
  }
}

async function getTrackedFiles(): Promise<string[]> {
  const main = await getMainSession();
  return main?.filesModified || [];
}

async function getTrackedTools(): Promise<string[]> {
  const main = await getMainSession();
  return main?.toolsUsed || [];
}

async function clearMainSession(): Promise<void> {
  await sessionState.delete('main');
}

async function isMainSession(sessionId: string): Promise<boolean> {
  const main = await getMainSession();
  return main?.sessionId === sessionId;
}

async function getMainSessionName(): Promise<string | null> {
  const main = await getMainSession();
  return main?.sessionName || null;
}

// Check if session name indicates a summary agent (skip these)
function isSummaryAgent(sessionName?: string): boolean {
  return sessionName?.endsWith('-summary') ?? false;
}

/**
 * Extract raw transcript data for the CURRENT TRANSACTION only
 * A transaction = UserPrompt → Stop (all assistant messages after last user message)
 *
 * Reads the transcript file and extracts:
 * - Last AI response (full text)
 * - User prompt that started this transaction
 * - Tool calls with inputs (only from THIS transaction)
 */
async function extractTranscriptData(transcriptPath: string): Promise<{
  aiResponse: string | null;
  userPrompt: string | null;
  toolCalls: Array<{ tool: string; input: Record<string, unknown> }>;
}> {
  const result = {
    aiResponse: null as string | null,
    userPrompt: null as string | null,
    toolCalls: [] as Array<{ tool: string; input: Record<string, unknown> }>,
  };

  try {
    const content = await fs.promises.readFile(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Find the index of the LAST user message - this marks the start of current transaction
    let lastUserMessageIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const record = JSON.parse(lines[i]);
        if (record.type === 'user') {
          lastUserMessageIndex = i;
          // Extract user prompt
          if (typeof record.message?.content === 'string') {
            result.userPrompt = record.message.content;
          } else if (Array.isArray(record.message?.content)) {
            const textContent = record.message.content.find((c: { type: string }) => c.type === 'text');
            if (textContent?.text) {
              result.userPrompt = textContent.text;
            }
          }
          break;
        }
      } catch {
        continue;
      }
    }

    // Now extract data only from records AFTER the last user message (current transaction)
    const transactionStart = lastUserMessageIndex >= 0 ? lastUserMessageIndex + 1 : 0;

    for (let i = transactionStart; i < lines.length; i++) {
      try {
        const record = JSON.parse(lines[i]);

        if (record.type === 'assistant' && record.message?.content) {
          for (const block of record.message.content) {
            // Extract text for AI response (last one wins)
            if (block.type === 'text' && block.text) {
              result.aiResponse = block.text;
            }

            // Extract tool calls (only stateful tools)
            if (block.type === 'tool_use' && block.name) {
              const statefulTools = ['Edit', 'Write', 'NotebookEdit', 'Bash'];
              if (statefulTools.includes(block.name)) {
                result.toolCalls.push({
                  tool: block.name,
                  input: block.input || {},
                });
              }
            }
          }
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    if (DEBUG) {
      logger.error(`Failed to extract transcript data: ${error}`);
    }
  }

  return result;
}

// Create the hook manager
const manager = new HookManager({
  logEvents: DEBUG,
  clientId: 'notification-hook',
  enableContextTracking: true,
  trackEdits: true,
});

/**
 * SessionStart Handler
 */
manager.onSessionStart(async (input) => {
  const sessionId = input.session_id;
  const identity = getProjectIdentity();

  // Ensure session has a friendly name
  const namer = new SessionNamer();
  const sessionName = namer.getOrCreateName(sessionId, input.source || 'startup');

  const existingMain = await getMainSession();
  const isStale = existingMain &&
    (Date.now() - new Date(existingMain.startedAt).getTime() > 60000);

  if (!existingMain || isStale) {
    await setMainSession(sessionId, sessionName);
  }

  // Get per-project Discord webhook URL (NOTIFY-003)
  const config = getNotificationConfig();

  // Post SessionStart event
  await postEvent({
    eventType: 'SessionStart',
    sessionId,
    sessionName,
    projectId: identity.projectId,
    projectName: identity.projectName,
    timestamp: new Date().toISOString(),
    cwd: input.cwd,
    // Per-project channel overrides (NOTIFY-003, NOTIFY-004)
    discordWebhookUrl: config.discordWebhookUrl,
    voiceId: config.voiceId,
  });

  return success();
});

/**
 * SessionEnd Handler
 */
manager.onSessionEnd(async (input) => {
  if (await isMainSession(input.session_id)) {
    await clearMainSession();
  }
  return success();
});

/**
 * UserPromptSubmit Handler
 */
manager.onUserPromptSubmit(async (input, context) => {
  const sessionId = input.session_id;
  const identity = getProjectIdentity();

  // Ensure session has a friendly name
  const namer = new SessionNamer();
  const sessionName = namer.getOrCreateName(sessionId, 'prompt');

  const currentMain = await getMainSession();

  // Handle session registration
  if (!currentMain) {
    await setMainSession(sessionId, sessionName);
  } else if (!currentMain.userPromptReceived && currentMain.sessionId !== sessionId) {
    await setMainSession(sessionId, sessionName);
  }

  // Clear turn tracking for new prompt
  await clearTurnTracking();

  // Get git context
  const git = getGitContext(PROJECT_DIR);

  // Post UserPromptSubmit event
  await postEvent({
    eventType: 'UserPromptSubmit',
    sessionId,
    sessionName: await getMainSessionName() || sessionName,
    projectId: identity.projectId,
    projectName: identity.projectName,
    timestamp: new Date().toISOString(),
    transcriptPath: input.transcript_path,
    cwd: input.cwd,
    promptText: input.prompt,
    git: formatGitContext(git),
  });

  return success();
});

/**
 * PostToolUse Handler - Track file changes and tools
 */
manager.onPostToolUse(async (input, context) => {
  const sessionId = input.session_id;
  const toolName = input.tool_name;
  const identity = getProjectIdentity();

  // Track the tool for this session
  await addTrackedTool(toolName);

  // Record file change using SDK tracker
  const change = fileTracker.recordChange(input);
  if (change) {
    await addTrackedFile(change.file);
  }

  // Post PostToolUse event
  await postEvent({
    eventType: 'PostToolUse',
    sessionId,
    sessionName: await getMainSessionName() || undefined,
    projectId: identity.projectId,
    projectName: identity.projectName,
    timestamp: new Date().toISOString(),
    toolName,
    toolInput: input.tool_input,
  });

  return success();
});

/**
 * Stop Handler - Extract raw transcript data and send to server
 * The server does ALL processing (summary, TTS, Discord, response page)
 */
manager.onStop(async (input) => {
  const sessionId = input.session_id;
  const sessionName = input.session_name;
  const identity = getProjectIdentity();

  // Skip summary agents
  if (isSummaryAgent(sessionName)) {
    if (DEBUG) {
      logger.info(`Ignoring Stop from summary agent: ${sessionName}`);
    }
    return success();
  }

  // Get git context
  const git = getGitContext(PROJECT_DIR);

  // Get accumulated files/tools (from PostToolUse tracking)
  const filesModified = await getTrackedFiles();
  const toolsUsed = await getTrackedTools();

  // Extract raw transcript data for server to process
  let transcriptData = {
    aiResponse: null as string | null,
    userPrompt: null as string | null,
    toolCalls: [] as Array<{ tool: string; input: Record<string, unknown> }>,
  };

  if (input.transcript_path) {
    transcriptData = await extractTranscriptData(input.transcript_path);
    if (DEBUG) {
      logger.info(`Extracted: ${transcriptData.aiResponse?.length || 0} chars response, ${transcriptData.toolCalls.length} tool calls`);
    }
  }

  // Get per-project Discord webhook URL (NOTIFY-003)
  const config = getNotificationConfig();

  // Post Stop event with ALL raw data - server does the processing
  await postEvent({
    eventType: 'Stop',
    sessionId,
    sessionName: await getMainSessionName() || sessionName,
    projectId: identity.projectId,
    projectName: identity.projectName,
    timestamp: new Date().toISOString(),
    transcriptPath: input.transcript_path,
    cwd: input.cwd,
    filesModified,
    toolsUsed,
    // Raw transcript data for server to process
    aiResponse: transcriptData.aiResponse,
    userPrompt: transcriptData.userPrompt,
    toolCalls: transcriptData.toolCalls,
    // Token usage
    usage: input.usage ? {
      inputTokens: input.usage.input_tokens,
      outputTokens: input.usage.output_tokens,
      cacheRead: input.usage.cache_read_input_tokens,
      cacheWrite: input.usage.cache_creation_input_tokens,
    } : undefined,
    model: input.model,
    stopReason: input.stop_hook_reason,
    git: formatGitContext(git),
    // Per-project channel overrides (NOTIFY-003, NOTIFY-004)
    discordWebhookUrl: config.discordWebhookUrl,
    voiceId: config.voiceId,
  });

  if (DEBUG) {
    logger.info(`Stop: ${filesModified.length} files, ${toolsUsed.length} tools, response: ${transcriptData.aiResponse ? 'yes' : 'no'}`);
  }

  return success();
});

// Run the hook
if (DEBUG) {
  logger.info('Notification hook started (direct POST mode)');
}
manager.run();
