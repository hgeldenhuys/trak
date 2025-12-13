/**
 * Migration 004: Add estimated_complexity to stories table
 *
 * Adds complexity estimation field to stories for better planning.
 */

import { Database } from 'bun:sqlite';
import { TABLES } from '../schema';

export const VERSION = 4;
export const DESCRIPTION = 'Add estimated_complexity column to stories table';

/**
 * Apply the migration
 */
export function up(db: Database): void {
  // Add column if it doesn't exist
  try {
    db.run(`ALTER TABLE ${TABLES.STORIES} ADD COLUMN estimated_complexity TEXT`);
  } catch (e) {
    // Column might already exist if running fresh schema
    const error = e as Error;
    if (!error.message.includes('duplicate column name')) {
      throw e;
    }
  }

  // Record migration
  db.run(
    `INSERT OR REPLACE INTO ${TABLES.SCHEMA_VERSIONS} (version, description) VALUES (?, ?)`,
    [VERSION, DESCRIPTION]
  );
}

/**
 * Rollback the migration
 */
export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN directly in older versions
  // For now, just remove the migration record
  db.run(`DELETE FROM ${TABLES.SCHEMA_VERSIONS} WHERE version = ?`, [VERSION]);
}

/**
 * Check if migration is already applied and run if not
 */
export function run(db: Database): { applied: boolean; version: number } {
  const row = db
    .query(`SELECT version FROM ${TABLES.SCHEMA_VERSIONS} WHERE version = ?`)
    .get(VERSION) as { version: number } | null;

  if (row) {
    return { applied: false, version: VERSION }; // Already applied
  }

  up(db);
  return { applied: true, version: VERSION };
}
