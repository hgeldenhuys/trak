/**
 * Migration 002: Add Notes, Impediments, Labels, Relations, and QEOM Metadata tables
 */

import { Database } from 'bun:sqlite';
import {
  CREATE_NOTES_TABLE,
  CREATE_NOTES_INDEXES,
  CREATE_IMPEDIMENTS_TABLE,
  CREATE_IMPEDIMENTS_INDEXES,
  CREATE_LABELS_TABLE,
  CREATE_LABELS_INDEXES,
  CREATE_ENTITY_LABELS_TABLE,
  CREATE_ENTITY_LABELS_INDEXES,
  CREATE_RELATIONS_TABLE,
  CREATE_RELATIONS_INDEXES,
  CREATE_QEOM_METADATA_TABLE,
  CREATE_QEOM_METADATA_INDEXES,
  TABLES,
} from '../schema';

const VERSION = 2;
const DESCRIPTION = 'Add notes, impediments, labels, relations, and QEOM metadata tables';

/**
 * Apply the migration
 */
export function up(db: Database): void {
  // Create tables
  db.run(CREATE_NOTES_TABLE);
  db.run(CREATE_IMPEDIMENTS_TABLE);
  db.run(CREATE_LABELS_TABLE);
  db.run(CREATE_ENTITY_LABELS_TABLE);
  db.run(CREATE_RELATIONS_TABLE);
  db.run(CREATE_QEOM_METADATA_TABLE);

  // Create indexes (split by semicolon and run individually)
  for (const indexSql of CREATE_NOTES_INDEXES.split(';')) {
    const sql = indexSql.trim();
    if (sql) db.run(sql);
  }
  for (const indexSql of CREATE_IMPEDIMENTS_INDEXES.split(';')) {
    const sql = indexSql.trim();
    if (sql) db.run(sql);
  }
  for (const indexSql of CREATE_LABELS_INDEXES.split(';')) {
    const sql = indexSql.trim();
    if (sql) db.run(sql);
  }
  for (const indexSql of CREATE_ENTITY_LABELS_INDEXES.split(';')) {
    const sql = indexSql.trim();
    if (sql) db.run(sql);
  }
  for (const indexSql of CREATE_RELATIONS_INDEXES.split(';')) {
    const sql = indexSql.trim();
    if (sql) db.run(sql);
  }
  for (const indexSql of CREATE_QEOM_METADATA_INDEXES.split(';')) {
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
  db.run(`DROP TABLE IF EXISTS ${TABLES.QEOM_METADATA}`);
  db.run(`DROP TABLE IF EXISTS ${TABLES.RELATIONS}`);
  db.run(`DROP TABLE IF EXISTS ${TABLES.ENTITY_LABELS}`);
  db.run(`DROP TABLE IF EXISTS ${TABLES.LABELS}`);
  db.run(`DROP TABLE IF EXISTS ${TABLES.IMPEDIMENTS}`);
  db.run(`DROP TABLE IF EXISTS ${TABLES.NOTES}`);
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
