/**
 * SDK Keys Repository (NOTIFY-013)
 *
 * Repository layer for SDK key management. Provides CRUD operations
 * for API authentication keys stored in SQLite.
 *
 * Keys are stored as SHA-256 hashes - the plain-text key is only
 * shown once during creation and never stored.
 */

import { getDatabase } from '../db';
import type { SDKKeyRecord } from '../types';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

/**
 * Database row structure for sdk_keys table
 */
interface SDKKeyRow {
  id: number;
  key_hash: string;
  name: string;
  project_id: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/**
 * Convert database row to SDKKeyRecord
 */
function rowToSDKKeyRecord(row: SDKKeyRow): SDKKeyRecord {
  return {
    id: row.id,
    keyHash: row.key_hash,
    name: row.name,
    projectId: row.project_id,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Create a new SDK key record
 *
 * @param hash - SHA-256 hash of the plain-text key
 * @param name - Human-readable name for the key
 * @param projectId - Optional project ID to scope the key
 * @returns The created SDK key record
 */
export function createKey(hash: string, name: string, projectId?: string): SDKKeyRecord {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO sdk_keys (key_hash, name, project_id, created_at)
    VALUES ($keyHash, $name, $projectId, $createdAt)
  `);

  const createdAt = new Date().toISOString();

  const result = stmt.run({
    $keyHash: hash,
    $name: name,
    $projectId: projectId || null,
    $createdAt: createdAt,
  });

  const id = Number(result.lastInsertRowid);

  if (DEBUG) {
    console.error(`[sdk-keys] Created key ${id}: ${name}${projectId ? ` (project: ${projectId})` : ''}`);
  }

  return {
    id,
    keyHash: hash,
    name,
    projectId: projectId || null,
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
  };
}

/**
 * Find an SDK key by its hash
 *
 * @param hash - SHA-256 hash of the key to find
 * @returns The SDK key record if found and not revoked, null otherwise
 */
export function findByHash(hash: string): SDKKeyRecord | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM sdk_keys
    WHERE key_hash = ? AND revoked_at IS NULL
  `);

  const row = stmt.get(hash) as SDKKeyRow | null;

  if (!row) {
    if (DEBUG) {
      console.error('[sdk-keys] Key not found or revoked');
    }
    return null;
  }

  return rowToSDKKeyRecord(row);
}

/**
 * Update the last_used_at timestamp for a key
 *
 * @param id - The SDK key ID
 */
export function updateLastUsed(id: number): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE sdk_keys
    SET last_used_at = ?
    WHERE id = ?
  `);

  stmt.run(new Date().toISOString(), id);

  if (DEBUG) {
    console.error(`[sdk-keys] Updated last_used_at for key ${id}`);
  }
}

/**
 * Revoke an SDK key (soft delete)
 *
 * @param id - The SDK key ID to revoke
 */
export function revokeKey(id: number): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE sdk_keys
    SET revoked_at = ?
    WHERE id = ?
  `);

  stmt.run(new Date().toISOString(), id);

  if (DEBUG) {
    console.error(`[sdk-keys] Revoked key ${id}`);
  }
}

/**
 * List all SDK keys (including revoked)
 *
 * @returns Array of all SDK key records
 */
export function listKeys(): SDKKeyRecord[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM sdk_keys
    ORDER BY created_at DESC
  `);

  const rows = stmt.all() as SDKKeyRow[];
  return rows.map(rowToSDKKeyRecord);
}

/**
 * List only active (non-revoked) SDK keys
 *
 * @returns Array of active SDK key records
 */
export function listActiveKeys(): SDKKeyRecord[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM sdk_keys
    WHERE revoked_at IS NULL
    ORDER BY created_at DESC
  `);

  const rows = stmt.all() as SDKKeyRow[];
  return rows.map(rowToSDKKeyRecord);
}

/**
 * Get an SDK key by ID
 *
 * @param id - The SDK key ID
 * @returns The SDK key record if found, null otherwise
 */
export function getKeyById(id: number): SDKKeyRecord | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM sdk_keys WHERE id = ?');
  const row = stmt.get(id) as SDKKeyRow | null;

  if (!row) return null;
  return rowToSDKKeyRecord(row);
}

/**
 * Delete an SDK key permanently (use revokeKey for soft delete)
 *
 * @param id - The SDK key ID to delete
 * @returns true if a key was deleted, false if not found
 */
export function deleteKey(id: number): boolean {
  const db = getDatabase();

  const stmt = db.prepare('DELETE FROM sdk_keys WHERE id = ?');
  const result = stmt.run(id);

  if (DEBUG) {
    console.error(`[sdk-keys] Deleted key ${id}: ${result.changes > 0 ? 'success' : 'not found'}`);
  }

  return result.changes > 0;
}
