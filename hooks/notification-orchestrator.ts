#!/usr/bin/env bun
/**
 * @deprecated NOTIFY-012: This file is deprecated.
 *
 * The file-watching orchestrator has been replaced by direct HTTP event posting.
 * See: notify-service/src/routes/events.ts for the new architecture.
 *
 * The hook now POSTs events directly to the server, which handles:
 * - Transaction state tracking
 * - Duration calculation
 * - Summary generation
 * - Notification dispatch
 *
 * This file is kept for rollback purposes only.
 * DO NOT start this orchestrator - it is no longer needed.
 *
 * New architecture:
 *   notification-hook.ts → POST /events → notify-service → notifications
 *
 * Old architecture (deprecated):
 *   notification-hook.ts → JSONL file → notification-orchestrator.ts → notifications
 */

console.warn('⚠️  DEPRECATED: notification-orchestrator.ts is no longer needed.');
console.warn('    The notification-hook.ts now POSTs events directly to notify-service.');
console.warn('    This orchestrator will exit. See NOTIFY-012 for details.');
console.warn('');
console.warn('    To use the new system, just start notify-service:');
console.warn('    cd notify-service && bun run start');
console.warn('');

// Exit with code 0 to not break scripts that might call this
// process.exit(0);

/**
 * ORIGINAL CODE BELOW - Kept for reference and rollback
 * =======================================================
 *
 * Notification Orchestrator (DEPRECATED)
 *
 * Central coordinator for the notification pipeline:
 * 1. Receive stop event from monitor
 * 2. Check duration threshold
 * 3. Generate summary via Claude headless
 * 4. Dispatch to enabled channels (TTS, Discord)
 *
 * Features:
 * - Channel enable/disable via config
 * - Unified error handling and logging
 * - Parallel channel dispatch where possible
 * - Graceful degradation on channel failures
 */

import { getConfig, validateConfig, type NotificationConfig } from './config';
import { generateSummary, extractFullAIResponse, extractToolUsageFromTranscript, type SummaryInput, type SummaryOutput } from './summarizer';
import { speakNotification, formatForSpeech, isConfigured as isTTSConfigured } from './tts-elevenlabs';
import { sendDiscordNotification, isConfigured as isDiscordConfigured, type DiscordNotification } from './notify-discord';
import { setNotificationCallback, startMonitor } from './notification-monitor';
import { sendRemoteNotification, buildPayload, isRemoteServiceAvailable } from './remote-client';
import { sendRawEvent, type ThinClientResult } from './thin-client';

// Types
export interface NotificationEvent {
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
}

export interface ChannelResult {
  channel: string;
  success: boolean;
  error?: string;
  duration?: number;
}

export interface OrchestrationResult {
  summary: SummaryOutput | null;
  channels: ChannelResult[];
  totalDurationMs: number;
}

/**
 * Debug logger
 */
function debug(config: NotificationConfig, ...args: unknown[]): void {
  if (config.debug) {
    console.error('[orchestrator]', ...args);
  }
}

/**
 * Dispatch notification to TTS channel
 */
async function dispatchTTS(
  config: NotificationConfig,
  summary: SummaryOutput
): Promise<ChannelResult> {
  const startTime = Date.now();

  if (!config.channels.tts.enabled) {
    return { channel: 'tts', success: true, duration: 0 };
  }

  try {
    const speechText = formatForSpeech(summary);
    const result = await speakNotification(speechText);

    return {
      channel: 'tts',
      success: result.success,
      error: result.error,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      channel: 'tts',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Dispatch notification to Discord channel
 */
async function dispatchDiscord(
  config: NotificationConfig,
  summary: SummaryOutput,
  event: NotificationEvent
): Promise<ChannelResult> {
  const startTime = Date.now();

  if (!config.channels.discord.enabled || !config.channels.discord.webhookUrl) {
    return { channel: 'discord', success: true, duration: 0 };
  }

  try {
    const notification: DiscordNotification = {
      taskCompleted: summary.taskCompleted,
      projectName: summary.projectName,
      contextUsagePercent: summary.contextUsagePercent,
      keyOutcomes: summary.keyOutcomes,
      durationMs: event.durationMs,
      filesModified: event.filesModified.length,
      toolsUsed: event.toolsUsed,
    };

    const result = await sendDiscordNotification(notification);

    return {
      channel: 'discord',
      success: result.success,
      error: result.error,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      channel: 'discord',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Dispatch notification to console channel
 */
function dispatchConsole(
  config: NotificationConfig,
  summary: SummaryOutput,
  event: NotificationEvent
): ChannelResult {
  if (!config.channels.console.enabled) {
    return { channel: 'console', success: true, duration: 0 };
  }

  const startTime = Date.now();

  console.log('');
  console.log('========================================');
  console.log(`Task Complete: ${summary.projectName}`);
  console.log('========================================');
  console.log(`${summary.taskCompleted}`);
  console.log('');
  console.log('Key Outcomes:');
  for (const outcome of summary.keyOutcomes) {
    console.log(`  - ${outcome}`);
  }
  console.log('');
  console.log(`Duration: ${Math.round(event.durationMs / 1000)}s`);
  console.log(`Context Usage: ${summary.contextUsagePercent}%`);
  console.log(`Files Modified: ${event.filesModified.length}`);
  console.log('========================================');
  console.log('');

  return {
    channel: 'console',
    success: true,
    duration: Date.now() - startTime,
  };
}

/**
 * Thin client orchestration - sends raw events to server (AC-005, AC-006)
 *
 * This is the new preferred mode for remote orchestration.
 * Key differences from orchestrateRemote:
 * - Sends raw event data (no local summarization)
 * - Does NOT fall back to local processing on failure (clean failure mode)
 */
async function orchestrateThinClient(
  config: NotificationConfig,
  event: NotificationEvent,
  startTime: number
): Promise<OrchestrationResult> {
  debug(config, 'Thin client mode: sending raw event to server...');

  const result: ThinClientResult = await sendRawEvent(config.remoteUrl, event);

  if (result.success) {
    debug(config, 'Thin client: raw event sent successfully');
    return {
      summary: null,  // Summary generated server-side
      channels: [
        { channel: 'thin-client', success: true, duration: Date.now() - startTime },
      ],
      totalDurationMs: Date.now() - startTime,
    };
  }

  // AC-006: Clean failure mode - do NOT fall back to local processing
  // Log warning and return failure result
  if (result.serviceUnavailable) {
    // Warning already logged by thin-client.ts
    debug(config, 'Thin client: service unavailable, notification skipped (no fallback)');
  } else {
    debug(config, `Thin client: failed - ${result.error}`);
  }

  return {
    summary: null,
    channels: [
      {
        channel: 'thin-client',
        success: false,
        error: result.error,
        duration: Date.now() - startTime,
      },
    ],
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Remote orchestration - sends to centralized service with fallback
 *
 * @deprecated Use orchestrateThinClient instead. This mode is kept for
 * backward compatibility but will be removed in a future version.
 */
async function orchestrateRemote(
  config: NotificationConfig,
  event: NotificationEvent,
  startTime: number
): Promise<OrchestrationResult> {
  // First, generate summary locally (needed for remote payload)
  debug(config, 'Generating summary for remote notification...');
  const summaryInput: SummaryInput = {
    promptText: event.promptText,
    sessionName: event.sessionName,
    transcriptPath: event.transcriptPath,
    durationMs: event.durationMs,
    filesModified: event.filesModified,
    toolsUsed: event.toolsUsed,
    stopPayload: event.stopPayload,
    usage: event.usage,
    model: event.model,
  };

  let summary: SummaryOutput;
  try {
    summary = await generateSummary(summaryInput);
  } catch (error) {
    debug(config, 'Summary generation failed:', error);
    summary = {
      taskCompleted: event.promptText?.substring(0, 80) || 'Task completed',
      projectName: event.projectName || 'Unknown Project',  // Use event.projectName, not hardcoded
      contextUsagePercent: 0,
      keyOutcomes: [`Completed in ${Math.round(event.durationMs / 1000)}s`],
    };
  }

  // Extract full AI response for detailed view page
  let fullResponse: string | undefined;
  // Use files/tools from hooks (per-turn tracking) - do NOT fallback to transcript
  // Transcript extraction would give session-wide data, not per-turn data
  const filesModified = event.filesModified;
  const toolsUsed = event.toolsUsed;

  if (event.transcriptPath) {
    const extracted = await extractFullAIResponse(event.transcriptPath);
    if (extracted) {
      fullResponse = extracted;
      debug(config, `Extracted full response: ${fullResponse.length} chars`);
    }
  }

  debug(config, `Per-turn tracking: ${filesModified.length} files, ${toolsUsed.length} tools`);

  // Build remote payload with full response
  const payload = buildPayload(summary.projectName, summary.taskCompleted, {
    durationMs: event.durationMs,
    filesModified: filesModified,  // Pass full file array instead of count
    toolsUsed: toolsUsed,
    contextUsagePercent: summary.contextUsagePercent,
    keyOutcomes: summary.keyOutcomes,
    fullResponse,
    sessionName: event.sessionName,  // Human-friendly session name
    usage: event.usage,  // Token usage from Stop hook
    model: event.model,  // Model used
  });

  // Send to remote service
  const result = await sendRemoteNotification(config, payload);

  if (result.success) {
    debug(config, 'Remote notification sent successfully');
    return {
      summary,
      channels: [
        { channel: 'remote', success: true, duration: Date.now() - startTime },
      ],
      totalDurationMs: Date.now() - startTime,
    };
  }

  // Fallback to local orchestration
  debug(config, `Remote notification failed (${result.error}), falling back to local...`);

  // Continue with local dispatch
  const channelPromises: Promise<ChannelResult>[] = [];
  channelPromises.push(dispatchTTS(config, summary));
  channelPromises.push(dispatchDiscord(config, summary, event));
  const asyncResults = await Promise.all(channelPromises);
  const consoleResult = dispatchConsole(config, summary, event);
  const channels = [...asyncResults, consoleResult];

  return {
    summary,
    channels,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Main orchestration function
 */
export async function orchestrate(
  event: NotificationEvent
): Promise<OrchestrationResult> {
  const config = getConfig();
  const startTime = Date.now();

  debug(config, 'Processing notification event:', {
    transactionId: event.transactionId.substring(0, 8),
    durationMs: event.durationMs,
    filesModified: event.filesModified.length,
  });

  // Check duration threshold
  if (event.durationMs < config.durationThresholdMs) {
    debug(config, 'Below threshold, skipping notification');
    return {
      summary: null,
      channels: [],
      totalDurationMs: Date.now() - startTime,
    };
  }

  // Check if we should use remote mode
  if (config.mode === 'remote') {
    debug(config, 'Remote mode enabled, using thin client mode (AC-005, AC-006)...');
    // Use thin client by default for remote mode (sends raw events, no local fallback)
    return orchestrateThinClient(config, event, startTime);
  }

  // Local mode: Generate summary using session-aware summarization
  debug(config, `Generating summary for session: ${event.sessionName || 'unknown'}...`);
  const summaryInput: SummaryInput = {
    promptText: event.promptText,
    sessionName: event.sessionName,  // Pass session name for persistent agent invocation
    transcriptPath: event.transcriptPath,  // Pass transcript for AI response extraction
    durationMs: event.durationMs,
    filesModified: event.filesModified,
    toolsUsed: event.toolsUsed,
    stopPayload: event.stopPayload,
    usage: event.usage,
    model: event.model,
  };

  let summary: SummaryOutput;
  try {
    summary = await generateSummary(summaryInput);
    debug(config, 'Summary generated:', summary);
  } catch (error) {
    debug(config, 'Summary generation failed:', error);
    // Create minimal fallback
    summary = {
      taskCompleted: event.promptText?.substring(0, 80) || 'Task completed',
      projectName: event.projectName || 'Unknown Project',  // Use event.projectName, not hardcoded
      contextUsagePercent: 0,
      keyOutcomes: [`Completed in ${Math.round(event.durationMs / 1000)}s`],
    };
  }

  // Dispatch to channels in parallel where possible
  debug(config, 'Dispatching to channels...');

  const channelPromises: Promise<ChannelResult>[] = [];

  // TTS is mostly independent
  channelPromises.push(dispatchTTS(config, summary));

  // Discord is fully independent
  channelPromises.push(dispatchDiscord(config, summary, event));

  // Wait for async channels
  const asyncResults = await Promise.all(channelPromises);

  // Console is synchronous
  const consoleResult = dispatchConsole(config, summary, event);

  const channels = [...asyncResults, consoleResult];

  // Log results
  for (const result of channels) {
    if (result.success) {
      debug(config, `Channel ${result.channel}: success (${result.duration}ms)`);
    } else {
      debug(config, `Channel ${result.channel}: failed - ${result.error}`);
    }
  }

  return {
    summary,
    channels,
    totalDurationMs: Date.now() - startTime,
  };
}

/**
 * Start the orchestrator with the monitor
 */
export async function startOrchestrator(): Promise<void> {
  const config = getConfig();
  const warnings = validateConfig(config);

  console.error('[orchestrator] Starting notification orchestrator...');

  // Log configuration
  console.error('[orchestrator] Configuration:');
  console.error(`  - Mode: ${config.mode} ${config.mode === 'remote' ? `(${config.remoteUrl})` : ''}`);
  console.error(`  - Threshold: ${config.durationThresholdMs / 1000}s`);
  console.error(`  - TTS: ${config.channels.tts.enabled ? (isTTSConfigured() ? 'enabled' : 'fallback') : 'disabled'}`);
  console.error(`  - Discord: ${config.channels.discord.enabled ? (isDiscordConfigured() ? 'enabled' : 'disabled (no webhook)') : 'disabled'}`);
  console.error(`  - Console: ${config.channels.console.enabled ? 'enabled' : 'disabled'}`);

  // Log warnings
  for (const warning of warnings) {
    console.error(`[orchestrator] Warning: ${warning}`);
  }

  // Set up the notification callback
  setNotificationCallback(async (event) => {
    try {
      const result = await orchestrate(event);
      debug(config, 'Orchestration complete:', {
        summary: result.summary?.taskCompleted,
        channels: result.channels.map(c => `${c.channel}:${c.success}`),
        totalDurationMs: result.totalDurationMs,
      });
    } catch (error) {
      console.error('[orchestrator] Error:', error);
    }
  });

  // Start the monitor
  await startMonitor();
}

/**
 * Get orchestrator status
 */
export function getStatus(): {
  config: Record<string, unknown>;
  channels: {
    tts: boolean;
    discord: boolean;
    console: boolean;
  };
} {
  const config = getConfig();
  return {
    config: {
      threshold: `${config.durationThresholdMs / 1000}s`,
      debug: config.debug,
    },
    channels: {
      tts: config.channels.tts.enabled && isTTSConfigured(),
      discord: config.channels.discord.enabled && isDiscordConfigured(),
      console: config.channels.console.enabled,
    },
  };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args[0] === '--status') {
    const status = getStatus();
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }

  if (args[0] === '--test') {
    // Test mode: run orchestration with mock event
    const testEvent: NotificationEvent = {
      transactionId: 'test-' + Date.now(),
      sessionId: 'test-session',
      durationMs: 45000,
      promptText: 'Implement notification system with TTS and Discord',
      filesModified: [
        'hooks/notification-hook.ts',
        'hooks/audio-queue.ts',
        'hooks/summarizer.ts',
        'hooks/tts-elevenlabs.ts',
        'hooks/notify-discord.ts',
        'hooks/notification-orchestrator.ts',
      ],
      toolsUsed: ['Read', 'Write', 'Bash', 'Edit'],
      stopPayload: {
        usage: { input_tokens: 50000, output_tokens: 10000 },
      },
    };

    console.log('Running test orchestration...');
    const result = await orchestrate(testEvent);
    console.log('Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  }

  // Normal mode: start orchestrator
  startOrchestrator().catch((error) => {
    console.error('[orchestrator] Fatal error:', error);
    process.exit(1);
  });
}
