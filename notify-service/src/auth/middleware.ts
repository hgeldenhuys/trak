/**
 * Auth Middleware (NOTIFY-013 T-003)
 *
 * Middleware for protecting endpoints with SDK key authentication.
 *
 * Usage:
 *   // Check auth and get result
 *   const authResult = await validateBearerToken(request);
 *   if (!authResult.valid) {
 *     return unauthorizedResponse();
 *   }
 *
 *   // Or wrap a handler
 *   const protectedHandler = requireAuth(myHandler);
 *
 * Security notes:
 * - Uses constant-time comparison for hash matching (via crypto.timingSafeEqual)
 * - Returns generic error message for invalid/revoked keys (prevents enumeration)
 * - Updates last_used_at on successful validation for audit trail
 */

import { timingSafeEqual } from 'crypto';
import { hashSdkKey, isValidSdkKeyFormat } from './key-generator';
import { findByHash, updateLastUsed } from './sdk-keys';
import type { AuthResult } from '../types';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

/**
 * Generic error message for all auth failures (prevents key enumeration)
 */
const AUTH_ERROR_MESSAGE = 'Invalid or revoked API key';

/**
 * Extract Bearer token from Authorization header
 *
 * @param request - Incoming HTTP request
 * @returns Token string if present, null otherwise
 */
function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  // Check for Bearer prefix (case-insensitive per RFC 6750)
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!bearerMatch) {
    return null;
  }

  return bearerMatch[1].trim();
}

/**
 * Compare two strings in constant time to prevent timing attacks
 *
 * @param a - First string
 * @param b - Second string
 * @returns true if strings are equal
 */
function constantTimeCompare(a: string, b: string): boolean {
  // Ensure both buffers are the same length for timingSafeEqual
  // If lengths differ, still do the comparison to maintain constant time
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Compare bufA with itself to maintain timing consistency,
    // but always return false for length mismatch
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Validate a Bearer token from an incoming request
 *
 * Extracts the token from the Authorization header, hashes it,
 * and verifies against the sdk_keys table using constant-time comparison.
 *
 * @param request - Incoming HTTP request
 * @returns AuthResult with validation status
 *
 * @example
 * const authResult = await validateBearerToken(request);
 * if (!authResult.valid) {
 *   return new Response(JSON.stringify({ error: authResult.error }), { status: 401 });
 * }
 * // Proceed with authenticated request
 * console.log(`Authenticated with key ${authResult.keyId}`);
 */
export async function validateBearerToken(request: Request): Promise<AuthResult> {
  // Extract token from header
  const token = extractBearerToken(request);

  if (!token) {
    if (DEBUG) {
      console.error('[auth] No Bearer token in Authorization header');
    }
    return { valid: false, error: 'Missing Authorization header' };
  }

  // Validate token format
  if (!isValidSdkKeyFormat(token)) {
    if (DEBUG) {
      console.error('[auth] Invalid SDK key format');
    }
    return { valid: false, error: AUTH_ERROR_MESSAGE };
  }

  // Hash the provided token
  const tokenHash = hashSdkKey(token);

  // Look up in database (findByHash already excludes revoked keys)
  const keyRecord = findByHash(tokenHash);

  if (!keyRecord) {
    if (DEBUG) {
      console.error('[auth] Key not found or revoked');
    }
    return { valid: false, error: AUTH_ERROR_MESSAGE };
  }

  // Verify hash match using constant-time comparison
  // (Even though findByHash already matched, we do a constant-time check
  // for extra safety against any potential timing side-channels)
  if (!constantTimeCompare(tokenHash, keyRecord.keyHash)) {
    if (DEBUG) {
      console.error('[auth] Hash mismatch (should not happen)');
    }
    return { valid: false, error: AUTH_ERROR_MESSAGE };
  }

  // Update last_used_at timestamp
  updateLastUsed(keyRecord.id);

  if (DEBUG) {
    console.error(`[auth] Authenticated with key ${keyRecord.id} (${keyRecord.name})`);
  }

  return {
    valid: true,
    keyId: keyRecord.id,
    keyName: keyRecord.name,
  };
}

/**
 * Handler function type for route handlers
 */
type HandlerFn = (request: Request, ...args: unknown[]) => Response | Promise<Response>;

/**
 * Create an unauthorized response
 *
 * @param message - Error message to include
 * @returns 401 JSON response
 */
export function unauthorizedResponse(message: string = AUTH_ERROR_MESSAGE): Response {
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message,
    }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Wrap a handler to require authentication
 *
 * Returns a new handler that validates the Bearer token before
 * calling the original handler. Returns 401 if auth fails.
 *
 * @param handler - Original request handler
 * @returns Wrapped handler that requires authentication
 *
 * @example
 * // Protect an endpoint
 * const protectedHandler = requireAuth(async (request) => {
 *   // This only runs if auth succeeds
 *   return new Response(JSON.stringify({ data: 'secret' }));
 * });
 *
 * // Use in routing
 * if (url.pathname === '/api/protected') {
 *   return protectedHandler(request);
 * }
 */
export function requireAuth(handler: HandlerFn): HandlerFn {
  return async (request: Request, ...args: unknown[]): Promise<Response> => {
    const authResult = await validateBearerToken(request);

    if (!authResult.valid) {
      return unauthorizedResponse(authResult.error);
    }

    // Call original handler
    return handler(request, ...args);
  };
}

/**
 * Check if authentication is required based on configuration
 *
 * Reads the REQUIRE_AUTH environment variable. Defaults to true in production.
 *
 * @returns true if authentication should be enforced
 */
export function isAuthRequired(): boolean {
  const requireAuth = process.env.REQUIRE_AUTH;

  // Explicitly set to 'false' disables auth
  if (requireAuth === 'false' || requireAuth === '0') {
    return false;
  }

  // Explicitly set to 'true' enables auth
  if (requireAuth === 'true' || requireAuth === '1') {
    return true;
  }

  // Default: enabled in production, disabled in development
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction;
}

/**
 * Conditionally apply auth middleware based on REQUIRE_AUTH setting
 *
 * If REQUIRE_AUTH is false, passes through to the handler without auth check.
 *
 * @param handler - Original request handler
 * @returns Handler with optional auth check
 */
export function optionalAuth(handler: HandlerFn): HandlerFn {
  if (!isAuthRequired()) {
    if (DEBUG) {
      console.error('[auth] Auth disabled (REQUIRE_AUTH=false or development mode)');
    }
    return handler;
  }

  return requireAuth(handler);
}
