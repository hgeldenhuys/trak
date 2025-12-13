/**
 * Tests for CLI entry point
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { $ } from 'bun';
import { unlink } from 'node:fs/promises';

const CLI_PATH = 'src/cli/index.ts';
const TEST_DB_PATH = '/tmp/cli-test-board.db';

describe('Board CLI', () => {
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

  describe('Global options', () => {
    it('should display help', async () => {
      const result = await $`bun run ${CLI_PATH} --help`.text();
      expect(result).toContain('Board CLI for story and task management');
      expect(result).toContain('--db-path');
      expect(result).toContain('--json');
      expect(result).toContain('--verbose');
    });

    it('should display version', async () => {
      const result = await $`bun run ${CLI_PATH} --version`.text();
      expect(result.trim()).toBe('0.1.0');
    });

    it('should accept custom database path', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} --verbose story 2>&1`.text();
      expect(result).toContain(`Database path: ${TEST_DB_PATH}`);
    });

    it('should accept verbose flag', async () => {
      const result = await $`bun run ${CLI_PATH} --verbose story 2>&1`.text();
      expect(result).toContain('[verbose]');
      expect(result).toContain('Database initialized successfully');
    });
  });

  describe('Subcommands', () => {
    it('should have story subcommand', async () => {
      const result = await $`bun run ${CLI_PATH} story --help`.text();
      expect(result).toContain('Manage stories');
    });

    it('should have task subcommand', async () => {
      const result = await $`bun run ${CLI_PATH} task --help`.text();
      expect(result).toContain('Manage tasks');
    });

    it('should have feature subcommand', async () => {
      const result = await $`bun run ${CLI_PATH} feature --help`.text();
      expect(result).toContain('Manage features');
    });
  });

  describe('Database initialization', () => {
    it('should initialize database on first run', async () => {
      // Remove test db if exists
      try {
        await unlink(TEST_DB_PATH);
      } catch {
        // Ignore
      }

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} story 2>&1`.text();
      expect(result).toContain('Applied 1 migration');
    });

    it('should not re-apply migrations on subsequent runs', async () => {
      // First run creates db
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} story 2>&1`.text();

      // Second run should not apply migrations
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} story 2>&1`.text();
      expect(result).not.toContain('Applied');
    });
  });
});
