/**
 * Task Repository for Board CLI/TUI System
 *
 * Handles all CRUD operations for tasks with event emission.
 * Tasks are atomic units of work within a story.
 */
import { getDb, TABLES } from '../db';
import { eventBus, createEventTimestamp } from '../events';
/**
 * Generate a UUID for new tasks
 */
function generateId() {
    return crypto.randomUUID();
}
/**
 * Convert a database row to a Task entity
 * Handles JSON parsing for array and object fields
 */
function toTask(row) {
    return {
        id: row.id,
        storyId: row.story_id,
        title: row.title,
        description: row.description,
        status: row.status,
        priority: row.priority,
        assignedTo: row.assigned_to,
        order: row.order_num,
        dependencies: JSON.parse(row.dependencies || '[]'),
        acCoverage: JSON.parse(row.ac_coverage || '[]'),
        estimatedComplexity: row.estimated_complexity,
        extensions: JSON.parse(row.extensions || '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
/**
 * Get the list of changed fields between two task objects
 */
function getChangedFields(original, updated) {
    const fields = [
        'title',
        'description',
        'status',
        'priority',
        'assignedTo',
        'order',
        'dependencies',
        'acCoverage',
        'estimatedComplexity',
        'extensions',
    ];
    const changed = [];
    for (const field of fields) {
        const origVal = original[field];
        const updVal = updated[field];
        // Handle array comparison
        if (Array.isArray(origVal) && Array.isArray(updVal)) {
            if (JSON.stringify(origVal) !== JSON.stringify(updVal)) {
                changed.push(field);
            }
        }
        else if (typeof origVal === 'object' && origVal !== null && typeof updVal === 'object' && updVal !== null) {
            // Handle object comparison
            if (JSON.stringify(origVal) !== JSON.stringify(updVal)) {
                changed.push(field);
            }
        }
        else if (origVal !== updVal) {
            changed.push(field);
        }
    }
    return changed;
}
/**
 * TaskRepository class - handles all task CRUD operations
 */
export class TaskRepository {
    /**
     * Create a new task
     *
     * @param input - Task creation input
     * @returns The created task
     * @emits task:created
     */
    create(input) {
        const db = getDb();
        const now = new Date().toISOString();
        const id = generateId();
        // Get the next order number for this story
        const maxOrderResult = db
            .query(`SELECT MAX(order_num) as max_order FROM ${TABLES.TASKS} WHERE story_id = ?`)
            .get(input.storyId);
        const nextOrder = input.order ?? ((maxOrderResult?.max_order ?? -1) + 1);
        const stmt = db.prepare(`
      INSERT INTO ${TABLES.TASKS} (
        id, story_id, title, description, status, priority,
        assigned_to, order_num, dependencies, ac_coverage,
        estimated_complexity, extensions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(id, input.storyId, input.title, input.description, input.status ?? 'pending', input.priority ?? 'P2', input.assignedTo ?? null, nextOrder, JSON.stringify(input.dependencies ?? []), JSON.stringify(input.acCoverage ?? []), input.estimatedComplexity ?? 'medium', JSON.stringify(input.extensions ?? {}), now, now);
        const task = this.findById(id);
        if (!task) {
            throw new Error('Failed to create task');
        }
        // Emit task:created event
        eventBus.emit('task:created', {
            entityId: task.id,
            entity: task,
            timestamp: createEventTimestamp(),
        });
        return task;
    }
    /**
     * Find a task by its ID
     *
     * @param id - Task ID
     * @returns The task or null if not found
     */
    findById(id) {
        const db = getDb();
        const row = db.query(`SELECT * FROM ${TABLES.TASKS} WHERE id = ?`).get(id);
        if (!row) {
            return null;
        }
        return toTask(row);
    }
    /**
     * Find all tasks for a specific story
     *
     * @param storyId - Story ID
     * @returns Array of tasks ordered by order_num
     */
    findByStoryId(storyId) {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.TASKS} WHERE story_id = ? ORDER BY order_num ASC`)
            .all(storyId);
        const tasks = [];
        for (const row of rows) {
            tasks.push(toTask(row));
        }
        return tasks;
    }
    /**
     * Find all tasks with a specific status
     *
     * @param status - Task status to filter by
     * @returns Array of tasks
     */
    findByStatus(status) {
        const db = getDb();
        const rows = db
            .query(`SELECT * FROM ${TABLES.TASKS} WHERE status = ? ORDER BY created_at DESC`)
            .all(status);
        const tasks = [];
        for (const row of rows) {
            tasks.push(toTask(row));
        }
        return tasks;
    }
    /**
     * Find all tasks with optional filters
     *
     * @param filters - Optional filters for storyId, status, assignedTo
     * @returns Array of tasks
     */
    findAll(filters) {
        const db = getDb();
        const conditions = [];
        const params = [];
        if (filters?.storyId) {
            conditions.push('story_id = ?');
            params.push(filters.storyId);
        }
        if (filters?.status) {
            conditions.push('status = ?');
            params.push(filters.status);
        }
        if (filters?.assignedTo !== undefined) {
            if (filters.assignedTo === null) {
                conditions.push('assigned_to IS NULL');
            }
            else {
                conditions.push('assigned_to = ?');
                params.push(filters.assignedTo);
            }
        }
        let query = `SELECT * FROM ${TABLES.TASKS}`;
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query += ' ORDER BY story_id, order_num ASC';
        const rows = db.query(query).all(...params);
        const tasks = [];
        for (const row of rows) {
            tasks.push(toTask(row));
        }
        return tasks;
    }
    /**
     * Update a task
     *
     * @param id - Task ID
     * @param input - Update input
     * @returns The updated task
     * @throws Error if task not found
     * @emits task:updated
     */
    update(id, input) {
        const previousState = this.findById(id);
        if (!previousState) {
            throw new Error(`Task not found: ${id}`);
        }
        const db = getDb();
        const now = new Date().toISOString();
        // Build dynamic update query
        const updates = ['updated_at = ?'];
        const params = [now];
        if (input.title !== undefined) {
            updates.push('title = ?');
            params.push(input.title);
        }
        if (input.description !== undefined) {
            updates.push('description = ?');
            params.push(input.description);
        }
        if (input.status !== undefined) {
            updates.push('status = ?');
            params.push(input.status);
        }
        if (input.priority !== undefined) {
            updates.push('priority = ?');
            params.push(input.priority);
        }
        if (input.assignedTo !== undefined) {
            updates.push('assigned_to = ?');
            params.push(input.assignedTo);
        }
        if (input.order !== undefined) {
            updates.push('order_num = ?');
            params.push(input.order);
        }
        if (input.dependencies !== undefined) {
            updates.push('dependencies = ?');
            params.push(JSON.stringify(input.dependencies));
        }
        if (input.acCoverage !== undefined) {
            updates.push('ac_coverage = ?');
            params.push(JSON.stringify(input.acCoverage));
        }
        if (input.estimatedComplexity !== undefined) {
            updates.push('estimated_complexity = ?');
            params.push(input.estimatedComplexity);
        }
        if (input.extensions !== undefined) {
            updates.push('extensions = ?');
            params.push(JSON.stringify(input.extensions));
        }
        params.push(id);
        const stmt = db.prepare(`
      UPDATE ${TABLES.TASKS}
      SET ${updates.join(', ')}
      WHERE id = ?
    `);
        stmt.run(...params);
        const task = this.findById(id);
        if (!task) {
            throw new Error(`Failed to retrieve updated task: ${id}`);
        }
        const changedFields = getChangedFields(previousState, task);
        // Emit task:updated event
        eventBus.emit('task:updated', {
            entityId: task.id,
            entity: task,
            previousState,
            changedFields,
            timestamp: createEventTimestamp(),
        });
        return task;
    }
    /**
     * Update only the status of a task
     * Emits a specific status-changed event with previous and new status
     *
     * @param id - Task ID
     * @param newStatus - New status value
     * @returns The updated task
     * @throws Error if task not found
     * @emits task:status-changed
     */
    updateStatus(id, newStatus) {
        const previousState = this.findById(id);
        if (!previousState) {
            throw new Error(`Task not found: ${id}`);
        }
        const previousStatus = previousState.status;
        // Skip if status is the same
        if (previousStatus === newStatus) {
            return previousState;
        }
        const db = getDb();
        const now = new Date().toISOString();
        const stmt = db.prepare(`
      UPDATE ${TABLES.TASKS}
      SET status = ?, updated_at = ?
      WHERE id = ?
    `);
        stmt.run(newStatus, now, id);
        const task = this.findById(id);
        if (!task) {
            throw new Error(`Failed to retrieve updated task: ${id}`);
        }
        // Emit task:status-changed event
        eventBus.emit('task:status-changed', {
            entityId: task.id,
            entity: task,
            previousStatus,
            newStatus,
            timestamp: createEventTimestamp(),
        });
        return task;
    }
    /**
     * Delete a task
     *
     * @param id - Task ID
     * @throws Error if task not found
     * @emits task:deleted
     */
    delete(id) {
        const task = this.findById(id);
        if (!task) {
            throw new Error(`Task not found: ${id}`);
        }
        const db = getDb();
        const stmt = db.prepare(`DELETE FROM ${TABLES.TASKS} WHERE id = ?`);
        stmt.run(id);
        // Emit task:deleted event
        eventBus.emit('task:deleted', {
            entityId: task.id,
            entity: task,
            timestamp: createEventTimestamp(),
        });
    }
    /**
     * Reorder tasks within a story
     * Updates the order_num field for each task in the provided order
     *
     * @param storyId - Story ID
     * @param taskIds - Array of task IDs in the desired order
     */
    reorder(storyId, taskIds) {
        const db = getDb();
        // Verify all tasks belong to the story
        const existingTasks = this.findByStoryId(storyId);
        const existingIds = new Set(existingTasks.map((t) => t.id));
        for (const taskId of taskIds) {
            if (!existingIds.has(taskId)) {
                throw new Error(`Task ${taskId} does not belong to story ${storyId}`);
            }
        }
        // Update order in a transaction
        const now = new Date().toISOString();
        const stmt = db.prepare(`
      UPDATE ${TABLES.TASKS}
      SET order_num = ?, updated_at = ?
      WHERE id = ? AND story_id = ?
    `);
        db.run('BEGIN TRANSACTION');
        try {
            for (let i = 0; i < taskIds.length; i++) {
                stmt.run(i, now, taskIds[i], storyId);
            }
            db.run('COMMIT');
        }
        catch (error) {
            db.run('ROLLBACK');
            throw error;
        }
    }
    /**
     * Get count of tasks grouped by status for a story
     *
     * @param storyId - Story ID
     * @returns Object with status counts
     */
    getStatusCounts(storyId) {
        const db = getDb();
        const rows = db
            .query(`
        SELECT status, COUNT(*) as count
        FROM ${TABLES.TASKS}
        WHERE story_id = ?
        GROUP BY status
      `)
            .all(storyId);
        const counts = {};
        for (const row of rows) {
            counts[row.status] = row.count;
        }
        return counts;
    }
}
/**
 * Singleton instance for convenience
 */
export const taskRepository = new TaskRepository();
