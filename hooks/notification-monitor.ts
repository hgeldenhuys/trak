#!/usr/bin/env bun
/**
 * @deprecated NOTIFY-012: This file is deprecated.
 *
 * The file-watching monitor has been replaced by direct HTTP event posting.
 * See: notify-service/src/transaction-tracker.ts for the new architecture.
 *
 * The hook now POSTs events directly to the server, which handles:
 * - Transaction state tracking (in-memory + SQLite persistence)
 * - Duration calculation
 * - Notification triggering
 *
 * This file is kept for rollback purposes only.
 * DO NOT use this monitor - it has fundamental flaws:
 * - In-memory state lost on restart
 * - File position tracking unreliable
 * - Race conditions with JSONL file access
 *
 * New architecture:
 *   notification-hook.ts → POST /events → notify-service → notifications
 *
 * Old architecture (deprecated):
 *   notification-hook.ts → JSONL file → notification-monitor.ts → orchestrator
 */

/**
 * ORIGINAL CODE BELOW - Kept for reference and rollback
 * =======================================================
 *
 * Notification Monitor - Background Event Watcher (DEPRECATED)
 *
 * Persistent background process that watches .claude/logs/hook-events.jsonl
 * for Stop events. Filters transactions exceeding 30 seconds duration.
 * Triggers notification pipeline when threshold is met.
 *
 * Features:
 * - File tailing for real-time event processing
 * - Transaction duration calculation
 * - 30-second threshold filtering
 * - Graceful shutdown handling
 *
 * Usage: bun hooks/notification-monitor.ts
 *        or via monitor-daemon.sh for background operation
 */

import { watch } from 'fs';
import { readFile, stat } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { getSessionName } from 'claude-hooks-sdk';

import { loadConfig } from './config';

// Load .env synchronously BEFORE config (must be sync to set env vars before loadConfig)
const envPath = path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        process.env[key] = value;
      }
    }
  }
}

// Configuration (from config.ts which reads .env) - NOW env vars are set
const config = loadConfig();
const LOG_DIR = path.join(config.projectDir, '.claude/logs');
const LOG_FILE = path.join(LOG_DIR, 'hook-events.jsonl');
const DURATION_THRESHOLD_MS = config.durationThresholdMs;
const DEBUG = config.debug;
const POLL_INTERVAL_MS = 1000; // Polling fallback interval
const STALENESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes - ignore events older than this

// Types
interface HookEventLog {
  eventType: 'UserPromptSubmit' | 'PostToolUse' | 'Stop';
  timestamp: string;
  sessionId: string;
  sessionName?: string;  // Human-friendly name from SessionNamer
  projectName?: string;  // Actual project name from CLAUDE_PROJECT_DIR
  transactionId?: string;  // Session-scoped ID
  promptId?: string;       // Prompt-scoped ID (for deduplication)
  transcriptPath?: string;  // Path to conversation JSONL for AI response extraction
  payload: Record<string, unknown>;
  // Per-turn tracking (added by notification-hook.ts on Stop events)
  filesModified?: string[];
  toolsUsed?: string[];
  // Token usage (from Stop event)
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: string;
  git?: {
    branch?: string;
    commit?: string;
    dirty?: boolean;
    repo?: string;
  };
  conversationContext?: {
    promptText?: string;
    toolName?: string;
    filesModified?: string[];
  };
}

interface TransactionTracker {
  transactionId: string;   // Session-scoped ID
  promptId: string;        // Prompt-scoped ID (for deduplication)
  sessionId: string;
  sessionName?: string;  // Human-friendly name for summary agent lookup
  projectName?: string;  // Actual project name from CLAUDE_PROJECT_DIR
  transcriptPath?: string;  // Path to conversation JSONL for AI response extraction
  startTime: Date;
  promptText?: string;
  filesModified: string[];
  toolsUsed: string[];
}

// State
let lastReadPosition = 0;
const activeTransactions = new Map<string, TransactionTracker>();
const processedTransactions = new Set<string>();  // Deduplication: track already-notified transactions
let isShuttingDown = false;
let isProcessing = false;  // Lock to prevent concurrent processing

// Notification callback - will be set by orchestrator
type NotificationCallback = (event: {
  transactionId: string;
  sessionId: string;
  sessionName?: string;  // Human-friendly name for summary agent invocation
  projectName?: string;  // Actual project name from CLAUDE_PROJECT_DIR
  transcriptPath?: string;  // Path to conversation JSONL for AI response extraction
  durationMs: number;
  promptText?: string;
  filesModified: string[];
  toolsUsed: string[];
  stopPayload: Record<string, unknown>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: string;
}) => Promise<void>;

let onNotificationTriggered: NotificationCallback | null = null;

/**
 * Set the notification callback
 */
export function setNotificationCallback(callback: NotificationCallback): void {
  onNotificationTriggered = callback;
}

/**
 * Process a single event from the log
 */
async function processEvent(event: HookEventLog): Promise<void> {
  // Skip stale events (older than staleness threshold)
  const eventTime = new Date(event.timestamp).getTime();
  const now = Date.now();
  if (now - eventTime > STALENESS_THRESHOLD_MS) {
    if (DEBUG) {
      const ageSeconds = Math.floor((now - eventTime) / 1000);
      console.error(`[monitor] Skipping stale event (${ageSeconds}s old): ${event.eventType}`);
    }
    return;
  }

  // Use sessionId for Map lookups (one active transaction per session)
  // Use promptId for deduplication (unique per prompt-response cycle)
  const sessionKey = event.sessionId;

  switch (event.eventType) {
    case 'UserPromptSubmit': {
      // Get promptId from ContextTracker (falls back to generated ID)
      const promptId = event.promptId || `prompt_${Date.now()}`;

      // Resolve session name from event or lookup via SessionNamer
      let resolvedSessionName = event.sessionName;
      if (!resolvedSessionName) {
        resolvedSessionName = getSessionName(event.sessionId) || undefined;
      }

      // Start tracking new transaction
      const tracker: TransactionTracker = {
        transactionId: event.transactionId || event.sessionId,
        promptId,  // Prompt-scoped ID for deduplication
        sessionId: event.sessionId,
        sessionName: resolvedSessionName,
        projectName: event.projectName,  // Capture from hook event
        transcriptPath: event.transcriptPath,  // Capture for AI response extraction
        startTime: new Date(event.timestamp),
        promptText: event.payload?.prompt as string || event.conversationContext?.promptText,
        filesModified: [],
        toolsUsed: [],
      };
      activeTransactions.set(sessionKey, tracker);
      if (DEBUG) {
        console.error(`[monitor] Transaction started: ${resolvedSessionName || sessionKey.substring(0, 8)}...`);
      }
      break;
    }

    case 'PostToolUse': {
      // Update transaction with tool info (lookup by sessionKey)
      const tracker = activeTransactions.get(sessionKey);
      if (tracker) {
        // Read toolName from conversationContext (where the hook writes it)
        const toolName = event.conversationContext?.toolName as string;
        if (toolName && !tracker.toolsUsed.includes(toolName)) {
          tracker.toolsUsed.push(toolName);
        }
        // Aggregate files modified
        const files = event.conversationContext?.filesModified || [];
        for (const file of files) {
          if (!tracker.filesModified.includes(file)) {
            tracker.filesModified.push(file);
          }
        }
        // Update projectName if not set (in case UserPromptSubmit was missed)
        if (!tracker.projectName && event.projectName) {
          tracker.projectName = event.projectName;
        }
      }
      break;
    }

    case 'Stop': {
      // Calculate duration and trigger notification if threshold met
      const tracker = activeTransactions.get(sessionKey);
      if (!tracker) {
        console.error(`[monitor] Stop event but no tracker for session ${sessionKey.substring(0, 8)} - missed UserPromptSubmit?`);
        break;
      }
      if (tracker) {
        const stopTime = new Date(event.timestamp);
        const durationMs = stopTime.getTime() - tracker.startTime.getTime();

        // Use files/tools from Stop event (per-turn tracking from hook)
        // These override any partially-collected PostToolUse data
        if (event.filesModified && event.filesModified.length > 0) {
          tracker.filesModified = event.filesModified;
        }
        if (event.toolsUsed && event.toolsUsed.length > 0) {
          tracker.toolsUsed = event.toolsUsed;
        }

        // Resolve session name for summary agent invocation
        const sessionName = tracker.sessionName || event.sessionName || getSessionName(tracker.sessionId) || undefined;

        // Use promptId for deduplication (unique per prompt-response cycle)
        const promptId = tracker.promptId;

        if (DEBUG) {
          console.error(
            `[monitor] Transaction ended: ${sessionName || sessionKey.substring(0, 8)}... (${durationMs}ms)`
          );
        }

        if (durationMs >= DURATION_THRESHOLD_MS) {
          // Deduplication: Skip if already processed this prompt
          if (processedTransactions.has(promptId)) {
            if (DEBUG) {
              console.error(`[monitor] Skipping duplicate notification for prompt ${promptId.substring(0, 12)}...`);
            }
          } else {
            processedTransactions.add(promptId);

            if (DEBUG) {
              console.error(
                `[monitor] Threshold exceeded! Triggering notification for ${sessionName || promptId.substring(0, 12)}...`
              );
            }

            // Trigger notification with sessionName, projectName, and transcriptPath
            // Use transcriptPath from Stop event if available (more recent), otherwise from tracker
            const transcriptPath = event.transcriptPath || tracker.transcriptPath;
            // Use projectName from tracker, fallback to Stop event, or derive from path
            const projectName = tracker.projectName || event.projectName;

            if (onNotificationTriggered) {
              try {
                await onNotificationTriggered({
                  transactionId: tracker.transactionId,
                  sessionId: tracker.sessionId,
                  sessionName,
                  projectName,
                  transcriptPath,
                  durationMs,
                  promptText: tracker.promptText,
                  filesModified: tracker.filesModified,
                  toolsUsed: tracker.toolsUsed,
                  stopPayload: event.payload,
                  usage: event.usage,
                  model: event.model,
                });
              } catch (error) {
                console.error('[monitor] Notification callback error:', error);
              }
            } else {
              // Default behavior: log to console
              console.log(
                JSON.stringify({
                  type: 'notification_trigger',
                  transactionId: tracker.transactionId,
                  sessionId: tracker.sessionId,
                  sessionName,
                  projectName,
                  durationMs,
                  promptText: tracker.promptText?.substring(0, 100),
                  filesModified: tracker.filesModified.length,
                  toolsUsed: tracker.toolsUsed,
                })
              );
            }
          }
        }

        // Clean up (delete by sessionKey)
        activeTransactions.delete(sessionKey);
      }
      break;
    }
  }
}

/**
 * Read new events from log file
 */
async function readNewEvents(): Promise<void> {
  // Prevent concurrent processing (race condition fix)
  if (isProcessing) {
    if (DEBUG) {
      console.error('[monitor] Skipping read - already processing');
    }
    return;
  }

  if (!existsSync(LOG_FILE)) {
    return;
  }

  isProcessing = true;

  try {
    const stats = await stat(LOG_FILE);
    const fileSize = stats.size;
    console.error(`[monitor] File size: ${fileSize}, lastPosition: ${lastReadPosition}`);

    if (fileSize <= lastReadPosition) {
      // File may have been truncated or no new data
      if (fileSize < lastReadPosition) {
        lastReadPosition = 0; // Reset on truncation
      }
      isProcessing = false;
      return;
    }

    // Update position BEFORE processing to prevent re-reads
    const previousPosition = lastReadPosition;
    lastReadPosition = fileSize;

    // Read ONLY the new bytes (not the whole file)
    const fd = await import('fs').then(fs => fs.promises.open(LOG_FILE, 'r'));
    try {
      const buffer = Buffer.alloc(fileSize - previousPosition);
      await fd.read(buffer, 0, buffer.length, previousPosition);
      const newContent = buffer.toString('utf-8');

      // Process new lines
      const newLines = newContent.split('\n').filter(line => line.trim());
      console.error(`[monitor] Processing ${newLines.length} new lines`);
      for (const line of newLines) {
        try {
          const event = JSON.parse(line) as HookEventLog;
          console.error(`[monitor] Got event: ${event.eventType} session=${event.sessionId?.substring(0, 8)}`);
          await processEvent(event);
        } catch (parseError) {
          if (DEBUG) {
            console.error('[monitor] Failed to parse event:', parseError);
          }
        }
      }
    } finally {
      await fd.close();
    }
  } catch (error) {
    if (DEBUG) {
      console.error('[monitor] Error reading log file:', error);
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the monitor
 */
export async function startMonitor(): Promise<void> {
  console.error('[monitor] Starting notification monitor...');
  console.error(`[monitor] Watching: ${LOG_FILE}`);
  console.error(`[monitor] Threshold: ${DURATION_THRESHOLD_MS}ms`);

  // Skip to end of file on startup - only process new events
  if (existsSync(LOG_FILE)) {
    try {
      const stats = await stat(LOG_FILE);
      lastReadPosition = stats.size;
      console.error(`[monitor] Starting from end of file (position ${lastReadPosition})`);
    } catch (e) {
      // File doesn't exist yet, start from 0
      lastReadPosition = 0;
    }
  }

  // Watch for file changes
  if (existsSync(LOG_FILE)) {
    const watcher = watch(LOG_FILE, async (eventType) => {
      if (eventType === 'change' && !isShuttingDown) {
        await readNewEvents();
      }
    });

    // Handle shutdown
    process.on('SIGINT', () => {
      console.error('[monitor] Shutting down...');
      isShuttingDown = true;
      watcher.close();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.error('[monitor] Shutting down...');
      isShuttingDown = true;
      watcher.close();
      process.exit(0);
    });
  }

  // Fallback polling for when file doesn't exist yet
  console.error('[monitor] Starting polling every', POLL_INTERVAL_MS, 'ms');
  const pollInterval = setInterval(async () => {
    if (!isShuttingDown) {
      console.error('[monitor] Polling tick...');
      await readNewEvents();
    }
  }, POLL_INTERVAL_MS);

  // Keep process running
  await new Promise(() => {});
}

/**
 * Get monitor status
 */
export function getStatus(): {
  activeTransactions: number;
  lastReadPosition: number;
  logFile: string;
} {
  return {
    activeTransactions: activeTransactions.size,
    lastReadPosition,
    logFile: LOG_FILE,
  };
}

// CLI entry point
if (import.meta.main) {
  startMonitor().catch((error) => {
    console.error('[monitor] Fatal error:', error);
    process.exit(1);
  });
}
