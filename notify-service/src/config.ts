#!/usr/bin/env bun
/**
 * Global Configuration System
 *
 * Manages centralized service configuration stored in ~/.claude-notify/config.json.
 * Provides sensible defaults, validation, and migration support.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { ServiceConfig } from './types';

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), '.claude-notify');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const PID_PATH = path.join(CONFIG_DIR, 'daemon.pid');

// Current config version for migrations
const CONFIG_VERSION = '1.0.0';

// Debug mode
const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

/**
 * Get the configuration directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the configuration file path
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Get the PID file path
 */
export function getPidPath(): string {
  return PID_PATH;
}

/**
 * Create default configuration with sensible defaults
 *
 * Note: Per AC-001, all API keys should come from ~/.claude-notify/config.json only,
 * not from environment variables. Environment fallbacks are kept for backward compatibility
 * during migration but the recommended setup is config-file only.
 */
export function createDefaultConfig(): ServiceConfig {
  return {
    version: CONFIG_VERSION,
    server: {
      port: 7777,
      host: '127.0.0.1',
    },
    channels: {
      tts: {
        enabled: true,
        apiKey: process.env.ELEVENLABS_API_KEY,
        voiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
        model: 'eleven_turbo_v2_5',
      },
      discord: {
        enabled: true,
        webhookUrl: process.env.DISCORD_WEBHOOK_URL,
        mentionRole: process.env.DISCORD_MENTION_ROLE,
        username: 'Claude Code',
      },
      console: {
        enabled: true,
      },
    },
    // Server-side summarization (AC-001, AC-002)
    summarization: {
      enabled: true,
      apiKey: undefined,  // Must be set in config file, not env vars per AC-001
      apiUrl: 'https://api.anthropic.com',
      model: 'claude-3-haiku-20240307',
    },
    audio: {
      fallbackSound: '/System/Library/Sounds/Glass.aiff',
      cleanupDelayMs: 60000,
    },
    defaults: {
      durationThresholdMs: 30000,
    },
    ngrok: {
      enabled: false,
      authToken: process.env.NGROK_AUTHTOKEN,
      subdomain: process.env.NGROK_SUBDOMAIN,
    },
    responseStorage: {
      enabled: true,
      ttlMs: 24 * 60 * 60 * 1000, // 24 hours
      maxEntries: 1000,
    },
  };
}

/**
 * Ensure the configuration directory exists
 */
export async function ensureConfigDir(): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
    if (DEBUG) {
      console.error(`[config] Created config directory: ${CONFIG_DIR}`);
    }
  }
}

/**
 * Read configuration from file
 * Returns default config if file doesn't exist
 */
export async function loadConfig(): Promise<ServiceConfig> {
  await ensureConfigDir();

  if (!existsSync(CONFIG_PATH)) {
    if (DEBUG) {
      console.error('[config] No config file found, using defaults');
    }
    return createDefaultConfig();
  }

  try {
    const content = await readFile(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content) as ServiceConfig;

    // Merge with defaults to ensure all fields exist
    const merged = mergeWithDefaults(config);

    // Check for migration
    if (config.version !== CONFIG_VERSION) {
      if (DEBUG) {
        console.error(`[config] Migrating from ${config.version} to ${CONFIG_VERSION}`);
      }
      merged.version = CONFIG_VERSION;
      await saveConfig(merged);
    }

    return merged;
  } catch (error) {
    console.error('[config] Error reading config:', error);
    return createDefaultConfig();
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: ServiceConfig): Promise<{ success: boolean; error?: string }> {
  await ensureConfigDir();

  try {
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    if (DEBUG) {
      console.error(`[config] Saved config to ${CONFIG_PATH}`);
    }
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[config] Error saving config:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Merge user config with defaults to ensure all fields exist
 */
function mergeWithDefaults(userConfig: Partial<ServiceConfig>): ServiceConfig {
  const defaults = createDefaultConfig();

  return {
    version: userConfig.version || defaults.version,
    server: {
      port: userConfig.server?.port ?? defaults.server.port,
      host: userConfig.server?.host ?? defaults.server.host,
      publicUrl: userConfig.server?.publicUrl,
    },
    channels: {
      tts: {
        enabled: userConfig.channels?.tts?.enabled ?? defaults.channels.tts.enabled,
        apiKey: userConfig.channels?.tts?.apiKey || defaults.channels.tts.apiKey,
        voiceId: userConfig.channels?.tts?.voiceId || defaults.channels.tts.voiceId,
        model: userConfig.channels?.tts?.model || defaults.channels.tts.model,
      },
      discord: {
        enabled: userConfig.channels?.discord?.enabled ?? defaults.channels.discord.enabled,
        webhookUrl: userConfig.channels?.discord?.webhookUrl || defaults.channels.discord.webhookUrl,
        mentionRole: userConfig.channels?.discord?.mentionRole || defaults.channels.discord.mentionRole,
        username: userConfig.channels?.discord?.username || defaults.channels.discord.username,
      },
      console: {
        enabled: userConfig.channels?.console?.enabled ?? defaults.channels.console.enabled,
      },
    },
    // Server-side summarization config (AC-001, AC-002)
    summarization: {
      enabled: userConfig.summarization?.enabled ?? defaults.summarization.enabled,
      apiKey: userConfig.summarization?.apiKey || defaults.summarization.apiKey,
      apiUrl: userConfig.summarization?.apiUrl || defaults.summarization.apiUrl,
      model: userConfig.summarization?.model || defaults.summarization.model,
    },
    audio: {
      fallbackSound: userConfig.audio?.fallbackSound || defaults.audio.fallbackSound,
      cleanupDelayMs: userConfig.audio?.cleanupDelayMs ?? defaults.audio.cleanupDelayMs,
    },
    defaults: {
      durationThresholdMs: userConfig.defaults?.durationThresholdMs ?? defaults.defaults.durationThresholdMs,
    },
    ngrok: {
      enabled: userConfig.ngrok?.enabled ?? defaults.ngrok.enabled,
      authToken: userConfig.ngrok?.authToken || defaults.ngrok.authToken,
      subdomain: userConfig.ngrok?.subdomain || defaults.ngrok.subdomain,
    },
    responseStorage: {
      enabled: userConfig.responseStorage?.enabled ?? defaults.responseStorage.enabled,
      ttlMs: userConfig.responseStorage?.ttlMs ?? defaults.responseStorage.ttlMs,
      maxEntries: userConfig.responseStorage?.maxEntries ?? defaults.responseStorage.maxEntries,
    },
  };
}

/**
 * Validate configuration and return warnings
 */
export function validateConfig(config: ServiceConfig): string[] {
  const warnings: string[] = [];

  // Check TTS
  if (config.channels.tts.enabled && !config.channels.tts.apiKey) {
    warnings.push('TTS enabled but no API key configured - will use fallback sound');
  }

  // Check Discord
  if (config.channels.discord.enabled && !config.channels.discord.webhookUrl) {
    warnings.push('Discord enabled but no webhook URL configured - Discord notifications disabled');
  }

  // Check summarization (AC-001, AC-002)
  if (config.summarization.enabled && !config.summarization.apiKey) {
    warnings.push('Server-side summarization enabled but no Anthropic API key configured - raw events will fail to process');
  }

  // Check if any output channel is available
  const hasOutput =
    (config.channels.tts.enabled && config.channels.tts.apiKey) ||
    (config.channels.discord.enabled && config.channels.discord.webhookUrl) ||
    config.channels.console.enabled;

  if (!hasOutput) {
    warnings.push('No notification channels configured - notifications will only log to console');
  }

  // Check port validity
  if (config.server.port < 1 || config.server.port > 65535) {
    warnings.push(`Invalid port ${config.server.port} - using default 7777`);
  }

  // Check ngrok
  if (config.ngrok.enabled && !config.ngrok.authToken) {
    warnings.push('ngrok enabled but no auth token configured - public URLs will not be available');
  }

  return warnings;
}

/**
 * Get a summary of the configuration for display
 */
export function getConfigSummary(config: ServiceConfig): Record<string, unknown> {
  return {
    version: config.version,
    server: `${config.server.host}:${config.server.port}`,
    channels: {
      tts: config.channels.tts.enabled
        ? config.channels.tts.apiKey
          ? 'enabled'
          : 'enabled (fallback only)'
        : 'disabled',
      discord: config.channels.discord.enabled
        ? config.channels.discord.webhookUrl
          ? 'enabled'
          : 'disabled (no webhook)'
        : 'disabled',
      console: config.channels.console.enabled ? 'enabled' : 'disabled',
    },
    // Server-side summarization status (AC-001, AC-002)
    summarization: {
      enabled: config.summarization.enabled,
      hasApiKey: !!config.summarization.apiKey,
      model: config.summarization.model || 'claude-3-haiku-20240307',
    },
    defaults: {
      durationThreshold: `${config.defaults.durationThresholdMs / 1000}s`,
    },
    ngrok: {
      enabled: config.ngrok.enabled,
      hasAuthToken: !!config.ngrok.authToken,
      subdomain: config.ngrok.subdomain || '(auto)',
    },
    responseStorage: {
      enabled: config.responseStorage.enabled,
      ttl: `${config.responseStorage.ttlMs / 1000 / 60 / 60}h`,
      maxEntries: config.responseStorage.maxEntries,
    },
  };
}

// Singleton instance
let configInstance: ServiceConfig | null = null;

/**
 * Get cached config instance (sync accessor for use in handlers)
 */
export function getConfig(): ServiceConfig | null {
  return configInstance;
}

/**
 * Load and cache config instance
 */
export async function initConfig(): Promise<ServiceConfig> {
  configInstance = await loadConfig();
  return configInstance;
}

/**
 * Reset cached config (for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

// CLI entry point
if (import.meta.main) {
  console.log('Notification Service Configuration');
  console.log('==================================');
  console.log('');
  console.log('Config path:', getConfigPath());
  console.log('PID path:', getPidPath());
  console.log('');

  const config = await loadConfig();
  const warnings = validateConfig(config);
  const summary = getConfigSummary(config);

  console.log('Configuration:');
  console.log(JSON.stringify(summary, null, 2));
  console.log('');

  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  } else {
    console.log('Configuration valid.');
  }
}
