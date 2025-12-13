/**
 * Session Repository - Tracks active work sessions
 *
 * Provides methods for managing sessions with event emission
 * for reactive updates.
 */
import { getDb, TABLES, COLUMN_MAPPINGS } from '../db';
import { eventBus, createEventTimestamp } from '../events';
/**
 * Transform database row to entity
 */
function rowToEntity(row) {
    return {
        id: row.id,
        actor: row.actor,
        activeStoryId: row.active_story_id,
        activeTaskId: row.active_task_id,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        phase: row.phase,
        compactionCount: row.compaction_count,
        extensions: JSON.parse(row.extensions),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
/**
 * Get changed fields between two entities
 */
function getChangedFields(previous, current) {
    const fields = [];
    const keys = Object.keys(current);
    for (const key of keys) {
        if (key === 'extensions') {
            if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
                fields.push(key);
            }
        }
        else if (previous[key] !== current[key]) {
            fields.push(key);
        }
    }
    return fields;
}
/**
 * SessionRepository - Manages session persistence
 *
 * @example
 * ```typescript
 * const repo = new SessionRepository();
 *
 * // Start a new session
 * const session = repo.start({
 *   actor: 'backend-dev',
 *   activeStoryId: 'BOARD-001',
 * });
 *
 * // Find active session
 * const active = repo.findActive();
 *
 * // End session
 * repo.end(session.id);
 * ```
 */
export class SessionRepository {
    /**
     * Start a new session
     *
     * @param input - Session data
     * @returns The created session
     * @emits session:started
     */
    start(input) {
        const db = getDb();
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const extensions = input.extensions ?? {};
        db.run(`INSERT INTO ${TABLES.SESSIONS} (
        id, actor, active_story_id, active_task_id, started_at, phase, compaction_count, extensions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            input.actor,
            input.activeStoryId ?? null,
            input.activeTaskId ?? null,
            now,
            input.phase ?? null,
            0,
            JSON.stringify(extensions),
            now,
            now,
        ]);
        const entity = this.findById(id);
        if (!entity) {
            throw new Error('Failed to start session');
        }
        // Emit event
        eventBus.emit('session:started', {
            entityId: id,
            entity,
            actor: input.actor,
            timestamp: createEventTimestamp(),
        });
        return entity;
    }
    /**
     * Find session by ID
     *
     * @param id - Session ID
     * @returns The session or null if not found
     */
    findById(id) {
        const db = getDb();
        const row = db
            .query(`SELECT * FROM ${TABLES.SESSIONS} WHERE id = ?`)
            .get(id);
        return row ? rowToEntity(row) : null;
    }
    /**
     * Find the currently active session
     *
     * A session is active if it has no endedAt timestamp.
     * Returns the most recently started active session if multiple exist.
     *
     * @returns The active session or null if none
     */
    findActive() {
        const db = getDb();
        const row = db
            .query(`SELECT * FROM ${TABLES.SESSIONS}
         WHERE ended_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1`)
            .get();
        return row ? rowToEntity(row) : null;
    }
    /**
     * Find all active sessions
     *
     * @returns Array of active sessions
     */
    findAllActive() {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.SESSIONS}
         WHERE ended_at IS NULL
         ORDER BY started_at DESC`)
            .all();
        const sessions = [];
        for (const row of rows) {
            sessions.push(rowToEntity(row));
        }
        return sessions;
    }
    /**
     * Find sessions by actor
     *
     * @param actor - Actor identifier
     * @returns Array of sessions
     */
    findByActor(actor) {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.SESSIONS}
         WHERE actor = ?
         ORDER BY started_at DESC`)
            .all(actor);
        const sessions = [];
        for (const row of rows) {
            sessions.push(rowToEntity(row));
        }
        return sessions;
    }
    /**
     * Update a session
     *
     * @param id - Session ID
     * @param input - Fields to update
     * @returns The updated session
     * @throws Error if session not found
     * @emits session:updated
     */
    update(id, input) {
        const db = getDb();
        const previous = this.findById(id);
        if (!previous) {
            throw new Error(`Session not found: ${id}`);
        }
        const now = new Date().toISOString();
        const updates = [];
        const values = [];
        if (input.activeStoryId !== undefined) {
            updates.push(`${COLUMN_MAPPINGS.sessions.activeStoryId} = ?`);
            values.push(input.activeStoryId);
        }
        if (input.activeTaskId !== undefined) {
            updates.push(`${COLUMN_MAPPINGS.sessions.activeTaskId} = ?`);
            values.push(input.activeTaskId);
        }
        if (input.phase !== undefined) {
            updates.push(`${COLUMN_MAPPINGS.sessions.phase} = ?`);
            values.push(input.phase);
        }
        if (input.compactionCount !== undefined) {
            updates.push(`${COLUMN_MAPPINGS.sessions.compactionCount} = ?`);
            values.push(input.compactionCount);
        }
        if (input.endedAt !== undefined) {
            updates.push(`${COLUMN_MAPPINGS.sessions.endedAt} = ?`);
            values.push(input.endedAt);
        }
        if (input.extensions !== undefined) {
            updates.push(`${COLUMN_MAPPINGS.sessions.extensions} = ?`);
            values.push(JSON.stringify(input.extensions));
        }
        if (updates.length === 0) {
            return previous;
        }
        updates.push(`${COLUMN_MAPPINGS.sessions.updatedAt} = ?`);
        values.push(now);
        values.push(id);
        const stmt = db.prepare(`UPDATE ${TABLES.SESSIONS} SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        const entity = this.findById(id);
        if (!entity) {
            throw new Error('Failed to update session');
        }
        // Emit event
        eventBus.emit('session:updated', {
            entityId: id,
            entity,
            previousState: previous,
            changedFields: getChangedFields(previous, entity),
            timestamp: createEventTimestamp(),
        });
        return entity;
    }
    /**
     * End a session
     *
     * Sets the endedAt timestamp and emits session:ended event.
     *
     * @param id - Session ID
     * @returns The ended session
     * @throws Error if session not found
     * @emits session:ended
     */
    end(id) {
        const db = getDb();
        const previous = this.findById(id);
        if (!previous) {
            throw new Error(`Session not found: ${id}`);
        }
        const now = new Date().toISOString();
        db.run(`UPDATE ${TABLES.SESSIONS} SET
        ended_at = ?,
        updated_at = ?
      WHERE id = ?`, [now, now, id]);
        const entity = this.findById(id);
        if (!entity) {
            throw new Error('Failed to end session');
        }
        // Calculate duration
        const startTime = new Date(entity.startedAt).getTime();
        const endTime = new Date(now).getTime();
        const durationMs = endTime - startTime;
        // Emit event
        eventBus.emit('session:ended', {
            entityId: id,
            entity,
            durationMs,
            timestamp: createEventTimestamp(),
        });
        return entity;
    }
    /**
     * Increment the compaction count for a session
     *
     * @param id - Session ID
     * @returns The updated session
     * @throws Error if session not found
     * @emits session:updated
     */
    incrementCompactionCount(id) {
        const db = getDb();
        const previous = this.findById(id);
        if (!previous) {
            throw new Error(`Session not found: ${id}`);
        }
        const now = new Date().toISOString();
        const newCount = previous.compactionCount + 1;
        db.run(`UPDATE ${TABLES.SESSIONS} SET
        compaction_count = ?,
        updated_at = ?
      WHERE id = ?`, [newCount, now, id]);
        const entity = this.findById(id);
        if (!entity) {
            throw new Error('Failed to increment compaction count');
        }
        // Emit event
        eventBus.emit('session:updated', {
            entityId: id,
            entity,
            previousState: previous,
            changedFields: ['compactionCount', 'updatedAt'],
            timestamp: createEventTimestamp(),
        });
        return entity;
    }
    /**
     * Find recent sessions
     *
     * @param limit - Maximum number of sessions to return
     * @returns Array of sessions, ordered by start time (newest first)
     */
    findRecent(limit) {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.SESSIONS}
         ORDER BY started_at DESC
         LIMIT ?`)
            .all(limit);
        const sessions = [];
        for (const row of rows) {
            sessions.push(rowToEntity(row));
        }
        return sessions;
    }
    /**
     * Get session duration in milliseconds
     *
     * For active sessions, calculates from start to now.
     * For ended sessions, calculates from start to end.
     *
     * @param id - Session ID
     * @returns Duration in milliseconds
     * @throws Error if session not found
     */
    getDuration(id) {
        const session = this.findById(id);
        if (!session) {
            throw new Error(`Session not found: ${id}`);
        }
        const startTime = new Date(session.startedAt).getTime();
        const endTime = session.endedAt
            ? new Date(session.endedAt).getTime()
            : Date.now();
        return endTime - startTime;
    }
    /**
     * End all active sessions
     *
     * Useful for cleanup on application shutdown.
     *
     * @returns Array of ended sessions
     */
    endAllActive() {
        const activeSessions = this.findAllActive();
        const endedSessions = [];
        for (const session of activeSessions) {
            const ended = this.end(session.id);
            endedSessions.push(ended);
        }
        return endedSessions;
    }
}
/**
 * Singleton instance
 */
export const sessionRepository = new SessionRepository();
