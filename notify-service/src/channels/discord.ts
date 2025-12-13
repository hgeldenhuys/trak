/**
 * Discord Channel - Webhook Notifications
 *
 * Sends formatted task completion notifications to Discord via webhook.
 * Supports audio file attachments and response page links.
 */

import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getConfig } from '../config';
import { getPublicUrl } from '../ngrok';
import type { NotificationMetadata } from '../types';
import { validateDiscordWebhookUrl } from '../utils/webhook-validator';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const BOT_AVATAR = 'https://www.anthropic.com/images/icons/apple-touch-icon.png';
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // Discord's 25MB limit

// Types
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

export interface DiscordResult {
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
 * Get color based on context usage
 */
function getColorForUsage(percent: number): number {
  if (percent < 30) return 0x00ff00; // Green - low usage
  if (percent < 60) return 0xffff00; // Yellow - moderate
  if (percent < 80) return 0xff8c00; // Orange - high
  return 0xff0000; // Red - critical
}

/**
 * Build Discord embed from notification data
 */
function buildEmbed(
  project: string,
  summary: string,
  metadata?: NotificationMetadata,
  responseUrl?: string,
  sessionName?: string
): DiscordEmbed {
  const fields: DiscordEmbed['fields'] = [];

  // Session name (human-readable identifier like "brave-elephant")
  if (sessionName) {
    fields.push({
      name: 'Session',
      value: sessionName,
      inline: true,
    });
  }

  // Key outcomes
  if (metadata?.keyOutcomes && metadata.keyOutcomes.length > 0) {
    fields.push({
      name: 'Key Outcomes',
      value: metadata.keyOutcomes.map(o => `- ${o}`).join('\n'),
      inline: false,
    });
  }

  // Duration
  if (metadata?.durationMs) {
    fields.push({
      name: 'Duration',
      value: formatDuration(metadata.durationMs),
      inline: true,
    });
  }

  // Context usage
  if (metadata?.contextUsagePercent !== undefined) {
    fields.push({
      name: 'Context Usage',
      value: `${metadata.contextUsagePercent}%`,
      inline: true,
    });
  }

  // Files modified
  if (metadata?.filesModified !== undefined) {
    fields.push({
      name: 'Files Modified',
      value: metadata.filesModified.toString(),
      inline: true,
    });
  }

  // Tools used
  if (metadata?.toolsUsed && metadata.toolsUsed.length > 0) {
    fields.push({
      name: 'Tools Used',
      value: metadata.toolsUsed.join(', '),
      inline: false,
    });
  }

  // Add response link if available
  if (responseUrl) {
    fields.push({
      name: 'Full Response',
      value: `[View Full Response](${responseUrl})`,
      inline: false,
    });
  }

  return {
    title: `Task Complete: ${project}`,
    description: summary,
    color: getColorForUsage(metadata?.contextUsagePercent || 0),
    fields,
    footer: {
      // Include project name in footer for context (AC-005)
      text: `Claude Code - ${project}`,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if an audio file can be attached (exists and under size limit)
 */
async function canAttachAudio(audioPath: string | undefined): Promise<boolean> {
  if (!audioPath || !existsSync(audioPath)) {
    return false;
  }

  try {
    const stats = await stat(audioPath);
    return stats.size <= MAX_ATTACHMENT_SIZE;
  } catch {
    return false;
  }
}

/**
 * Build response URL based on config priority: ngrok > publicUrl > localhost
 */
function buildResponseUrl(responseId: string | undefined): string | undefined {
  if (!responseId) {
    return undefined;
  }

  const config = getConfig();
  if (!config) {
    return undefined;
  }

  // Priority 1: ngrok tunnel URL
  const ngrokUrl = getPublicUrl();
  if (ngrokUrl) {
    return `${ngrokUrl}/response/${responseId}`;
  }

  // Priority 2: configured public URL (e.g., network IP)
  if (config.server.publicUrl) {
    return `${config.server.publicUrl}/response/${responseId}`;
  }

  // Priority 3: localhost fallback
  return `http://127.0.0.1:${config.server.port}/response/${responseId}`;
}

/**
 * Dispatch notification to Discord
 * @param audioPath Optional path to audio file to attach
 * @param responseId Optional response ID for linking to full response page
 * @param sessionName Optional human-readable session name (e.g., "brave-elephant")
 * @param perProjectWebhookUrl Optional per-project Discord webhook URL (NOTIFY-003)
 */
export async function dispatchDiscord(
  project: string,
  summary: string,
  metadata?: NotificationMetadata,
  audioPath?: string,
  responseId?: string,
  sessionName?: string,
  perProjectWebhookUrl?: string
): Promise<DiscordResult> {
  const config = getConfig();
  if (!config) {
    return { success: false, error: 'Config not loaded' };
  }

  // Determine which webhook URL to use (NOTIFY-003)
  // Priority: per-project (if valid) > global config
  let webhookUrl = config.channels.discord.webhookUrl;
  let usingPerProject = false;

  if (perProjectWebhookUrl) {
    const validation = validateDiscordWebhookUrl(perProjectWebhookUrl);
    if (validation.valid) {
      webhookUrl = perProjectWebhookUrl;
      usingPerProject = true;
      if (DEBUG) {
        console.error(`[discord] Using per-project webhook for ${project}`);
      }
    } else {
      // Log validation failure but continue with global webhook (AC-004)
      console.error(`[discord] Invalid per-project webhook URL for ${project}: ${validation.error}`);
    }
  }

  if (!webhookUrl) {
    if (DEBUG) {
      console.error('[discord] No webhook URL configured');
    }
    return { success: false, error: 'DISCORD_WEBHOOK_URL not configured' };
  }

  const responseUrl = buildResponseUrl(responseId);
  const embed = buildEmbed(project, summary, metadata, responseUrl, sessionName);

  const payload: DiscordWebhookPayload = {
    username: config.channels.discord.username,
    avatar_url: BOT_AVATAR,
    embeds: [embed],
  };

  // Add mention if configured
  if (config.channels.discord.mentionRole) {
    payload.content = `<@&${config.channels.discord.mentionRole}>`;
  }

  // Check if we can attach audio
  const attachAudio = await canAttachAudio(audioPath);

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let response: Response;

      if (attachAudio && audioPath) {
        // Use multipart/form-data for file upload
        const formData = new FormData();

        // Add payload as JSON
        formData.append('payload_json', JSON.stringify(payload));

        // Add audio file
        const audioBuffer = await readFile(audioPath);
        const fileName = path.basename(audioPath);
        const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        formData.append('files[0]', blob, fileName);

        response = await fetch(webhookUrl, {
          method: 'POST',
          body: formData,
        });

        if (DEBUG) {
          console.error(`[discord] Sent with audio attachment: ${fileName}`);
        }
      } else {
        // Standard JSON request without attachment
        response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      lastStatusCode = response.status;

      if (response.ok) {
        if (DEBUG) {
          const webhookType = usingPerProject ? 'per-project' : 'global';
          console.error(`[discord] Notification sent for ${project} (${webhookType} webhook)`);
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
 * Check if Discord is configured
 */
export function isDiscordConfigured(): boolean {
  const config = getConfig();
  return !!(config?.channels.discord.enabled && config?.channels.discord.webhookUrl);
}
