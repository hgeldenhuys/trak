/**
 * Initial Migration - Creates all tables for Board CLI/TUI System
 *
 * Schema version: 1
 * Tables created:
 * - schema_versions (migration tracking)
 * - features
 * - stories
 * - tasks
 * - acceptance_criteria
 * - history
 * - sessions
 */
import { ALL_TABLE_CREATES, ALL_INDEX_CREATES, TABLES, } from '../schema';
/**
 * Migration metadata
 */
export const MIGRATION = {
    version: 1,
    description: 'Initial schema - creates all core tables and indexes',
};
/**
 * Check if this migration has already been applied
 */
export function isApplied(db) {
    try {
        const result = db
            .query(`SELECT version FROM ${TABLES.SCHEMA_VERSIONS} WHERE version = ?`)
            .get(MIGRATION.version);
        return result !== null;
    }
    catch {
        // Table doesn't exist yet, migration not applied
        return false;
    }
}
/**
 * Apply the initial migration
 * Creates all tables and indexes for the board system
 */
export function up(db) {
    // Start transaction for atomic migration
    db.run('BEGIN TRANSACTION');
    try {
        // Create all tables
        for (const createSQL of ALL_TABLE_CREATES) {
            db.run(createSQL);
        }
        // Create all indexes (each string may contain multiple statements)
        for (const indexSQL of ALL_INDEX_CREATES) {
            // Split by semicolon and run each statement
            const statements = indexSQL
                .split(';')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            for (const stmt of statements) {
                db.run(stmt);
            }
        }
        // Record migration as applied
        db.run(`INSERT INTO ${TABLES.SCHEMA_VERSIONS} (version, description) VALUES (?, ?)`, [MIGRATION.version, MIGRATION.description]);
        db.run('COMMIT');
    }
    catch (error) {
        db.run('ROLLBACK');
        throw error;
    }
}
/**
 * Rollback the initial migration
 * Drops all tables in reverse order to respect foreign key constraints
 */
export function down(db) {
    db.run('BEGIN TRANSACTION');
    try {
        // Drop tables in reverse order (respecting foreign keys)
        const dropOrder = [
            TABLES.SESSIONS,
            TABLES.HISTORY,
            TABLES.ACCEPTANCE_CRITERIA,
            TABLES.TASKS,
            TABLES.STORIES,
            TABLES.FEATURES,
            TABLES.SCHEMA_VERSIONS,
        ];
        for (const table of dropOrder) {
            db.run(`DROP TABLE IF EXISTS ${table}`);
        }
        db.run('COMMIT');
    }
    catch (error) {
        db.run('ROLLBACK');
        throw error;
    }
}
/**
 * Run this migration
 */
export function run(db) {
    if (isApplied(db)) {
        return { applied: false, version: MIGRATION.version };
    }
    up(db);
    return { applied: true, version: MIGRATION.version };
}
