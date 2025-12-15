#!/usr/bin/env bun
/**
 * Set Discord Webhook for Project
 *
 * Quick CLI to configure per-project Discord webhook URL.
 *
 * Usage:
 *   bun notify-service/src/commands/set-webhook.ts <webhook-url>
 *   bun notify-service/src/commands/set-webhook.ts --show
 *   bun notify-service/src/commands/set-webhook.ts --clear
 *
 * This creates/updates .config/notification-config.json in the current directory.
 */

import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(process.cwd(), '.config/notification-config.json');
const ALLOWED_DOMAINS = ['discord.com', 'discordapp.com'];

interface ProjectNotifyConfig {
  discordWebhookUrl?: string;
  // Future: other per-project overrides
}

function validateWebhookUrl(url: string): { valid: true } | { valid: false; error: string } {
  try {
    const parsed = new URL(url);

    // Must be HTTPS
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Discord webhooks must use HTTPS' };
    }

    // Must be Discord domain (SSRF prevention)
    const hostname = parsed.hostname.toLowerCase();
    const isAllowed = ALLOWED_DOMAINS.some(
      domain => hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowed) {
      return {
        valid: false,
        error: `Invalid domain. Must be discord.com or discordapp.com, got: ${hostname}`,
      };
    }

    // Must be a webhook path
    if (!parsed.pathname.includes('/webhooks/')) {
      return { valid: false, error: 'URL does not appear to be a Discord webhook' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

function loadConfig(): ProjectNotifyConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

function saveConfig(config: ProjectNotifyConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

function showHelp(): void {
  console.log(`
Set Discord Webhook for Project

Usage:
  set-webhook <webhook-url>   Set the Discord webhook URL for this project
  set-webhook --show          Show current webhook configuration
  set-webhook --clear         Remove the webhook configuration

Examples:
  set-webhook https://discord.com/api/webhooks/123456/abcdef
  set-webhook --show

The configuration is stored in:
  .config/notification-config.json
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  if (args.includes('--show')) {
    const config = loadConfig();
    if (config.discordWebhookUrl) {
      // Mask the token for security
      const url = new URL(config.discordWebhookUrl);
      const parts = url.pathname.split('/');
      if (parts.length >= 2) {
        parts[parts.length - 1] = parts[parts.length - 1].substring(0, 8) + '...';
      }
      const maskedUrl = `${url.origin}${parts.join('/')}`;
      console.log(`Discord Webhook: ${maskedUrl}`);
      console.log(`Config file: ${CONFIG_PATH}`);
    } else {
      console.log('No Discord webhook configured for this project.');
      console.log('Using global webhook from ~/.claude-notify/config.json');
    }
    return;
  }

  if (args.includes('--clear')) {
    const config = loadConfig();
    delete config.discordWebhookUrl;
    saveConfig(config);
    console.log('Discord webhook cleared for this project.');
    console.log('Will fall back to global webhook.');
    return;
  }

  // Set webhook URL
  const webhookUrl = args[0];

  const validation = validateWebhookUrl(webhookUrl);
  if (!validation.valid) {
    console.error(`Error: ${validation.error}`);
    process.exit(1);
  }

  const config = loadConfig();
  config.discordWebhookUrl = webhookUrl;
  saveConfig(config);

  // Mask for display
  const url = new URL(webhookUrl);
  const parts = url.pathname.split('/');
  if (parts.length >= 2) {
    parts[parts.length - 1] = parts[parts.length - 1].substring(0, 8) + '...';
  }
  const maskedUrl = `${url.origin}${parts.join('/')}`;

  console.log(`Discord webhook configured for this project.`);
  console.log(`Webhook: ${maskedUrl}`);
  console.log(`Config file: ${CONFIG_PATH}`);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
