#!/usr/bin/env bun
/**
 * Board CLI - Command-line interface for story and task management
 *
 * Main entry point that sets up Commander.js with global options
 * and initializes the database before any command execution.
 */

import { Command, CommanderError } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { initDb, closeDb } from '../db';
import { setOutputOptions, error, verbose } from './utils/output';
import { setActor, initContextFromEnv } from '../context';
import { enableAutoHistory } from '../history/auto-logger';
import { createStoryCommand } from './commands/story';
import { taskCommand } from './commands/task';
import { featureCommand } from './commands/feature';
import { createNoteCommand } from './commands/note';
import { createImpedimentCommand } from './commands/impediment';
import { createLabelCommand } from './commands/label';
import { createRelationCommand } from './commands/relation';
import { createQEOMCommand } from './commands/qeom';
import { createAcCommand } from './commands/ac';
import { createDecisionCommand } from './commands/decision';
import { createSessionCommand } from './commands/session';
import { createHistoryCommand } from './commands/history';
import { createDataCommand } from './commands/data';

/**
 * Get the default database path
 * Priority: BOARD_DB_PATH env var > ~/.board/data.db
 */
function getDefaultDbPath(): string {
  // Check environment variable first
  const envPath = process.env.BOARD_DB_PATH;
  if (envPath) {
    return envPath;
  }

  // Default to ~/.board/data.db
  const boardDir = join(homedir(), '.board');

  // Create directory if it doesn't exist
  if (!existsSync(boardDir)) {
    mkdirSync(boardDir, { recursive: true });
  }

  return join(boardDir, 'data.db');
}

/**
 * Create and configure the main CLI program
 */
function createProgram(): Command {
  const program = new Command();
  const defaultDbPath = getDefaultDbPath();

  program
    .name('board')
    .description('Board CLI for story and task management')
    .version('0.3.0')
    .option('--db-path <path>', `Path to SQLite database (env: BOARD_DB_PATH)`, defaultDbPath)
    .option('--actor <name>', 'Actor name for history tracking (env: BOARD_ACTOR)', process.env.BOARD_ACTOR || 'cli')
    .option('--json', 'Output as JSON', false)
    .option('-v, --verbose', 'Verbose output', false);

  // Global hook to initialize database and set output options before any command
  program.hook('preAction', async (thisCommand) => {
    const options = thisCommand.opts();

    // Set global output options for all commands
    setOutputOptions({
      json: options.json ?? false,
      verbose: options.verbose ?? false,
    });

    // Initialize context from environment first
    initContextFromEnv();

    // Set actor from CLI flag (overrides env)
    if (options.actor) {
      setActor(options.actor);
    }

    verbose(`Database path: ${options.dbPath}`);
    verbose(`Actor: ${options.actor}`);
    verbose(`JSON output: ${options.json}`);

    // Initialize database
    try {
      initDb({ dbPath: options.dbPath });
      verbose('Database initialized successfully');

      // Enable auto-history logging after DB is ready
      enableAutoHistory();
      verbose('Auto-history enabled');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(`Failed to initialize database: ${message}`);
      process.exit(1);
    }
  });

  // Cleanup hook to close database after command execution
  program.hook('postAction', async () => {
    closeDb();
    verbose('Database connection closed');
  });

  // Add subcommands
  // Story command with list, delete subcommands
  program.addCommand(createStoryCommand());

  // Task command with create, list, show, update, status, delete subcommands
  program.addCommand(taskCommand);

  // Feature command with create, list, show, update, delete subcommands
  program.addCommand(featureCommand);

  // Note command with add, list, show, pin, delete subcommands
  program.addCommand(createNoteCommand());

  // Impediment command with raise, list, show, resolve, escalate, assign, delete subcommands
  program.addCommand(createImpedimentCommand());

  // Label command with create, list, apply, remove, show, delete subcommands
  program.addCommand(createLabelCommand());

  // Relation command with create, list, blockers, delete subcommands
  program.addCommand(createRelationCommand());

  // QEOM command with add, list, show, summary, search, update-confidence, delete subcommands
  program.addCommand(createQEOMCommand());

  // Acceptance Criteria command with add, list, show, test, verify, fail, delete subcommands
  program.addCommand(createAcCommand());

  // Decision command with add, list, show, delete subcommands
  program.addCommand(createDecisionCommand());

  // Session command with start, end, current, list subcommands
  program.addCommand(createSessionCommand());

  // History command with list, show, entity subcommands
  program.addCommand(createHistoryCommand());

  // Data command with export, import subcommands
  program.addCommand(createDataCommand());

  return program;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const program = createProgram();

  // Enable exit override for better error handling
  program.exitOverride();

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    // Handle Commander-specific errors
    if (err instanceof CommanderError) {
      // Don't show error for help/version output
      if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
        process.exit(0);
      }
      // Show usage errors
      if (err.code === 'commander.missingArgument' || err.code === 'commander.missingMandatoryOptionValue') {
        error(err.message);
        process.exit(1);
      }
    }

    // Handle other errors
    const message = err instanceof Error ? err.message : String(err);
    error(message);
    process.exit(1);
  }
}

// Run the CLI
main();
