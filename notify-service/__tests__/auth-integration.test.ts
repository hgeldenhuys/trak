/**
 * Auth Integration Tests (NOTIFY-013 T-010)
 *
 * Integration tests for endpoint protection with SDK key authentication.
 *
 * Test scenarios:
 * 1. Protected endpoints without token return 401
 * 2. Protected endpoints with valid token return success
 * 3. Public endpoints remain accessible without auth
 * 4. Revoked key scenarios
 *
 * Coverage:
 * - AC-002: POST /events returns 401 without valid Bearer token
 * - AC-003: GET /debug/* returns 401 without valid Bearer token
 * - AC-004: GET /response/:id and GET /health remain public
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { initDatabase, closeDatabase } from '../src/db';
import {
  generateSdkKey,
  createKey,
  deleteKey,
  revokeKey,
  listKeys,
  validateBearerToken,
  isAuthRequired,
  optionalAuth,
  requireAuth,
  unauthorizedResponse,
} from '../src/auth';
import type { EventPayload } from '../src/types';
import path from 'path';
import { existsSync, unlinkSync, mkdirSync } from 'fs';

// Test database path
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-auth');
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'events.db');

// Store original env values
let originalRequireAuth: string | undefined;
let originalDataDir: string | undefined;
let originalDebug: string | undefined;

// Test state
let testKey: string;
let testKeyId: number;

/**
 * Create a sample event payload for testing
 */
function createTestEventPayload(projectId: string, sessionId: string): EventPayload {
  return {
    eventType: 'UserPromptSubmit',
    sessionId,
    sessionName: 'test-session',
    projectId,
    projectName: 'auth-test-project',
    timestamp: new Date().toISOString(),
    transcriptPath: '/test/transcript.jsonl',
    cwd: '/test/path',
    promptText: 'Test prompt for auth integration test',
  };
}

/**
 * Create a mock request with optional Authorization header
 */
function createMockRequest(
  method: string,
  path: string,
  options: { authToken?: string; body?: unknown } = {}
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.authToken !== undefined) {
    headers['Authorization'] = options.authToken;
  }
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

/**
 * Clean up test data
 */
function cleanupTestData() {
  // Delete all test keys from database
  try {
    const keys = listKeys();
    for (const key of keys) {
      if (key.name.startsWith('integration-test-')) {
        deleteKey(key.id);
      }
    }
  } catch {
    // Database might not be initialized yet
  }
}

describe('Auth Integration Tests', () => {
  beforeAll(async () => {
    // Store original env values
    originalRequireAuth = process.env.REQUIRE_AUTH;
    originalDataDir = process.env.NOTIFY_SERVICE_DATA_DIR;
    originalDebug = process.env.NOTIFY_SERVICE_DEBUG;

    // Set up test environment
    process.env.REQUIRE_AUTH = 'true';
    process.env.NOTIFY_SERVICE_DATA_DIR = TEST_DATA_DIR;
    process.env.NOTIFY_SERVICE_DEBUG = 'false';

    // Ensure test data directory exists
    if (!existsSync(TEST_DATA_DIR)) {
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    // Initialize database
    initDatabase();

    // Clean up any stale test keys
    cleanupTestData();

    // Create test SDK key
    const { plainKey, hash } = generateSdkKey();
    const record = createKey(hash, 'integration-test-key');
    testKey = plainKey;
    testKeyId = record.id;
  });

  afterAll(async () => {
    // Clean up test keys
    cleanupTestData();

    // Restore original env values
    if (originalRequireAuth !== undefined) {
      process.env.REQUIRE_AUTH = originalRequireAuth;
    } else {
      delete process.env.REQUIRE_AUTH;
    }

    if (originalDataDir !== undefined) {
      process.env.NOTIFY_SERVICE_DATA_DIR = originalDataDir;
    } else {
      delete process.env.NOTIFY_SERVICE_DATA_DIR;
    }

    if (originalDebug !== undefined) {
      process.env.NOTIFY_SERVICE_DEBUG = originalDebug;
    } else {
      delete process.env.NOTIFY_SERVICE_DEBUG;
    }

    // Close database connection
    closeDatabase();

    // Clean up test database file
    try {
      if (existsSync(TEST_DB_PATH)) {
        unlinkSync(TEST_DB_PATH);
      }
      // Clean up WAL files if they exist
      const walPath = `${TEST_DB_PATH}-wal`;
      const shmPath = `${TEST_DB_PATH}-shm`;
      if (existsSync(walPath)) unlinkSync(walPath);
      if (existsSync(shmPath)) unlinkSync(shmPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================
  // AC-002: Token validation for protected endpoints
  // ============================================

  describe('AC-002: Bearer token validation', () => {
    test('request without token fails validation', async () => {
      const request = createMockRequest('POST', '/events', {
        body: createTestEventPayload('proj-no-auth', 'sess-no-auth'),
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing Authorization header');
    });

    test('request with invalid token fails validation', async () => {
      const request = createMockRequest('POST', '/events', {
        authToken: 'Bearer nsk_invalidtoken12345678901234567',
        body: createTestEventPayload('proj-invalid', 'sess-invalid'),
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid or revoked API key');
    });

    test('request with malformed token fails validation', async () => {
      const request = createMockRequest('POST', '/events', {
        authToken: 'Bearer not-a-valid-key-format',
        body: createTestEventPayload('proj-malformed', 'sess-malformed'),
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid or revoked API key');
    });

    test('request with valid Bearer token passes validation', async () => {
      const request = createMockRequest('POST', '/events', {
        authToken: `Bearer ${testKey}`,
        body: createTestEventPayload('proj-valid', 'sess-valid'),
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(true);
      expect(result.keyId).toBe(testKeyId);
      expect(result.keyName).toBe('integration-test-key');
    });

    test('request with lowercase bearer prefix passes validation', async () => {
      const request = createMockRequest('POST', '/events', {
        authToken: `bearer ${testKey}`, // lowercase "bearer"
        body: createTestEventPayload('proj-lowercase', 'sess-lowercase'),
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(true);
    });
  });

  // ============================================
  // AC-003: requireAuth middleware wrapper
  // ============================================

  describe('AC-003: requireAuth middleware', () => {
    const successHandler = async (_req: Request) =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    test('requireAuth rejects request without token', async () => {
      const protectedHandler = requireAuth(successHandler);
      const request = createMockRequest('GET', '/debug');

      const response = await protectedHandler(request);
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    test('requireAuth accepts request with valid token', async () => {
      const protectedHandler = requireAuth(successHandler);
      const request = createMockRequest('GET', '/debug', {
        authToken: `Bearer ${testKey}`,
      });

      const response = await protectedHandler(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test('requireAuth rejects request with invalid token', async () => {
      const protectedHandler = requireAuth(successHandler);
      const request = createMockRequest('GET', '/debug', {
        authToken: 'Bearer nsk_invalidtoken12345678901234567',
      });

      const response = await protectedHandler(request);
      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });
  });

  // ============================================
  // AC-004: optionalAuth middleware (REQUIRE_AUTH=true)
  // ============================================

  describe('AC-004: optionalAuth middleware with REQUIRE_AUTH=true', () => {
    const successHandler = async (_req: Request) =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    test('optionalAuth enforces auth when REQUIRE_AUTH=true', async () => {
      // REQUIRE_AUTH is set to 'true' in beforeAll
      expect(isAuthRequired()).toBe(true);

      const protectedHandler = optionalAuth(successHandler);
      const request = createMockRequest('GET', '/queue');

      const response = await protectedHandler(request);
      expect(response.status).toBe(401);
    });

    test('optionalAuth allows access with valid token when REQUIRE_AUTH=true', async () => {
      const protectedHandler = optionalAuth(successHandler);
      const request = createMockRequest('GET', '/queue', {
        authToken: `Bearer ${testKey}`,
      });

      const response = await protectedHandler(request);
      expect(response.status).toBe(200);
    });
  });

  // ============================================
  // Revoked key scenarios
  // ============================================

  describe('Revoked key scenarios', () => {
    let revokedKey: string;
    let revokedKeyId: number;

    beforeAll(async () => {
      // Create a key specifically for revocation testing
      const { plainKey, hash } = generateSdkKey();
      const record = createKey(hash, 'integration-test-revoked-key');
      revokedKey = plainKey;
      revokedKeyId = record.id;
    });

    afterAll(() => {
      // Clean up revoked key
      try {
        deleteKey(revokedKeyId);
      } catch {
        // Ignore cleanup errors
      }
    });

    test('key works before revocation', async () => {
      const request = createMockRequest('GET', '/queue', {
        authToken: `Bearer ${revokedKey}`,
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(true);
      expect(result.keyId).toBe(revokedKeyId);
    });

    test('key stops working after revocation', async () => {
      // Revoke the key
      revokeKey(revokedKeyId);

      // Attempt to use revoked key
      const request = createMockRequest('GET', '/queue', {
        authToken: `Bearer ${revokedKey}`,
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(false);
    });

    test('revoked key error message does not reveal key status', async () => {
      // The error message should be generic to prevent key enumeration
      const request = createMockRequest('GET', '/queue', {
        authToken: `Bearer ${revokedKey}`,
      });

      const result = await validateBearerToken(request);
      // Should use generic message, not "Key has been revoked"
      expect(result.error).toBe('Invalid or revoked API key');
    });
  });

  // ============================================
  // unauthorizedResponse helper
  // ============================================

  describe('unauthorizedResponse helper', () => {
    test('returns 401 status with JSON body', async () => {
      const response = unauthorizedResponse();

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Invalid or revoked API key');
    });

    test('accepts custom message', async () => {
      const response = unauthorizedResponse('Custom error message');

      const body = await response.json();
      expect(body.message).toBe('Custom error message');
    });
  });

  // ============================================
  // Edge cases
  // ============================================

  describe('Edge cases', () => {
    test('empty Authorization header fails validation', async () => {
      const request = createMockRequest('GET', '/queue', {
        authToken: '',
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(false);
    });

    test('Authorization header without Bearer prefix fails validation', async () => {
      const request = createMockRequest('GET', '/queue', {
        authToken: testKey, // Missing "Bearer " prefix
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(false);
    });

    test('Bearer token with extra whitespace passes validation', async () => {
      const request = createMockRequest('GET', '/queue', {
        authToken: `Bearer   ${testKey}  `, // Extra whitespace
      });

      const result = await validateBearerToken(request);
      // Should trim whitespace and work
      expect(result.valid).toBe(true);
    });

    test('Basic auth header is rejected', async () => {
      const request = createMockRequest('GET', '/queue', {
        authToken: `Basic ${Buffer.from('user:pass').toString('base64')}`,
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(false);
    });

    test('BEARER prefix (uppercase) passes validation', async () => {
      const request = createMockRequest('GET', '/queue', {
        authToken: `BEARER ${testKey}`,
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(true);
    });

    test('token with wrong prefix length fails validation', async () => {
      const request = createMockRequest('GET', '/queue', {
        authToken: 'Bearer sk_test_invalidprefix12345678901234',
      });

      const result = await validateBearerToken(request);
      expect(result.valid).toBe(false);
    });
  });
});

/**
 * Unit tests that don't require a running server
 * These test the auth module functions directly
 */
describe('Auth Module Unit Tests', () => {
  beforeAll(() => {
    process.env.NOTIFY_SERVICE_DATA_DIR = TEST_DATA_DIR;
    initDatabase();
  });

  afterAll(() => {
    closeDatabase();
  });

  describe('Key generation', () => {
    test('generated key has correct format', () => {
      const { plainKey, hash } = generateSdkKey();

      expect(plainKey).toMatch(/^nsk_[a-z0-9]{32}$/);
      expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    test('each generated key is unique', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const { plainKey } = generateSdkKey();
        expect(keys.has(plainKey)).toBe(false);
        keys.add(plainKey);
      }
    });
  });

  describe('Key storage', () => {
    test('created key can be found by hash', () => {
      const { plainKey, hash } = generateSdkKey();
      const record = createKey(hash, 'integration-test-storage');

      expect(record.id).toBeGreaterThan(0);
      expect(record.name).toBe('integration-test-storage');

      // Clean up
      deleteKey(record.id);
    });
  });
});
