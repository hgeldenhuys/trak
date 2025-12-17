/**
 * Migration 008: Add weave_entries and weave_references tables
 *
 * Adds support for Weave knowledge framework with 11 dimensions:
 * Q, E, O, M, C, A, T, H, Pi, Mu, Delta
 *
 * weave_entries - Core knowledge entries with confidence tracking
 * weave_references - Cross-references between entries
 */

import { Database } from 'bun:sqlite';
import { TABLES, CREATE_WEAVE_ENTRIES_TABLE, CREATE_WEAVE_ENTRIES_INDEXES, CREATE_WEAVE_REFERENCES_TABLE, CREATE_WEAVE_REFERENCES_INDEXES } from '../schema';

export const VERSION = 8;
export const DESCRIPTION = 'Add weave entries and references tables';

/**
 * Apply the migration
 */
export function up(db: Database): void {
  // Create weave_entries table
  db.run(CREATE_WEAVE_ENTRIES_TABLE);

  // Create weave_entries indexes
  const entryIndexes = CREATE_WEAVE_ENTRIES_INDEXES.split(';').filter(s => s.trim());
  for (const stmt of entryIndexes) {
    db.run(stmt);
  }

  // Create weave_references table
  db.run(CREATE_WEAVE_REFERENCES_TABLE);

  // Create weave_references indexes
  const refIndexes = CREATE_WEAVE_REFERENCES_INDEXES.split(';').filter(s => s.trim());
  for (const stmt of refIndexes) {
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
  db.run(`DROP TABLE IF EXISTS ${TABLES.WEAVE_REFERENCES}`);
  db.run(`DROP TABLE IF EXISTS ${TABLES.WEAVE_ENTRIES}`);
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
