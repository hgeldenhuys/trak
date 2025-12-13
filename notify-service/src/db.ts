/**
 * SQLite Database Layer for Event Storage (NOTIFY-012)
 *
 * Uses Bun's built-in SQLite driver for event persistence.
 * Events are stored keyed by (projectId, sessionId) for efficient lookup.
 *
 * Schema:
 * - events: All hook events with JSON payload
 * - Indexes on (projectId, sessionId) and (projectId, timestamp)
 */

import { Database } from 'bun:sqlite';
import path from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { EventPayload, StoredEvent } from './types';
import type { TransactionState } from './transaction-tracker';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

// Database file location
const DATA_DIR = process.env.NOTIFY_SERVICE_DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'events.db');

let db: Database | null = null;

/**
 * Initialize the database and create tables if needed
 */
export function initDatabase(): Database {
  if (db) return db;

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (DEBUG) {
    console.error(`[db] Initializing database at ${DB_FILE}`);
  }

  db = new Database(DB_FILE);

  // Enable WAL mode for better concurrent performance
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA synchronous = NORMAL');

  // Create events table
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL,
      project_name TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_name TEXT,
      event_type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      received_at TEXT NOT NULL,
      transcript_path TEXT,
      cwd TEXT,
      git TEXT,
      prompt_text TEXT,
      tool_name TEXT,
      tool_input TEXT,
      files_modified TEXT,
      tools_used TEXT,
      usage TEXT,
      model TEXT,
      stop_reason TEXT,
      notification_sent INTEGER DEFAULT 0,
      notification_id TEXT
    )
  `);

  // Create indexes for common queries
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_project_session
    ON events (project_id, session_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_project_timestamp
    ON events (project_id, timestamp DESC)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_events_project_name
    ON events (project_name)
  `);

  // Create sdk_keys table for API authentication (NOTIFY-013)
  db.run(`
    CREATE TABLE IF NOT EXISTS sdk_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      project_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      revoked_at TEXT
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_sdk_keys_hash
    ON sdk_keys (key_hash)
  `);

  // Create active_transactions table for transaction persistence (NOTIFY-002)
  db.run(`
    CREATE TABLE IF NOT EXISTS active_transactions (
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_name TEXT,
      project_name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      prompt_text TEXT,
      transcript_path TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      PRIMARY KEY (project_id, session_id)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_active_transactions_pending
    ON active_transactions (completed_at) WHERE completed_at IS NULL
  `);

  if (DEBUG) {
    console.error('[db] Database initialized successfully');
  }

  return db;
}

/**
 * Get the database instance (initializes if needed)
 */
export function getDatabase(): Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Insert an event into the database
 */
export function insertEvent(event: EventPayload): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT INTO events (
      project_id, project_name, session_id, session_name, event_type,
      timestamp, received_at, transcript_path, cwd, git,
      prompt_text, tool_name, tool_input, files_modified, tools_used,
      usage, model, stop_reason
    ) VALUES (
      $projectId, $projectName, $sessionId, $sessionName, $eventType,
      $timestamp, $receivedAt, $transcriptPath, $cwd, $git,
      $promptText, $toolName, $toolInput, $filesModified, $toolsUsed,
      $usage, $model, $stopReason
    )
  `);

  const result = stmt.run({
    $projectId: event.projectId,
    $projectName: event.projectName,
    $sessionId: event.sessionId,
    $sessionName: event.sessionName || null,
    $eventType: event.eventType,
    $timestamp: event.timestamp,
    $receivedAt: new Date().toISOString(),
    $transcriptPath: event.transcriptPath || null,
    $cwd: event.cwd || null,
    $git: event.git ? JSON.stringify(event.git) : null,
    $promptText: event.promptText || null,
    $toolName: event.toolName || null,
    $toolInput: event.toolInput ? JSON.stringify(event.toolInput) : null,
    $filesModified: event.filesModified ? JSON.stringify(event.filesModified) : null,
    $toolsUsed: event.toolsUsed ? JSON.stringify(event.toolsUsed) : null,
    $usage: event.usage ? JSON.stringify(event.usage) : null,
    $model: event.model || null,
    $stopReason: event.stopReason || null,
  });

  const eventId = Number(result.lastInsertRowid);

  if (DEBUG) {
    console.error(`[db] Inserted event ${eventId}: ${event.eventType} for ${event.projectName}/${event.sessionId.slice(0, 8)}`);
  }

  return eventId;
}

/**
 * Parse a database row into a StoredEvent
 */
function rowToStoredEvent(row: Record<string, unknown>): StoredEvent {
  return {
    id: row.id as number,
    eventType: row.event_type as StoredEvent['eventType'],
    sessionId: row.session_id as string,
    sessionName: row.session_name as string | undefined,
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    timestamp: row.timestamp as string,
    receivedAt: row.received_at as string,
    transcriptPath: row.transcript_path as string | undefined,
    cwd: row.cwd as string | undefined,
    git: row.git ? JSON.parse(row.git as string) : undefined,
    promptText: row.prompt_text as string | undefined,
    toolName: row.tool_name as string | undefined,
    toolInput: row.tool_input ? JSON.parse(row.tool_input as string) : undefined,
    filesModified: row.files_modified ? JSON.parse(row.files_modified as string) : undefined,
    toolsUsed: row.tools_used ? JSON.parse(row.tools_used as string) : undefined,
    usage: row.usage ? JSON.parse(row.usage as string) : undefined,
    model: row.model as string | undefined,
    stopReason: row.stop_reason as string | undefined,
    notificationSent: row.notification_sent === 1,
    notificationId: row.notification_id as string | undefined,
  };
}

/**
 * Get events by session ID
 */
export function getEventsBySession(projectId: string, sessionId: string): StoredEvent[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE project_id = ? AND session_id = ?
    ORDER BY timestamp ASC
  `);

  const rows = stmt.all(projectId, sessionId) as Record<string, unknown>[];
  return rows.map(rowToStoredEvent);
}

/**
 * Get recent events for a project
 */
export function getRecentEvents(projectId: string, limit: number = 50): StoredEvent[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE project_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(projectId, limit) as Record<string, unknown>[];
  // Reverse to get chronological order
  return rows.map(rowToStoredEvent).reverse();
}

/**
 * Get recent events for a project by project name (slug)
 */
export function getRecentEventsByName(projectName: string, limit: number = 50): StoredEvent[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE project_name = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const rows = stmt.all(projectName, limit) as Record<string, unknown>[];
  // Reverse to get chronological order
  return rows.map(rowToStoredEvent).reverse();
}

/**
 * Get events since a specific ID (for SSE streaming)
 */
export function getEventsSinceId(projectId: string, sinceId: number): StoredEvent[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE project_id = ? AND id > ?
    ORDER BY id ASC
  `);

  const rows = stmt.all(projectId, sinceId) as Record<string, unknown>[];
  return rows.map(rowToStoredEvent);
}

/**
 * Get events since a specific ID by project name
 */
export function getEventsSinceIdByName(projectName: string, sinceId: number): StoredEvent[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE project_name = ? AND id > ?
    ORDER BY id ASC
  `);

  const rows = stmt.all(projectName, sinceId) as Record<string, unknown>[];
  return rows.map(rowToStoredEvent);
}

/**
 * Get the most recent event ID for a project
 */
export function getLatestEventId(projectId: string): number {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT MAX(id) as max_id FROM events WHERE project_id = ?
  `);

  const row = stmt.get(projectId) as { max_id: number | null } | null;
  return row?.max_id || 0;
}

/**
 * Mark an event as having triggered a notification
 */
export function markNotificationSent(eventId: number, notificationId: string): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE events
    SET notification_sent = 1, notification_id = ?
    WHERE id = ?
  `);

  stmt.run(notificationId, eventId);

  if (DEBUG) {
    console.error(`[db] Marked event ${eventId} as notification sent: ${notificationId}`);
  }
}

/**
 * Get event by ID
 */
export function getEventById(eventId: number): StoredEvent | null {
  const db = getDatabase();

  const stmt = db.prepare('SELECT * FROM events WHERE id = ?');
  const row = stmt.get(eventId) as Record<string, unknown> | null;

  if (!row) return null;
  return rowToStoredEvent(row);
}

/**
 * Get all unique project names (for listing available projects)
 */
export function getProjectNames(): string[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT DISTINCT project_name FROM events ORDER BY project_name ASC
  `);

  const rows = stmt.all() as { project_name: string }[];
  return rows.map(r => r.project_name);
}

/**
 * Delete old events (cleanup)
 */
export function deleteOldEvents(olderThanDays: number = 7): number {
  const db = getDatabase();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const stmt = db.prepare(`
    DELETE FROM events WHERE timestamp < ?
  `);

  const result = stmt.run(cutoff.toISOString());
  const deleted = result.changes;

  if (DEBUG && deleted > 0) {
    console.error(`[db] Deleted ${deleted} events older than ${olderThanDays} days`);
  }

  return deleted;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    if (DEBUG) {
      console.error('[db] Database connection closed');
    }
  }
}

// ============================================================================
// Transaction Persistence Functions (NOTIFY-002)
// ============================================================================

/**
 * Save a transaction state to SQLite (INSERT OR REPLACE)
 * Used for persistence across server restarts.
 */
export function saveTransaction(state: TransactionState): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO active_transactions (
      project_id, session_id, session_name, project_name,
      start_time, prompt_text, transcript_path
    ) VALUES (
      $projectId, $sessionId, $sessionName, $projectName,
      $startTime, $promptText, $transcriptPath
    )
  `);

  stmt.run({
    $projectId: state.projectId,
    $sessionId: state.sessionId,
    $sessionName: state.sessionName || null,
    $projectName: state.projectName,
    $startTime: state.startTime.toISOString(),
    $promptText: state.promptText || null,
    $transcriptPath: state.transcriptPath || null,
  });

  if (DEBUG) {
    console.error(`[db] Saved transaction: ${state.projectName}/${state.sessionId.slice(0, 8)}`);
  }
}

/**
 * Get a transaction from SQLite by projectId and sessionId
 * Returns null if not found.
 */
export function getTransaction(projectId: string, sessionId: string): TransactionState | null {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM active_transactions
    WHERE project_id = ? AND session_id = ?
  `);

  const row = stmt.get(projectId, sessionId) as Record<string, unknown> | null;

  if (!row) return null;

  return {
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    sessionId: row.session_id as string,
    sessionName: row.session_name as string | undefined,
    transcriptPath: row.transcript_path as string | undefined,
    startTime: new Date(row.start_time as string),
    promptText: row.prompt_text as string | undefined,
    filesModified: [],  // Not persisted - only available in-memory
    toolsUsed: [],      // Not persisted - only available in-memory
    eventCount: 0,      // Not persisted - only available in-memory
  };
}

/**
 * Mark a transaction as completed in SQLite
 * Updates completed_at and duration_ms fields.
 */
export function markTransactionCompleted(projectId: string, sessionId: string, durationMs: number): void {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE active_transactions
    SET completed_at = ?, duration_ms = ?
    WHERE project_id = ? AND session_id = ?
  `);

  stmt.run(new Date().toISOString(), durationMs, projectId, sessionId);

  if (DEBUG) {
    console.error(`[db] Marked transaction completed: ${projectId.slice(0, 8)}/${sessionId.slice(0, 8)} (${durationMs}ms)`);
  }
}

/**
 * Get all pending (incomplete) transactions from SQLite
 * Returns transactions where completed_at IS NULL.
 */
export function getPendingTransactions(): TransactionState[] {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM active_transactions
    WHERE completed_at IS NULL
  `);

  const rows = stmt.all() as Record<string, unknown>[];

  return rows.map(row => ({
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    sessionId: row.session_id as string,
    sessionName: row.session_name as string | undefined,
    transcriptPath: row.transcript_path as string | undefined,
    startTime: new Date(row.start_time as string),
    promptText: row.prompt_text as string | undefined,
    filesModified: [],  // Not persisted
    toolsUsed: [],      // Not persisted
    eventCount: 0,      // Not persisted
  }));
}

/**
 * Clear stale transactions from SQLite
 * Deletes transactions where start_time is older than maxAgeMs.
 * Returns the number of deleted transactions.
 */
export function clearStaleTransactionsFromDb(maxAgeMs: number = 60 * 60 * 1000): number {
  const db = getDatabase();

  const cutoff = new Date(Date.now() - maxAgeMs);

  const stmt = db.prepare(`
    DELETE FROM active_transactions
    WHERE start_time < ?
  `);

  const result = stmt.run(cutoff.toISOString());
  const deleted = result.changes;

  if (DEBUG && deleted > 0) {
    console.error(`[db] Cleared ${deleted} stale transactions from SQLite`);
  }

  return deleted;
}
