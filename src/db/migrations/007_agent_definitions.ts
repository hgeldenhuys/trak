/**
 * Migration 007: Add agent_definitions and agent_learnings tables
 *
 * Adds support for dynamic agent definitions with versioning and
 * learnings that can be accumulated over time.
 */

import { Database } from 'bun:sqlite';
import { TABLES, CREATE_AGENT_DEFINITIONS_TABLE, CREATE_AGENT_DEFINITIONS_INDEXES, CREATE_AGENT_LEARNINGS_TABLE, CREATE_AGENT_LEARNINGS_INDEXES } from '../schema';

export const VERSION = 7;
export const DESCRIPTION = 'Add agent definitions and learnings tables';

/**
 * Apply the migration
 */
export function up(db: Database): void {
  // Create agent_definitions table
  db.run(CREATE_AGENT_DEFINITIONS_TABLE);

  // Create agent_definitions indexes
  const definitionIndexes = CREATE_AGENT_DEFINITIONS_INDEXES.split(';').filter(s => s.trim());
  for (const stmt of definitionIndexes) {
    db.run(stmt);
  }

  // Create agent_learnings table
  db.run(CREATE_AGENT_LEARNINGS_TABLE);

  // Create agent_learnings indexes
  const learningIndexes = CREATE_AGENT_LEARNINGS_INDEXES.split(';').filter(s => s.trim());
  for (const stmt of learningIndexes) {
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
  db.run(`DROP TABLE IF EXISTS ${TABLES.AGENT_LEARNINGS}`);
  db.run(`DROP TABLE IF EXISTS ${TABLES.AGENT_DEFINITIONS}`);
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
