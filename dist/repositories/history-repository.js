/**
 * History Repository - Audit log for entity changes
 *
 * Provides methods for appending history entries and querying
 * the change history of entities.
 */
import { getDb, TABLES } from '../db';
/**
 * Transform database row to entity
 */
function rowToEntity(row) {
    return {
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        actor: row.actor,
        summary: row.summary,
        changes: JSON.parse(row.changes),
        previousState: row.previous_state ? JSON.parse(row.previous_state) : null,
        extensions: JSON.parse(row.extensions),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
/**
 * HistoryRepository - Manages audit log entries
 *
 * History entries are append-only and should not be updated or deleted.
 *
 * @example
 * ```typescript
 * const repo = new HistoryRepository();
 *
 * // Append a history entry
 * repo.append({
 *   entityType: EntityType.STORY,
 *   entityId: 'story-123',
 *   action: HistoryAction.UPDATED,
 *   actor: 'backend-dev',
 *   summary: 'Updated story status to in_progress',
 *   changes: { status: 'in_progress' },
 *   previousState: { status: 'draft' },
 * });
 *
 * // Query history
 * const history = repo.findByEntity(EntityType.STORY, 'story-123');
 * ```
 */
export class HistoryRepository {
    /**
     * Append a history entry
     *
     * @param input - History entry data
     * @returns The created history entry
     */
    append(input) {
        const db = getDb();
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const changes = input.changes ?? {};
        const previousState = input.previousState ?? null;
        const extensions = input.extensions ?? {};
        db.run(`INSERT INTO ${TABLES.HISTORY} (
        id, entity_type, entity_id, action, actor, summary, changes, previous_state, extensions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            input.entityType,
            input.entityId,
            input.action,
            input.actor,
            input.summary,
            JSON.stringify(changes),
            previousState ? JSON.stringify(previousState) : null,
            JSON.stringify(extensions),
            now,
            now,
        ]);
        const entity = this.findById(id);
        if (!entity) {
            throw new Error('Failed to append history entry');
        }
        return entity;
    }
    /**
     * Find history entry by ID
     *
     * @param id - History entry ID
     * @returns The history entry or null if not found
     */
    findById(id) {
        const db = getDb();
        const row = db
            .query(`SELECT * FROM ${TABLES.HISTORY} WHERE id = ?`)
            .get(id);
        return row ? rowToEntity(row) : null;
    }
    /**
     * Find all history entries for an entity
     *
     * @param entityType - Type of entity
     * @param entityId - Entity ID
     * @returns Array of history entries, ordered by creation time (newest first)
     */
    findByEntity(entityType, entityId) {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.HISTORY}
         WHERE entity_type = ? AND entity_id = ?
         ORDER BY created_at DESC`)
            .all(entityType, entityId);
        const entries = [];
        for (const row of rows) {
            entries.push(rowToEntity(row));
        }
        return entries;
    }
    /**
     * Find all history entries by actor
     *
     * @param actor - Actor identifier
     * @returns Array of history entries, ordered by creation time (newest first)
     */
    findByActor(actor) {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.HISTORY}
         WHERE actor = ?
         ORDER BY created_at DESC`)
            .all(actor);
        const entries = [];
        for (const row of rows) {
            entries.push(rowToEntity(row));
        }
        return entries;
    }
    /**
     * Find recent history entries across all entities
     *
     * @param limit - Maximum number of entries to return
     * @returns Array of history entries, ordered by creation time (newest first)
     */
    findRecent(limit) {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.HISTORY}
         ORDER BY created_at DESC
         LIMIT ?`)
            .all(limit);
        const entries = [];
        for (const row of rows) {
            entries.push(rowToEntity(row));
        }
        return entries;
    }
    /**
     * Find history entries by action type
     *
     * @param action - Action type
     * @param limit - Maximum number of entries (optional)
     * @returns Array of history entries
     */
    findByAction(action, limit) {
        const db = getDb();
        let query = `SELECT * FROM ${TABLES.HISTORY} WHERE action = ? ORDER BY created_at DESC`;
        const params = [action];
        if (limit !== undefined) {
            query += ' LIMIT ?';
            params.push(limit);
        }
        const rows = db.query(query).all(...params);
        const entries = [];
        for (const row of rows) {
            entries.push(rowToEntity(row));
        }
        return entries;
    }
    /**
     * Find history entries by entity type
     *
     * @param entityType - Type of entity
     * @param limit - Maximum number of entries (optional)
     * @returns Array of history entries
     */
    findByEntityType(entityType, limit) {
        const db = getDb();
        let query = `SELECT * FROM ${TABLES.HISTORY} WHERE entity_type = ? ORDER BY created_at DESC`;
        const params = [entityType];
        if (limit !== undefined) {
            query += ' LIMIT ?';
            params.push(limit);
        }
        const rows = db.query(query).all(...params);
        const entries = [];
        for (const row of rows) {
            entries.push(rowToEntity(row));
        }
        return entries;
    }
    /**
     * Find history entries within a time range
     *
     * @param startTime - ISO timestamp for range start
     * @param endTime - ISO timestamp for range end
     * @returns Array of history entries
     */
    findByTimeRange(startTime, endTime) {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.HISTORY}
         WHERE created_at >= ? AND created_at <= ?
         ORDER BY created_at DESC`)
            .all(startTime, endTime);
        const entries = [];
        for (const row of rows) {
            entries.push(rowToEntity(row));
        }
        return entries;
    }
    /**
     * Count history entries for an entity
     *
     * @param entityType - Type of entity
     * @param entityId - Entity ID
     * @returns Number of history entries
     */
    countByEntity(entityType, entityId) {
        const db = getDb();
        const result = db
            .query(`SELECT COUNT(*) as count FROM ${TABLES.HISTORY}
         WHERE entity_type = ? AND entity_id = ?`)
            .get(entityType, entityId);
        return result.count;
    }
    /**
     * Get summary statistics for an actor
     *
     * @param actor - Actor identifier
     * @returns Object with action counts
     */
    getActorStats(actor) {
        const db = getDb();
        const rows = db
            .query(`SELECT action, COUNT(*) as count
         FROM ${TABLES.HISTORY}
         WHERE actor = ?
         GROUP BY action`)
            .all(actor);
        const stats = {};
        for (const row of rows) {
            stats[row.action] = row.count;
        }
        return stats;
    }
}
/**
 * Singleton instance
 */
export const historyRepository = new HistoryRepository();
