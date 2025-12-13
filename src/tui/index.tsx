/**
 * TUI Entry Point - Board CLI/TUI System
 *
 * Initializes the OpenTUI renderer, database connection,
 * and starts the React application.
 *
 * IMPORTANT: Sets TMPDIR=/tmp to work around OpenTUI temp file issues.
 */

import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { App } from './App';
import { initDb } from '../db';

/**
 * Reset terminal to clean state
 *
 * OpenTUI enables mouse tracking and alternate screen but doesn't
 * always clean up properly on exit. This function resets:
 * - Mouse tracking modes (1000, 1002, 1003, 1006)
 * - Alternate screen buffer (1049)
 * - Cursor visibility (25h)
 * - Normal screen mode
 *
 * Uses ANSI escape sequences instead of `reset` command to avoid
 * clearing the screen and hiding error messages.
 */
function resetTerminal(): void {
  // Reset stdin to normal mode (disable raw mode)
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
    } catch {
      // Ignore errors if stdin is not a TTY
    }
  }

  // Use ANSI escape sequences to restore terminal state
  // without clearing the screen (preserves error messages)
  const escapes = [
    '\x1b[?1000l', // Disable mouse click tracking
    '\x1b[?1002l', // Disable mouse button tracking
    '\x1b[?1003l', // Disable mouse any-event tracking
    '\x1b[?1006l', // Disable SGR mouse mode
    '\x1b[?1049l', // Exit alternate screen buffer
    '\x1b[?25h',   // Show cursor
    '\x1b[0m',     // Reset text attributes
  ].join('');

  process.stdout.write(escapes);
}

/**
 * Get database path from environment or use default
 * Matches CLI default path: ~/.board/data.db
 */
function getDatabasePath(): string {
  if (process.env.BOARD_DB_PATH) {
    return process.env.BOARD_DB_PATH;
  }
  // Default to ~/.board/data.db (same as CLI)
  const { homedir } = require('os');
  const { join } = require('path');
  return join(homedir(), '.board', 'data.db');
}

/**
 * Initialize the application
 *
 * 1. Initialize database connection
 * 2. Create OpenTUI renderer (await - returns Promise!)
 * 3. Create React root with renderer and render App
 */
async function main(): Promise<void> {
  try {
    // Initialize database first
    const dbPath = getDatabasePath();
    console.log(`Initializing database at: ${dbPath}`);
    initDb({ dbPath });
    console.log('Database initialized successfully');

    // Clear console before starting TUI
    console.clear();

    // Create OpenTUI renderer - MUST await!
    const renderer = await createCliRenderer();

    // Create React root with renderer and render the App component
    // Note: createRoot takes the renderer and returns { render, unmount }
    const root = createRoot(renderer);
    root.render(<App />);

    // Cleanup function for graceful shutdown
    const cleanup = () => {
      root.unmount();
      resetTerminal();
    };

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });

    // Also handle normal exit
    process.on('exit', () => {
      resetTerminal();
    });

    // Handle uncaught exceptions - print error BEFORE resetting terminal
    process.on('uncaughtException', (error) => {
      // Write to stderr before resetting terminal so error is visible
      process.stderr.write(`\n\nUncaught exception: ${error}\n${error.stack || ''}\n`);
      resetTerminal();
      process.exit(1);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason) => {
      process.stderr.write(`\n\nUnhandled rejection: ${reason}\n`);
      resetTerminal();
      process.exit(1);
    });

  } catch (error) {
    // Print error BEFORE resetting terminal so it's visible
    const err = error as Error;
    process.stderr.write(`\n\nFailed to start TUI: ${err.message}\n${err.stack || ''}\n`);
    resetTerminal();
    process.exit(1);
  }
}

// Start the application
main();
