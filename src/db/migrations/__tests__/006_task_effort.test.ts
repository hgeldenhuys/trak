import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import * as migration006 from '../006_task_effort';
import * as migration001 from '../001_initial';

describe('Migration 006: Task Effort Fields', () => {
  let db: Database;

  beforeEach(() => {
    // Create in-memory database with initial schema
    db = new Database(':memory:');
    db.run('PRAGMA foreign_keys = ON');
    migration001.up(db);

    // Create test feature and story for foreign key constraints
    db.run(`
      INSERT INTO features (id, code, name)
      VALUES ('feature-1', 'TEST', 'Test Feature')
    `);
    db.run(`
      INSERT INTO stories (id, code, feature_id, title)
      VALUES ('story-1', 'TEST-001', 'feature-1', 'Test Story')
    `);
  });

  afterEach(() => {
    db.close();
  });

  test('adds all required columns to tasks table', () => {
    // Run migration
    const result = migration006.run(db);
    expect(result.applied).toBe(true);
    expect(result.version).toBe(6);

    // Check columns exist
    const info = db.query('PRAGMA table_info(tasks)').all() as Array<{ name: string }>;
    const columns = info.map(c => c.name);

    expect(columns).toContain('estimated_effort');
    expect(columns).toContain('actual_effort');
    expect(columns).toContain('effort_unit');
    expect(columns).toContain('started_at');
    expect(columns).toContain('completed_at');
  });

  test('columns are nullable (can insert without them)', () => {
    migration006.run(db);

    // Should not throw - all new columns are nullable
    db.run(`
      INSERT INTO tasks (id, story_id, title)
      VALUES ('task-1', 'story-1', 'Task without effort')
    `);

    const task = db.query('SELECT * FROM tasks WHERE id = ?').get('task-1') as Record<string, unknown>;
    expect(task.estimated_effort).toBeNull();
    expect(task.actual_effort).toBeNull();
    expect(task.effort_unit).toBeNull();
    expect(task.started_at).toBeNull();
    expect(task.completed_at).toBeNull();
  });

  test('can insert tasks with effort fields', () => {
    migration006.run(db);

    db.run(`
      INSERT INTO tasks (id, story_id, title, estimated_effort, actual_effort, effort_unit, started_at, completed_at)
      VALUES ('task-2', 'story-1', 'Task with effort', 4.5, 6.0, 'hours', '2025-12-12T10:00:00Z', '2025-12-12T16:00:00Z')
    `);

    const task = db.query('SELECT * FROM tasks WHERE id = ?').get('task-2') as Record<string, unknown>;
    expect(task.estimated_effort).toBe(4.5);
    expect(task.actual_effort).toBe(6.0);
    expect(task.effort_unit).toBe('hours');
    expect(task.started_at).toBe('2025-12-12T10:00:00Z');
    expect(task.completed_at).toBe('2025-12-12T16:00:00Z');
  });

  test('records migration version in schema_versions', () => {
    migration006.run(db);

    const version = db.query('SELECT * FROM schema_versions WHERE version = 6').get() as Record<string, unknown>;
    expect(version).not.toBeNull();
    expect(version.version).toBe(6);
    expect(version.description).toBe('Add effort tracking columns to tasks table');
  });

  test('is idempotent (running twice does not error)', () => {
    // Run once
    const result1 = migration006.run(db);
    expect(result1.applied).toBe(true);

    // Run again - should not error, just return not applied
    const result2 = migration006.run(db);
    expect(result2.applied).toBe(false);
    expect(result2.version).toBe(6);
  });

  test('down removes migration record', () => {
    migration006.run(db);

    // Verify record exists
    let version = db.query('SELECT * FROM schema_versions WHERE version = 6').get();
    expect(version).not.toBeNull();

    // Run down
    migration006.down(db);

    // Record should be removed
    version = db.query('SELECT * FROM schema_versions WHERE version = 6').get();
    expect(version).toBeNull();
  });

  test('effort_unit accepts valid values', () => {
    migration006.run(db);

    const units = ['hours', 'points', 'ai-hours'];
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      db.run(`
        INSERT INTO tasks (id, story_id, title, effort_unit)
        VALUES ('task-unit-${i}', 'story-1', 'Task with ${unit}', '${unit}')
      `);

      const task = db.query('SELECT effort_unit FROM tasks WHERE id = ?').get(`task-unit-${i}`) as Record<string, unknown>;
      expect(task.effort_unit).toBe(unit);
    }
  });
});
