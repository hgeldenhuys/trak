#!/usr/bin/env bun
/**
 * Notification System Configuration
 *
 * Centralized configuration for the notification pipeline.
 * Reads from environment variables with sensible defaults.
 */

import path from 'path';
import { readPersistedConfig, persistedToNotificationConfig } from './config-persistence';

// Types
export type NotificationMode = 'local' | 'remote';

export interface NotificationConfig {
  // General
  debug: boolean;
  projectDir: string;
  logsDir: string;

  // Mode: local (in-process) or remote (centralized service)
  mode: NotificationMode;
  remoteUrl: string;
  sdkKey?: string;  // SDK key for authenticating with remote server

  // Thresholds
  durationThresholdMs: number;

  // Channels
  channels: {
    tts: {
      enabled: boolean;
      apiKey?: string;
      voiceId: string;
    };
    discord: {
      enabled: boolean;
      webhookUrl?: string;
      mentionRole?: string;
    };
    console: {
      enabled: boolean;
    };
  };

  // Per-project overrides (NOTIFY-003, NOTIFY-004)
  discordWebhookUrl?: string;  // Project-specific Discord webhook URL
  voiceId?: string;            // Project-specific ElevenLabs voice ID

  // Claude headless
  claude: {
    model: string;
    apiKey?: string;
    timeoutMs: number;
  };

  // Audio
  audio: {
    fallbackSound: string;
    cleanupDelayMs: number;
  };
}

/**
 * Load configuration from environment (base config)
 *
 * Note: Per AC-001 and AC-007, when mode='remote', API keys should come from
 * ~/.claude-notify/config.json only (not from environment variables or per-project config).
 * Environment variables are still used for local mode and backward compatibility.
 */
function loadEnvConfig(): NotificationConfig {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  return {
    // General
    debug: process.env.NOTIFICATION_DEBUG === 'true',
    projectDir,
    logsDir: path.join(projectDir, '.claude/logs'),

    // Mode (default to local for backward compatibility)
    mode: (process.env.NOTIFICATION_MODE as NotificationMode) || 'local',
    remoteUrl: process.env.NOTIFICATION_REMOTE_URL || 'http://127.0.0.1:7777',
    sdkKey: process.env.NOTIFICATION_SDK_KEY,

    // Thresholds
    durationThresholdMs: parseInt(
      process.env.NOTIFICATION_THRESHOLD_MS || '30000',
      10
    ),

    // Channels - env vars used for local mode only (see loadConfig for remote mode)
    channels: {
      tts: {
        enabled: process.env.NOTIFICATION_TTS !== 'false',
        apiKey: process.env.ELEVENLABS_API_KEY,
        voiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
      },
      discord: {
        enabled: process.env.NOTIFICATION_DISCORD !== 'false',
        webhookUrl: process.env.DISCORD_WEBHOOK_URL,
        mentionRole: process.env.DISCORD_MENTION_ROLE,
      },
      console: {
        enabled: process.env.NOTIFICATION_CONSOLE !== 'false',
      },
    },

    // Claude headless
    claude: {
      model: process.env.CLAUDE_MODEL || 'haiku',
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeoutMs: parseInt(process.env.CLAUDE_TIMEOUT_MS || '30000', 10),
    },

    // Audio
    audio: {
      fallbackSound: '/System/Library/Sounds/Glass.aiff',
      cleanupDelayMs: 60000, // 1 minute
    },

    // Per-project overrides (NOTIFY-003)
    discordWebhookUrl: process.env.DISCORD_PROJECT_WEBHOOK_URL,
  };
}

/**
 * Load configuration from file and environment
 *
 * For remote mode (AC-001, AC-007):
 *   - Read remoteUrl from ~/.claude-notify/config.json only
 *   - DO NOT read from per-project .config/notification-config.json
 *   - DO NOT use ELEVENLABS_API_KEY, DISCORD_WEBHOOK_URL env vars (server handles these)
 *
 * For local mode:
 *   - File config takes precedence over environment variables
 *   - Both ~/.claude-notify/config.json and per-project config are read
 */
export function loadConfig(): NotificationConfig {
  // Start with env config as base
  const envConfig = loadEnvConfig();

  // Try to load global config from ~/.claude-notify/config.json
  let globalConfig = null;
  try {
    const fs = require('fs');
    const os = require('os');
    const globalConfigPath = path.join(os.homedir(), '.claude-notify', 'config.json');

    if (fs.existsSync(globalConfigPath)) {
      const content = fs.readFileSync(globalConfigPath, 'utf-8');
      globalConfig = JSON.parse(content);
    }
  } catch {
    // Silently continue
  }

  // Determine mode (global config takes precedence)
  const mode = globalConfig?.mode ?? envConfig.mode;

  // For remote mode (AC-001, AC-007): only use global config for API keys
  // Per-project Discord webhook is allowed (NOTIFY-003)
  if (mode === 'remote') {
    // Load per-project config for discordWebhookUrl only
    let projectConfig = null;
    try {
      const fs = require('fs');
      const configPath = path.join(
        envConfig.projectDir,
        '.config/notification-config.json'
      );
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        projectConfig = JSON.parse(content);
      }
    } catch {
      // Silently continue
    }

    // Remote mode: thin client, no local API keys needed
    return {
      debug: globalConfig?.debug ?? envConfig.debug,
      projectDir: envConfig.projectDir,
      logsDir: envConfig.logsDir,
      mode: 'remote',
      // remoteUrl from global config only (AC-007)
      remoteUrl: globalConfig?.remoteUrl ?? envConfig.remoteUrl,
      // sdkKey for authenticating with remote server (AC-009)
      sdkKey: globalConfig?.sdkKey ?? envConfig.sdkKey,
      durationThresholdMs: globalConfig?.durationThresholdMs ?? envConfig.durationThresholdMs,
      // For remote mode, channel configs are NOT needed locally - server handles dispatch
      // Keep minimal defaults for backward compatibility
      channels: {
        tts: {
          enabled: false,  // Server handles TTS
          voiceId: '21m00Tcm4TlvDq8ikWAM',
        },
        discord: {
          enabled: false,  // Server handles Discord
        },
        console: {
          enabled: globalConfig?.channels?.console?.enabled ?? true,
        },
      },
      claude: {
        model: globalConfig?.claude?.model || envConfig.claude.model,
        apiKey: undefined,  // Not needed for remote mode
        timeoutMs: envConfig.claude.timeoutMs,
      },
      audio: envConfig.audio,
      // Per-project overrides (NOTIFY-003, NOTIFY-004) - from per-project config or env
      discordWebhookUrl: projectConfig?.discordWebhookUrl ?? envConfig.discordWebhookUrl,
      voiceId: projectConfig?.voiceId ?? envConfig.voiceId,
    };
  }

  // Local mode: merge global, per-project, and env configs
  let persistedConfig = null;
  try {
    const fs = require('fs');
    const configPath = path.join(
      envConfig.projectDir,
      '.config/notification-config.json'
    );

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      persistedConfig = JSON.parse(content);
    }
  } catch {
    // Silently fall back to env config
  }

  // Merge priority: per-project > global > env
  const merged = {
    debug: persistedConfig?.debug ?? globalConfig?.debug ?? envConfig.debug,
    projectDir: envConfig.projectDir,
    logsDir: envConfig.logsDir,
    mode: 'local' as NotificationMode,
    remoteUrl: persistedConfig?.remoteUrl ?? globalConfig?.remoteUrl ?? envConfig.remoteUrl,
    sdkKey: persistedConfig?.sdkKey ?? globalConfig?.sdkKey ?? envConfig.sdkKey,
    durationThresholdMs: persistedConfig?.durationThresholdMs ?? globalConfig?.durationThresholdMs ?? envConfig.durationThresholdMs,
    channels: {
      tts: {
        enabled: persistedConfig?.channels?.tts?.enabled ?? globalConfig?.channels?.tts?.enabled ?? envConfig.channels.tts.enabled,
        apiKey: persistedConfig?.channels?.tts?.apiKey || globalConfig?.channels?.tts?.apiKey || envConfig.channels.tts.apiKey,
        voiceId: persistedConfig?.channels?.tts?.voiceId || globalConfig?.channels?.tts?.voiceId || envConfig.channels.tts.voiceId,
      },
      discord: {
        enabled: persistedConfig?.channels?.discord?.enabled ?? globalConfig?.channels?.discord?.enabled ?? envConfig.channels.discord.enabled,
        webhookUrl: persistedConfig?.channels?.discord?.webhookUrl || globalConfig?.channels?.discord?.webhookUrl || envConfig.channels.discord.webhookUrl,
        mentionRole: persistedConfig?.channels?.discord?.mentionRole || globalConfig?.channels?.discord?.mentionRole || envConfig.channels.discord.mentionRole,
      },
      console: {
        enabled: persistedConfig?.channels?.console?.enabled ?? globalConfig?.channels?.console?.enabled ?? envConfig.channels.console.enabled,
      },
    },
    claude: {
      model: persistedConfig?.claude?.model || globalConfig?.claude?.model || envConfig.claude.model,
      apiKey: envConfig.claude.apiKey, // Always from env for security
      timeoutMs: envConfig.claude.timeoutMs,
    },
    audio: envConfig.audio,
    // Per-project overrides (NOTIFY-003, NOTIFY-004)
    discordWebhookUrl: persistedConfig?.discordWebhookUrl ?? envConfig.discordWebhookUrl,
    voiceId: persistedConfig?.voiceId ?? envConfig.voiceId,
  };

  return merged;
}

/**
 * Async version of loadConfig for TUI use
 */
export async function loadConfigAsync(): Promise<NotificationConfig> {
  const envConfig = loadEnvConfig();

  const persistedConfig = await readPersistedConfig(envConfig.projectDir);

  if (!persistedConfig) {
    return envConfig;
  }

  // Merge using the converter
  const fileOverrides = persistedToNotificationConfig(persistedConfig, envConfig.projectDir);

  return {
    ...envConfig,
    ...fileOverrides,
    channels: {
      tts: {
        ...envConfig.channels.tts,
        ...fileOverrides.channels?.tts,
      },
      discord: {
        ...envConfig.channels.discord,
        ...fileOverrides.channels?.discord,
      },
      console: {
        ...envConfig.channels.console,
        ...fileOverrides.channels?.console,
      },
    },
    claude: {
      ...envConfig.claude,
      model: fileOverrides.claude?.model || envConfig.claude.model,
    },
  };
}

/**
 * Validate configuration and return warnings
 */
export function validateConfig(config: NotificationConfig): string[] {
  const warnings: string[] = [];

  // Check TTS
  if (config.channels.tts.enabled && !config.channels.tts.apiKey) {
    warnings.push(
      'TTS enabled but ELEVENLABS_API_KEY not set - will use fallback sound'
    );
  }

  // Check Discord
  if (config.channels.discord.enabled && !config.channels.discord.webhookUrl) {
    warnings.push(
      'Discord enabled but DISCORD_WEBHOOK_URL not set - Discord notifications disabled'
    );
  }

  // Check if any output channel is configured
  const hasOutput =
    (config.channels.tts.enabled && config.channels.tts.apiKey) ||
    (config.channels.discord.enabled && config.channels.discord.webhookUrl) ||
    config.channels.console.enabled;

  if (!hasOutput) {
    warnings.push(
      'No notification channels configured - notifications will only log to console'
    );
  }

  return warnings;
}

/**
 * Get configuration summary for display
 */
export function getConfigSummary(config: NotificationConfig): Record<string, unknown> {
  return {
    debug: config.debug,
    durationThreshold: `${config.durationThresholdMs / 1000}s`,
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
    claude: {
      model: config.claude.model,
      apiKey: config.claude.apiKey ? 'set' : 'using subscription',
    },
  };
}

// Config hot-reload support
const os = require('os');
const GLOBAL_CONFIG_PATH = path.join(os.homedir(), '.claude-notify', 'config.json');
let configInstance: NotificationConfig | null = null;
let configMtime: number = 0;

/**
 * Get the global config instance with hot-reload support
 *
 * Checks if the config file has been modified since last load.
 * If modified, reloads the config automatically.
 * This enables SDK key and other config changes to take effect
 * without requiring a session restart.
 */
export function getConfig(): NotificationConfig {
  const fs = require('fs');

  try {
    const stats = fs.statSync(GLOBAL_CONFIG_PATH);
    const currentMtime = stats.mtimeMs;

    if (configInstance && currentMtime === configMtime) {
      // File unchanged, use cache
      return configInstance;
    }

    // File changed or first load - reload config
    configInstance = loadConfig();
    configMtime = currentMtime;

    return configInstance;
  } catch {
    // Config file doesn't exist, use cached or load fresh
    if (!configInstance) {
      configInstance = loadConfig();
    }
    return configInstance;
  }
}

/**
 * Reset config (for testing)
 */
export function resetConfig(): void {
  configInstance = null;
  configMtime = 0;
}

// CLI entry point
if (import.meta.main) {
  const config = loadConfig();
  const warnings = validateConfig(config);
  const summary = getConfigSummary(config);

  console.log('Notification System Configuration');
  console.log('=================================');
  console.log('');
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
