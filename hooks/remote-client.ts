#!/usr/bin/env bun
/**
 * Remote Notification Client
 *
 * Sends notifications to the centralized notification service.
 * Includes connection timeout, retry logic, and graceful fallback
 * to local orchestration when the service is unavailable.
 *
 * Follows pattern: Pi:graceful-fallback-for-external-dependencies
 */

import type { NotificationConfig } from './config';

const DEBUG = process.env.NOTIFICATION_DEBUG === 'true';

// Configuration
const CONNECTION_TIMEOUT_MS = 2000;
const MAX_RETRIES = 1;

/**
 * Notification payload for remote service
 */
export interface RemoteNotificationPayload {
  project: string;
  summary: string;
  fullResponse?: string;  // Full AI response for detailed view page
  channelPrefs?: {
    tts?: boolean;
    discord?: boolean;
    console?: boolean;
  };
  metadata?: {
    durationMs?: number;
    filesModified?: string[];  // Array of file paths (changed from count for richer display)
    toolsUsed?: string[];
    contextUsagePercent?: number;
    keyOutcomes?: string[];
    sessionName?: string;  // Human-friendly session name (e.g., "brave-elephant")
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    model?: string;
  };
}

/**
 * Response from remote service
 */
export interface RemoteNotifyResponse {
  success: boolean;
  queued: boolean;
  queuePosition?: number;
  channels: {
    tts: boolean;
    discord: boolean;
    console: boolean;
  };
  error?: string;
}

/**
 * Result of remote notification attempt
 */
export interface RemoteNotifyResult {
  success: boolean;
  response?: RemoteNotifyResponse;
  error?: string;
  fallbackTriggered: boolean;
}

/**
 * Check if the remote service is available
 */
export async function isRemoteServiceAvailable(config: NotificationConfig): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

    const response = await fetch(`${config.remoteUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Send notification to remote service with timeout and retry
 */
export async function sendRemoteNotification(
  config: NotificationConfig,
  payload: RemoteNotificationPayload
): Promise<RemoteNotifyResult> {
  const url = `${config.remoteUrl}/notify`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

      if (DEBUG) {
        console.error(`[remote-client] Sending notification to ${url} (attempt ${attempt + 1})`);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as RemoteNotifyResponse;
        if (DEBUG) {
          console.error('[remote-client] Notification sent successfully');
        }
        return {
          success: true,
          response: data,
          fallbackTriggered: false,
        };
      }

      const errorText = await response.text();
      if (DEBUG) {
        console.error(`[remote-client] Server error: ${response.status} - ${errorText}`);
      }

      // Don't retry on client errors
      if (response.status >= 400 && response.status < 500) {
        return {
          success: false,
          error: `Server error: ${response.status} - ${errorText}`,
          fallbackTriggered: true,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (DEBUG) {
        console.error(`[remote-client] Request failed: ${errorMessage}`);
      }

      // On last attempt, return failure
      if (attempt === MAX_RETRIES) {
        return {
          success: false,
          error: `Connection failed after ${MAX_RETRIES + 1} attempts: ${errorMessage}`,
          fallbackTriggered: true,
        };
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return {
    success: false,
    error: 'Max retries exceeded',
    fallbackTriggered: true,
  };
}

/**
 * Build notification payload from event data
 */
export function buildPayload(
  projectName: string,
  summary: string,
  options?: {
    durationMs?: number;
    filesModified?: string[];  // Array of file paths
    toolsUsed?: string[];
    contextUsagePercent?: number;
    keyOutcomes?: string[];
    fullResponse?: string;
    sessionName?: string;  // Human-friendly session name
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    model?: string;
  }
): RemoteNotificationPayload {
  return {
    project: projectName,
    summary,
    fullResponse: options?.fullResponse,
    metadata: options ? {
      durationMs: options.durationMs,
      filesModified: options.filesModified,
      toolsUsed: options.toolsUsed,
      contextUsagePercent: options.contextUsagePercent,
      keyOutcomes: options.keyOutcomes,
      sessionName: options.sessionName,
      usage: options.usage,
      model: options.model,
    } : undefined,
  };
}

// CLI entry point for testing
if (import.meta.main) {
  const { loadConfig } = await import('./config');

  const config = loadConfig();

  console.log('Remote Notification Client');
  console.log('==========================');
  console.log('');
  console.log('Mode:', config.mode);
  console.log('Remote URL:', config.remoteUrl);
  console.log('');

  if (config.mode !== 'remote') {
    console.log('Note: Mode is not "remote". Set NOTIFICATION_MODE=remote to use remote service.');
    console.log('');
  }

  console.log('Checking remote service availability...');
  const available = await isRemoteServiceAvailable(config);
  console.log('Remote service available:', available);

  if (available) {
    console.log('');
    console.log('Sending test notification...');
    const result = await sendRemoteNotification(config, {
      project: 'Test Project',
      summary: 'This is a test notification from the remote client CLI.',
      metadata: {
        durationMs: 30000,
        filesModified: [
          'hooks/remote-client.ts',
          'hooks/notification-orchestrator.ts',
          'src/types.ts',
          'src/channels/discord.ts',
          'src/routes/response.ts',
        ],
        toolsUsed: ['Read', 'Write', 'Bash'],
      },
    });
    console.log('Result:', JSON.stringify(result, null, 2));
  }
}
