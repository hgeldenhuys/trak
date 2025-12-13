/**
 * Database Connection Manager for Board CLI/TUI System
 *
 * Provides singleton database connection using bun:sqlite native driver.
 * Handles initialization, migrations, and connection management.
 */
import { Database } from 'bun:sqlite';
import { TABLES } from './schema';
import * as migration001 from './migrations/001_initial';
/**
 * Default database path
 */
const DEFAULT_DB_PATH = '.board.db';
/**
 * Database singleton instance
 */
let dbInstance = null;
/**
 * Current database path
 */
let currentDbPath = null;
/**
 * All migrations in order
 */
const MIGRATIONS = [migration001];
/**
 * Run all pending migrations
 */
function runMigrations(db) {
    const applied = [];
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
export function getSchemaVersion(db) {
    try {
        const result = db
            .query(`SELECT MAX(version) as version FROM ${TABLES.SCHEMA_VERSIONS}`)
            .get();
        return result?.version ?? 0;
    }
    catch {
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
export function initDb(options = {}) {
    const { dbPath = DEFAULT_DB_PATH, runMigrations: shouldRunMigrations = true, enableWAL = true, enableForeignKeys = true, } = options;
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
            console.log(`Applied ${result.applied} migration(s): ${result.versions.join(', ')}`);
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
export function getDb() {
    if (!dbInstance) {
        throw new Error('Database not initialized. Call initDb() first.');
    }
    return dbInstance;
}
/**
 * Get the database instance if initialized, otherwise null
 */
export function getDbOrNull() {
    return dbInstance;
}
/**
 * Close the database connection
 */
export function closeDb() {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
        currentDbPath = null;
    }
}
/**
 * Get the current database path
 */
export function getDbPath() {
    return currentDbPath;
}
/**
 * Check if the database is initialized
 */
export function isDbInitialized() {
    return dbInstance !== null;
}
/**
 * Reset the database (drop all tables and re-run migrations)
 * USE WITH CAUTION - this will delete all data
 */
export function resetDb() {
    const db = getDb();
    // Drop all tables in reverse order
    const dropOrder = [
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
    }
    catch (error) {
        db.run('ROLLBACK');
        throw error;
    }
    // Re-run migrations
    runMigrations(db);
}
/**
 * Create an in-memory database for testing
 */
export function createTestDb() {
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
