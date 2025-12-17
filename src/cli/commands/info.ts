/**
 * Board Info Command
 *
 * Displays configuration information including database path,
 * working directory, and environment settings.
 */

import { Command } from 'commander';
import { existsSync } from 'fs';
import { resolveDbPath, getLocalDbPath, hasLocalDb } from '../../db';

/**
 * Create the info command
 */
export function createInfoCommand(): Command {
  return new Command('info')
    .description('Show configuration and database information')
    .action(async () => {
      const cwd = process.cwd();
      const resolvedPath = resolveDbPath();
      const localPath = getLocalDbPath();
      const hasLocal = hasLocalDb();
      const dbExists = existsSync(resolvedPath);

      console.log('Board CLI Info');
      console.log('==============');
      console.log('');
      console.log(`Working directory: ${cwd}`);
      console.log(`Database path:     ${resolvedPath}`);
      console.log(`Database exists:   ${dbExists ? 'yes' : 'no'}`);
      console.log(`Local .board.db:   ${hasLocal ? 'yes' : 'no'} (${localPath})`);
      console.log('');
      console.log('Environment:');
      console.log(`  BOARD_DB_PATH:   ${process.env.BOARD_DB_PATH || '(not set)'}`);
      console.log(`  BOARD_GLOBAL:    ${process.env.BOARD_GLOBAL || '(not set)'}`);
      console.log(`  BOARD_ACTOR:     ${process.env.BOARD_ACTOR || '(not set)'}`);
    });
}
