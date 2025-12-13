#!/usr/bin/env bun
/**
 * Notification Service CLI
 *
 * Command-line interface for managing the centralized notification service.
 *
 * Commands:
 *   start    - Start the daemon (daemonize)
 *   stop     - Stop the running daemon
 *   status   - Show daemon status and queue
 *   config   - View/edit configuration
 *   test     - Send a test notification
 */

import {
  loadConfig,
  saveConfig,
  getConfigPath,
  getConfigSummary,
  validateConfig,
  createDefaultConfig,
} from './config';
import {
  getDaemonStatus,
  startDaemon,
  stopDaemon,
  sendTestNotification,
} from './daemon';
import { startServer } from './server';

const VERSION = '1.0.0';

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Notification Service CLI v${VERSION}

Usage: claude-notify <command> [options]

Commands:
  start [--foreground]  Start the notification service
                        --foreground: Run in foreground (for debugging)
  stop                  Stop the running service
  status                Show service status and queue
  config                View current configuration
  config init           Create default configuration
  test                  Send a test notification

  webhook <url>         Set Discord webhook for current project (NOTIFY-003)
  webhook --show        Show current project webhook
  webhook --clear       Remove project webhook (use global)

  voice <id>            Set ElevenLabs voice ID for current project (NOTIFY-004)
  voice --show          Show current project voice ID
  voice --clear         Remove project voice (use global)

Options:
  --help, -h            Show this help message
  --version, -v         Show version

Examples:
  claude-notify start
  claude-notify start --foreground
  claude-notify status
  claude-notify test
  claude-notify webhook https://discord.com/api/webhooks/...
  claude-notify voice 21m00Tcm4TlvDq8ikWAM
`);
}

/**
 * Handle start command
 */
async function handleStart(foreground: boolean): Promise<void> {
  const config = await loadConfig();

  if (foreground) {
    console.log('Starting notification service in foreground...');
    await startServer();
    return;
  }

  console.log('Starting notification service daemon...');
  const result = await startDaemon(config.server.port);

  if (result.success) {
    console.log(`Daemon started successfully (PID ${result.pid})`);
    console.log(`Listening on http://${config.server.host}:${config.server.port}`);
  } else {
    console.error(`Failed to start daemon: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Handle stop command
 */
async function handleStop(): Promise<void> {
  console.log('Stopping notification service daemon...');
  const result = await stopDaemon();

  if (result.success) {
    console.log('Daemon stopped successfully');
  } else {
    console.error(`Failed to stop daemon: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Handle status command
 */
async function handleStatus(): Promise<void> {
  const status = await getDaemonStatus();

  console.log('Notification Service Status');
  console.log('===========================');
  console.log('');

  if (status.running) {
    console.log(`Status: RUNNING`);
    console.log(`PID: ${status.pid}`);
    console.log(`Port: ${status.port}`);
    console.log(`Started: ${status.startedAt}`);
    if (status.uptime) {
      const seconds = Math.floor(status.uptime / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      console.log(`Uptime: ${hours}h ${minutes % 60}m ${seconds % 60}s`);
    }

    // Show ngrok URL from PID file if available
    if (status.ngrokUrl) {
      console.log('');
      console.log('Public Access:');
      console.log(`  ngrok URL: ${status.ngrokUrl}`);
    }

    // Try to get health info
    try {
      const response = await fetch(`http://127.0.0.1:${status.port}/health`);
      if (response.ok) {
        const health = await response.json() as {
          channels: { tts: string; discord: string; console: string };
          ngrok?: { status: string; publicUrl?: string };
          responseStore?: { count: number; oldestEntryAge?: number };
        };
        console.log('');
        console.log('Channels:');
        console.log(`  TTS: ${health.channels.tts}`);
        console.log(`  Discord: ${health.channels.discord}`);
        console.log(`  Console: ${health.channels.console}`);

        // Show live ngrok status
        if (health.ngrok) {
          console.log('');
          console.log('ngrok Tunnel:');
          console.log(`  Status: ${health.ngrok.status}`);
          if (health.ngrok.publicUrl) {
            console.log(`  Public URL: ${health.ngrok.publicUrl}`);
          }
        }

        // Show response store stats
        if (health.responseStore && health.responseStore.count > 0) {
          console.log('');
          console.log('Response Store:');
          console.log(`  Stored Responses: ${health.responseStore.count}`);
          if (health.responseStore.oldestEntryAge) {
            const ageMinutes = Math.floor(health.responseStore.oldestEntryAge / 1000 / 60);
            console.log(`  Oldest Entry: ${ageMinutes} minutes ago`);
          }
        }
      }
    } catch {
      console.log('');
      console.log('(Could not fetch health info)');
    }

    // Try to get queue info
    try {
      const response = await fetch(`http://127.0.0.1:${status.port}/queue`);
      if (response.ok) {
        const queue = await response.json() as { queueLength: number; isPlaying: boolean };
        console.log('');
        console.log('Audio Queue:');
        console.log(`  Length: ${queue.queueLength}`);
        console.log(`  Playing: ${queue.isPlaying ? 'Yes' : 'No'}`);
      }
    } catch {
      // Ignore
    }
  } else {
    console.log('Status: STOPPED');
    console.log('');
    console.log('Run "claude-notify start" to start the service');
  }
}

/**
 * Handle config command
 */
async function handleConfig(init: boolean): Promise<void> {
  if (init) {
    const config = createDefaultConfig();
    const result = await saveConfig(config);

    if (result.success) {
      console.log(`Configuration initialized at ${getConfigPath()}`);
    } else {
      console.error(`Failed to save config: ${result.error}`);
      process.exit(1);
    }
    return;
  }

  const config = await loadConfig();
  const warnings = validateConfig(config);
  const summary = getConfigSummary(config);

  console.log('Notification Service Configuration');
  console.log('==================================');
  console.log('');
  console.log(`Config file: ${getConfigPath()}`);
  console.log('');
  console.log(JSON.stringify(summary, null, 2));
  console.log('');

  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

/**
 * Handle test command
 */
async function handleTest(): Promise<void> {
  const status = await getDaemonStatus();

  if (!status.running || !status.port) {
    console.error('Daemon not running. Start with "claude-notify start" first.');
    process.exit(1);
  }

  console.log(`Sending test notification to port ${status.port}...`);
  const result = await sendTestNotification(status.port);

  if (result.success) {
    console.log('Test notification sent successfully!');
    console.log('Response:', JSON.stringify(result.response, null, 2));
  } else {
    console.error(`Failed to send test notification: ${result.error}`);
    process.exit(1);
  }
}

/**
 * Handle webhook command (NOTIFY-003)
 */
async function handleWebhook(args: string[]): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');

  const CONFIG_PATH = path.join(process.cwd(), '.agent/loom/notification-config.json');
  const ALLOWED_DOMAINS = ['discord.com', 'discordapp.com'];

  interface ProjectNotifyConfig {
    discordWebhookUrl?: string;
  }

  function validateWebhookUrl(url: string): { valid: true } | { valid: false; error: string } {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        return { valid: false, error: 'Discord webhooks must use HTTPS' };
      }
      const hostname = parsed.hostname.toLowerCase();
      const isAllowed = ALLOWED_DOMAINS.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        return { valid: false, error: `Invalid domain. Must be discord.com or discordapp.com` };
      }
      if (!parsed.pathname.includes('/webhooks/')) {
        return { valid: false, error: 'URL does not appear to be a Discord webhook' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  function loadProjectConfig(): ProjectNotifyConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
    } catch { /* ignore */ }
    return {};
  }

  function saveProjectConfig(config: ProjectNotifyConfig): void {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  }

  function maskWebhookUrl(webhookUrl: string): string {
    try {
      const url = new URL(webhookUrl);
      const parts = url.pathname.split('/');
      if (parts.length >= 2) {
        parts[parts.length - 1] = parts[parts.length - 1].substring(0, 8) + '...';
      }
      return `${url.origin}${parts.join('/')}`;
    } catch {
      return '[invalid url]';
    }
  }

  // Handle --show
  if (args.includes('--show')) {
    const config = loadProjectConfig();
    if (config.discordWebhookUrl) {
      console.log(`Discord Webhook: ${maskWebhookUrl(config.discordWebhookUrl)}`);
      console.log(`Config file: ${CONFIG_PATH}`);
    } else {
      console.log('No Discord webhook configured for this project.');
      console.log('Using global webhook from ~/.claude-notify/config.json');
    }
    return;
  }

  // Handle --clear
  if (args.includes('--clear')) {
    const config = loadProjectConfig();
    delete config.discordWebhookUrl;
    saveProjectConfig(config);
    console.log('Discord webhook cleared for this project.');
    console.log('Will fall back to global webhook.');
    return;
  }

  // Set webhook URL
  const webhookUrl = args[0];
  if (!webhookUrl) {
    console.error('Usage: claude-notify webhook <url>');
    console.error('       claude-notify webhook --show');
    console.error('       claude-notify webhook --clear');
    process.exit(1);
  }

  const validation = validateWebhookUrl(webhookUrl);
  if (!validation.valid) {
    console.error(`Error: ${validation.error}`);
    process.exit(1);
  }

  const config = loadProjectConfig();
  config.discordWebhookUrl = webhookUrl;
  saveProjectConfig(config);

  console.log(`Discord webhook configured for this project.`);
  console.log(`Webhook: ${maskWebhookUrl(webhookUrl)}`);
  console.log(`Config file: ${CONFIG_PATH}`);
}

/**
 * Handle voice command (NOTIFY-004)
 * Set per-project ElevenLabs voice ID
 */
async function handleVoice(args: string[]): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');

  const CONFIG_PATH = path.join(process.cwd(), '.agent/loom/notification-config.json');

  interface ProjectNotifyConfig {
    discordWebhookUrl?: string;
    voiceId?: string;
  }

  function loadProjectConfig(): ProjectNotifyConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
    } catch { /* ignore */ }
    return {};
  }

  function saveProjectConfig(config: ProjectNotifyConfig): void {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  }

  // Handle --show
  if (args.includes('--show')) {
    const config = loadProjectConfig();
    if (config.voiceId) {
      console.log(`Voice ID: ${config.voiceId}`);
      console.log(`Config file: ${CONFIG_PATH}`);
    } else {
      console.log('No voice ID configured for this project.');
      console.log('Using global voice from ~/.claude-notify/config.json');
    }
    return;
  }

  // Handle --clear
  if (args.includes('--clear')) {
    const config = loadProjectConfig();
    delete config.voiceId;
    saveProjectConfig(config);
    console.log('Voice ID cleared for this project.');
    console.log('Will fall back to global voice.');
    return;
  }

  // Set voice ID
  const voiceId = args[0];
  if (!voiceId) {
    console.error('Usage: claude-notify voice <id>');
    console.error('       claude-notify voice --show');
    console.error('       claude-notify voice --clear');
    process.exit(1);
  }

  // No validation - ElevenLabs handles that (per task instructions)
  const config = loadProjectConfig();
  config.voiceId = voiceId;
  saveProjectConfig(config);

  console.log(`Voice ID configured for this project.`);
  console.log(`Voice: ${voiceId}`);
  console.log(`Config file: ${CONFIG_PATH}`);
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`claude-notify v${VERSION}`);
    return;
  }

  const command = args[0];

  switch (command) {
    case 'start':
      await handleStart(args.includes('--foreground'));
      break;

    case 'stop':
      await handleStop();
      break;

    case 'status':
      await handleStatus();
      break;

    case 'config':
      await handleConfig(args[1] === 'init');
      break;

    case 'test':
      await handleTest();
      break;

    case 'webhook':
      await handleWebhook(args.slice(1));
      break;

    case 'voice':
      await handleVoice(args.slice(1));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "claude-notify --help" for usage');
      process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
