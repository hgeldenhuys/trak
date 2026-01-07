/**
 * Tests for `board log` CLI command
 *
 * Tests the activity log CLI commands for adding, listing,
 * and clearing log entries for agent monitoring.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { $ } from 'bun';
import { unlink } from 'node:fs/promises';

const CLI_PATH = 'src/cli/index.ts';
const TEST_DB_PATH = '/tmp/log-cli-test.db';

describe('board log', () => {
  beforeAll(async () => {
    // Clean up any existing test db
    try {
      await unlink(TEST_DB_PATH);
      await unlink(TEST_DB_PATH + '-wal');
      await unlink(TEST_DB_PATH + '-shm');
    } catch {
      // Ignore
    }
    // Initialize database to run migrations before tests
    // This prevents "Applied X migrations" output from breaking JSON parsing
    await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log count`.quiet();
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
    it('should show log command in main help', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} --help`.text();
      expect(result).toContain('log');
    });

    it('should show log subcommands in log --help', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log --help`.text();
      expect(result).toContain('add');
      expect(result).toContain('list');
      expect(result).toContain('clear');
      expect(result).toContain('show');
      expect(result).toContain('count');
    });
  });

  describe('log add', () => {
    it('should add log with required options (-s, -m)', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "test-hook" -m "Test message" --json`.json();

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.source).toBe('test-hook');
      expect(result.message).toBe('Test message');
      expect(result.level).toBe('info'); // default level
    });

    it('should add log with level option (-l warn)', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "test-hook" -m "Warning message" -l warn --json`.json();

      expect(result.level).toBe('warn');
    });

    it('should add log with level option (-l error)', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "test-hook" -m "Error message" -l error --json`.json();

      expect(result.level).toBe('error');
    });

    it('should fail with invalid level', async () => {
      const proc = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "test" -m "msg" -l invalid`.nothrow();
      expect(proc.exitCode).not.toBe(0);
    });

    it('should output JSON with --json flag', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "json-test" -m "JSON output test" --json`.json();

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('storyId');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('createdAt');
    });

    it('should fail without required -s option', async () => {
      const proc = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -m "No source"`.nothrow();
      expect(proc.exitCode).not.toBe(0);
    });

    it('should fail without required -m option', async () => {
      const proc = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "no-message"`.nothrow();
      expect(proc.exitCode).not.toBe(0);
    });

    it('should show success message in text output', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "text-test" -m "Text output"`.text();
      expect(result).toContain('Log added:');
    });
  });

  describe('log add with story', () => {
    beforeAll(async () => {
      // Create a feature and story for story association tests
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} feature create -n "Log Test Feature" -c LOGF`.quiet();
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} story create -f LOGF -t "Log Test Story" -s planned`.quiet();
    });

    it('should add log with story option (-S)', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "story-hook" -m "Story log" -S LOGF-001 --json`.json();

      expect(result.storyId).toBeDefined();
      expect(result.storyId).not.toBeNull();
    });

    it('should fail with non-existent story', async () => {
      const proc = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "test" -m "msg" -S NON-EXISTENT`.nothrow();
      expect(proc.exitCode).not.toBe(0);
    });
  });

  describe('log list', () => {
    beforeEach(async () => {
      // Clear logs before each list test
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --all --confirm`.quiet();
    });

    it('should list logs with default behavior', async () => {
      // Add a few logs
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "list-test" -m "Log 1"`.quiet();
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "list-test" -m "Log 2"`.quiet();

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log list`.text();

      expect(result).toContain('Log 1');
      expect(result).toContain('Log 2');
      expect(result).toContain('list-test');
    });

    it('should respect -n limit option', async () => {
      // Add more logs than the limit
      for (let i = 1; i <= 5; i++) {
        await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "limit-test" -m "Log ${i}"`.quiet();
      }

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log list -n 3 --json`.json();

      expect(result).toHaveLength(3);
    });

    it('should filter by source with -s option', async () => {
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "source-a" -m "From A"`.quiet();
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "source-b" -m "From B"`.quiet();
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "source-a" -m "Also from A"`.quiet();

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log list -s source-a --json`.json();

      expect(result.length).toBe(2);
      for (const log of result) {
        expect(log.source).toBe('source-a');
      }
    });

    it('should output valid JSON with --json flag', async () => {
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "json-list" -m "JSON test"`.quiet();

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log list --json`.json();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('source');
      expect(result[0]).toHaveProperty('message');
      expect(result[0]).toHaveProperty('level');
    });

    it('should show "No activity logs found" when empty', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log list`.text();
      expect(result).toContain('No activity logs found');
    });

    it('should return empty array in JSON when no logs', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log list --json`.json();
      expect(result).toEqual([]);
    });

    it('should display table with expected columns', async () => {
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "table-test" -m "Column test"`.quiet();

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log list`.text();

      expect(result).toContain('TIME');
      expect(result).toContain('SOURCE');
      expect(result).toContain('LEVEL');
      expect(result).toContain('MESSAGE');
    });

    it('should show logs in reverse chronological order', async () => {
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "order" -m "First"`.quiet();
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "order" -m "Second"`.quiet();
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "order" -m "Third"`.quiet();

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log list --json`.json();

      // Third should be first (newest)
      expect(result[0].message).toBe('Third');
      expect(result[1].message).toBe('Second');
      expect(result[2].message).toBe('First');
    });
  });

  describe('log clear', () => {
    beforeEach(async () => {
      // Ensure we have some logs
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "clear-test" -m "Log to clear"`.quiet();
    });

    it('should parse duration format correctly (hours)', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --older-than 1h --json`.json();

      expect(result).toHaveProperty('cleared');
      expect(result).toHaveProperty('olderThan');
      expect(result.olderThan).toBe('1h');
    });

    it('should parse duration format correctly (days)', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --older-than 7d --json`.json();

      expect(result.olderThan).toBe('7d');
    });

    it('should parse duration format correctly (minutes)', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --older-than 30m --json`.json();

      expect(result.olderThan).toBe('30m');
    });

    it('should parse duration format correctly (weeks)', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --older-than 2w --json`.json();

      expect(result.olderThan).toBe('2w');
    });

    it('should fail with invalid duration format', async () => {
      const proc = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --older-than invalid`.nothrow();
      expect(proc.exitCode).not.toBe(0);
    });

    it('should clear all with --all --confirm', async () => {
      // Add several logs
      for (let i = 0; i < 5; i++) {
        await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "bulk" -m "Bulk log ${i}"`.quiet();
      }

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --all --confirm --json`.json();

      expect(result.cleared).toBeGreaterThan(0);

      // Verify logs are cleared
      const count = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log count --json`.json();
      expect(count.count).toBe(0);
    });

    it('should require --confirm with --all flag', async () => {
      const proc = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --all`.nothrow();
      expect(proc.exitCode).not.toBe(0);
    });

    it('should use default 24h when --older-than not specified', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --json`.json();

      expect(result).toHaveProperty('olderThan');
      expect(result.olderThan).toBe('24h');
    });

    it('should show success message in text output', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --all --confirm`.text();
      expect(result).toContain('Cleared');
      expect(result).toContain('log entries');
    });
  });

  describe('log show', () => {
    it('should show log by full ID', async () => {
      // Create a fresh log for this test
      const created = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "show-test" -m "Log to show" -l warn --json`.json();
      const logId = created.id;

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log show ${logId} --json`.json();

      expect(result.id).toBe(logId);
      expect(result.source).toBe('show-test');
      expect(result.message).toBe('Log to show');
    });

    it('should show log by ID prefix', async () => {
      // Create a fresh log for this test
      const created = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "prefix-test" -m "Prefix log" --json`.json();
      const logId = created.id;

      const prefix = logId.slice(0, 8);
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log show ${prefix} --json`.json();

      expect(result.id).toBe(logId);
    });

    it('should fail for non-existent log', async () => {
      const proc = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log show non-existent-id`.nothrow();
      expect(proc.exitCode).not.toBe(0);
    });

    it('should display all fields in text output', async () => {
      // Create a fresh log for this test
      const created = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "fields-test" -m "Fields log" -l error --json`.json();
      const logId = created.id;

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log show ${logId}`.text();

      expect(result).toContain('ID:');
      expect(result).toContain('Source:');
      expect(result).toContain('Level:');
      expect(result).toContain('Timestamp:');
      expect(result).toContain('Message:');
    });
  });

  describe('log count', () => {
    beforeEach(async () => {
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log clear --all --confirm`.quiet();
    });

    it('should return count in JSON format', async () => {
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "count" -m "msg1"`.quiet();
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "count" -m "msg2"`.quiet();

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log count --json`.json();

      expect(result).toHaveProperty('count');
      expect(result.count).toBe(2);
    });

    it('should return 0 for empty database', async () => {
      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log count --json`.json();
      expect(result.count).toBe(0);
    });

    it('should show human-readable output', async () => {
      await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log add -s "count" -m "msg"`.quiet();

      const result = await $`bun run ${CLI_PATH} --db-path ${TEST_DB_PATH} log count`.text();

      expect(result).toContain('Total activity logs:');
    });
  });
});
