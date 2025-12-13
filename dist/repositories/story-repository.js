/**
 * Story Repository for Board CLI/TUI System
 *
 * Provides CRUD operations for Story entities with event emission.
 * Story codes are auto-generated using the pattern: {FEATURE_CODE}-{NNN}
 */
import { getDb, TABLES } from '../db';
import { eventBus, createEventTimestamp } from '../events';
import { Priority } from '../types';
/**
 * Generate a UUID v4
 */
function generateId() {
    return crypto.randomUUID();
}
/**
 * Generate a story code in the format {FEATURE_CODE}-{NNN}
 * @param featureCode - The feature code (e.g., 'NOTIFY')
 * @param counter - The story counter number
 * @returns Story code (e.g., 'NOTIFY-001')
 */
function generateStoryCode(featureCode, counter) {
    return `${featureCode}-${String(counter).padStart(3, '0')}`;
}
/**
 * Convert a database row to a Story entity
 * @param row - The raw database row
 * @returns Story entity with proper types
 */
function toStory(row) {
    return {
        id: row.id,
        code: row.code,
        featureId: row.feature_id,
        title: row.title,
        description: row.description,
        why: row.why,
        status: row.status,
        priority: row.priority,
        assignedTo: row.assigned_to,
        extensions: JSON.parse(row.extensions || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
/**
 * Story Repository - Manages Story entity persistence and events
 */
export class StoryRepository {
    /**
     * Create a new story
     * Auto-generates the story code from the parent feature
     * @param input - Story creation input
     * @returns The created story
     * @throws Error if feature not found
     */
    create(input) {
        const db = getDb();
        const now = new Date().toISOString();
        const id = generateId();
        // Get feature and increment story counter in a transaction
        const feature = db
            .query(`SELECT * FROM ${TABLES.FEATURES} WHERE id = ?`)
            .get(input.featureId);
        if (!feature) {
            throw new Error(`Feature not found: ${input.featureId}`);
        }
        const newCounter = feature.story_counter + 1;
        const code = generateStoryCode(feature.code, newCounter);
        // Update feature counter
        db.run(`UPDATE ${TABLES.FEATURES} SET story_counter = ?, updated_at = ? WHERE id = ?`, [newCounter, now, input.featureId]);
        // Insert the story
        db.run(`INSERT INTO ${TABLES.STORIES} (
        id, code, feature_id, title, description, why,
        status, priority, assigned_to, extensions,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            id,
            code,
            input.featureId,
            input.title,
            input.description,
            input.why,
            input.status ?? 'draft',
            input.priority ?? Priority.P2,
            input.assignedTo ?? null,
            JSON.stringify(input.extensions ?? {}),
            now,
            now,
        ]);
        const story = this.findById(id);
        if (!story) {
            throw new Error('Failed to create story');
        }
        // Emit story:created event
        eventBus.emit('story:created', {
            entityId: story.id,
            entity: story,
            timestamp: createEventTimestamp(),
        });
        return story;
    }
    /**
     * Find a story by its ID
     * @param id - Story UUID
     * @returns The story or null if not found
     */
    findById(id) {
        const db = getDb();
        const row = db
            .query(`SELECT * FROM ${TABLES.STORIES} WHERE id = ?`)
            .get(id);
        return row ? toStory(row) : null;
    }
    /**
     * Find a story by its code
     * @param code - Story code (e.g., 'NOTIFY-001')
     * @returns The story or null if not found
     */
    findByCode(code) {
        const db = getDb();
        const row = db
            .query(`SELECT * FROM ${TABLES.STORIES} WHERE code = ?`)
            .get(code);
        return row ? toStory(row) : null;
    }
    /**
     * Find all stories belonging to a feature
     * @param featureId - Feature UUID
     * @returns Array of stories in the feature
     */
    findByFeatureId(featureId) {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.STORIES} WHERE feature_id = ? ORDER BY created_at ASC`)
            .all(featureId);
        const stories = [];
        for (const row of rows) {
            stories.push(toStory(row));
        }
        return stories;
    }
    /**
     * Find all stories with optional filters
     * @param filters - Optional filter criteria
     * @returns Array of matching stories
     */
    findAll(filters) {
        const db = getDb();
        const conditions = [];
        const params = [];
        if (filters?.status) {
            conditions.push('status = ?');
            params.push(filters.status);
        }
        if (filters?.featureId) {
            conditions.push('feature_id = ?');
            params.push(filters.featureId);
        }
        let query = `SELECT * FROM ${TABLES.STORIES}`;
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query += ' ORDER BY created_at ASC';
        const rows = db
            .query(query)
            .all(...params);
        const stories = [];
        for (const row of rows) {
            stories.push(toStory(row));
        }
        return stories;
    }
    /**
     * Update a story
     * @param id - Story UUID
     * @param input - Fields to update
     * @returns The updated story
     * @throws Error if story not found
     */
    update(id, input) {
        const db = getDb();
        const now = new Date().toISOString();
        // Get current story state for event payload
        const previousState = this.findById(id);
        if (!previousState) {
            throw new Error(`Story not found: ${id}`);
        }
        // Build dynamic update query
        const updates = ['updated_at = ?'];
        const params = [now];
        const changedFields = [];
        if (input.title !== undefined && input.title !== previousState.title) {
            updates.push('title = ?');
            params.push(input.title);
            changedFields.push('title');
        }
        if (input.description !== undefined && input.description !== previousState.description) {
            updates.push('description = ?');
            params.push(input.description);
            changedFields.push('description');
        }
        if (input.why !== undefined && input.why !== previousState.why) {
            updates.push('why = ?');
            params.push(input.why);
            changedFields.push('why');
        }
        if (input.status !== undefined && input.status !== previousState.status) {
            updates.push('status = ?');
            params.push(input.status);
            changedFields.push('status');
        }
        if (input.priority !== undefined && input.priority !== previousState.priority) {
            updates.push('priority = ?');
            params.push(input.priority);
            changedFields.push('priority');
        }
        if (input.assignedTo !== undefined && input.assignedTo !== previousState.assignedTo) {
            updates.push('assigned_to = ?');
            params.push(input.assignedTo);
            changedFields.push('assignedTo');
        }
        if (input.extensions !== undefined) {
            updates.push('extensions = ?');
            params.push(JSON.stringify(input.extensions));
            changedFields.push('extensions');
        }
        // Only update if there are changes
        if (changedFields.length > 0) {
            params.push(id);
            db.run(`UPDATE ${TABLES.STORIES} SET ${updates.join(', ')} WHERE id = ?`, params);
        }
        const story = this.findById(id);
        if (!story) {
            throw new Error('Failed to update story');
        }
        // Emit story:updated event if there were changes
        if (changedFields.length > 0) {
            eventBus.emit('story:updated', {
                entityId: story.id,
                entity: story,
                previousState,
                changedFields,
                timestamp: createEventTimestamp(),
            });
        }
        return story;
    }
    /**
     * Update only the status of a story
     * Emits a specialized story:status-changed event
     * @param id - Story UUID
     * @param newStatus - New status value
     * @returns The updated story
     * @throws Error if story not found
     */
    updateStatus(id, newStatus) {
        const db = getDb();
        const now = new Date().toISOString();
        // Get current story state
        const previousState = this.findById(id);
        if (!previousState) {
            throw new Error(`Story not found: ${id}`);
        }
        const previousStatus = previousState.status;
        // Skip if status is the same
        if (previousStatus === newStatus) {
            return previousState;
        }
        // Update status
        db.run(`UPDATE ${TABLES.STORIES} SET status = ?, updated_at = ? WHERE id = ?`, [newStatus, now, id]);
        const story = this.findById(id);
        if (!story) {
            throw new Error('Failed to update story status');
        }
        // Emit story:status-changed event
        eventBus.emit('story:status-changed', {
            entityId: story.id,
            entity: story,
            previousStatus,
            newStatus,
            timestamp: createEventTimestamp(),
        });
        return story;
    }
    /**
     * Delete a story
     * @param id - Story UUID
     * @throws Error if story not found
     */
    delete(id) {
        const db = getDb();
        // Get story for event payload before deleting
        const story = this.findById(id);
        if (!story) {
            throw new Error(`Story not found: ${id}`);
        }
        // Delete the story (cascades to tasks, acceptance criteria)
        db.run(`DELETE FROM ${TABLES.STORIES} WHERE id = ?`, [id]);
        // Emit story:deleted event
        eventBus.emit('story:deleted', {
            entityId: story.id,
            entity: story,
            timestamp: createEventTimestamp(),
        });
    }
}
/**
 * Singleton instance of StoryRepository
 */
export const storyRepository = new StoryRepository();
