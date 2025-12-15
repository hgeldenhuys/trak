/**
 * SDK Key Authentication Tests (NOTIFY-013)
 *
 * Tests for SDK key generation, hashing, and repository operations.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDatabase, closeDatabase } from '../src/db';
import {
  generateSdkKey,
  hashSdkKey,
  isValidSdkKeyFormat,
  truncateKeyForLogging,
} from '../src/auth/key-generator';
import {
  createKey,
  findByHash,
  updateLastUsed,
  revokeKey,
  listKeys,
  listActiveKeys,
  getKeyById,
  deleteKey,
} from '../src/auth/sdk-keys';
import path from 'path';

// Test database path
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-sdk-keys.db');

describe('Key Generator', () => {
  test('generateSdkKey returns plain key and hash', () => {
    const { plainKey, hash } = generateSdkKey();

    expect(plainKey).toMatch(/^nsk_[a-z0-9]{32}$/);
    expect(hash).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  test('generateSdkKey produces unique keys', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { plainKey } = generateSdkKey();
      keys.add(plainKey);
    }
    expect(keys.size).toBe(100); // All unique
  });

  test('hashSdkKey produces consistent hashes', () => {
    const key = 'nsk_test1234567890abcdefghijklmnop';
    const hash1 = hashSdkKey(key);
    const hash2 = hashSdkKey(key);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  test('hashSdkKey produces different hashes for different keys', () => {
    const hash1 = hashSdkKey('nsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const hash2 = hashSdkKey('nsk_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

    expect(hash1).not.toBe(hash2);
  });

  test('isValidSdkKeyFormat validates correct keys', () => {
    expect(isValidSdkKeyFormat('nsk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')).toBe(true);
    expect(isValidSdkKeyFormat('nsk_00000000000000000000000000000000')).toBe(true);
    expect(isValidSdkKeyFormat('nsk_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toBe(true);
  });

  test('isValidSdkKeyFormat rejects invalid keys', () => {
    // Wrong prefix
    expect(isValidSdkKeyFormat('sk_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')).toBe(false);
    expect(isValidSdkKeyFormat('api_key_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')).toBe(false);

    // Wrong length
    expect(isValidSdkKeyFormat('nsk_short')).toBe(false);
    expect(isValidSdkKeyFormat('nsk_toolongaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);

    // Invalid characters (uppercase not allowed)
    expect(isValidSdkKeyFormat('nsk_A1B2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')).toBe(false);

    // Empty or null-like
    expect(isValidSdkKeyFormat('')).toBe(false);
    expect(isValidSdkKeyFormat('nsk_')).toBe(false);
  });

  test('truncateKeyForLogging returns safe truncated key', () => {
    const key = 'nsk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
    const truncated = truncateKeyForLogging(key);

    expect(truncated).toBe('nsk_a1b2c3d4...');
    expect(truncated).not.toContain('e5f6g7h8'); // Rest of key not included
  });

  test('truncateKeyForLogging handles invalid keys', () => {
    expect(truncateKeyForLogging('invalid')).toBe('invalid_key');
    expect(truncateKeyForLogging('')).toBe('invalid_key');
  });
});

describe('SDK Keys Repository', () => {
  let testId: string;

  beforeEach(() => {
    testId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Initialize database
    process.env.NOTIFY_SERVICE_DATA_DIR = path.dirname(TEST_DB_PATH);
    try {
      initDatabase();
    } catch (e) {
      // May already be initialized
    }
  });

  afterEach(() => {
    // Don't close between tests
  });

  test('createKey creates a new key record', () => {
    const { plainKey, hash } = generateSdkKey();
    const record = createKey(hash, `Test Key ${testId}`);

    expect(record.id).toBeGreaterThan(0);
    expect(record.keyHash).toBe(hash);
    expect(record.name).toBe(`Test Key ${testId}`);
    expect(record.projectId).toBeNull();
    expect(record.createdAt).toBeTruthy();
    expect(record.lastUsedAt).toBeNull();
    expect(record.revokedAt).toBeNull();
  });

  test('createKey with projectId scopes the key', () => {
    const { hash } = generateSdkKey();
    const projectId = `project-${testId}`;
    const record = createKey(hash, `Scoped Key ${testId}`, projectId);

    expect(record.projectId).toBe(projectId);
  });

  test('findByHash returns key record', () => {
    const { hash } = generateSdkKey();
    const created = createKey(hash, `Find Key ${testId}`);

    const found = findByHash(hash);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe(`Find Key ${testId}`);
  });

  test('findByHash returns null for non-existent hash', () => {
    const fakeHash = hashSdkKey('nsk_nonexistent000000000000000000');
    const found = findByHash(fakeHash);

    expect(found).toBeNull();
  });

  test('findByHash returns null for revoked key', () => {
    const { hash } = generateSdkKey();
    const created = createKey(hash, `Revoked Key ${testId}`);

    revokeKey(created.id);

    const found = findByHash(hash);
    expect(found).toBeNull();
  });

  test('updateLastUsed updates timestamp', async () => {
    const { hash } = generateSdkKey();
    const created = createKey(hash, `Used Key ${testId}`);

    expect(created.lastUsedAt).toBeNull();

    // Wait a bit to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    updateLastUsed(created.id);

    const updated = getKeyById(created.id);
    expect(updated?.lastUsedAt).not.toBeNull();
    expect(new Date(updated!.lastUsedAt!).getTime()).toBeGreaterThan(
      new Date(updated!.createdAt).getTime()
    );
  });

  test('revokeKey sets revoked_at timestamp', () => {
    const { hash } = generateSdkKey();
    const created = createKey(hash, `Revoke Key ${testId}`);

    expect(created.revokedAt).toBeNull();

    revokeKey(created.id);

    const revoked = getKeyById(created.id);
    expect(revoked?.revokedAt).not.toBeNull();
  });

  test('listKeys returns all keys including revoked', () => {
    // Create unique prefix for this test
    const prefix = `List-${testId}`;

    // Create keys
    const { hash: hash1 } = generateSdkKey();
    const { hash: hash2 } = generateSdkKey();

    const key1 = createKey(hash1, `${prefix}-Active`);
    const key2 = createKey(hash2, `${prefix}-Revoked`);

    revokeKey(key2.id);

    const allKeys = listKeys();

    // Filter to our test keys
    const testKeys = allKeys.filter((k) => k.name.startsWith(prefix));

    expect(testKeys.length).toBe(2);
    expect(testKeys.find((k) => k.name.endsWith('Active'))?.revokedAt).toBeNull();
    expect(testKeys.find((k) => k.name.endsWith('Revoked'))?.revokedAt).not.toBeNull();
  });

  test('listActiveKeys excludes revoked keys', () => {
    const prefix = `Active-${testId}`;

    const { hash: hash1 } = generateSdkKey();
    const { hash: hash2 } = generateSdkKey();

    const key1 = createKey(hash1, `${prefix}-Keep`);
    const key2 = createKey(hash2, `${prefix}-Remove`);

    revokeKey(key2.id);

    const activeKeys = listActiveKeys();

    // Filter to our test keys
    const testKeys = activeKeys.filter((k) => k.name.startsWith(prefix));

    expect(testKeys.length).toBe(1);
    expect(testKeys[0].name).toBe(`${prefix}-Keep`);
  });

  test('getKeyById returns key by ID', () => {
    const { hash } = generateSdkKey();
    const created = createKey(hash, `GetById Key ${testId}`);

    const found = getKeyById(created.id);
    expect(found).not.toBeNull();
    expect(found?.keyHash).toBe(hash);
  });

  test('getKeyById returns null for non-existent ID', () => {
    const found = getKeyById(999999);
    expect(found).toBeNull();
  });

  test('deleteKey removes key permanently', () => {
    const { hash } = generateSdkKey();
    const created = createKey(hash, `Delete Key ${testId}`);

    const deleted = deleteKey(created.id);
    expect(deleted).toBe(true);

    const found = getKeyById(created.id);
    expect(found).toBeNull();
  });

  test('deleteKey returns false for non-existent key', () => {
    const deleted = deleteKey(999999);
    expect(deleted).toBe(false);
  });
});

describe('SDK Key Authentication Flow', () => {
  beforeEach(() => {
    process.env.NOTIFY_SERVICE_DATA_DIR = path.dirname(TEST_DB_PATH);
    try {
      initDatabase();
    } catch (e) {
      // May already be initialized
    }
  });

  test('full key lifecycle: create, use, revoke', async () => {
    // 1. Generate and store key
    const { plainKey, hash } = generateSdkKey();
    const record = createKey(hash, 'API Client Key');

    expect(isValidSdkKeyFormat(plainKey)).toBe(true);
    expect(record.id).toBeGreaterThan(0);

    // 2. Simulate API request - hash incoming key and lookup
    const incomingHash = hashSdkKey(plainKey);
    const foundKey = findByHash(incomingHash);

    expect(foundKey).not.toBeNull();
    expect(foundKey?.id).toBe(record.id);

    // 3. Update last used on successful auth
    updateLastUsed(foundKey!.id);

    // 4. Verify last_used_at updated
    const afterUse = getKeyById(foundKey!.id);
    expect(afterUse?.lastUsedAt).not.toBeNull();

    // 5. Revoke the key
    revokeKey(foundKey!.id);

    // 6. Subsequent auth attempts should fail
    const afterRevoke = findByHash(incomingHash);
    expect(afterRevoke).toBeNull();
  });

  test('invalid key authentication fails', () => {
    // Try to authenticate with a key that was never created
    const fakeKey = 'nsk_fakekey00000000000000000000000';
    const fakeHash = hashSdkKey(fakeKey);

    const found = findByHash(fakeHash);
    expect(found).toBeNull();
  });
});
