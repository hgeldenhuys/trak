/**
 * Board Init Command
 *
 * Creates a project-local .board.db database in the current directory.
 * This enables project-centric workflow where each project has its own
 * isolated story board.
 *
 * Usage:
 *   board init              Create .board.db in current directory
 *   board init --force      Re-initialize even if DB exists
 *
 * The command is idempotent - running it multiple times is safe.
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { initDb, getLocalDbPath, hasLocalDb, getSchemaVersion } from '../../db';
import { success, error, info, warn } from '../utils/output';

/**
 * Create the init command
 */
export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a project-local board database (.board.db)')
    .option('-f, --force', 'Re-initialize even if database exists', false)
    .action(async (options: { force: boolean }) => {
      const localDbPath = getLocalDbPath();
      const dbExists = hasLocalDb();

      // Check if database already exists
      if (dbExists && !options.force) {
        // Check schema version to see if it's valid
        try {
          const db = initDb({ dbPath: localDbPath, runMigrations: false });
          const version = getSchemaVersion(db);

          if (version > 0) {
            info(`Project board already initialized at ${localDbPath}`);
            info(`Schema version: ${version}`);
            info('Use --force to re-initialize');
            return;
          }
        } catch (err) {
          // Database exists but might be corrupted, suggest --force
          warn(`Database exists but may be invalid: ${localDbPath}`);
          info('Use --force to re-initialize');
          return;
        }
      }

      // Create/initialize the database
      try {
        if (dbExists && options.force) {
          warn('Re-initializing existing database...');
        }

        const db = initDb({
          dbPath: localDbPath,
          runMigrations: true,
          enableWAL: true,
          enableForeignKeys: true,
        });

        const version = getSchemaVersion(db);

        success(`Project board initialized at ${localDbPath}`);
        info(`Schema version: ${version}`);
        info('');
        info('Next steps:');
        info('  board feature create -c FEAT -n "Feature Name"  Create a feature');
        info('  board story create -f FEAT -t "Story Title"     Create a story');
        info('  board-tui                                       Open interactive TUI');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to initialize database: ${message}`);
        process.exit(1);
      }
    });
}
