/**
 * Migration 005: Add files and reference columns to tasks table
 *
 * Adds support for tracking:
 * - files: Array of file paths modified/created by the task
 * - reference: Optional link to prior art, patterns, or documentation
 */

import { Database } from 'bun:sqlite';
import { TABLES } from '../schema';

export const VERSION = 5;
export const DESCRIPTION = 'Add files and reference columns to tasks table';

/**
 * Apply the migration
 */
export function up(db: Database): void {
  // Add files column if it doesn't exist
  try {
    db.run(`ALTER TABLE ${TABLES.TASKS} ADD COLUMN files TEXT NOT NULL DEFAULT '[]'`);
  } catch (e) {
    const error = e as Error;
    if (!error.message.includes('duplicate column name')) {
      throw e;
    }
  }

  // Add reference column if it doesn't exist
  try {
    db.run(`ALTER TABLE ${TABLES.TASKS} ADD COLUMN reference TEXT`);
  } catch (e) {
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
  // Just remove the migration record
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
