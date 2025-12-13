/**
 * Migration 003: Add decisions table
 *
 * Adds decision tracking for architectural and design decisions
 * with rationale, alternatives, and status tracking.
 */

import { Database } from 'bun:sqlite';
import { TABLES, CREATE_DECISIONS_TABLE, CREATE_DECISIONS_INDEXES } from '../schema';

export const VERSION = 3;
export const DESCRIPTION = 'Add decisions table for architectural decision tracking';

/**
 * Apply the migration
 */
export function up(db: Database): void {
  // Create decisions table
  db.run(CREATE_DECISIONS_TABLE);

  // Create indexes
  const indexStatements = CREATE_DECISIONS_INDEXES.split(';').filter(s => s.trim());
  for (const stmt of indexStatements) {
    db.run(stmt);
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
  db.run(`DROP TABLE IF EXISTS ${TABLES.DECISIONS}`);
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
