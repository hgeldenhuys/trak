/**
 * SDK Key Generator (NOTIFY-013)
 *
 * Utilities for generating and hashing SDK keys.
 *
 * Key format: tk_test_{32 random alphanumeric characters}
 * Example: tk_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 *
 * Keys are generated using crypto.randomBytes() for cryptographic security.
 * Only the SHA-256 hash is stored server-side; the plain key is shown once.
 */

import { createHash, randomBytes } from 'crypto';
import type { GeneratedKey } from '../types';

/**
 * SDK key prefix for identification
 */
const KEY_PREFIX = 'tk_test_';

/**
 * Length of the random portion of the key (32 characters)
 */
const RANDOM_LENGTH = 32;

/**
 * Alphabet for key generation (alphanumeric, lowercase)
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a cryptographically secure random string
 *
 * @param length - Length of the random string
 * @returns Random alphanumeric string
 */
function generateRandomString(length: number): string {
  const bytes = randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    // Use modulo to map byte to alphabet index
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }

  return result;
}

/**
 * Hash an SDK key using SHA-256
 *
 * @param key - Plain-text SDK key
 * @returns SHA-256 hex digest
 */
export function hashSdkKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new SDK key
 *
 * Creates a new key in the format tk_test_{32_random_chars} and returns
 * both the plain-text key (for display to user) and the hash (for storage).
 *
 * @returns Object with plainKey (show once) and hash (store in database)
 *
 * @example
 * const { plainKey, hash } = generateSdkKey();
 * // plainKey: "tk_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
 * // hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
 */
export function generateSdkKey(): GeneratedKey {
  const randomPart = generateRandomString(RANDOM_LENGTH);
  const plainKey = `${KEY_PREFIX}${randomPart}`;
  const hash = hashSdkKey(plainKey);

  return { plainKey, hash };
}

/**
 * Validate SDK key format
 *
 * @param key - Key string to validate
 * @returns true if key matches expected format
 */
export function isValidSdkKeyFormat(key: string): boolean {
  if (!key.startsWith(KEY_PREFIX)) {
    return false;
  }

  const randomPart = key.slice(KEY_PREFIX.length);

  if (randomPart.length !== RANDOM_LENGTH) {
    return false;
  }

  // Check all characters are in the alphabet
  for (const char of randomPart) {
    if (!ALPHABET.includes(char)) {
      return false;
    }
  }

  return true;
}

/**
 * Extract the key ID prefix for logging (first 8 chars after prefix)
 *
 * @param key - SDK key
 * @returns Truncated key for safe logging
 */
export function truncateKeyForLogging(key: string): string {
  if (!key.startsWith(KEY_PREFIX)) {
    return 'invalid_key';
  }

  const randomPart = key.slice(KEY_PREFIX.length);
  return `${KEY_PREFIX}${randomPart.slice(0, 8)}...`;
}
