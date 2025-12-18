/**
 * SDK Key Generator (NOTIFY-013)
 *
 * Utilities for generating and hashing SDK keys.
 *
 * Key format: trak_{32 random alphanumeric characters}
 * Example: trak_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 *
 * Keys are generated using crypto.randomBytes() for cryptographic security.
 * Only the SHA-256 hash is stored server-side; the plain key is shown once.
 */

import { createHash, randomBytes } from 'crypto';
import type { GeneratedKey } from '../types';

/**
 * SDK key prefix for identification
 */
const KEY_PREFIX = 'trak_';

/**
 * Length of the random portion of the key (32 characters)
 */
const RANDOM_LENGTH = 32;

/**
 * Alphabet for key generation (alphanumeric, lowercase)
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a cryptographically secure random string using rejection sampling
 *
 * Uses rejection sampling to avoid modulo bias. For alphabet size 36,
 * we accept bytes 0-251 (252 = 36 * 7) and reject 252-255.
 *
 * @param length - Length of the random string
 * @returns Random alphanumeric string
 */
function generateRandomString(length: number): string {
  const alphabetSize = ALPHABET.length; // 36
  // Find largest multiple of alphabetSize <= 256 to avoid bias
  const maxValidByte = Math.floor(256 / alphabetSize) * alphabetSize - 1; // 251

  let result = '';

  while (result.length < length) {
    // Generate more bytes than needed to handle rejections
    const bytes = randomBytes(length - result.length + 10);

    for (let i = 0; i < bytes.length && result.length < length; i++) {
      // Rejection sampling: only accept bytes that don't create bias
      if (bytes[i] <= maxValidByte) {
        result += ALPHABET[bytes[i] % alphabetSize];
      }
    }
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
 * Creates a new key in the format sk_live_{32_random_chars} and returns
 * both the plain-text key (for display to user) and the hash (for storage).
 *
 * @returns Object with plainKey (show once) and hash (store in database)
 *
 * @example
 * const { plainKey, hash } = generateSdkKey();
 * // plainKey: "trak_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
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
