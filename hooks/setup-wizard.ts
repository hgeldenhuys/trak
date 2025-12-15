#!/usr/bin/env bun
/**
 * Notification Server Setup Wizard
 *
 * Interactive wizard for configuring the notification server during notification system setup.
 * Offers two paths:
 *   (A) Create NEW local server - configure port, channels, and optional ngrok
 *   (B) Connect to EXISTING server - provide URL for remote mode
 *
 * Generates ~/.claude-notify/config.json with validated settings.
 *
 * CLI options:
 *   --reconfigure     Show current values and allow skipping unchanged sections
 *   --set key=value   Set a specific config value (e.g., --set discord.webhookUrl=https://...)
 *
 * Examples:
 *   bun hooks/setup-wizard.ts                           # Full wizard
 *   bun hooks/setup-wizard.ts --reconfigure             # Update existing config
 *   bun hooks/setup-wizard.ts --set tts.apiKey=sk_xxx   # Set single value
 *   bun hooks/setup-wizard.ts --set discord.enabled=false --set tts.enabled=true
 */

import { select, input, confirm, password, number } from '@inquirer/prompts';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createServer, type AddressInfo } from 'net';
import { isatty } from 'tty';

// Parse CLI arguments
const args = process.argv.slice(2);
const isReconfigure = args.includes('--reconfigure');
const setArgs = args.filter(arg => arg.startsWith('--set'));

// Check for interactive terminal (skip for --set mode)
if (setArgs.length === 0 && (!isatty(0) || !isatty(1))) {
  console.log('\n[INFO] Setup wizard requires an interactive terminal.');
  console.log('[INFO] Run manually after installation: bun hooks/setup-wizard.ts\n');
  process.exit(0);
}

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

// Configuration schema matching ServiceConfig
interface ServiceConfig {
  mode: 'local' | 'remote';
  port?: number;
  remoteUrl?: string;
  sdkKey?: string;  // SDK key for authenticating with remote server
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
  ngrok?: {
    enabled: boolean;
    authToken?: string;
    subdomain?: string;
  };
  /**
   * Server-side summarization configuration (AC-001, AC-002)
   * Used when notify-service performs summarization server-side
   */
  summarization?: {
    enabled: boolean;
    apiKey?: string;        // Anthropic API key for Claude
    apiUrl?: string;        // API URL (default: https://api.anthropic.com)
    model?: string;         // Model to use (default: claude-3-haiku-20240307)
  };
  /**
   * @deprecated Use summarization instead. Kept for backward compatibility.
   */
  summary: {
    apiUrl: string;
    apiKey?: string;
    model: string;
  };
  claude: {
    model: string;
  };
  durationThresholdMs: number;
  debug: boolean;
}

/**
 * Get the config directory path (~/.claude-notify)
 */
function getConfigDir(): string {
  return join(homedir(), '.claude-notify');
}

/**
 * Get the config file path
 */
function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

/**
 * Load existing configuration if present
 */
function loadExistingConfig(): ServiceConfig | null {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as ServiceConfig;
  } catch {
    return null;
  }
}

/**
 * Set a nested config value by dot-notation path
 * e.g., "discord.webhookUrl" -> config.channels.discord.webhookUrl
 */
function setConfigValue(config: ServiceConfig, path: string, value: string): boolean {
  const parts = path.split('.');

  // Handle common shortcuts
  const pathMappings: Record<string, string[]> = {
    'tts.enabled': ['channels', 'tts', 'enabled'],
    'tts.apiKey': ['channels', 'tts', 'apiKey'],
    'tts.voiceId': ['channels', 'tts', 'voiceId'],
    'discord.enabled': ['channels', 'discord', 'enabled'],
    'discord.webhookUrl': ['channels', 'discord', 'webhookUrl'],
    'discord.mentionRole': ['channels', 'discord', 'mentionRole'],
    'console.enabled': ['channels', 'console', 'enabled'],
    'ngrok.enabled': ['ngrok', 'enabled'],
    'ngrok.authToken': ['ngrok', 'authToken'],
    'ngrok.subdomain': ['ngrok', 'subdomain'],
    // Legacy summary config (deprecated)
    'summary.apiUrl': ['summary', 'apiUrl'],
    'summary.apiKey': ['summary', 'apiKey'],
    'summary.model': ['summary', 'model'],
    // New server-side summarization config (AC-001, AC-002)
    'summarization.enabled': ['summarization', 'enabled'],
    'summarization.apiKey': ['summarization', 'apiKey'],
    'summarization.apiUrl': ['summarization', 'apiUrl'],
    'summarization.model': ['summarization', 'model'],
    // Shorthand for Anthropic key
    'anthropic.apiKey': ['summarization', 'apiKey'],
    'port': ['port'],
    'mode': ['mode'],
    'remoteUrl': ['remoteUrl'],
    'sdkKey': ['sdkKey'],
    'durationThresholdMs': ['durationThresholdMs'],
    'debug': ['debug'],
  };

  const mappedPath = pathMappings[path] || parts;

  // Navigate to parent and set value
  let current: any = config;
  for (let i = 0; i < mappedPath.length - 1; i++) {
    if (current[mappedPath[i]] === undefined) {
      current[mappedPath[i]] = {};
    }
    current = current[mappedPath[i]];
  }

  const finalKey = mappedPath[mappedPath.length - 1];

  // Parse value type
  let parsedValue: any = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (/^\d+$/.test(value)) parsedValue = parseInt(value, 10);

  current[finalKey] = parsedValue;
  return true;
}

/**
 * Handle --set arguments and exit
 */
async function handleSetArgs(setArgs: string[]): Promise<void> {
  const existingConfig = loadExistingConfig();
  if (!existingConfig) {
    printError('No existing config found. Run wizard first without --set to create initial config.');
    process.exit(1);
  }

  let hasChanges = false;

  for (const arg of setArgs) {
    // Parse --set key=value or next arg after --set
    const match = arg.match(/^--set\s+(.+)=(.*)$/) || arg.match(/^--set=(.+)=(.*)$/);
    if (!match) {
      // Check if it's just --set followed by key=value
      const idx = args.indexOf(arg);
      if (idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) {
        const kvMatch = args[idx + 1].match(/^(.+)=(.*)$/);
        if (kvMatch) {
          const [, key, value] = kvMatch;
          if (setConfigValue(existingConfig, key, value)) {
            printSuccess(`Set ${key} = ${value}`);
            hasChanges = true;
          } else {
            printError(`Failed to set ${key}`);
          }
        }
      }
      continue;
    }

    const [, key, value] = match;
    if (setConfigValue(existingConfig, key, value)) {
      printSuccess(`Set ${key} = ${value}`);
      hasChanges = true;
    } else {
      printError(`Failed to set ${key}`);
    }
  }

  // Also handle positional args after --set
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--set' && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      const kvMatch = args[i + 1].match(/^(.+)=(.*)$/);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        if (setConfigValue(existingConfig, key, value)) {
          printSuccess(`Set ${key} = ${value}`);
          hasChanges = true;
        }
      }
    }
  }

  if (hasChanges) {
    const result = await writeConfig(existingConfig);
    if (result.success) {
      printSuccess(`Configuration saved to ${result.path}`);
    } else {
      printError(`Failed to save: ${result.error}`);
      process.exit(1);
    }
  }

  process.exit(0);
}

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      const addr = server.address() as AddressInfo;
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
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
 * Validate Discord webhook URL and optionally test it
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
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Claude Code Notification Setup - Connection Test',
          username: 'Claude Code Setup',
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
 * Validate server health endpoint (without auth)
 */
async function validateServerHealth(url: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const healthUrl = url.endsWith('/') ? `${url}health` : `${url}/health`;
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });

    if (response.ok) {
      return { valid: true };
    }

    return { valid: false, error: `Server returned status ${response.status}` };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { valid: false, error: 'Connection timeout (5s)' };
    }
    return { valid: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Validate SDK key by pinging server health with Bearer token
 * Per E:validation-on-entry-pattern - validate credentials when entered
 */
async function validateSdkKey(url: string, key: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const healthUrl = url.endsWith('/') ? `${url}health` : `${url}/health`;
    const response = await fetch(healthUrl, {
      headers: {
        'Authorization': `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'Invalid SDK key (401 Unauthorized)' };
    }

    return { valid: false, error: `Server returned status ${response.status}` };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { valid: false, error: 'Connection timeout (5s)' };
    }
    return { valid: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/**
 * Step 1: Path Selection (A or B)
 */
async function selectPath(): Promise<'local' | 'remote'> {
  console.log(`
${colors.bold}========================================${colors.reset}
  Notification Server Setup Wizard
${colors.bold}========================================${colors.reset}

This wizard will configure your notification system for
task completion alerts (TTS, Discord, console).
`);

  const path = await select({
    message: 'How would you like to set up notifications?',
    choices: [
      {
        name: '(A) Create NEW local server',
        value: 'local' as const,
        description: 'Run notification server on this machine with TTS, Discord, and console channels',
      },
      {
        name: '(B) Connect to EXISTING server',
        value: 'remote' as const,
        description: 'Connect to a remote notification server (e.g., shared team server)',
      },
    ],
  });

  return path;
}

/**
 * Path A, Step 1: Port Configuration
 */
async function configurePort(): Promise<number> {
  console.log('\n--- Port Configuration ---\n');

  const defaultPort = 7777;

  // Check if default port is available
  const defaultAvailable = await isPortAvailable(defaultPort);
  if (defaultAvailable) {
    printInfo(`Default port ${defaultPort} is available`);
  } else {
    printWarning(`Default port ${defaultPort} is in use`);
  }

  let port = defaultPort;
  let portValid = false;

  while (!portValid) {
    port = (await number({
      message: 'Enter port number for the notification server:',
      default: defaultPort,
      min: 1024,
      max: 65535,
      validate: (value) => {
        if (value === undefined || value < 1024 || value > 65535) {
          return 'Port must be between 1024 and 65535';
        }
        return true;
      },
    })) || defaultPort;

    printInfo(`Checking port ${port}...`);
    const available = await isPortAvailable(port);

    if (available) {
      printSuccess(`Port ${port} is available`);
      portValid = true;
    } else {
      printError(`Port ${port} is already in use`);
      const tryAnother = await confirm({
        message: 'Would you like to try a different port?',
        default: true,
      });
      if (!tryAnother) {
        printWarning('Proceeding with potentially unavailable port');
        portValid = true;
      }
    }
  }

  return port;
}

/**
 * Path A, Step 2: TTS/ElevenLabs Setup
 */
async function configureTTS(): Promise<ServiceConfig['channels']['tts']> {
  console.log('\n--- TTS (Text-to-Speech) Setup ---\n');

  const enableTTS = await confirm({
    message: 'Enable TTS notifications? (Uses ElevenLabs API)',
    default: true,
  });

  if (!enableTTS) {
    printInfo('TTS notifications disabled');
    return {
      enabled: false,
      voiceId: '21m00Tcm4TlvDq8ikWAM',
    };
  }

  // API Key
  const apiKey = await password({
    message: 'Enter your ElevenLabs API key:',
    mask: '*',
    validate: (value) => {
      if (!value || value.trim() === '') {
        return 'API key is required for TTS';
      }
      return true;
    },
  });

  printInfo('Validating API key...');
  const validation = await validateElevenLabsApiKey(apiKey);

  if (validation.valid) {
    printSuccess('API key validated successfully');
  } else {
    printError(`Validation failed: ${validation.error}`);
    const useAnyway = await confirm({
      message: 'Use this API key anyway? (You can fix it later)',
      default: false,
    });
    if (!useAnyway) {
      return {
        enabled: false,
        voiceId: '21m00Tcm4TlvDq8ikWAM',
      };
    }
  }

  // Voice ID
  const voiceId = await input({
    message: 'Voice ID (leave empty for default Rachel voice):',
    default: '21m00Tcm4TlvDq8ikWAM',
  });

  return {
    enabled: true,
    apiKey,
    voiceId: voiceId || '21m00Tcm4TlvDq8ikWAM',
  };
}

/**
 * Path A, Step 3: Discord Setup
 */
async function configureDiscord(): Promise<ServiceConfig['channels']['discord']> {
  console.log('\n--- Discord Notifications Setup ---\n');

  const enableDiscord = await confirm({
    message: 'Enable Discord notifications?',
    default: true,
  });

  if (!enableDiscord) {
    printInfo('Discord notifications disabled');
    return {
      enabled: false,
    };
  }

  // Webhook URL
  const webhookUrl = await input({
    message: 'Enter Discord webhook URL:',
    validate: (value) => {
      if (!value || value.trim() === '') {
        return 'Webhook URL is required for Discord';
      }
      const pattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
      if (!pattern.test(value)) {
        return 'Invalid Discord webhook URL format (expected: https://discord.com/api/webhooks/...)';
      }
      return true;
    },
  });

  // Test connection
  const testConnection = await confirm({
    message: 'Send a test message to verify the webhook?',
    default: true,
  });

  if (testConnection) {
    printInfo('Testing webhook connection...');
    const validation = await validateDiscordWebhook(webhookUrl, true);

    if (validation.valid) {
      printSuccess('Webhook connection successful - check your Discord channel!');
    } else {
      printError(`Connection test failed: ${validation.error}`);
      const useAnyway = await confirm({
        message: 'Use this webhook anyway?',
        default: false,
      });
      if (!useAnyway) {
        return {
          enabled: false,
        };
      }
    }
  }

  // Mention role (optional)
  const mentionRole = await input({
    message: 'Role ID to mention (optional, leave empty to skip):',
    default: '',
  });

  return {
    enabled: true,
    webhookUrl,
    mentionRole: mentionRole || undefined,
  };
}

/**
 * Path A, Step 4: ngrok Setup
 */
async function configureNgrok(): Promise<ServiceConfig['ngrok']> {
  console.log('\n--- Remote Access (ngrok) Setup ---\n');

  const enableNgrok = await confirm({
    message: 'Enable remote access via ngrok? (Allows other machines to connect)',
    default: false,
  });

  if (!enableNgrok) {
    printInfo('Remote access disabled');
    return {
      enabled: false,
    };
  }

  // Auth token
  const authToken = await password({
    message: 'Enter your ngrok auth token:',
    mask: '*',
    validate: (value) => {
      if (!value || value.trim() === '') {
        return 'Auth token is required for ngrok';
      }
      // Basic format check for ngrok tokens
      if (!value.includes('_')) {
        return 'Invalid ngrok auth token format';
      }
      return true;
    },
  });

  // Subdomain (optional, requires paid ngrok)
  const useSubdomain = await confirm({
    message: 'Use a reserved subdomain? (Requires paid ngrok plan)',
    default: false,
  });

  let subdomain: string | undefined;
  if (useSubdomain) {
    subdomain = await input({
      message: 'Enter your reserved subdomain:',
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'Subdomain is required';
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
          return 'Subdomain can only contain lowercase letters, numbers, and hyphens';
        }
        return true;
      },
    });
  }

  printSuccess('ngrok configuration saved');
  printInfo('Note: ngrok tunnel will be started when the notification server runs');

  return {
    enabled: true,
    authToken,
    subdomain,
  };
}

/**
 * Path A: Console channel setup
 */
async function configureConsole(): Promise<ServiceConfig['channels']['console']> {
  console.log('\n--- Console Notifications ---\n');

  const enableConsole = await confirm({
    message: 'Enable console notifications? (Prints summary to terminal)',
    default: true,
  });

  return {
    enabled: enableConsole,
  };
}

/**
 * Path A, Step 5: Server-Side Summarization Setup (AC-001, AC-002)
 *
 * Configures server-side summarization using Anthropic API.
 * This replaces local summarization when in centralized mode.
 */
async function configureServerSummarization(): Promise<ServiceConfig['summarization']> {
  console.log('\n--- Server-Side Summarization Setup (Anthropic) ---\n');

  printInfo('Server-side summarization generates concise task summaries using Claude.');
  printInfo('All API keys are stored in ~/.claude-notify/config.json (centralized).');
  printInfo('This is required for thin client mode where clients send raw events.');

  const enableSummarization = await confirm({
    message: 'Enable server-side summarization? (Required for thin client mode)',
    default: true,
  });

  if (!enableSummarization) {
    printInfo('Server-side summarization disabled');
    printWarning('Without this, thin clients will not work (raw events cannot be processed)');
    return {
      enabled: false,
    };
  }

  // Anthropic API Key
  const apiKey = await password({
    message: 'Enter your Anthropic API key:',
    mask: '*',
    validate: (value) => {
      if (!value || value.trim() === '') {
        return 'Anthropic API key is required for server-side summarization';
      }
      if (!value.startsWith('sk-ant-')) {
        return 'Invalid Anthropic API key format (should start with sk-ant-)';
      }
      return true;
    },
  });

  // Model selection
  const model = await select({
    message: 'Select Claude model for summarization:',
    choices: [
      { name: 'Claude 3 Haiku (fast, cheap)', value: 'claude-3-haiku-20240307', description: 'Recommended for summaries' },
      { name: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022', description: 'Latest Haiku model' },
      { name: 'Claude 3 Sonnet', value: 'claude-3-sonnet-20240229', description: 'Better quality, more expensive' },
    ],
    default: 'claude-3-haiku-20240307',
  });

  printSuccess(`Server-side summarization configured: Anthropic / ${model}`);

  return {
    enabled: true,
    apiKey,
    apiUrl: 'https://api.anthropic.com',
    model,
  };
}

/**
 * Path A, Step 5: LLM Summarizer Setup (Legacy - for local mode)
 */
async function configureSummary(): Promise<ServiceConfig['summary']> {
  console.log('\n--- LLM Summarizer Setup ---\n');

  printInfo('The summarizer generates concise summaries of completed tasks.');
  printInfo('It uses any OpenAI-compatible API (OpenAI, OpenRouter, Anthropic, Ollama, etc.)');

  const enableSummary = await confirm({
    message: 'Enable LLM-based summarization?',
    default: true,
  });

  if (!enableSummary) {
    printInfo('LLM summarization disabled');
    return {
      apiUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
    };
  }

  // API Provider selection
  const provider = await select({
    message: 'Select your LLM provider:',
    choices: [
      { name: 'OpenAI', value: 'openai', description: 'Direct OpenAI API' },
      { name: 'OpenRouter', value: 'openrouter', description: 'Multi-provider gateway (recommended)' },
      { name: 'Anthropic', value: 'anthropic', description: 'Claude models via Anthropic API' },
      { name: 'Local (Ollama)', value: 'ollama', description: 'Run locally with Ollama' },
      { name: 'Custom', value: 'custom', description: 'Custom OpenAI-compatible endpoint' },
    ],
  });

  let apiUrl = 'https://api.openai.com/v1';
  let defaultModel = 'gpt-4o-mini';

  switch (provider) {
    case 'openai':
      apiUrl = 'https://api.openai.com/v1';
      defaultModel = 'gpt-4o-mini';
      break;
    case 'openrouter':
      apiUrl = 'https://openrouter.ai/api/v1';
      defaultModel = 'google/gemini-2.5-flash';
      break;
    case 'anthropic':
      apiUrl = 'https://api.anthropic.com/v1';
      defaultModel = 'claude-3-haiku-20240307';
      break;
    case 'ollama':
      apiUrl = 'http://localhost:11434/v1';
      defaultModel = 'llama3.2';
      break;
    case 'custom':
      apiUrl = await input({
        message: 'Enter your API base URL:',
        default: 'https://api.openai.com/v1',
        validate: (value) => {
          if (!value || value.trim() === '') {
            return 'API URL is required';
          }
          try {
            new URL(value);
            return true;
          } catch {
            return 'Invalid URL format';
          }
        },
      });
      defaultModel = 'gpt-4o-mini';
      break;
  }

  // API Key (skip for local Ollama)
  let apiKey: string | undefined;
  if (provider !== 'ollama') {
    apiKey = await password({
      message: `Enter your ${provider === 'custom' ? 'API' : provider.charAt(0).toUpperCase() + provider.slice(1)} key:`,
      mask: '*',
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'API key is required';
        }
        return true;
      },
    });
  }

  // Model selection
  const model = await input({
    message: 'Enter the model to use:',
    default: defaultModel,
  });

  printSuccess(`Summarizer configured: ${provider} / ${model}`);

  return {
    apiUrl,
    apiKey,
    model,
  };
}

/**
 * Path B: Existing Server Connection
 *
 * Updated for NOTIFY-013: Support hosted server URL and SDK key authentication
 */
async function configureRemoteServer(): Promise<{ remoteUrl: string; sdkKey?: string }> {
  console.log('\n--- Connect to Existing Server ---\n');

  printInfo('Connect to a hosted notification server.');
  printInfo('Examples: https://notify.yourdomain.com, https://notifications.mycompany.io');

  let remoteUrl = '';
  let urlValidated = false;

  while (!urlValidated) {
    remoteUrl = await input({
      message: 'Enter your notification server URL:',
      default: 'https://notify.yourdomain.com',
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'Server URL is required';
        }
        try {
          const url = new URL(value);
          if (!['http:', 'https:'].includes(url.protocol)) {
            return 'URL must use http or https protocol';
          }
          return true;
        } catch {
          return 'Invalid URL format (e.g., https://notify.yourdomain.com)';
        }
      },
    });

    printInfo('Checking server connectivity...');
    const validation = await validateServerHealth(remoteUrl);

    if (validation.valid) {
      printSuccess('Server is reachable');
      urlValidated = true;
    } else {
      printError(`Connection failed: ${validation.error}`);
      const tryAgain = await confirm({
        message: 'Would you like to try a different URL?',
        default: true,
      });
      if (!tryAgain) {
        printWarning('Proceeding with potentially unreachable server');
        urlValidated = true;
      }
    }
  }

  // SDK Key prompt
  console.log('\n--- SDK Key Authentication ---\n');

  printInfo('Remote servers require an SDK key for authentication.');
  printInfo('Get your key by running: bun notify-service/src/admin-cli.ts key create --name "my-device"');

  const sdkKey = await password({
    message: 'Enter your SDK key:',
    mask: '*',
    validate: (value) => {
      if (!value || value.trim() === '') {
        return 'SDK key is required for remote server';
      }
      if (!value.startsWith('sk_live_')) {
        return 'Invalid SDK key format (should start with sk_live_)';
      }
      return true;
    },
  });

  // Validate SDK key against the server
  printInfo('Validating SDK key...');
  const keyValidation = await validateSdkKey(remoteUrl, sdkKey);

  if (keyValidation.valid) {
    printSuccess('SDK key validated successfully');
  } else {
    printError(`SDK key validation failed: ${keyValidation.error}`);
    const useAnyway = await confirm({
      message: 'Use this SDK key anyway? (You can update it later)',
      default: false,
    });
    if (!useAnyway) {
      printWarning('Continuing without valid SDK key - notifications may fail');
      return { remoteUrl };
    }
  }

  return { remoteUrl, sdkKey };
}

/**
 * Write configuration to ~/.claude-notify/config.json
 */
async function writeConfig(config: ServiceConfig): Promise<{ success: boolean; path: string; error?: string }> {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  try {
    // Create directory if it doesn't exist
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Write config file
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    return { success: true, path: configPath };
  } catch (error) {
    return {
      success: false,
      path: configPath,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Per-project Discord configuration (NOTIFY-003)
 *
 * Allows each project to have its own Discord channel for notifications.
 * Stored in .config/notification-config.json within the project.
 */
async function configurePerProjectDiscord(): Promise<string | null> {
  console.log('\n--- Per-Project Discord Channel (Optional) ---\n');

  printInfo('You can configure a project-specific Discord channel for this project.');
  printInfo('If not configured, notifications will go to the global Discord channel.');

  const enablePerProject = await confirm({
    message: 'Configure a Discord webhook specific to this project?',
    default: false,
  });

  if (!enablePerProject) {
    printInfo('Using global Discord channel for this project');
    return null;
  }

  // Webhook URL
  const webhookUrl = await input({
    message: 'Enter Discord webhook URL for this project:',
    validate: (value) => {
      if (!value || value.trim() === '') {
        return 'Webhook URL is required';
      }
      const pattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
      if (!pattern.test(value)) {
        return 'Invalid Discord webhook URL format (expected: https://discord.com/api/webhooks/...)';
      }
      return true;
    },
  });

  // Test connection
  const testConnection = await confirm({
    message: 'Send a test message to verify the webhook?',
    default: true,
  });

  if (testConnection) {
    printInfo('Testing webhook connection...');
    const validation = await validateDiscordWebhook(webhookUrl, true);

    if (validation.valid) {
      printSuccess('Webhook connection successful - check your Discord channel!');
    } else {
      printError(`Connection test failed: ${validation.error}`);
      const useAnyway = await confirm({
        message: 'Use this webhook anyway?',
        default: false,
      });
      if (!useAnyway) {
        printInfo('Skipping per-project Discord configuration');
        return null;
      }
    }
  }

  return webhookUrl;
}

/**
 * Write per-project notification config
 *
 * Creates .config/notification-config.json in the current project directory.
 */
interface PerProjectConfig {
  discordWebhookUrl?: string;
  voiceId?: string;  // Per-project ElevenLabs voice ID (NOTIFY-004)
}

async function writePerProjectConfig(config: PerProjectConfig): Promise<{ success: boolean; path: string; error?: string }> {
  const configPath = join(process.cwd(), '.config/notification-config.json');
  const configDir = join(process.cwd(), '.config');

  try {
    // Create directory if it doesn't exist
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Load existing config if present
    let existingConfig: PerProjectConfig = {};
    if (existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch {
        // Ignore parse errors, start fresh
      }
    }

    // Merge with new config
    const mergedConfig = { ...existingConfig, ...config };

    // Write config file
    writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2) + '\n', 'utf-8');

    return { success: true, path: configPath };
  } catch (error) {
    return {
      success: false,
      path: configPath,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run wizard in reconfigure mode - show current values, allow skipping sections
 */
async function runReconfigureWizard(existingConfig: ServiceConfig): Promise<ServiceConfig> {
  console.log(`
${colors.bold}========================================${colors.reset}
  Reconfigure Notification Settings
${colors.bold}========================================${colors.reset}

Current config loaded. Press Enter to keep current values,
or select 'Configure' to modify a section.
`);

  const config = { ...existingConfig };

  // Show current mode
  printInfo(`Current mode: ${config.mode}`);
  const changeMode = await confirm({
    message: 'Change mode (local/remote)?',
    default: false,
  });
  if (changeMode) {
    config.mode = await select({
      message: 'Select mode:',
      choices: [
        { name: 'Local', value: 'local' as const },
        { name: 'Remote', value: 'remote' as const },
      ],
      default: config.mode,
    });
  }

  if (config.mode === 'local') {
    // Port
    printInfo(`Current port: ${config.port || 7777}`);
    const changePort = await confirm({ message: 'Change port?', default: false });
    if (changePort) {
      config.port = await configurePort();
    }

    // TTS
    printInfo(`TTS: ${config.channels.tts.enabled ? 'enabled' : 'disabled'}`);
    const changeTTS = await confirm({ message: 'Configure TTS?', default: false });
    if (changeTTS) {
      config.channels.tts = await configureTTS();
    }

    // Discord
    printInfo(`Discord: ${config.channels.discord.enabled ? 'enabled' : 'disabled'}`);
    const changeDiscord = await confirm({ message: 'Configure Discord?', default: false });
    if (changeDiscord) {
      config.channels.discord = await configureDiscord();
    }

    // Console
    printInfo(`Console: ${config.channels.console.enabled ? 'enabled' : 'disabled'}`);
    const changeConsole = await confirm({ message: 'Configure Console?', default: false });
    if (changeConsole) {
      config.channels.console = await configureConsole();
    }

    // ngrok
    printInfo(`ngrok: ${config.ngrok?.enabled ? 'enabled' : 'disabled'}`);
    const changeNgrok = await confirm({ message: 'Configure ngrok?', default: false });
    if (changeNgrok) {
      config.ngrok = await configureNgrok();
    }
  } else {
    // Remote URL and SDK Key
    printInfo(`Remote URL: ${config.remoteUrl || 'not set'}`);
    printInfo(`SDK Key: ${config.sdkKey ? 'configured' : 'not set'}`);

    const changeRemote = await confirm({ message: 'Change remote URL or SDK key?', default: false });
    if (changeRemote) {
      const { remoteUrl, sdkKey } = await configureRemoteServer();
      config.remoteUrl = remoteUrl;
      if (sdkKey) {
        config.sdkKey = sdkKey;
      }
    }
  }

  // Summarization (local mode only - remote server handles summarization)
  if (config.mode === 'local') {
    printInfo(`Summarization: ${config.summarization?.enabled ? 'enabled' : 'disabled'}`);
    const changeSummarization = await confirm({ message: 'Configure summarization?', default: false });
    if (changeSummarization) {
      config.summarization = await configureServerSummarization();
      // Update legacy summary config for backward compatibility
      if (config.summarization.enabled) {
        config.summary = {
          apiUrl: config.summarization.apiUrl || 'https://api.anthropic.com',
          apiKey: config.summarization.apiKey,
          model: config.summarization.model || 'claude-3-haiku-20240307',
        };
      }
    }
  }

  return config;
}

/**
 * Main wizard flow
 */
async function runWizard(): Promise<void> {
  try {
    // Handle --set mode first
    if (setArgs.length > 0) {
      await handleSetArgs(setArgs);
      return;
    }

    // Handle --reconfigure mode
    const existingConfig = loadExistingConfig();
    if (isReconfigure) {
      if (!existingConfig) {
        printError('No existing config found. Run wizard without --reconfigure first.');
        process.exit(1);
      }
      const config = await runReconfigureWizard(existingConfig);
      console.log('\n--- Saving Configuration ---\n');
      const result = await writeConfig(config);
      if (result.success) {
        printSuccess(`Configuration saved to ${result.path}`);
      } else {
        printError(`Failed to save: ${result.error}`);
        process.exit(1);
      }
      return;
    }

    // Step 1: Select path (A or B)
    const path = await selectPath();

    let config: ServiceConfig;

    if (path === 'local') {
      // Path A: Create NEW local server
      const port = await configurePort();
      const tts = await configureTTS();
      const discord = await configureDiscord();
      const consoleChannel = await configureConsole();

      // Server-side summarization (consolidates LLM Summarizer + Server-Side into one section)
      // This handles both local summarization and thin client support
      const summarization = await configureServerSummarization();

      // Build summary config from summarization for backward compatibility
      const summary = summarization.enabled
        ? {
            apiUrl: summarization.apiUrl || 'https://api.anthropic.com',
            apiKey: summarization.apiKey,
            model: summarization.model || 'claude-3-haiku-20240307',
          }
        : {
            apiUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
          };

      const ngrok = await configureNgrok();

      config = {
        mode: 'local',
        port,
        channels: {
          tts,
          discord,
          console: consoleChannel,
        },
        ngrok,
        summary,
        // Server-side summarization config (AC-001, AC-002)
        summarization,
        claude: {
          model: 'haiku',
        },
        durationThresholdMs: 30000,
        debug: false,
      };
    } else {
      // Path B: Connect to EXISTING server (NOTIFY-013)
      const { remoteUrl, sdkKey } = await configureRemoteServer();

      // Remote mode: Server handles summarization, no local LLM config needed
      config = {
        mode: 'remote',
        remoteUrl,
        sdkKey,  // SDK key for authenticating with remote server
        channels: {
          tts: { enabled: false, voiceId: '21m00Tcm4TlvDq8ikWAM' },
          discord: { enabled: false },
          console: { enabled: true },
        },
        // Minimal summary config for backward compatibility
        summary: {
          apiUrl: 'https://api.anthropic.com',
          model: 'claude-3-haiku-20240307',
        },
        claude: {
          model: 'haiku',
        },
        durationThresholdMs: 30000,
        debug: false,
      };
    }

      // Per-project Discord channel (NOTIFY-003)
    const perProjectWebhook = await configurePerProjectDiscord();

    // Write global configuration
    console.log('\n--- Saving Configuration ---\n');
    const result = await writeConfig(config);

    // Write per-project config if webhook was provided
    if (perProjectWebhook) {
      const projectConfigResult = await writePerProjectConfig({ discordWebhookUrl: perProjectWebhook });
      if (projectConfigResult.success) {
        printSuccess(`Per-project Discord webhook saved to ${projectConfigResult.path}`);
      } else {
        printWarning(`Could not save per-project config: ${projectConfigResult.error}`);
      }
    }

    if (result.success) {
      printSuccess(`Configuration saved to ${result.path}`);

      console.log(`
${colors.bold}========================================${colors.reset}
  Setup Complete!
${colors.bold}========================================${colors.reset}

${colors.green}Configuration saved to:${colors.reset} ${result.path}

${colors.cyan}Next steps:${colors.reset}
`);

      if (config.mode === 'local') {
        console.log('  1. Start the notification daemon:');
        console.log('     ./hooks/monitor-daemon.sh start\n');
        console.log('  2. Verify notifications with:');
        console.log('     bun hooks/config-tui.ts (select "Test Notification")\n');
      } else {
        console.log('  1. Ensure your remote server is running at:');
        console.log(`     ${config.remoteUrl}\n`);
        console.log('  2. Start the notification hook:');
        console.log('     (Hooks are already wired in .claude/settings.json)\n');
      }

      console.log('  Configure more options anytime:');
      console.log('     bun hooks/config-tui.ts\n');
    } else {
      printError(`Failed to save configuration: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      console.log('\n\nSetup cancelled.\n');
      process.exit(0);
    }
    throw error;
  }
}

/**
 * CLI entry point
 */
if (import.meta.main) {
  runWizard().catch((error) => {
    console.error('Setup wizard error:', error);
    process.exit(1);
  });
}

// Export for testing and integration
export {
  runWizard,
  selectPath,
  configurePort,
  configureTTS,
  configureDiscord,
  configureNgrok,
  configureConsole,
  configureSummary,
  configureServerSummarization,
  configureRemoteServer,
  configurePerProjectDiscord,
  writeConfig,
  writePerProjectConfig,
  validateElevenLabsApiKey,
  validateDiscordWebhook,
  validateServerHealth,
  validateSdkKey,
  isPortAvailable,
  getConfigDir,
  getConfigPath,
  type ServiceConfig,
  type PerProjectConfig,
};
