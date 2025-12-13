/**
 * Auth Module Exports (NOTIFY-013)
 *
 * Barrel export for clean imports throughout the application.
 *
 * @example
 * import { generateSdkKey, validateBearerToken, requireAuth } from './auth';
 */

// Key generation utilities
export {
  generateSdkKey,
  hashSdkKey,
  isValidSdkKeyFormat,
  truncateKeyForLogging,
} from './key-generator';

// SDK keys repository
export {
  createKey,
  findByHash,
  updateLastUsed,
  revokeKey,
  listKeys,
  listActiveKeys,
  getKeyById,
  deleteKey,
} from './sdk-keys';

// Auth middleware
export {
  validateBearerToken,
  requireAuth,
  optionalAuth,
  isAuthRequired,
  unauthorizedResponse,
} from './middleware';

// Re-export types for convenience
export type { AuthResult, SDKKeyRecord, GeneratedKey } from '../types';
