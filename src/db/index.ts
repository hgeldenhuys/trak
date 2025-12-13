/**
 * Database Connection Manager for Board CLI/TUI System
 *
 * Provides singleton database connection using bun:sqlite native driver.
 * Handles initialization, migrations, and connection management.
 */

import { Database } from 'bun:sqlite';
import { SCHEMA_VERSION, TABLES } from './schema';
import * as migration001 from './migrations/001_initial';
import * as migration002 from './migrations/002_notes_impediments_labels';
import * as migration003 from './migrations/003_decisions';
import * as migration004 from './migrations/004_story_complexity';
import * as migration005 from './migrations/005_task_files';
import * as migration006 from './migrations/006_task_effort';

/**
 * Default database path
 */
const DEFAULT_DB_PATH = '.board.db';

/**
 * Database singleton instance
 */
let dbInstance: Database | null = null;

/**
 * Current database path
 */
let currentDbPath: string | null = null;

/**
 * Options for initializing the database
 */
export interface InitDbOptions {
  /**
   * Path to the SQLite database file
   * Defaults to '.board.db' in the current directory
   */
  dbPath?: string;

  /**
   * Whether to run migrations automatically
   * Defaults to true
   */
  runMigrations?: boolean;

  /**
   * Whether to enable WAL mode for better concurrency
   * Defaults to true
   */
  enableWAL?: boolean;

  /**
   * Whether to enable foreign key constraints
   * Defaults to true
   */
  enableForeignKeys?: boolean;
}

/**
 * All migrations in order
 */
const MIGRATIONS = [migration001, migration002, migration003, migration004, migration005, migration006];

/**
 * Run all pending migrations
 */
function runMigrations(db: Database): { applied: number; versions: number[] } {
  const applied: number[] = [];

  for (const migration of MIGRATIONS) {
    const result = migration.run(db);
    if (result.applied) {
      applied.push(result.version);
    }
  }

  return { applied: applied.length, versions: applied };
}

/**
 * Get the current schema version from the database
 */
export function getSchemaVersion(db: Database): number {
  try {
    const result = db
      .query(
        `SELECT MAX(version) as version FROM ${TABLES.SCHEMA_VERSIONS}`
      )
      .get() as { version: number | null } | null;
    return result?.version ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Initialize the database connection
 *
 * Creates the database file if it doesn't exist,
 * applies pending migrations, and configures SQLite settings.
 *
 * @param options - Configuration options
 * @returns The initialized database instance
 */
export function initDb(options: InitDbOptions = {}): Database {
  const {
    dbPath = DEFAULT_DB_PATH,
    runMigrations: shouldRunMigrations = true,
    enableWAL = true,
    enableForeignKeys = true,
  } = options;

  // If we already have an instance with the same path, return it
  if (dbInstance && currentDbPath === dbPath) {
    return dbInstance;
  }

  // Close existing connection if path changed
  if (dbInstance) {
    closeDb();
  }

  // Create new database connection
  dbInstance = new Database(dbPath, { create: true });
  currentDbPath = dbPath;

  // Configure SQLite settings
  if (enableForeignKeys) {
    dbInstance.run('PRAGMA foreign_keys = ON');
  }

  if (enableWAL) {
    dbInstance.run('PRAGMA journal_mode = WAL');
  }

  // Run migrations if enabled
  if (shouldRunMigrations) {
    const result = runMigrations(dbInstance);
    if (result.applied > 0) {
      console.log(
        `Applied ${result.applied} migration(s): ${result.versions.join(', ')}`
      );
    }
  }

  return dbInstance;
}

/**
 * Get the current database instance
 *
 * @throws Error if database has not been initialized
 * @returns The database instance
 */
export function getDb(): Database {
  if (!dbInstance) {
    throw new Error(
      'Database not initialized. Call initDb() first.'
    );
  }
  return dbInstance;
}

/**
 * Get the database instance if initialized, otherwise null
 */
export function getDbOrNull(): Database | null {
  return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
  }
}

/**
 * Get the current database path
 */
export function getDbPath(): string | null {
  return currentDbPath;
}

/**
 * Check if the database is initialized
 */
export function isDbInitialized(): boolean {
  return dbInstance !== null;
}

/**
 * Reset the database (drop all tables and re-run migrations)
 * USE WITH CAUTION - this will delete all data
 */
export function resetDb(): void {
  const db = getDb();

  // Drop all tables in reverse order
  const dropOrder = [
    TABLES.DECISIONS,
    TABLES.QEOM_METADATA,
    TABLES.RELATIONS,
    TABLES.ENTITY_LABELS,
    TABLES.LABELS,
    TABLES.IMPEDIMENTS,
    TABLES.NOTES,
    TABLES.SESSIONS,
    TABLES.HISTORY,
    TABLES.ACCEPTANCE_CRITERIA,
    TABLES.TASKS,
    TABLES.STORIES,
    TABLES.FEATURES,
    TABLES.SCHEMA_VERSIONS,
  ];

  db.run('BEGIN TRANSACTION');
  try {
    for (const table of dropOrder) {
      db.run(`DROP TABLE IF EXISTS ${table}`);
    }
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }

  // Re-run migrations
  runMigrations(db);
}

/**
 * Create an in-memory database for testing
 */
export function createTestDb(): Database {
  const db = new Database(':memory:');
  db.run('PRAGMA foreign_keys = ON');

  // Run all migrations
  for (const migration of MIGRATIONS) {
    migration.up(db);
  }

  return db;
}

// Re-export schema constants and types
export { TABLES, SCHEMA_VERSION, COLUMN_MAPPINGS } from './schema';
