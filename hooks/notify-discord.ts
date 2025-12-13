#!/usr/bin/env bun
/**
 * Discord Webhook Notification Channel
 *
 * Sends formatted task completion notifications to Discord via webhook.
 *
 * Features:
 * - Discord embed formatting with rich fields
 * - Retry logic with exponential backoff
 * - Optional channel/role mentions
 * - Rate limiting awareness
 *
 * Environment variables:
 * - DISCORD_WEBHOOK_URL: Required webhook URL
 * - DISCORD_MENTION_ROLE: Optional role ID to mention
 * - DISCORD_USERNAME: Optional custom bot username
 */

// Configuration
const DEBUG = process.env.NOTIFICATION_DEBUG === 'true';
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const MENTION_ROLE = process.env.DISCORD_MENTION_ROLE;
const BOT_USERNAME = process.env.DISCORD_USERNAME || 'Claude Code';
const BOT_AVATAR = 'https://www.anthropic.com/images/icons/apple-touch-icon.png';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Types
export interface DiscordNotification {
  taskCompleted: string;
  projectName: string;
  contextUsagePercent: number;
  keyOutcomes: string[];
  durationMs: number;
  filesModified?: number;
  toolsUsed?: string[];
}

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds: DiscordEmbed[];
}

export interface NotifyResult {
  success: boolean;
  error?: string;
  statusCode?: number;
  retries?: number;
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Get color based on task completion characteristics
 */
function getColorForTask(notification: DiscordNotification): number {
  // Green for tasks with file changes (productive work)
  if (notification.filesModified && notification.filesModified > 0) {
    return 0x00ff00;
  }
  // Blue for long-running tasks without file changes (research, analysis)
  if (notification.durationMs > 60000) {
    return 0x5865F2; // Discord blurple
  }
  // Default gray for quick tasks
  return 0x99AAB5;
}

/**
 * Build Discord embed from notification data
 */
function buildEmbed(notification: DiscordNotification): DiscordEmbed {
  const fields: DiscordEmbed['fields'] = [];

  // Key outcomes
  if (notification.keyOutcomes.length > 0) {
    fields.push({
      name: 'Key Outcomes',
      value: notification.keyOutcomes.map(o => `- ${o}`).join('\n'),
      inline: false,
    });
  }

  // Duration
  fields.push({
    name: 'Duration',
    value: formatDuration(notification.durationMs),
    inline: true,
  });

  // Files modified count (only show if > 0)
  if (notification.filesModified !== undefined && notification.filesModified > 0) {
    fields.push({
      name: 'Files Modified',
      value: notification.filesModified.toString(),
      inline: true,
    });
  }

  // Tools are intentionally omitted from Discord summary - they're in the detailed report

  return {
    title: `Task Complete: ${notification.projectName}`,
    description: notification.taskCompleted,
    color: getColorForTask(notification),
    fields,
    footer: {
      text: 'Claude Code Notification',
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send notification to Discord
 */
export async function sendDiscordNotification(
  notification: DiscordNotification
): Promise<NotifyResult> {
  if (!WEBHOOK_URL) {
    if (DEBUG) {
      console.error('[discord] No DISCORD_WEBHOOK_URL set');
    }
    return {
      success: false,
      error: 'DISCORD_WEBHOOK_URL not configured',
    };
  }

  const embed = buildEmbed(notification);

  const payload: DiscordWebhookPayload = {
    username: BOT_USERNAME,
    avatar_url: BOT_AVATAR,
    embeds: [embed],
  };

  // Add mention if configured
  if (MENTION_ROLE) {
    payload.content = `<@&${MENTION_ROLE}>`;
  }

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      lastStatusCode = response.status;

      if (response.ok) {
        if (DEBUG) {
          console.error(`[discord] Notification sent successfully`);
        }
        return {
          success: true,
          statusCode: response.status,
          retries: attempt,
        };
      }

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY_MS * (attempt + 1);
        if (DEBUG) {
          console.error(`[discord] Rate limited, waiting ${waitMs}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      // Other error
      const errorText = await response.text();
      lastError = `Discord API error: ${response.status} - ${errorText}`;

      if (DEBUG) {
        console.error(`[discord] Error:`, lastError);
      }

      // Don't retry client errors (except rate limiting)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        break;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      if (DEBUG) {
        console.error(`[discord] Request error:`, lastError);
      }
    }

    // Wait before retry
    if (attempt < MAX_RETRIES - 1) {
      const waitMs = RETRY_DELAY_MS * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  return {
    success: false,
    error: lastError,
    statusCode: lastStatusCode,
    retries: MAX_RETRIES,
  };
}

/**
 * Send a simple text message to Discord
 */
export async function sendDiscordMessage(
  message: string
): Promise<NotifyResult> {
  if (!WEBHOOK_URL) {
    return {
      success: false,
      error: 'DISCORD_WEBHOOK_URL not configured',
    };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: BOT_USERNAME,
        avatar_url: BOT_AVATAR,
        content: message,
      }),
    });

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if Discord is configured
 */
export function isConfigured(): boolean {
  return !!WEBHOOK_URL;
}

// CLI entry point for testing
if (import.meta.main) {
  const testNotification: DiscordNotification = {
    taskCompleted: 'Implemented notification system with TTS and Discord integration',
    projectName: 'Claude Loom',
    contextUsagePercent: 45,
    keyOutcomes: [
      'Created hook event logger',
      'Built audio queue system',
      'Integrated ElevenLabs TTS',
      'Added Discord notifications',
    ],
    durationMs: 180000, // 3 minutes
    filesModified: 8,
    toolsUsed: ['Read', 'Write', 'Bash', 'Edit'],
  };

  console.log('Testing Discord notification...');
  console.log('Webhook configured:', isConfigured());
  console.log('');

  if (isConfigured()) {
    console.log('Sending test notification...');
    const result = await sendDiscordNotification(testNotification);
    console.log('Result:', JSON.stringify(result, null, 2));
  } else {
    console.log('DISCORD_WEBHOOK_URL not set. Showing embed preview:');
    console.log('');
    const embed = buildEmbed(testNotification);
    console.log(JSON.stringify(embed, null, 2));
  }
}
