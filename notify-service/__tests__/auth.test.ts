/**
 * Auth Module Tests (NOTIFY-013 T-009)
 *
 * Comprehensive tests for SDK key authentication including middleware.
 * Note: Key generation and SDK keys repository tests are in sdk-keys.test.ts.
 * This file focuses on middleware behavior and authentication flow.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDatabase, closeDatabase } from '../src/db';
import { generateSdkKey, hashSdkKey } from '../src/auth/key-generator';
import { createKey, revokeKey } from '../src/auth/sdk-keys';
import {
  validateBearerToken,
  requireAuth,
  optionalAuth,
  isAuthRequired,
  unauthorizedResponse,
} from '../src/auth/middleware';
import path from 'path';

// Test database path
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-auth.db');

describe('Auth Middleware', () => {
  let testId: string;

  beforeEach(() => {
    testId = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Initialize database
    process.env.NOTIFY_SERVICE_DATA_DIR = path.dirname(TEST_DB_PATH);
    try {
      initDatabase();
    } catch (e) {
      // May already be initialized
    }
  });

  afterEach(() => {
    // Clean up env vars between tests
    delete process.env.REQUIRE_AUTH;
    delete process.env.NODE_ENV;
  });

  describe('validateBearerToken', () => {
    test('returns error for missing Authorization header', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'GET',
      });

      const result = await validateBearerToken(request);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
    });

    test('returns error for empty Authorization header', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: '' },
      });

      const result = await validateBearerToken(request);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
    });

    test('returns error for invalid Bearer format - missing prefix', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: 'tk_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6' },
      });

      const result = await validateBearerToken(request);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
    });

    test('returns error for invalid Bearer format - wrong prefix', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: 'Basic tk_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6' },
      });

      const result = await validateBearerToken(request);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
    });

    test('returns error for invalid SDK key format', async () => {
      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: 'Bearer invalid_key_format' },
      });

      const result = await validateBearerToken(request);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid or revoked API key');
    });

    test('returns error for non-existent key', async () => {
      // Valid format but never created in database
      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: 'Bearer tk_test_nonexistent00000000000000000000' },
      });

      const result = await validateBearerToken(request);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid or revoked API key');
    });

    test('returns error for revoked key', async () => {
      // Create and revoke a key
      const { plainKey, hash } = generateSdkKey();
      const record = createKey(hash, `Revoked Key ${testId}`);
      revokeKey(record.id);

      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: `Bearer ${plainKey}` },
      });

      const result = await validateBearerToken(request);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid or revoked API key');
    });

    test('returns success with keyId for valid key', async () => {
      // Create a valid key
      const { plainKey, hash } = generateSdkKey();
      const record = createKey(hash, `Valid Key ${testId}`);

      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: `Bearer ${plainKey}` },
      });

      const result = await validateBearerToken(request);

      expect(result.valid).toBe(true);
      expect(result.keyId).toBe(record.id);
      expect(result.keyName).toBe(`Valid Key ${testId}`);
      expect(result.error).toBeUndefined();
    });

    test('is case-insensitive for Bearer prefix', async () => {
      const { plainKey, hash } = generateSdkKey();
      createKey(hash, `Case Test Key ${testId}`);

      // Test lowercase 'bearer'
      const requestLower = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: `bearer ${plainKey}` },
      });

      const resultLower = await validateBearerToken(requestLower);
      expect(resultLower.valid).toBe(true);

      // Test uppercase 'BEARER'
      const requestUpper = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: `BEARER ${plainKey}` },
      });

      const resultUpper = await validateBearerToken(requestUpper);
      expect(resultUpper.valid).toBe(true);
    });

    test('handles whitespace around token', async () => {
      const { plainKey, hash } = generateSdkKey();
      createKey(hash, `Whitespace Key ${testId}`);

      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: `Bearer   ${plainKey}  ` },
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(true);
    });
  });

  describe('requireAuth wrapper', () => {
    test('returns 401 for invalid auth', async () => {
      const handler = async (request: Request) => {
        return new Response(JSON.stringify({ data: 'secret' }), { status: 200 });
      };

      const protectedHandler = requireAuth(handler);

      // Request without auth
      const request = new Request('http://localhost/api/test', {
        method: 'GET',
      });

      const response = await protectedHandler(request);

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    test('returns 401 for revoked key', async () => {
      const handler = async (request: Request) => {
        return new Response(JSON.stringify({ data: 'secret' }), { status: 200 });
      };

      const protectedHandler = requireAuth(handler);

      // Create and revoke a key
      const { plainKey, hash } = generateSdkKey();
      const record = createKey(hash, `Revoked Key ${testId}`);
      revokeKey(record.id);

      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: `Bearer ${plainKey}` },
      });

      const response = await protectedHandler(request);

      expect(response.status).toBe(401);
    });

    test('passes through for valid auth', async () => {
      const handler = async (request: Request) => {
        return new Response(JSON.stringify({ data: 'secret' }), { status: 200 });
      };

      const protectedHandler = requireAuth(handler);

      // Create a valid key
      const { plainKey, hash } = generateSdkKey();
      createKey(hash, `Valid Key ${testId}`);

      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: `Bearer ${plainKey}` },
      });

      const response = await protectedHandler(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toBe('secret');
    });

    test('passes additional arguments to handler', async () => {
      // Simulate a handler that receives extra args (like URL params)
      const handler = async (request: Request, extraArg: unknown) => {
        return new Response(JSON.stringify({ extra: extraArg }), { status: 200 });
      };

      const protectedHandler = requireAuth(handler);

      const { plainKey, hash } = generateSdkKey();
      createKey(hash, `Extra Args Key ${testId}`);

      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: `Bearer ${plainKey}` },
      });

      const response = await protectedHandler(request, { foo: 'bar' });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.extra).toEqual({ foo: 'bar' });
    });
  });

  describe('unauthorizedResponse', () => {
    test('returns 401 status', async () => {
      const response = unauthorizedResponse();

      expect(response.status).toBe(401);
    });

    test('returns JSON content type', async () => {
      const response = unauthorizedResponse();

      expect(response.headers.get('Content-Type')).toBe('application/json');
    });

    test('includes default error message', async () => {
      const response = unauthorizedResponse();
      const body = await response.json();

      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid or revoked API key');
    });

    test('includes custom error message', async () => {
      const response = unauthorizedResponse('Custom error message');
      const body = await response.json();

      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Custom error message');
    });
  });

  describe('isAuthRequired', () => {
    test('returns false when REQUIRE_AUTH=false', () => {
      process.env.REQUIRE_AUTH = 'false';
      expect(isAuthRequired()).toBe(false);
    });

    test('returns false when REQUIRE_AUTH=0', () => {
      process.env.REQUIRE_AUTH = '0';
      expect(isAuthRequired()).toBe(false);
    });

    test('returns true when REQUIRE_AUTH=true', () => {
      process.env.REQUIRE_AUTH = 'true';
      expect(isAuthRequired()).toBe(true);
    });

    test('returns true when REQUIRE_AUTH=1', () => {
      process.env.REQUIRE_AUTH = '1';
      expect(isAuthRequired()).toBe(true);
    });

    test('defaults to true in production', () => {
      delete process.env.REQUIRE_AUTH;
      process.env.NODE_ENV = 'production';
      expect(isAuthRequired()).toBe(true);
    });

    test('defaults to false in development', () => {
      delete process.env.REQUIRE_AUTH;
      process.env.NODE_ENV = 'development';
      expect(isAuthRequired()).toBe(false);
    });

    test('defaults to false when NODE_ENV not set', () => {
      delete process.env.REQUIRE_AUTH;
      delete process.env.NODE_ENV;
      expect(isAuthRequired()).toBe(false);
    });
  });

  describe('optionalAuth', () => {
    test('skips auth when REQUIRE_AUTH=false', async () => {
      process.env.REQUIRE_AUTH = 'false';

      const handler = async (request: Request) => {
        return new Response(JSON.stringify({ data: 'accessible' }), { status: 200 });
      };

      const conditionalHandler = optionalAuth(handler);

      // Request without auth should work
      const request = new Request('http://localhost/api/test', {
        method: 'GET',
      });

      const response = await conditionalHandler(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toBe('accessible');
    });

    test('requires auth when REQUIRE_AUTH=true', async () => {
      process.env.REQUIRE_AUTH = 'true';

      const handler = async (request: Request) => {
        return new Response(JSON.stringify({ data: 'secret' }), { status: 200 });
      };

      const conditionalHandler = optionalAuth(handler);

      // Request without auth should fail
      const request = new Request('http://localhost/api/test', {
        method: 'GET',
      });

      const response = await conditionalHandler(request);

      expect(response.status).toBe(401);
    });

    test('passes through with valid auth when required', async () => {
      process.env.REQUIRE_AUTH = 'true';

      const handler = async (request: Request) => {
        return new Response(JSON.stringify({ data: 'secret' }), { status: 200 });
      };

      const conditionalHandler = optionalAuth(handler);

      // Create a valid key
      const { plainKey, hash } = generateSdkKey();
      createKey(hash, `Optional Auth Key ${testId}`);

      const request = new Request('http://localhost/api/test', {
        method: 'GET',
        headers: { Authorization: `Bearer ${plainKey}` },
      });

      const response = await conditionalHandler(request);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toBe('secret');
    });
  });
});

describe('Hash Security', () => {
  test('hash is not reversible - different key produces different hash', () => {
    const key1 = 'tk_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const key2 = 'tk_test_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const hash1 = hashSdkKey(key1);
    const hash2 = hashSdkKey(key2);

    // Different keys should produce different hashes
    expect(hash1).not.toBe(hash2);

    // Hash should be 64 characters (SHA-256 hex)
    expect(hash1).toHaveLength(64);
    expect(hash2).toHaveLength(64);
  });

  test('cannot derive key from hash', () => {
    const key = 'tk_test_testkey1234567890abcdefghij';
    const hash = hashSdkKey(key);

    // Hash should not contain the key or any identifiable part
    expect(hash).not.toContain('tk_test_');
    expect(hash).not.toContain('testkey');
    expect(hash).not.toContain('1234567890');

    // Hash should be hex characters only
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('hash is deterministic', () => {
    const key = 'tk_test_deterministictest0000000000';

    const hash1 = hashSdkKey(key);
    const hash2 = hashSdkKey(key);
    const hash3 = hashSdkKey(key);

    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });

  test('small key changes produce completely different hashes', () => {
    const key1 = 'tk_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
    const key2 = 'tk_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p7'; // Only last char different

    const hash1 = hashSdkKey(key1);
    const hash2 = hashSdkKey(key2);

    expect(hash1).not.toBe(hash2);

    // Hashes should be completely different (avalanche effect)
    // Count matching characters - should be very few due to SHA-256 properties
    let matchingChars = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) matchingChars++;
    }

    // With SHA-256, expect roughly 50% match by random chance (about 32 chars)
    // If more than 50 chars match, something is wrong
    expect(matchingChars).toBeLessThan(50);
  });
});

describe('End-to-End Auth Flow', () => {
  let testId: string;

  beforeEach(() => {
    testId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    process.env.NOTIFY_SERVICE_DATA_DIR = path.join(process.cwd(), 'data');
    try {
      initDatabase();
    } catch (e) {
      // May already be initialized
    }
    process.env.REQUIRE_AUTH = 'true';
  });

  afterEach(() => {
    delete process.env.REQUIRE_AUTH;
  });

  test('complete flow: generate key, authenticate, use protected endpoint', async () => {
    // 1. Admin creates a new key
    const { plainKey, hash } = generateSdkKey();
    const record = createKey(hash, `E2E Test Key ${testId}`);

    expect(record.id).toBeGreaterThan(0);
    expect(record.lastUsedAt).toBeNull();

    // 2. Client authenticates with the key
    const protectedHandler = requireAuth(async (request: Request) => {
      return new Response(JSON.stringify({ success: true, message: 'Protected data accessed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const request = new Request('http://localhost/api/protected', {
      method: 'GET',
      headers: { Authorization: `Bearer ${plainKey}` },
    });

    const response = await protectedHandler(request);

    // 3. Verify access was granted
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Protected data accessed');
  });

  test('flow with revoked key: generate, revoke, fail auth', async () => {
    // 1. Admin creates and then revokes a key
    const { plainKey, hash } = generateSdkKey();
    const record = createKey(hash, `Revoked E2E Key ${testId}`);
    revokeKey(record.id);

    // 2. Client tries to authenticate with revoked key
    const protectedHandler = requireAuth(async (request: Request) => {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const request = new Request('http://localhost/api/protected', {
      method: 'GET',
      headers: { Authorization: `Bearer ${plainKey}` },
    });

    const response = await protectedHandler(request);

    // 3. Verify access was denied
    expect(response.status).toBe(401);
  });

  test('flow with invalid key format', async () => {
    const protectedHandler = requireAuth(async (request: Request) => {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    // Try various invalid formats
    const invalidKeys = [
      'invalid',
      'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // Wrong prefix
      'tk_test_short', // Too short
      'tk_test_UPPERCASE0000000000000000000000', // Uppercase not allowed
      '', // Empty
    ];

    for (const invalidKey of invalidKeys) {
      const request = new Request('http://localhost/api/protected', {
        method: 'GET',
        headers: { Authorization: `Bearer ${invalidKey}` },
      });

      const response = await protectedHandler(request);
      expect(response.status).toBe(401);
    }
  });
});
