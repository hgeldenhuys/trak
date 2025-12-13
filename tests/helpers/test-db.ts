/**
 * Test Database Helper
 *
 * Provides utilities for setting up and tearing down test databases.
 * Uses in-memory SQLite for fast, isolated tests.
 */

import { Database } from 'bun:sqlite';
import { initDb, closeDb, getDb, TABLES } from '../../src/db';
import { resetEventBus } from '../../src/events';
import * as migration001 from '../../src/db/migrations/001_initial';

/**
 * Setup an in-memory test database
 * Initializes the database with migrations and returns the instance
 */
export async function setupTestDb(): Promise<Database> {
  // Initialize in-memory database
  const db = initDb({ dbPath: ':memory:' });
  return db;
}

/**
 * Cleanup the test database
 * Resets the event bus and closes the database connection
 */
export async function cleanupTestDb(): Promise<void> {
  resetEventBus();
  closeDb();
}

/**
 * Reset the test database to a clean state
 * Drops all data and re-runs migrations
 */
export async function resetTestDb(): Promise<void> {
  const db = getDb();

  // Drop all data from tables in reverse order (due to foreign keys)
  const dropOrder = [
    TABLES.SESSIONS,
    TABLES.HISTORY,
    TABLES.ACCEPTANCE_CRITERIA,
    TABLES.TASKS,
    TABLES.STORIES,
    TABLES.FEATURES,
  ];

  db.run('BEGIN TRANSACTION');
  try {
    for (const table of dropOrder) {
      db.run(`DELETE FROM ${table}`);
    }
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }

  // Reset event bus to clear any lingering listeners
  resetEventBus();
}

/**
 * Create a standalone in-memory database for isolated testing
 * Does not use the singleton - useful for parallel tests
 */
export function createIsolatedTestDb(): Database {
  const db = new Database(':memory:');
  db.run('PRAGMA foreign_keys = ON');
  migration001.up(db);
  return db;
}

/**
 * Seed test data for features
 */
export function seedFeature(
  db: Database,
  data: { code: string; name: string; description?: string }
): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO ${TABLES.FEATURES} (id, code, name, description, story_counter, extensions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.code.toUpperCase(),
      data.name,
      data.description ?? '',
      0,
      '{}',
      now,
      now,
    ]
  );

  return id;
}

/**
 * Seed test data for stories
 */
export function seedStory(
  db: Database,
  data: {
    featureId: string;
    code: string;
    title: string;
    description?: string;
    why?: string;
    status?: string;
  }
): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO ${TABLES.STORIES} (id, code, feature_id, title, description, why, status, priority, extensions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.code,
      data.featureId,
      data.title,
      data.description ?? '',
      data.why ?? '',
      data.status ?? 'draft',
      'P2',
      '{}',
      now,
      now,
    ]
  );

  return id;
}

/**
 * Seed test data for tasks
 */
export function seedTask(
  db: Database,
  data: {
    storyId: string;
    title: string;
    description?: string;
    status?: string;
    order?: number;
  }
): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO ${TABLES.TASKS} (id, story_id, title, description, status, priority, order_num, dependencies, ac_coverage, estimated_complexity, extensions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.storyId,
      data.title,
      data.description ?? '',
      data.status ?? 'pending',
      'P2',
      data.order ?? 0,
      '[]',
      '[]',
      'medium',
      '{}',
      now,
      now,
    ]
  );

  return id;
}
