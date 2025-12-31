/**
 * Tests for `board task ready` command
 *
 * Tests the dependency-aware task filtering that surfaces
 * tasks ready to work on (no blocking dependencies).
 *
 * Inspired by Beads (steveyegge/beads) `bd ready` command.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { $ } from 'bun';
import { unlink } from 'node:fs/promises';

const CLI_PATH = 'src/cli/index.ts';
const TEST_DB_PATH = '/tmp/task-ready-test.db';

describe('board task ready', () => {
  // Setup: Create test data with dependencies
  beforeAll(async () => {
    // Clean up any existing test db
    try {
      await unlink(TEST_DB_PATH);
      await unlink(TEST_DB_PATH + '-wal');
      await unlink(TEST_DB_PATH + '-shm');
    } catch {
      // Ignore
    }

    // Create a feature and story
    await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} feature create -n "Test Feature" -c TEST`.quiet();
    await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} story create -f TEST -t "Test Story" -s planned`.quiet();

    // Create tasks:
    // Task A - no dependencies (ready)
    await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task create -s TEST-001 -t "Task A - No deps"`.quiet();
    // Task B - no dependencies (ready)
    await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task create -s TEST-001 -t "Task B - No deps"`.quiet();
    // Task C - completed (should not appear in ready list)
    await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task create -s TEST-001 -t "Task C - Completed"`.quiet();
  });

  afterAll(async () => {
    // Cleanup test database
    try {
      await unlink(TEST_DB_PATH);
      await unlink(TEST_DB_PATH + '-wal');
      await unlink(TEST_DB_PATH + '-shm');
    } catch {
      // Ignore if files don't exist
    }
  });

  describe('help and discoverability', () => {
    it('should appear in task --help', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task --help`.text();
      expect(result).toContain('ready');
      expect(result).toContain('no blocking dependencies');
    });

    it('should have --story option', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task ready --help`.text();
      expect(result).toContain('--story');
      expect(result).toContain('Filter by story code');
    });
  });

  describe('basic functionality', () => {
    it('should list pending tasks with no dependencies', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task ready`.text();
      expect(result).toContain('Task A - No deps');
      expect(result).toContain('Task B - No deps');
      expect(result).toContain('Task C - Completed'); // Still pending initially
    });

    it('should not show completed tasks', async () => {
      // Complete Task C
      const tasksJson = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task list -s TEST-001 --json`.json();
      const taskC = tasksJson.find((t: { title: string }) => t.title === 'Task C - Completed');

      if (taskC) {
        await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task status ${taskC.id} completed`.quiet();
      }

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task ready`.text();
      expect(result).not.toContain('Task C - Completed');
    });

    it('should filter by story code', async () => {
      // Create another story with a task
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} story create -f TEST -t "Other Story" -s planned`.quiet();
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task create -s TEST-002 -t "Other Story Task"`.quiet();

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task ready --story TEST-001`.text();
      expect(result).toContain('Task A - No deps');
      expect(result).not.toContain('Other Story Task');
    });
  });

  describe('JSON output', () => {
    it('should output valid JSON with --json flag', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task ready --json`.json();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('title');
      expect(result[0]).toHaveProperty('dependencies');
    });

    it('should include task details in JSON output', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task ready --json`.json();
      const taskA = result.find((t: { title: string }) => t.title === 'Task A - No deps');
      expect(taskA).toBeDefined();
      expect(taskA.status).toBe('pending');
      expect(Array.isArray(taskA.dependencies)).toBe(true);
    });
  });

  describe('dependency resolution', () => {
    it('should include tasks with empty dependencies array', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task ready --json`.json();
      // All our test tasks should have empty dependencies
      for (const task of result) {
        expect(task.dependencies.length).toBe(0);
      }
    });
  });

  describe('human-readable output', () => {
    it('should show task count message', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task ready`.text();
      expect(result).toMatch(/Found \d+ ready task/);
    });

    it('should display table with expected columns', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} task ready`.text();
      expect(result).toContain('ID');
      expect(result).toContain('TITLE');
      expect(result).toContain('STATUS');
      expect(result).toContain('STORY');
      expect(result).toContain('DEPS');
    });
  });
});
