/**
 * Integration Tests for Board Init Command
 *
 * Tests project-local database initialization:
 * - Creates .board.db in current directory
 * - Idempotent behavior (safe to run multiple times)
 * - --force flag for re-initialization
 * - Schema version verification
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { $ } from 'bun';
import { Database } from 'bun:sqlite';
import { TABLES, SCHEMA_VERSION } from '../../src/db';

describe('board init command', () => {
  const testDir = join(import.meta.dir, 'temp-init-test');
  const localDbPath = join(testDir, '.board.db');
  const cliPath = join(import.meta.dir, '../../src/cli/index.ts');
  const originalCwd = process.cwd();

  beforeEach(() => {
    // Clean up test directory if it exists
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore original cwd
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('basic initialization', () => {
    test('creates .board.db in current directory', async () => {
      expect(existsSync(localDbPath)).toBe(false);

      const result = await $`bun run ${cliPath} init`.quiet();

      expect(result.exitCode).toBe(0);
      expect(existsSync(localDbPath)).toBe(true);
    });

    test('creates database with correct schema version', async () => {
      await $`bun run ${cliPath} init`.quiet();

      const db = new Database(localDbPath, { readonly: true });
      const result = db.query(
        `SELECT MAX(version) as version FROM ${TABLES.SCHEMA_VERSIONS}`
      ).get() as { version: number };

      expect(result.version).toBe(SCHEMA_VERSION);
      db.close();
    });

    test('creates all required tables', async () => {
      await $`bun run ${cliPath} init`.quiet();

      const db = new Database(localDbPath, { readonly: true });
      const tables = db.query(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain(TABLES.FEATURES);
      expect(tableNames).toContain(TABLES.STORIES);
      expect(tableNames).toContain(TABLES.TASKS);
      expect(tableNames).toContain(TABLES.ACCEPTANCE_CRITERIA);
      expect(tableNames).toContain(TABLES.HISTORY);
      expect(tableNames).toContain(TABLES.SESSIONS);

      db.close();
    });

    test('outputs success message with database path', async () => {
      const result = await $`bun run ${cliPath} init`.text();

      expect(result).toContain('Project board initialized');
      expect(result).toContain('.board.db');
    });

    test('displays schema version in output', async () => {
      const result = await $`bun run ${cliPath} init`.text();

      expect(result).toContain(`Schema version: ${SCHEMA_VERSION}`);
    });

    test('displays next steps in output', async () => {
      const result = await $`bun run ${cliPath} init`.text();

      expect(result).toContain('Next steps:');
      expect(result).toContain('board feature create');
      expect(result).toContain('board story create');
    });
  });

  describe('idempotency', () => {
    test('is safe to run multiple times', async () => {
      // First init
      const result1 = await $`bun run ${cliPath} init`.quiet();
      expect(result1.exitCode).toBe(0);

      // Second init should not fail
      const result2 = await $`bun run ${cliPath} init`.text();
      expect(result2).toContain('already initialized');
    });

    test('does not destroy existing data on second run', async () => {
      // Initialize and create a feature
      await $`bun run ${cliPath} init`.quiet();
      await $`bun run ${cliPath} feature create -c TEST -n "Test Feature"`.quiet();

      // Verify feature exists
      const listBefore = await $`bun run ${cliPath} feature list --json`.json();
      expect(listBefore.length).toBe(1);

      // Run init again
      await $`bun run ${cliPath} init`.quiet();

      // Feature should still exist
      const listAfter = await $`bun run ${cliPath} feature list --json`.json();
      expect(listAfter.length).toBe(1);
      expect(listAfter[0].code).toBe('TEST');
    });

    test('suggests --force when already initialized', async () => {
      await $`bun run ${cliPath} init`.quiet();
      const result = await $`bun run ${cliPath} init`.text();

      expect(result).toContain('--force');
    });
  });

  describe('--force flag', () => {
    test('re-initializes database when --force is used', async () => {
      // First init
      await $`bun run ${cliPath} init`.quiet();

      // Add some data
      await $`bun run ${cliPath} feature create -c FORCE -n "Force Test"`.quiet();

      // Re-init with --force
      const result = await $`bun run ${cliPath} init --force`.text();

      expect(result).toContain('Re-initializing');
      expect(result).toContain('initialized');
    });

    test('preserves data with --force (migrations only)', async () => {
      // Note: --force runs migrations but doesn't wipe data
      await $`bun run ${cliPath} init`.quiet();
      await $`bun run ${cliPath} feature create -c KEEP -n "Keep Me"`.quiet();

      await $`bun run ${cliPath} init --force`.quiet();

      // Data should still exist (migrations are additive)
      const list = await $`bun run ${cliPath} feature list --json`.json();
      expect(list.length).toBe(1);
      expect(list[0].code).toBe('KEEP');
    });
  });

  describe('help output', () => {
    test('shows init command in main help', async () => {
      const result = await $`bun run ${cliPath} --help`.text();

      expect(result).toContain('init');
      expect(result).toContain('project-local');
    });

    test('shows init command help', async () => {
      const result = await $`bun run ${cliPath} init --help`.text();

      expect(result).toContain('Initialize');
      expect(result).toContain('.board.db');
      expect(result).toContain('--force');
    });
  });

  describe('database resolution after init', () => {
    test('CLI uses local database after init', async () => {
      await $`bun run ${cliPath} init`.quiet();

      // Create a feature
      await $`bun run ${cliPath} feature create -c LOCAL -n "Local Feature"`.quiet();

      // Verify it's using local database with verbose
      const verbose = await $`bun run ${cliPath} -v feature list`.text();

      expect(verbose).toContain('.board.db');
      expect(verbose).not.toContain('.board/data.db'); // Not global
    });
  });
});
