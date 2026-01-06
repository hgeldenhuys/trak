/**
 * Activity Log Repository
 *
 * Provides database operations for ActivityLog entities using bun:sqlite.
 * All mutations emit events via the event bus for reactive updates.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from '../db';
import { TABLES } from '../db/schema';
import { eventBus, createEventTimestamp } from '../events';
import type {
  ActivityLog,
  ActivityLogLevel,
  CreateActivityLogInput,
} from '../types';

/**
 * Database row type for activity_logs table (snake_case)
 */
interface ActivityLogRow {
  id: string;
  source: string;
  level: string;
  message: string;
  timestamp: string;
  story_id: string | null;
  metadata: string;
  created_at: string;
}

/**
 * Generate a UUID for new entities
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get current ISO timestamp
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Convert database row (snake_case) to ActivityLog entity (camelCase)
 */
function toActivityLog(row: ActivityLogRow): ActivityLog {
  return {
    id: row.id,
    source: row.source,
    level: row.level as ActivityLogLevel,
    message: row.message,
    timestamp: row.timestamp,
    storyId: row.story_id,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
  };
}

/**
 * Activity Log Repository Class
 */
export class ActivityLogRepository {
  private readonly tableName = TABLES.ACTIVITY_LOGS;
  private dbOverride: Database | null = null;

  constructor(db?: Database) {
    this.dbOverride = db ?? null;
  }

  private get db(): Database {
    return this.dbOverride ?? getDb();
  }

  /**
   * Create a new activity log entry
   */
  create(input: CreateActivityLogInput): ActivityLog {
    const id = generateId();
    const now = getCurrentTimestamp();
    const metadata = JSON.stringify(input.metadata ?? {});
    const level = input.level ?? 'info';
    const timestamp = now; // Use current time as the event timestamp

    this.db.run(`
      INSERT INTO ${this.tableName} (id, source, level, message, timestamp, story_id, metadata, created_at)
      VALUES ($id, $source, $level, $message, $timestamp, $storyId, $metadata, $createdAt)
    `, {
      $id: id,
      $source: input.source,
      $level: level,
      $message: input.message,
      $timestamp: timestamp,
      $storyId: input.storyId ?? null,
      $metadata: metadata,
      $createdAt: now,
    });

    const log: ActivityLog = {
      id,
      source: input.source,
      level,
      message: input.message,
      timestamp,
      storyId: input.storyId ?? null,
      metadata: input.metadata ?? {},
      createdAt: now,
    };

    // Emit data event for TUI reactivity
    eventBus.emit('data', {
      table: this.tableName,
      type: 'created',
      id: log.id,
      timestamp: createEventTimestamp(),
    });

    return log;
  }

  /**
   * Find an activity log by ID
   */
  findById(id: string): ActivityLog | null {
    const row = this.db.query(`SELECT * FROM ${this.tableName} WHERE id = $id`).get({ $id: id }) as ActivityLogRow | null;
    return row ? toActivityLog(row) : null;
  }

  /**
   * Find recent activity logs, optionally filtered by story
   * Returns logs in reverse chronological order (newest first)
   */
  findRecent(limit: number = 10, storyId?: string): ActivityLog[] {
    let query: string;
    let params: Record<string, unknown>;

    if (storyId) {
      query = `
        SELECT * FROM ${this.tableName}
        WHERE story_id = $storyId
        ORDER BY timestamp DESC
        LIMIT $limit
      `;
      params = { $storyId: storyId, $limit: limit };
    } else {
      query = `
        SELECT * FROM ${this.tableName}
        ORDER BY timestamp DESC
        LIMIT $limit
      `;
      params = { $limit: limit };
    }

    const rows = this.db.query(query).all(params) as ActivityLogRow[];

    const result: ActivityLog[] = [];
    for (const row of rows) {
      result.push(toActivityLog(row));
    }
    return result;
  }

  /**
   * Find activity logs by source
   */
  findBySource(source: string, limit: number = 50): ActivityLog[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE source = $source
      ORDER BY timestamp DESC
      LIMIT $limit
    `).all({ $source: source, $limit: limit }) as ActivityLogRow[];

    const result: ActivityLog[] = [];
    for (const row of rows) {
      result.push(toActivityLog(row));
    }
    return result;
  }

  /**
   * Delete activity logs older than the specified date
   * Returns the number of deleted entries
   */
  cleanup(olderThan: Date): number {
    const cutoffTimestamp = olderThan.toISOString();

    // First count how many will be deleted
    const countResult = this.db.query(`
      SELECT COUNT(*) as count FROM ${this.tableName}
      WHERE timestamp < $cutoff
    `).get({ $cutoff: cutoffTimestamp }) as { count: number };

    const count = countResult?.count ?? 0;

    if (count > 0) {
      this.db.run(`
        DELETE FROM ${this.tableName}
        WHERE timestamp < $cutoff
      `, { $cutoff: cutoffTimestamp });

      // Emit cleanup event
      eventBus.emit('data', {
        table: this.tableName,
        type: 'deleted',
        id: 'cleanup',
        timestamp: createEventTimestamp(),
      });
    }

    return count;
  }

  /**
   * Delete all activity logs
   * Returns the number of deleted entries
   */
  clearAll(): number {
    const countResult = this.db.query(`
      SELECT COUNT(*) as count FROM ${this.tableName}
    `).get() as { count: number };

    const count = countResult?.count ?? 0;

    if (count > 0) {
      this.db.run(`DELETE FROM ${this.tableName}`);

      eventBus.emit('data', {
        table: this.tableName,
        type: 'deleted',
        id: 'clear-all',
        timestamp: createEventTimestamp(),
      });
    }

    return count;
  }

  /**
   * Count all activity logs
   */
  count(): number {
    const result = this.db.query(`
      SELECT COUNT(*) as count FROM ${this.tableName}
    `).get() as { count: number };

    return result?.count ?? 0;
  }
}

/**
 * Singleton instance
 */
export const activityLogRepository = new ActivityLogRepository();
