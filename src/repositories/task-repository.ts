/**
 * Task Repository for Board CLI/TUI System
 *
 * Handles all CRUD operations for tasks with event emission.
 * Tasks are atomic units of work within a story.
 */

import { getDb, TABLES } from '../db';
import { eventBus, createEventTimestamp } from '../events';
import {
  EffortUnit,
} from '../types';
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskStatus,
} from '../types';

/**
 * Generate a UUID for new tasks
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Convert a database row to a Task entity
 * Handles JSON parsing for array and object fields
 */
function toTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    storyId: row.story_id as string,
    title: row.title as string,
    description: row.description as string,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    assignedTo: row.assigned_to as string | null,
    order: row.order_num as number,
    dependencies: JSON.parse((row.dependencies as string) || '[]') as string[],
    acCoverage: JSON.parse((row.ac_coverage as string) || '[]') as string[],
    estimatedComplexity: row.estimated_complexity as Task['estimatedComplexity'],
    files: JSON.parse((row.files as string) || '[]') as string[],
    reference: row.reference as string | null,
    estimatedEffort: row.estimated_effort as number | null,
    actualEffort: row.actual_effort as number | null,
    effortUnit: row.effort_unit as EffortUnit | null,
    startedAt: row.started_at as string | null,
    completedAt: row.completed_at as string | null,
    extensions: JSON.parse((row.extensions as string) || '{}') as Record<string, unknown>,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Get the list of changed fields between two task objects
 */
function getChangedFields(original: Task, updated: Task): (keyof Task)[] {
  const fields: (keyof Task)[] = [
    'title',
    'description',
    'status',
    'priority',
    'assignedTo',
    'order',
    'dependencies',
    'acCoverage',
    'estimatedComplexity',
    'files',
    'reference',
    'estimatedEffort',
    'actualEffort',
    'effortUnit',
    'startedAt',
    'completedAt',
    'extensions',
  ];

  const changed: (keyof Task)[] = [];
  for (const field of fields) {
    const origVal = original[field];
    const updVal = updated[field];

    // Handle array comparison
    if (Array.isArray(origVal) && Array.isArray(updVal)) {
      if (JSON.stringify(origVal) !== JSON.stringify(updVal)) {
        changed.push(field);
      }
    } else if (typeof origVal === 'object' && origVal !== null && typeof updVal === 'object' && updVal !== null) {
      // Handle object comparison
      if (JSON.stringify(origVal) !== JSON.stringify(updVal)) {
        changed.push(field);
      }
    } else if (origVal !== updVal) {
      changed.push(field);
    }
  }

  return changed;
}

/**
 * Task filter options for findAll
 */
export interface TaskFilters {
  storyId?: string;
  status?: TaskStatus;
  assignedTo?: string;
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
  create(input: CreateTaskInput): Task {
    const db = getDb();
    const now = new Date().toISOString();
    const id = generateId();

    // Get the next order number for this story
    const maxOrderResult = db
      .query(`SELECT MAX(order_num) as max_order FROM ${TABLES.TASKS} WHERE story_id = ?`)
      .get(input.storyId) as { max_order: number | null } | null;
    const nextOrder = input.order ?? ((maxOrderResult?.max_order ?? -1) + 1);

    const stmt = db.prepare(`
      INSERT INTO ${TABLES.TASKS} (
        id, story_id, title, description, status, priority,
        assigned_to, order_num, dependencies, ac_coverage,
        estimated_complexity, files, reference,
        estimated_effort, actual_effort, effort_unit,
        extensions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.storyId,
      input.title,
      input.description,
      input.status ?? 'pending',
      input.priority ?? 'P2',
      input.assignedTo ?? null,
      nextOrder,
      JSON.stringify(input.dependencies ?? []),
      JSON.stringify(input.acCoverage ?? []),
      input.estimatedComplexity ?? 'medium',
      JSON.stringify(input.files ?? []),
      input.reference ?? null,
      input.estimatedEffort ?? null,
      input.actualEffort ?? null,
      input.effortUnit ?? null,
      JSON.stringify(input.extensions ?? {}),
      now,
      now
    );

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
  findById(id: string): Task | null {
    const db = getDb();
    const row = db.query(`SELECT * FROM ${TABLES.TASKS} WHERE id = ?`).get(id) as Record<string, unknown> | null;

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
  findByStoryId(storyId: string): Task[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.TASKS} WHERE story_id = ? ORDER BY order_num ASC`)
      .all(storyId) as Record<string, unknown>[];

    const tasks: Task[] = [];
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
  findByStatus(status: TaskStatus): Task[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.TASKS} WHERE status = ? ORDER BY created_at DESC`)
      .all(status) as Record<string, unknown>[];

    const tasks: Task[] = [];
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
  findAll(filters?: TaskFilters): Task[] {
    const db = getDb();
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

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
      } else {
        conditions.push('assigned_to = ?');
        params.push(filters.assignedTo);
      }
    }

    let query = `SELECT * FROM ${TABLES.TASKS}`;
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY story_id, order_num ASC';

    const rows = db.query(query).all(...params) as Record<string, unknown>[];

    const tasks: Task[] = [];
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
  update(id: string, input: UpdateTaskInput): Task {
    const previousState = this.findById(id);
    if (!previousState) {
      throw new Error(`Task not found: ${id}`);
    }

    const db = getDb();
    const now = new Date().toISOString();

    // Build dynamic update query
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

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

    if (input.files !== undefined) {
      updates.push('files = ?');
      params.push(JSON.stringify(input.files));
    }

    if (input.reference !== undefined) {
      updates.push('reference = ?');
      params.push(input.reference);
    }

    if (input.estimatedEffort !== undefined) {
      updates.push('estimated_effort = ?');
      params.push(input.estimatedEffort);
    }

    if (input.actualEffort !== undefined) {
      updates.push('actual_effort = ?');
      params.push(input.actualEffort);
    }

    if (input.effortUnit !== undefined) {
      updates.push('effort_unit = ?');
      params.push(input.effortUnit);
    }

    if (input.startedAt !== undefined) {
      updates.push('started_at = ?');
      params.push(input.startedAt);
    }

    if (input.completedAt !== undefined) {
      updates.push('completed_at = ?');
      params.push(input.completedAt);
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
   * Auto-captures startedAt when transitioning to 'in_progress' (if not already set)
   * Auto-captures completedAt when transitioning to 'completed' (if not already set)
   *
   * @param id - Task ID
   * @param newStatus - New status value
   * @returns The updated task
   * @throws Error if task not found
   * @emits task:status-changed
   */
  updateStatus(id: string, newStatus: TaskStatus): Task {
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

    // Build the update parts
    const updates = ['status = ?', 'updated_at = ?'];
    const params: (string | null)[] = [newStatus, now];

    // Auto-capture startedAt when transitioning to in_progress (only if not already set)
    if (newStatus === 'in_progress' && previousState.startedAt === null) {
      updates.push('started_at = ?');
      params.push(now);
    }

    // Auto-capture completedAt when transitioning to completed (only if not already set)
    if (newStatus === 'completed' && previousState.completedAt === null) {
      updates.push('completed_at = ?');
      params.push(now);
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
  delete(id: string): void {
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
  reorder(storyId: string, taskIds: string[]): void {
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
    } catch (error) {
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
  getStatusCounts(storyId: string): Record<string, number> {
    const db = getDb();
    const rows = db
      .query(`
        SELECT status, COUNT(*) as count
        FROM ${TABLES.TASKS}
        WHERE story_id = ?
        GROUP BY status
      `)
      .all(storyId) as { status: string; count: number }[];

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  }

  /**
   * Add a file to a task's files list
   *
   * @param id - Task ID
   * @param filePath - Path to add
   * @returns The updated task
   */
  addFile(id: string, filePath: string): Task {
    const task = this.findById(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    // Don't add duplicate
    if (task.files.includes(filePath)) {
      return task;
    }

    const newFiles = [...task.files, filePath];
    return this.update(id, { files: newFiles });
  }

  /**
   * Remove a file from a task's files list
   *
   * @param id - Task ID
   * @param filePath - Path to remove
   * @returns The updated task
   */
  removeFile(id: string, filePath: string): Task {
    const task = this.findById(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const newFiles = task.files.filter(f => f !== filePath);
    return this.update(id, { files: newFiles });
  }

  /**
   * Set the reference link for a task
   *
   * @param id - Task ID
   * @param reference - Reference URL or null to clear
   * @returns The updated task
   */
  setReference(id: string, reference: string | null): Task {
    return this.update(id, { reference });
  }

  /**
   * Capture modified files from git for a task
   * Adds all staged and modified files to the task
   *
   * @param id - Task ID
   * @returns The updated task with captured files
   */
  captureGitFiles(id: string): Task {
    const task = this.findById(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    // Use Bun's shell to get git status
    const proc = Bun.spawnSync(['git', 'status', '--porcelain']);
    const output = proc.stdout.toString();

    const files: string[] = [];
    const lines = output.split('\n').filter(Boolean);
    for (const line of lines) {
      // Git status format: XY filename
      // X = index status, Y = working tree status
      const match = line.match(/^..\s+(.+)$/);
      if (match) {
        files.push(match[1]);
      }
    }

    // Merge with existing files, avoiding duplicates
    const newFiles = [...new Set([...task.files, ...files])];
    return this.update(id, { files: newFiles });
  }
}

/**
 * Singleton instance for convenience
 */
export const taskRepository = new TaskRepository();
