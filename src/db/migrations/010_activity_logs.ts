/**
 * Migration 010: Add Activity Logs table
 *
 * Activity logs capture real-time events from external agents, adapters, and integrations.
 * Used for monitoring agent activity in the TUI.
 */

import { Database } from 'bun:sqlite';
import {
  CREATE_ACTIVITY_LOGS_TABLE,
  CREATE_ACTIVITY_LOGS_INDEXES,
  TABLES,
} from '../schema';

const VERSION = 10;
const DESCRIPTION = 'Add activity_logs table for real-time agent monitoring';

/**
 * Apply the migration
 */
export function up(db: Database): void {
  // Create table
  db.run(CREATE_ACTIVITY_LOGS_TABLE);

  // Create indexes (split by semicolon and run individually)
  for (const indexSql of CREATE_ACTIVITY_LOGS_INDEXES.split(';')) {
    const sql = indexSql.trim();
    if (sql) db.run(sql);
  }

  // Record migration
  db.run(
    'INSERT INTO schema_versions (version, description) VALUES (?, ?)',
    [VERSION, DESCRIPTION]
  );
}

/**
 * Rollback the migration
 */
export function down(db: Database): void {
  db.run(`DROP TABLE IF EXISTS ${TABLES.ACTIVITY_LOGS}`);
  db.run('DELETE FROM schema_versions WHERE version = ?', [VERSION]);
}

/**
 * Run the migration if not already applied
 */
export function run(db: Database): { applied: boolean; version: number } {
  // Check if already applied
  const result = db.query('SELECT version FROM schema_versions WHERE version = ?').get(VERSION);
  if (result) {
    return { applied: false, version: VERSION }; // Already applied
  }

  up(db);
  return { applied: true, version: VERSION };
}

export default { up, down, run, VERSION, DESCRIPTION };
