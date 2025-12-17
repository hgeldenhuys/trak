/**
 * Tests for Database Path Resolution (Project-Centric)
 *
 * These tests verify the database path resolution logic:
 * 1. Explicit override takes highest priority
 * 2. BOARD_DB_PATH environment variable
 * 3. BOARD_GLOBAL=1 uses global ~/.board/data.db
 * 4. Local .board.db in current directory (DEFAULT - always)
 */

import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import {
  resolveDbPath,
  hasLocalDb,
  getLocalDbPath,
  getGlobalDbPath,
} from '../index';

describe('Database Path Resolution', () => {
  const originalCwd = process.cwd();
  const testDir = join(import.meta.dir, 'temp-test-dir');
  const originalEnv = process.env.BOARD_DB_PATH;

  beforeEach(() => {
    // Clean up test directory if it exists
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Clear environment variables
    delete process.env.BOARD_DB_PATH;
    delete process.env.BOARD_GLOBAL;
  });

  afterEach(() => {
    // Restore original cwd
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }

    // Restore environment variables
    if (originalEnv !== undefined) {
      process.env.BOARD_DB_PATH = originalEnv;
    } else {
      delete process.env.BOARD_DB_PATH;
    }
    delete process.env.BOARD_GLOBAL;
  });

  describe('resolveDbPath()', () => {
    it('should use explicit override path when provided', () => {
      const overridePath = '/custom/path/to/db.sqlite';
      const result = resolveDbPath(overridePath);
      expect(result).toBe(overridePath);
    });

    it('should use BOARD_DB_PATH environment variable when set', () => {
      const envPath = '/env/path/to/db.sqlite';
      process.env.BOARD_DB_PATH = envPath;

      const result = resolveDbPath();
      expect(result).toBe(envPath);
    });

    it('should prefer explicit override over environment variable', () => {
      const overridePath = '/override/path/db.sqlite';
      process.env.BOARD_DB_PATH = '/env/path/db.sqlite';

      const result = resolveDbPath(overridePath);
      expect(result).toBe(overridePath);
    });

    it('should use local .board.db when it exists', () => {
      // Create a local .board.db in test directory
      process.chdir(testDir);
      const localDbPath = join(testDir, '.board.db');
      writeFileSync(localDbPath, ''); // Create empty file

      const result = resolveDbPath();
      expect(result).toBe(localDbPath);
    });

    it('should prefer environment variable over local .board.db', () => {
      // Create local .board.db
      process.chdir(testDir);
      const localDbPath = join(testDir, '.board.db');
      writeFileSync(localDbPath, '');

      // Set environment variable
      const envPath = '/env/path/db.sqlite';
      process.env.BOARD_DB_PATH = envPath;

      const result = resolveDbPath();
      expect(result).toBe(envPath);
    });

    it('should always use local path by default (even if .board.db does not exist)', () => {
      // Change to test directory with no .board.db
      process.chdir(testDir);

      const result = resolveDbPath();
      const expectedLocalPath = join(testDir, '.board.db');
      expect(result).toBe(expectedLocalPath);
    });

    it('should use global path when BOARD_GLOBAL=1 is set', () => {
      process.chdir(testDir);
      process.env.BOARD_GLOBAL = '1';

      const result = resolveDbPath();
      const expectedGlobalPath = join(homedir(), '.board', 'data.db');
      expect(result).toBe(expectedGlobalPath);
    });
  });

  describe('hasLocalDb()', () => {
    it('should return false when .board.db does not exist', () => {
      process.chdir(testDir);
      expect(hasLocalDb()).toBe(false);
    });

    it('should return true when .board.db exists', () => {
      process.chdir(testDir);
      const localDbPath = join(testDir, '.board.db');
      writeFileSync(localDbPath, '');

      expect(hasLocalDb()).toBe(true);
    });
  });

  describe('getLocalDbPath()', () => {
    it('should return path to .board.db in current directory', () => {
      process.chdir(testDir);
      const result = getLocalDbPath();
      expect(result).toBe(join(testDir, '.board.db'));
    });

    it('should return path regardless of whether file exists', () => {
      process.chdir(testDir);
      // File does not exist
      expect(existsSync(join(testDir, '.board.db'))).toBe(false);
      const result = getLocalDbPath();
      expect(result).toBe(join(testDir, '.board.db'));
    });
  });

  describe('getGlobalDbPath()', () => {
    it('should return path to ~/.board/data.db', () => {
      const result = getGlobalDbPath();
      const expected = join(homedir(), '.board', 'data.db');
      expect(result).toBe(expected);
    });
  });

  describe('Resolution Priority', () => {
    it('should follow correct priority order: override > env > BOARD_GLOBAL > local', () => {
      process.chdir(testDir);
      const localDbPath = join(testDir, '.board.db');

      // Set environment variable
      const envPath = '/env/path/db.sqlite';
      process.env.BOARD_DB_PATH = envPath;

      // Test with override (highest priority)
      const overridePath = '/override/path/db.sqlite';
      expect(resolveDbPath(overridePath)).toBe(overridePath);

      // Test without override (env takes over)
      expect(resolveDbPath()).toBe(envPath);

      // Remove env var (local is now default)
      delete process.env.BOARD_DB_PATH;
      expect(resolveDbPath()).toBe(localDbPath);

      // Set BOARD_GLOBAL=1 (global takes over)
      process.env.BOARD_GLOBAL = '1';
      expect(resolveDbPath()).toBe(join(homedir(), '.board', 'data.db'));

      // Remove BOARD_GLOBAL (back to local)
      delete process.env.BOARD_GLOBAL;
      expect(resolveDbPath()).toBe(localDbPath);
    });
  });
});
