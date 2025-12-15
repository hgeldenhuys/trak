#!/usr/bin/env bun
/**
 * Notification Service Admin CLI (NOTIFY-013)
 *
 * Command-line interface for managing SDK keys for API authentication.
 *
 * Commands:
 *   key create --name <name> [--project <id>]  - Create a new SDK key
 *   key list                                   - List all SDK keys
 *   key revoke <id>                            - Revoke an SDK key
 */

import { initDatabase } from './db';
import { generateSdkKey, truncateKeyForLogging } from './auth/key-generator';
import { createKey, listKeys, revokeKey, getKeyById } from './auth/sdk-keys';

const VERSION = '1.0.0';

// ANSI color codes for output formatting
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
${colors.bold}Notification Service Admin CLI v${VERSION}${colors.reset}

${colors.cyan}Usage:${colors.reset} notify-admin <command> [options]

${colors.cyan}Commands:${colors.reset}
  key create --name <name> [--project <id>]  Create a new SDK key
  key list                                   List all SDK keys
  key revoke <id>                            Revoke an SDK key by ID

${colors.cyan}Options:${colors.reset}
  --help, -h            Show this help message
  --version, -v         Show version

${colors.cyan}Examples:${colors.reset}
  notify-admin key create --name "macbook-pro"
  notify-admin key create --name "production" --project "my-project"
  notify-admin key list
  notify-admin key revoke 1
`);
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { named: Record<string, string>; positional: string[] } {
  const named: Record<string, string> = {};
  const positional: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      // Check if next arg exists and is not a flag
      if (nextArg && !nextArg.startsWith('-')) {
        named[key] = nextArg;
        i += 2;
      } else {
        named[key] = 'true';
        i += 1;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      named[key] = 'true';
      i += 1;
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { named, positional };
}

/**
 * Format a date string for display
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'never';

  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Mask a key hash for display (show first 8 chars of original key format)
 * Per Q:masked-api-key-display pattern
 */
function maskKeyForDisplay(): string {
  // We only store hashes, so we show a placeholder format
  return 'sk_live_********...';
}

/**
 * Handle 'key create' command
 */
function handleKeyCreate(args: { named: Record<string, string>; positional: string[] }): void {
  const name = args.named.name;
  const projectId = args.named.project;

  if (!name) {
    console.error(`${colors.red}Error:${colors.reset} --name is required`);
    console.error('');
    console.error('Usage: notify-admin key create --name <name> [--project <id>]');
    process.exit(1);
  }

  // Initialize database
  initDatabase();

  // Generate key
  const { plainKey, hash } = generateSdkKey();

  // Store in database
  const record = createKey(hash, name, projectId);

  // Display result
  console.log('');
  console.log(`${colors.green}${colors.bold}Created SDK Key${colors.reset}`);
  console.log('');
  console.log(`${colors.bold}Key:${colors.reset}  ${colors.cyan}${plainKey}${colors.reset}`);
  console.log('');
  console.log(`${colors.yellow}${colors.bold}SAVE THIS - shown only once!${colors.reset}`);
  console.log('');
  console.log(`${colors.dim}Name:${colors.reset}       ${record.name}`);
  console.log(`${colors.dim}ID:${colors.reset}         ${record.id}`);
  if (projectId) {
    console.log(`${colors.dim}Project:${colors.reset}    ${projectId}`);
  }
  console.log(`${colors.dim}Created:${colors.reset}    ${formatDate(record.createdAt)}`);
  console.log('');
}

/**
 * Handle 'key list' command
 */
function handleKeyList(): void {
  // Initialize database
  initDatabase();

  // Get all keys
  const keys = listKeys();

  if (keys.length === 0) {
    console.log('');
    console.log(`${colors.dim}No SDK keys found.${colors.reset}`);
    console.log('');
    console.log('Create one with: notify-admin key create --name "my-device"');
    console.log('');
    return;
  }

  // Print table header
  console.log('');
  console.log(`${colors.bold}ID${colors.reset}  ${colors.bold}Name${colors.reset}               ${colors.bold}Created${colors.reset}              ${colors.bold}Last Used${colors.reset}            ${colors.bold}Status${colors.reset}`);
  console.log(`${'─'.repeat(80)}`);

  // Print each key
  for (const key of keys) {
    const id = String(key.id).padEnd(3);
    const name = key.name.slice(0, 16).padEnd(18);
    const created = formatDate(key.createdAt).padEnd(20);
    const lastUsed = formatDate(key.lastUsedAt).padEnd(20);

    let status: string;
    if (key.revokedAt) {
      status = `${colors.red}Revoked${colors.reset}`;
    } else {
      status = `${colors.green}Active${colors.reset}`;
    }

    console.log(`${id} ${name} ${created} ${lastUsed} ${status}`);
  }

  console.log('');
}

/**
 * Handle 'key revoke' command
 */
function handleKeyRevoke(args: { named: Record<string, string>; positional: string[] }): void {
  // Key ID is the first positional argument after 'key' and 'revoke'
  const keyIdStr = args.positional[2];

  if (!keyIdStr) {
    console.error(`${colors.red}Error:${colors.reset} Key ID is required`);
    console.error('');
    console.error('Usage: notify-admin key revoke <id>');
    process.exit(1);
  }

  const keyId = parseInt(keyIdStr, 10);

  if (isNaN(keyId)) {
    console.error(`${colors.red}Error:${colors.reset} Invalid key ID: ${keyIdStr}`);
    process.exit(1);
  }

  // Initialize database
  initDatabase();

  // Check if key exists
  const existingKey = getKeyById(keyId);

  if (!existingKey) {
    console.error(`${colors.red}Error:${colors.reset} Key with ID ${keyId} not found`);
    process.exit(1);
  }

  if (existingKey.revokedAt) {
    console.error(`${colors.yellow}Warning:${colors.reset} Key ${keyId} (${existingKey.name}) is already revoked`);
    process.exit(0);
  }

  // Revoke the key
  revokeKey(keyId);

  console.log('');
  console.log(`${colors.green}Key ${keyId} (${existingKey.name}) has been revoked${colors.reset}`);
  console.log('');
}

/**
 * Main CLI entry point
 */
function main(): void {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  // Handle help and version flags
  if (args.length === 0 || parsed.named.help || parsed.named.h) {
    printHelp();
    return;
  }

  if (parsed.named.version || parsed.named.v) {
    console.log(`notify-admin v${VERSION}`);
    return;
  }

  // Get command (first positional argument)
  const command = parsed.positional[0];

  if (command !== 'key') {
    console.error(`${colors.red}Error:${colors.reset} Unknown command: ${command}`);
    console.error('Run "notify-admin --help" for usage');
    process.exit(1);
  }

  // Get subcommand (second positional argument)
  const subcommand = parsed.positional[1];

  switch (subcommand) {
    case 'create':
      handleKeyCreate(parsed);
      break;

    case 'list':
      handleKeyList();
      break;

    case 'revoke':
      handleKeyRevoke(parsed);
      break;

    default:
      console.error(`${colors.red}Error:${colors.reset} Unknown key command: ${subcommand}`);
      console.error('');
      console.error('Available commands:');
      console.error('  key create --name <name>  Create a new SDK key');
      console.error('  key list                  List all SDK keys');
      console.error('  key revoke <id>           Revoke an SDK key');
      process.exit(1);
  }
}

// Run CLI
main();
