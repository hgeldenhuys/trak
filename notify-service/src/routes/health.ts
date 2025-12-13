/**
 * Health Check Endpoint
 *
 * GET /health - Returns service status and channel availability
 */

import type { HealthResponse } from '../types';
import { getConfig } from '../config';
import { getNgrokStatus } from '../ngrok';
import { getResponseStoreStats } from '../response-store';

const startTime = Date.now();
const VERSION = '1.0.0';

/**
 * Check if TTS is ready
 */
function getTTSStatus(): 'ready' | 'disabled' | 'error' {
  const config = getConfig();
  if (!config) return 'error';
  if (!config.channels.tts.enabled) return 'disabled';
  if (!config.channels.tts.apiKey) return 'disabled';
  return 'ready';
}

/**
 * Check if Discord is ready
 */
function getDiscordStatus(): 'ready' | 'disabled' | 'error' {
  const config = getConfig();
  if (!config) return 'error';
  if (!config.channels.discord.enabled) return 'disabled';
  if (!config.channels.discord.webhookUrl) return 'disabled';
  return 'ready';
}

/**
 * Check if console is ready
 */
function getConsoleStatus(): 'ready' | 'disabled' {
  const config = getConfig();
  if (!config) return 'disabled';
  return config.channels.console.enabled ? 'ready' : 'disabled';
}

/**
 * Handle health check request
 */
export function handleHealth(): Response {
  const config = getConfig();
  const uptime = Date.now() - startTime;

  // Determine overall status
  let status: 'ok' | 'degraded' | 'error' = 'ok';

  if (!config) {
    status = 'error';
  } else {
    const tts = getTTSStatus();
    const discord = getDiscordStatus();

    // Degraded if any enabled channel has issues
    if (
      (config.channels.tts.enabled && tts !== 'ready') ||
      (config.channels.discord.enabled && discord !== 'ready')
    ) {
      status = 'degraded';
    }
  }

  // Get ngrok status
  const ngrokStatus = getNgrokStatus();

  // Get response store stats
  const storeStats = getResponseStoreStats();

  const response: HealthResponse = {
    status,
    version: VERSION,
    uptime,
    channels: {
      tts: getTTSStatus(),
      discord: getDiscordStatus(),
      console: getConsoleStatus(),
    },
    ngrok: {
      status: ngrokStatus.status,
      publicUrl: ngrokStatus.publicUrl,
    },
    responseStore: {
      count: storeStats.count,
      oldestEntryAge: storeStats.oldestEntryAge,
    },
  };

  return new Response(JSON.stringify(response), {
    status: status === 'error' ? 503 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
