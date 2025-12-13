/**
 * AcceptanceCriteria Repository - CRUD operations for acceptance criteria
 *
 * Provides methods for creating, reading, updating, verifying, and deleting
 * acceptance criteria with event emission for reactive updates.
 */
import { getDb, TABLES, COLUMN_MAPPINGS } from '../db';
import { eventBus, createEventTimestamp } from '../events';
/**
 * Transform database row to entity
 */
function rowToEntity(row) {
    return {
        id: row.id,
        storyId: row.story_id,
        code: row.code,
        description: row.description,
        status: row.status,
        verificationNotes: row.verification_notes,
        verifiedAt: row.verified_at,
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
 * AcceptanceCriteriaRepository - Manages acceptance criteria persistence
 *
 * @example
 * ```typescript
 * const repo = new AcceptanceCriteriaRepository();
 *
 * // Create new acceptance criteria
 * const ac = repo.create({
 *   storyId: 'story-123',
 *   code: 'AC-001',
 *   description: 'User can log in with valid credentials',
 * });
 *
 * // Find by story
 * const criteria = repo.findByStoryId('story-123');
 *
 * // Verify criteria
 * repo.verify(ac.id, 'Tested manually - works as expected');
 * ```
 */
export class AcceptanceCriteriaRepository {
    /**
     * Create a new acceptance criteria
     *
     * @param input - Acceptance criteria data
     * @returns The created acceptance criteria
     * @emits ac:created
     */
    create(input) {
        const db = getDb();
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const extensions = input.extensions ?? {};
        const status = input.status ?? 'pending';
        db.run(`INSERT INTO ${TABLES.ACCEPTANCE_CRITERIA} (
        id, story_id, code, description, status, extensions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            input.storyId,
            input.code,
            input.description,
            status,
            JSON.stringify(extensions),
            now,
            now,
        ]);
        const entity = this.findById(id);
        if (!entity) {
            throw new Error('Failed to create acceptance criteria');
        }
        // Emit event
        eventBus.emit('ac:created', {
            entityId: id,
            entity,
            timestamp: createEventTimestamp(),
        });
        return entity;
    }
    /**
     * Find acceptance criteria by ID
     *
     * @param id - Acceptance criteria ID
     * @returns The acceptance criteria or null if not found
     */
    findById(id) {
        const db = getDb();
        const row = db
            .query(`SELECT * FROM ${TABLES.ACCEPTANCE_CRITERIA} WHERE id = ?`)
            .get(id);
        return row ? rowToEntity(row) : null;
    }
    /**
     * Find all acceptance criteria for a story
     *
     * @param storyId - Story ID
     * @returns Array of acceptance criteria
     */
    findByStoryId(storyId) {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.ACCEPTANCE_CRITERIA} WHERE story_id = ? ORDER BY code ASC`)
            .all(storyId);
        const entities = [];
        for (const row of rows) {
            entities.push(rowToEntity(row));
        }
        return entities;
    }
    /**
     * Update acceptance criteria
     *
     * @param id - Acceptance criteria ID
     * @param input - Fields to update
     * @returns The updated acceptance criteria
     * @throws Error if acceptance criteria not found
     * @emits ac:updated
     */
    update(id, input) {
        const db = getDb();
        const previous = this.findById(id);
        if (!previous) {
            throw new Error(`AcceptanceCriteria not found: ${id}`);
        }
        const now = new Date().toISOString();
        const updates = [];
        const values = [];
        if (input.description !== undefined) {
            updates.push(`${COLUMN_MAPPINGS.acceptanceCriteria.description} = ?`);
            values.push(input.description);
        }
        if (input.status !== undefined) {
            updates.push(`${COLUMN_MAPPINGS.acceptanceCriteria.status} = ?`);
            values.push(input.status);
        }
        if (input.verificationNotes !== undefined) {
            updates.push(`${COLUMN_MAPPINGS.acceptanceCriteria.verificationNotes} = ?`);
            values.push(input.verificationNotes);
        }
        if (input.extensions !== undefined) {
            updates.push(`${COLUMN_MAPPINGS.acceptanceCriteria.extensions} = ?`);
            values.push(JSON.stringify(input.extensions));
        }
        if (updates.length === 0) {
            return previous;
        }
        updates.push(`${COLUMN_MAPPINGS.acceptanceCriteria.updatedAt} = ?`);
        values.push(now);
        values.push(id);
        const stmt = db.prepare(`UPDATE ${TABLES.ACCEPTANCE_CRITERIA} SET ${updates.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        const entity = this.findById(id);
        if (!entity) {
            throw new Error('Failed to update acceptance criteria');
        }
        // Emit event
        eventBus.emit('ac:updated', {
            entityId: id,
            entity,
            previousState: previous,
            changedFields: getChangedFields(previous, entity),
            timestamp: createEventTimestamp(),
        });
        return entity;
    }
    /**
     * Verify acceptance criteria
     *
     * Sets status to 'verified', records verification notes and timestamp.
     *
     * @param id - Acceptance criteria ID
     * @param notes - Verification notes
     * @returns The verified acceptance criteria
     * @throws Error if acceptance criteria not found
     * @emits ac:verified
     */
    verify(id, notes) {
        const db = getDb();
        const previous = this.findById(id);
        if (!previous) {
            throw new Error(`AcceptanceCriteria not found: ${id}`);
        }
        const now = new Date().toISOString();
        db.run(`UPDATE ${TABLES.ACCEPTANCE_CRITERIA} SET
        status = ?,
        verification_notes = ?,
        verified_at = ?,
        updated_at = ?
      WHERE id = ?`, ['verified', notes, now, now, id]);
        const entity = this.findById(id);
        if (!entity) {
            throw new Error('Failed to verify acceptance criteria');
        }
        // Emit event
        eventBus.emit('ac:verified', {
            entityId: id,
            entity,
            verificationNotes: notes,
            verificationResult: 'verified',
            timestamp: createEventTimestamp(),
        });
        return entity;
    }
    /**
     * Mark acceptance criteria as failed
     *
     * Sets status to 'failed', records verification notes.
     *
     * @param id - Acceptance criteria ID
     * @param notes - Failure notes
     * @returns The failed acceptance criteria
     * @throws Error if acceptance criteria not found
     * @emits ac:verified
     */
    fail(id, notes) {
        const db = getDb();
        const previous = this.findById(id);
        if (!previous) {
            throw new Error(`AcceptanceCriteria not found: ${id}`);
        }
        const now = new Date().toISOString();
        db.run(`UPDATE ${TABLES.ACCEPTANCE_CRITERIA} SET
        status = ?,
        verification_notes = ?,
        verified_at = ?,
        updated_at = ?
      WHERE id = ?`, ['failed', notes, now, now, id]);
        const entity = this.findById(id);
        if (!entity) {
            throw new Error('Failed to update acceptance criteria');
        }
        // Emit event
        eventBus.emit('ac:verified', {
            entityId: id,
            entity,
            verificationNotes: notes,
            verificationResult: 'failed',
            timestamp: createEventTimestamp(),
        });
        return entity;
    }
    /**
     * Delete acceptance criteria
     *
     * @param id - Acceptance criteria ID
     * @throws Error if acceptance criteria not found
     * @emits ac:deleted
     */
    delete(id) {
        const db = getDb();
        const entity = this.findById(id);
        if (!entity) {
            throw new Error(`AcceptanceCriteria not found: ${id}`);
        }
        db.run(`DELETE FROM ${TABLES.ACCEPTANCE_CRITERIA} WHERE id = ?`, [id]);
        // Emit event
        eventBus.emit('ac:deleted', {
            entityId: id,
            entity,
            timestamp: createEventTimestamp(),
        });
    }
    /**
     * Count acceptance criteria by status for a story
     *
     * @param storyId - Story ID
     * @returns Object with counts by status
     */
    countByStatus(storyId) {
        const db = getDb();
        const rows = db
            .query(`SELECT status, COUNT(*) as count
         FROM ${TABLES.ACCEPTANCE_CRITERIA}
         WHERE story_id = ?
         GROUP BY status`)
            .all(storyId);
        const counts = { pending: 0, verified: 0, failed: 0 };
        for (const row of rows) {
            if (row.status in counts) {
                counts[row.status] = row.count;
            }
        }
        return counts;
    }
    /**
     * Check if all acceptance criteria for a story are verified
     *
     * @param storyId - Story ID
     * @returns True if all criteria are verified
     */
    allVerified(storyId) {
        const counts = this.countByStatus(storyId);
        return counts.pending === 0 && counts.failed === 0 && counts.verified > 0;
    }
}
/**
 * Singleton instance
 */
export const acceptanceCriteriaRepository = new AcceptanceCriteriaRepository();
