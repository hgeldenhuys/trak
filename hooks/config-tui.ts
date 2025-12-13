#!/usr/bin/env bun
/**
 * TUI Configuration Interface for Notification System
 *
 * Provides an interactive terminal interface for configuring notification channels.
 * Uses @inquirer/prompts for user interaction.
 *
 * Features:
 * - Configure TTS/ElevenLabs settings
 * - Configure Discord webhook
 * - Configure general settings (threshold, model, debug)
 * - Test notification action
 * - Real-time validation with colored feedback
 */

import { select, input, confirm, password, number, editor } from '@inquirer/prompts';
import { loadConfigAsync, type NotificationConfig } from './config';
import {
  readPersistedConfig,
  writePersistedConfig,
  createDefaultConfig,
  type PersistedConfig,
} from './config-persistence';
import { orchestrate, type NotificationEvent } from './notification-orchestrator';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

/**
 * Print colored status message
 */
function printSuccess(msg: string): void {
  console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`);
}

function printError(msg: string): void {
  console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`);
}

function printInfo(msg: string): void {
  console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`);
}

function printWarning(msg: string): void {
  console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`);
}

/**
 * Validate ElevenLabs API key by making a test request
 */
async function validateElevenLabsApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || apiKey.trim() === '') {
    return { valid: false, error: 'API key is empty' };
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }

    return { valid: false, error: `API returned status ${response.status}` };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Validate Discord webhook URL by checking format and optionally testing
 */
async function validateDiscordWebhook(
  url: string,
  testConnection: boolean = false
): Promise<{ valid: boolean; error?: string }> {
  if (!url || url.trim() === '') {
    return { valid: false, error: 'Webhook URL is empty' };
  }

  // Check URL format
  const webhookPattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
  if (!webhookPattern.test(url)) {
    return { valid: false, error: 'Invalid Discord webhook URL format' };
  }

  if (testConnection) {
    try {
      // Send a test message
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Claude Code Notification System - Connection Test',
          username: 'Claude Code',
        }),
      });

      if (response.ok || response.status === 204) {
        return { valid: true };
      }

      return { valid: false, error: `Webhook returned status ${response.status}` };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  return { valid: true };
}

/**
 * Format API key for display (mask all but last 4 chars)
 */
function maskApiKey(key?: string): string {
  if (!key) return '(not set)';
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

/**
 * Get current config status summary
 */
function getStatusSummary(config: PersistedConfig): string[] {
  const lines: string[] = [];

  // TTS status
  const ttsStatus = config.channels.tts.enabled
    ? config.channels.tts.apiKey
      ? `${colors.green}Enabled${colors.reset}`
      : `${colors.yellow}Enabled (no API key)${colors.reset}`
    : `${colors.dim}Disabled${colors.reset}`;
  lines.push(`  TTS: ${ttsStatus}`);

  // Discord status
  const discordStatus = config.channels.discord.enabled
    ? config.channels.discord.webhookUrl
      ? `${colors.green}Enabled${colors.reset}`
      : `${colors.yellow}Enabled (no webhook)${colors.reset}`
    : `${colors.dim}Disabled${colors.reset}`;
  lines.push(`  Discord: ${discordStatus}`);

  // Console status
  const consoleStatus = config.channels.console.enabled
    ? `${colors.green}Enabled${colors.reset}`
    : `${colors.dim}Disabled${colors.reset}`;
  lines.push(`  Console: ${consoleStatus}`);

  // General settings
  lines.push(`  Threshold: ${config.durationThresholdMs / 1000}s`);
  lines.push(`  Claude Model: ${config.claude.model}`);
  lines.push(`  Debug: ${config.debug ? 'On' : 'Off'}`);

  return lines;
}

/**
 * TTS Settings Submenu
 */
async function ttsSettingsMenu(config: PersistedConfig): Promise<PersistedConfig> {
  console.log('\n--- TTS (ElevenLabs) Settings ---\n');

  // Toggle enabled
  config.channels.tts.enabled = await confirm({
    message: 'Enable TTS notifications?',
    default: config.channels.tts.enabled,
  });

  if (!config.channels.tts.enabled) {
    printInfo('TTS notifications disabled');
    return config;
  }

  // API Key
  const currentKeyDisplay = maskApiKey(config.channels.tts.apiKey);
  console.log(`Current API Key: ${currentKeyDisplay}`);

  const changeKey = await confirm({
    message: 'Change API key?',
    default: !config.channels.tts.apiKey,
  });

  if (changeKey) {
    const apiKey = await password({
      message: 'Enter ElevenLabs API key:',
      mask: '*',
    });

    if (apiKey) {
      printInfo('Validating API key...');
      const validation = await validateElevenLabsApiKey(apiKey);

      if (validation.valid) {
        config.channels.tts.apiKey = apiKey;
        printSuccess('API key validated successfully');
      } else {
        printError(`Validation failed: ${validation.error}`);
        const useAnyway = await confirm({
          message: 'Use this API key anyway?',
          default: false,
        });
        if (useAnyway) {
          config.channels.tts.apiKey = apiKey;
        }
      }
    }
  }

  // Voice ID
  const voiceId = await input({
    message: 'Voice ID (leave empty for default):',
    default: config.channels.tts.voiceId,
  });
  config.channels.tts.voiceId = voiceId || '21m00Tcm4TlvDq8ikWAM';

  return config;
}

/**
 * Discord Settings Submenu
 */
async function discordSettingsMenu(config: PersistedConfig): Promise<PersistedConfig> {
  console.log('\n--- Discord Settings ---\n');

  // Toggle enabled
  config.channels.discord.enabled = await confirm({
    message: 'Enable Discord notifications?',
    default: config.channels.discord.enabled,
  });

  if (!config.channels.discord.enabled) {
    printInfo('Discord notifications disabled');
    return config;
  }

  // Webhook URL
  const currentUrl = config.channels.discord.webhookUrl;
  if (currentUrl) {
    console.log(`Current webhook: ${currentUrl.substring(0, 50)}...`);
  }

  const changeUrl = await confirm({
    message: 'Change webhook URL?',
    default: !currentUrl,
  });

  if (changeUrl) {
    const webhookUrl = await input({
      message: 'Enter Discord webhook URL:',
      validate: (value) => {
        if (!value) return 'Webhook URL is required';
        const pattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
        if (!pattern.test(value)) {
          return 'Invalid Discord webhook URL format (expected: https://discord.com/api/webhooks/...)';
        }
        return true;
      },
    });

    if (webhookUrl) {
      const testConnection = await confirm({
        message: 'Test webhook connection?',
        default: true,
      });

      if (testConnection) {
        printInfo('Testing webhook connection...');
        const validation = await validateDiscordWebhook(webhookUrl, true);

        if (validation.valid) {
          printSuccess('Webhook connection successful');
          config.channels.discord.webhookUrl = webhookUrl;
        } else {
          printError(`Connection test failed: ${validation.error}`);
          const useAnyway = await confirm({
            message: 'Use this webhook anyway?',
            default: false,
          });
          if (useAnyway) {
            config.channels.discord.webhookUrl = webhookUrl;
          }
        }
      } else {
        config.channels.discord.webhookUrl = webhookUrl;
      }
    }
  }

  // Mention role
  const mentionRole = await input({
    message: 'Role ID to mention (optional, leave empty to skip):',
    default: config.channels.discord.mentionRole || '',
  });
  config.channels.discord.mentionRole = mentionRole || undefined;

  return config;
}

/**
 * General Settings Submenu
 */
async function generalSettingsMenu(config: PersistedConfig): Promise<PersistedConfig> {
  console.log('\n--- General Settings ---\n');

  // Notification threshold
  const thresholdSeconds = await number({
    message: 'Notification threshold (seconds):',
    default: config.durationThresholdMs / 1000,
    min: 0,
    max: 3600,
  });
  config.durationThresholdMs = (thresholdSeconds || 30) * 1000;

  // Claude model
  const model = await select({
    message: 'Claude model for summaries:',
    choices: [
      { name: 'Haiku (fastest, cheapest)', value: 'haiku' },
      { name: 'Haiku 4.5 (fast, improved)', value: 'haiku-4.5' },
      { name: 'Sonnet (balanced)', value: 'sonnet' },
      { name: 'Sonnet 4 (latest balanced)', value: 'sonnet-4' },
      { name: 'Opus (most capable)', value: 'opus' },
    ],
    default: config.claude.model,
  });
  config.claude.model = model;

  // Console notifications
  config.channels.console.enabled = await confirm({
    message: 'Enable console notifications?',
    default: config.channels.console.enabled,
  });

  // Debug mode
  config.debug = await confirm({
    message: 'Enable debug mode?',
    default: config.debug,
  });

  return config;
}

/**
 * Prompt Settings Submenu
 */
async function promptSettingsMenu(config: PersistedConfig): Promise<PersistedConfig> {
  console.log('\n--- Summary Prompt Settings ---\n');

  const defaultPrompt = `You are Claude, summarizing what you just accomplished for your developer. Speak in first person as if you're briefly telling them what you did while they were away.

The developer asked you to do something, and you completed the task. Now they need a quick audio summary to know what happened.

Guidelines:
- Speak in first person ("I did", "I fixed", "I created")
- Reference their original request if provided
- Keep it conversational but brief (under 150 characters for TTS)
- Be confident and natural - this is for audio, not text`;

  const hasCustom = !!config.customSystemPrompt;

  if (hasCustom) {
    console.log(`${colors.dim}Current custom prompt (first 100 chars):${colors.reset}`);
    console.log(`  ${config.customSystemPrompt?.substring(0, 100)}...`);
    console.log('');
  } else {
    console.log(`${colors.dim}Using default prompt${colors.reset}`);
    console.log('');
  }

  const action = await select({
    message: 'What would you like to do?',
    choices: [
      { name: 'Edit custom prompt', value: 'edit' },
      { name: 'View current prompt', value: 'view' },
      { name: 'Reset to default', value: 'reset' },
      { name: 'Back to main menu', value: 'back' },
    ],
  });

  switch (action) {
    case 'edit': {
      console.log(`\n${colors.dim}Enter your custom system prompt. This will be used when generating audio summaries.${colors.reset}`);
      console.log(`${colors.dim}Use an editor by pressing Enter, or paste directly.${colors.reset}\n`);

      const customPrompt = await editor({
        message: 'Edit system prompt:',
        default: config.customSystemPrompt || defaultPrompt,
        postfix: '.md',
      });

      if (customPrompt && customPrompt.trim()) {
        config.customSystemPrompt = customPrompt.trim();
        printSuccess('Custom prompt saved');
      }
      break;
    }
    case 'view': {
      console.log('\n--- Current Prompt ---\n');
      console.log(config.customSystemPrompt || defaultPrompt);
      console.log('\n----------------------\n');
      await confirm({ message: 'Press Enter to continue', default: true });
      break;
    }
    case 'reset': {
      const doReset = await confirm({
        message: 'Reset to default prompt?',
        default: false,
      });
      if (doReset) {
        config.customSystemPrompt = undefined;
        printSuccess('Prompt reset to default');
      }
      break;
    }
    case 'back':
      break;
  }

  return config;
}

/**
 * Test Notification Action
 */
async function testNotification(config: PersistedConfig): Promise<void> {
  console.log('\n--- Test Notification ---\n');

  printInfo('Sending test notification through all enabled channels...');

  // Create mock event
  const testEvent: NotificationEvent = {
    transactionId: 'test-' + Date.now(),
    sessionId: 'test-session',
    durationMs: config.durationThresholdMs + 1000, // Above threshold
    promptText: 'Test notification from TUI configuration',
    filesModified: ['hooks/config-tui.ts', 'hooks/config.ts'],
    toolsUsed: ['Read', 'Write', 'Edit'],
    stopPayload: {
      usage: { input_tokens: 5000, output_tokens: 1000 },
    },
  };

  try {
    const result = await orchestrate(testEvent);

    console.log('');
    if (result.summary) {
      printSuccess(`Summary generated: "${result.summary.taskCompleted}"`);
    }

    for (const channel of result.channels) {
      if (channel.success) {
        printSuccess(`${channel.channel}: Delivered (${channel.duration}ms)`);
      } else {
        printError(`${channel.channel}: Failed - ${channel.error}`);
      }
    }

    console.log(`\nTotal time: ${result.totalDurationMs}ms`);
  } catch (error) {
    printError(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Main menu loop
 */
async function mainMenu(): Promise<void> {
  console.log(`
${colors.bold}========================================${colors.reset}
  Claude Code Notification Configuration
${colors.bold}========================================${colors.reset}
`);

  // Load existing config or create default
  let config = await readPersistedConfig();
  if (!config) {
    config = createDefaultConfig();
    printInfo('No saved configuration found. Using defaults.');
  } else {
    printSuccess('Configuration loaded from file.');
  }

  let hasChanges = false;

  while (true) {
    // Show current status
    console.log('\n--- Current Status ---');
    const status = getStatusSummary(config);
    for (const line of status) {
      console.log(line);
    }
    console.log('');

    const choice = await select({
      message: 'What would you like to configure?',
      choices: [
        { name: 'TTS Settings (ElevenLabs)', value: 'tts' },
        { name: 'Discord Settings', value: 'discord' },
        { name: 'General Settings', value: 'general' },
        { name: 'Prompt Settings (Summary Style)', value: 'prompt' },
        { name: 'Test Notification', value: 'test' },
        {
          name: hasChanges ? 'Save & Exit' : 'Exit',
          value: 'exit',
        },
      ],
    });

    switch (choice) {
      case 'tts':
        config = await ttsSettingsMenu(config);
        hasChanges = true;
        break;
      case 'discord':
        config = await discordSettingsMenu(config);
        hasChanges = true;
        break;
      case 'general':
        config = await generalSettingsMenu(config);
        hasChanges = true;
        break;
      case 'prompt':
        config = await promptSettingsMenu(config);
        hasChanges = true;
        break;
      case 'test':
        await testNotification(config);
        break;
      case 'exit':
        if (hasChanges) {
          const save = await confirm({
            message: 'Save changes before exiting?',
            default: true,
          });

          if (save) {
            const result = await writePersistedConfig(config);
            if (result.success) {
              printSuccess(`Configuration saved to ${result.path}`);
            } else {
              printError(`Failed to save: ${result.error}`);
            }
          }
        }
        console.log('\nGoodbye!\n');
        return;
    }
  }
}

// CLI entry point
if (import.meta.main) {
  mainMenu().catch((error) => {
    if (error.name === 'ExitPromptError') {
      // User pressed Ctrl+C
      console.log('\n\nConfiguration cancelled.\n');
      process.exit(0);
    }
    console.error('Error:', error);
    process.exit(1);
  });
}

// Export for testing
export { mainMenu, ttsSettingsMenu, discordSettingsMenu, generalSettingsMenu, testNotification };
