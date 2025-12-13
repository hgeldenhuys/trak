/**
 * Migration 006: Add effort tracking columns to tasks table
 *
 * Adds support for:
 * - estimated_effort: Claude's upfront prediction
 * - actual_effort: Measured effort after completion
 * - effort_unit: Unit type (hours, points, ai-hours)
 * - started_at: Auto-captured when status -> in_progress
 * - completed_at: Auto-captured when status -> completed
 */

import { Database } from 'bun:sqlite';
import { TABLES } from '../schema';

export const VERSION = 6;
export const DESCRIPTION = 'Add effort tracking columns to tasks table';

/**
 * Apply the migration
 */
export function up(db: Database): void {
  // Add estimated_effort column if it doesn't exist
  try {
    db.run(`ALTER TABLE ${TABLES.TASKS} ADD COLUMN estimated_effort REAL`);
  } catch (e) {
    const error = e as Error;
    if (!error.message.includes('duplicate column name')) {
      throw e;
    }
  }

  // Add actual_effort column if it doesn't exist
  try {
    db.run(`ALTER TABLE ${TABLES.TASKS} ADD COLUMN actual_effort REAL`);
  } catch (e) {
    const error = e as Error;
    if (!error.message.includes('duplicate column name')) {
      throw e;
    }
  }

  // Add effort_unit column if it doesn't exist
  try {
    db.run(`ALTER TABLE ${TABLES.TASKS} ADD COLUMN effort_unit TEXT`);
  } catch (e) {
    const error = e as Error;
    if (!error.message.includes('duplicate column name')) {
      throw e;
    }
  }

  // Add started_at column if it doesn't exist
  try {
    db.run(`ALTER TABLE ${TABLES.TASKS} ADD COLUMN started_at TEXT`);
  } catch (e) {
    const error = e as Error;
    if (!error.message.includes('duplicate column name')) {
      throw e;
    }
  }

  // Add completed_at column if it doesn't exist
  try {
    db.run(`ALTER TABLE ${TABLES.TASKS} ADD COLUMN completed_at TEXT`);
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
