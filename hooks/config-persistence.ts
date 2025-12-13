#!/usr/bin/env bun
/**
 * Configuration Persistence Module
 *
 * Handles reading/writing notification-config.json for the TUI.
 * Persists configuration to .agent/loom/notification-config.json.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { NotificationConfig, NotificationMode } from './config';

// Types for persisted config (subset of NotificationConfig that user can configure)
export interface PersistedConfig {
  debug: boolean;
  durationThresholdMs: number;
  // Mode: local (in-process) or remote (centralized service)
  mode?: NotificationMode;
  remoteUrl?: string;
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
  claude: {
    model: string;
  };
  // Custom system prompt for the summarizer (optional)
  customSystemPrompt?: string;
}

/**
 * Get the config file path
 */
export function getConfigPath(projectDir?: string): string {
  const baseDir = projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(baseDir, '.agent/loom/notification-config.json');
}

/**
 * Ensure the config directory exists
 */
async function ensureConfigDir(configPath: string): Promise<void> {
  const dir = path.dirname(configPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Read persisted configuration from file
 * Returns null if file doesn't exist
 */
export async function readPersistedConfig(projectDir?: string): Promise<PersistedConfig | null> {
  const configPath = getConfigPath(projectDir);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as PersistedConfig;
    return config;
  } catch (error) {
    console.error('[config-persistence] Error reading config:', error);
    return null;
  }
}

/**
 * Write persisted configuration to file
 */
export async function writePersistedConfig(
  config: PersistedConfig,
  projectDir?: string
): Promise<{ success: boolean; error?: string; path?: string }> {
  const configPath = getConfigPath(projectDir);

  try {
    await ensureConfigDir(configPath);
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true, path: configPath };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[config-persistence] Error writing config:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Create default config from environment or sensible defaults
 */
export function createDefaultConfig(): PersistedConfig {
  return {
    debug: process.env.NOTIFICATION_DEBUG === 'true',
    durationThresholdMs: parseInt(process.env.NOTIFICATION_THRESHOLD_MS || '30000', 10),
    mode: 'local',
    remoteUrl: 'http://127.0.0.1:7777',
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
    claude: {
      model: process.env.CLAUDE_MODEL || 'haiku',
    },
  };
}

/**
 * Convert PersistedConfig to partial NotificationConfig for merging
 */
export function persistedToNotificationConfig(
  persisted: PersistedConfig,
  projectDir?: string
): Partial<NotificationConfig> {
  const baseDir = projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  return {
    debug: persisted.debug,
    projectDir: baseDir,
    logsDir: path.join(baseDir, '.claude/logs'),
    mode: persisted.mode || 'local',
    remoteUrl: persisted.remoteUrl || 'http://127.0.0.1:7777',
    durationThresholdMs: persisted.durationThresholdMs,
    channels: {
      tts: {
        enabled: persisted.channels.tts.enabled,
        apiKey: persisted.channels.tts.apiKey,
        voiceId: persisted.channels.tts.voiceId,
      },
      discord: {
        enabled: persisted.channels.discord.enabled,
        webhookUrl: persisted.channels.discord.webhookUrl,
        mentionRole: persisted.channels.discord.mentionRole,
      },
      console: {
        enabled: persisted.channels.console.enabled,
      },
    },
    claude: {
      model: persisted.claude.model,
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeoutMs: parseInt(process.env.CLAUDE_TIMEOUT_MS || '30000', 10),
    },
    audio: {
      fallbackSound: '/System/Library/Sounds/Glass.aiff',
      cleanupDelayMs: 60000,
    },
  };
}

/**
 * Check if config file exists
 */
export function configFileExists(projectDir?: string): boolean {
  return existsSync(getConfigPath(projectDir));
}

// CLI entry point for testing
if (import.meta.main) {
  console.log('Config Persistence Module');
  console.log('=========================');
  console.log('');
  console.log('Config path:', getConfigPath());
  console.log('Config file exists:', configFileExists());
  console.log('');

  const existing = await readPersistedConfig();
  if (existing) {
    console.log('Existing config:');
    console.log(JSON.stringify(existing, null, 2));
  } else {
    console.log('No existing config. Default config:');
    const defaultConfig = createDefaultConfig();
    console.log(JSON.stringify(defaultConfig, null, 2));
  }
}
