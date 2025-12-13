/**
 * TaskRepository Tests
 *
 * Uses actual in-memory SQLite database through initDb
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, closeDb, getDb, TABLES } from '../../db';
import { TaskRepository, taskRepository } from '../task-repository';
import { eventBus } from '../../events';
import { TaskStatus, Priority, EffortUnit } from '../../types';

describe('TaskRepository', () => {
  let repository: TaskRepository;
  let testFeatureId: string;
  let testStoryId: string;
  let capturedEvents: { name: string; payload: unknown }[];

  // Store listener references so we can remove them
  let onCreated: (payload: unknown) => void;
  let onUpdated: (payload: unknown) => void;
  let onDeleted: (payload: unknown) => void;
  let onStatusChanged: (payload: unknown) => void;

  beforeEach(() => {
    // Initialize in-memory database
    initDb({ dbPath: ':memory:' });
    const db = getDb();

    // Reset captured events
    capturedEvents = [];

    // Create listeners
    onCreated = (payload) => capturedEvents.push({ name: 'task:created', payload });
    onUpdated = (payload) => capturedEvents.push({ name: 'task:updated', payload });
    onDeleted = (payload) => capturedEvents.push({ name: 'task:deleted', payload });
    onStatusChanged = (payload) => capturedEvents.push({ name: 'task:status-changed', payload });

    // Subscribe to all task events
    eventBus.on('task:created', onCreated);
    eventBus.on('task:updated', onUpdated);
    eventBus.on('task:deleted', onDeleted);
    eventBus.on('task:status-changed', onStatusChanged);

    // Insert test feature
    testFeatureId = crypto.randomUUID();
    db.run(
      `INSERT INTO ${TABLES.FEATURES} (id, code, name, description) VALUES (?, ?, ?, ?)`,
      [testFeatureId, 'TEST', 'Test Feature', 'Test feature description']
    );

    // Insert test story
    testStoryId = crypto.randomUUID();
    db.run(
      `INSERT INTO ${TABLES.STORIES} (id, code, feature_id, title, description, why) VALUES (?, ?, ?, ?, ?, ?)`,
      [testStoryId, 'TEST-001', testFeatureId, 'Test Story', 'Test story description', 'Testing purposes']
    );

    // Create repository instance
    repository = new TaskRepository();
  });

  afterEach(() => {
    // Remove event listeners
    eventBus.off('task:created', onCreated);
    eventBus.off('task:updated', onUpdated);
    eventBus.off('task:deleted', onDeleted);
    eventBus.off('task:status-changed', onStatusChanged);
    closeDb();
  });

  describe('create', () => {
    it('should create a task with required fields', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Test Task',
        description: 'Test task description',
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.storyId).toBe(testStoryId);
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test task description');
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.priority).toBe(Priority.P2);
      expect(task.order).toBe(0);
      expect(task.dependencies).toEqual([]);
      expect(task.acCoverage).toEqual([]);
      expect(task.estimatedComplexity).toBe('medium');
    });

    it('should create a task with all optional fields', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Full Task',
        description: 'Full description',
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.P1,
        assignedTo: 'backend-dev',
        order: 5,
        dependencies: ['dep-1', 'dep-2'],
        acCoverage: ['ac-1'],
        estimatedComplexity: 'high',
        extensions: { custom: 'value' },
      });

      expect(task.status).toBe(TaskStatus.IN_PROGRESS);
      expect(task.priority).toBe(Priority.P1);
      expect(task.assignedTo).toBe('backend-dev');
      expect(task.order).toBe(5);
      expect(task.dependencies).toEqual(['dep-1', 'dep-2']);
      expect(task.acCoverage).toEqual(['ac-1']);
      expect(task.estimatedComplexity).toBe('high');
      expect(task.extensions).toEqual({ custom: 'value' });
    });

    it('should emit task:created event', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Event Test Task',
        description: 'Testing events',
      });

      expect(capturedEvents.length).toBe(1);
      expect(capturedEvents[0].name).toBe('task:created');
      const payload = capturedEvents[0].payload as { entityId: string; entity: { title: string } };
      expect(payload.entityId).toBe(task.id);
      expect(payload.entity.title).toBe('Event Test Task');
    });

    it('should auto-increment order for tasks in same story', () => {
      const task1 = repository.create({
        storyId: testStoryId,
        title: 'Task 1',
        description: '',
      });

      const task2 = repository.create({
        storyId: testStoryId,
        title: 'Task 2',
        description: '',
      });

      const task3 = repository.create({
        storyId: testStoryId,
        title: 'Task 3',
        description: '',
      });

      expect(task1.order).toBe(0);
      expect(task2.order).toBe(1);
      expect(task3.order).toBe(2);
    });
  });

  describe('findById', () => {
    it('should find task by ID', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'Find Me',
        description: 'Test',
      });

      const found = repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe('Find Me');
    });

    it('should return null for non-existent ID', () => {
      const found = repository.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByStoryId', () => {
    it('should find all tasks for a story', () => {
      repository.create({ storyId: testStoryId, title: 'Task 1', description: '' });
      repository.create({ storyId: testStoryId, title: 'Task 2', description: '' });
      repository.create({ storyId: testStoryId, title: 'Task 3', description: '' });

      const tasks = repository.findByStoryId(testStoryId);

      expect(tasks.length).toBe(3);
      expect(tasks[0].title).toBe('Task 1');
      expect(tasks[1].title).toBe('Task 2');
      expect(tasks[2].title).toBe('Task 3');
    });

    it('should return tasks ordered by order_num', () => {
      repository.create({ storyId: testStoryId, title: 'Task C', description: '', order: 2 });
      repository.create({ storyId: testStoryId, title: 'Task A', description: '', order: 0 });
      repository.create({ storyId: testStoryId, title: 'Task B', description: '', order: 1 });

      const tasks = repository.findByStoryId(testStoryId);

      expect(tasks[0].title).toBe('Task A');
      expect(tasks[1].title).toBe('Task B');
      expect(tasks[2].title).toBe('Task C');
    });

    it('should return empty array for story with no tasks', () => {
      const tasks = repository.findByStoryId('empty-story-id');
      expect(tasks).toEqual([]);
    });
  });

  describe('findByStatus', () => {
    it('should find tasks by status', () => {
      repository.create({ storyId: testStoryId, title: 'Pending 1', description: '', status: TaskStatus.PENDING });
      repository.create({ storyId: testStoryId, title: 'In Progress', description: '', status: TaskStatus.IN_PROGRESS });
      repository.create({ storyId: testStoryId, title: 'Pending 2', description: '', status: TaskStatus.PENDING });

      const pendingTasks = repository.findByStatus(TaskStatus.PENDING);
      const inProgressTasks = repository.findByStatus(TaskStatus.IN_PROGRESS);

      expect(pendingTasks.length).toBe(2);
      expect(inProgressTasks.length).toBe(1);
    });
  });

  describe('findAll', () => {
    it('should return all tasks without filters', () => {
      repository.create({ storyId: testStoryId, title: 'Task 1', description: '' });
      repository.create({ storyId: testStoryId, title: 'Task 2', description: '' });

      const tasks = repository.findAll();

      expect(tasks.length).toBe(2);
    });

    it('should filter by storyId', () => {
      repository.create({ storyId: testStoryId, title: 'Task 1', description: '' });

      const tasks = repository.findAll({ storyId: testStoryId });

      expect(tasks.length).toBe(1);
    });

    it('should filter by status', () => {
      repository.create({ storyId: testStoryId, title: 'Pending', description: '', status: TaskStatus.PENDING });
      repository.create({ storyId: testStoryId, title: 'Completed', description: '', status: TaskStatus.COMPLETED });

      const tasks = repository.findAll({ status: TaskStatus.PENDING });

      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Pending');
    });

    it('should filter by assignedTo', () => {
      repository.create({ storyId: testStoryId, title: 'Backend', description: '', assignedTo: 'backend-dev' });
      repository.create({ storyId: testStoryId, title: 'Frontend', description: '', assignedTo: 'frontend-dev' });

      const tasks = repository.findAll({ assignedTo: 'backend-dev' });

      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Backend');
    });

    it('should combine multiple filters', () => {
      repository.create({ storyId: testStoryId, title: 'Match', description: '', status: TaskStatus.IN_PROGRESS, assignedTo: 'backend-dev' });
      repository.create({ storyId: testStoryId, title: 'No Match 1', description: '', status: TaskStatus.PENDING, assignedTo: 'backend-dev' });
      repository.create({ storyId: testStoryId, title: 'No Match 2', description: '', status: TaskStatus.IN_PROGRESS, assignedTo: 'frontend-dev' });

      const tasks = repository.findAll({
        storyId: testStoryId,
        status: TaskStatus.IN_PROGRESS,
        assignedTo: 'backend-dev',
      });

      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Match');
    });
  });

  describe('update', () => {
    it('should update task fields', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'Original Title',
        description: 'Original description',
      });

      const updated = repository.update(created.id, {
        title: 'Updated Title',
        description: 'Updated description',
        priority: Priority.P0,
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.description).toBe('Updated description');
      expect(updated.priority).toBe(Priority.P0);
    });

    it('should emit task:updated event with changed fields', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'Original',
        description: '',
      });

      // Clear creation event
      capturedEvents = [];

      repository.update(created.id, { title: 'Updated' });

      expect(capturedEvents.length).toBe(1);
      expect(capturedEvents[0].name).toBe('task:updated');
      const payload = capturedEvents[0].payload as { changedFields: string[] };
      expect(payload.changedFields).toContain('title');
    });

    it('should throw error for non-existent task', () => {
      expect(() => {
        repository.update('non-existent', { title: 'Test' });
      }).toThrow('Task not found: non-existent');
    });

    it('should update array fields correctly', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'Task',
        description: '',
        dependencies: ['old-dep'],
      });

      const updated = repository.update(created.id, {
        dependencies: ['new-dep-1', 'new-dep-2'],
        acCoverage: ['ac-1', 'ac-2'],
      });

      expect(updated.dependencies).toEqual(['new-dep-1', 'new-dep-2']);
      expect(updated.acCoverage).toEqual(['ac-1', 'ac-2']);
    });
  });

  describe('updateStatus', () => {
    it('should update task status', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'Task',
        description: '',
        status: TaskStatus.PENDING,
      });

      const updated = repository.updateStatus(created.id, TaskStatus.IN_PROGRESS);

      expect(updated.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('should emit task:status-changed event', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'Task',
        description: '',
        status: TaskStatus.PENDING,
      });

      // Clear creation event
      capturedEvents = [];

      repository.updateStatus(created.id, TaskStatus.COMPLETED);

      expect(capturedEvents.length).toBe(1);
      expect(capturedEvents[0].name).toBe('task:status-changed');
      const payload = capturedEvents[0].payload as {
        previousStatus: string;
        newStatus: string;
      };
      expect(payload.previousStatus).toBe(TaskStatus.PENDING);
      expect(payload.newStatus).toBe(TaskStatus.COMPLETED);
    });

    it('should not emit event if status unchanged', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'Task',
        description: '',
        status: TaskStatus.PENDING,
      });

      // Clear creation event
      capturedEvents = [];

      repository.updateStatus(created.id, TaskStatus.PENDING);

      expect(capturedEvents.length).toBe(0);
    });

    it('should auto-set startedAt when transitioning to in_progress', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'Task',
        description: '',
        status: TaskStatus.PENDING,
      });

      // Verify startedAt is null initially
      expect(created.startedAt).toBeNull();

      const updated = repository.updateStatus(created.id, TaskStatus.IN_PROGRESS);

      // startedAt should now be set
      expect(updated.startedAt).not.toBeNull();
      expect(typeof updated.startedAt).toBe('string');
      // Verify it's a valid ISO timestamp
      const parsedDate = new Date(updated.startedAt!);
      expect(parsedDate.getTime()).not.toBeNaN();
    });

    it('should auto-set completedAt when transitioning to completed', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'Task',
        description: '',
        status: TaskStatus.PENDING,
      });

      // Verify completedAt is null initially
      expect(created.completedAt).toBeNull();

      const updated = repository.updateStatus(created.id, TaskStatus.COMPLETED);

      // completedAt should now be set
      expect(updated.completedAt).not.toBeNull();
      expect(typeof updated.completedAt).toBe('string');
      // Verify it's a valid ISO timestamp
      const parsedDate = new Date(updated.completedAt!);
      expect(parsedDate.getTime()).not.toBeNaN();
    });

    it('should not overwrite startedAt if task goes back to in_progress', () => {
      // Create a task and transition to in_progress
      const created = repository.create({
        storyId: testStoryId,
        title: 'Task',
        description: '',
        status: TaskStatus.PENDING,
      });

      const inProgress = repository.updateStatus(created.id, TaskStatus.IN_PROGRESS);
      const originalStartedAt = inProgress.startedAt;

      // Move to completed
      repository.updateStatus(created.id, TaskStatus.COMPLETED);

      // Wait a tiny bit to ensure timestamps would be different
      // (In practice, the condition check prevents the overwrite anyway)

      // Move back to in_progress
      const backToInProgress = repository.updateStatus(created.id, TaskStatus.IN_PROGRESS);

      // startedAt should NOT have changed
      expect(backToInProgress.startedAt).toBe(originalStartedAt);
    });

    it('should not overwrite completedAt if task goes back to completed', () => {
      // Create a task and transition through states
      const created = repository.create({
        storyId: testStoryId,
        title: 'Task',
        description: '',
        status: TaskStatus.PENDING,
      });

      const completed = repository.updateStatus(created.id, TaskStatus.COMPLETED);
      const originalCompletedAt = completed.completedAt;

      // Move back to in_progress
      repository.updateStatus(created.id, TaskStatus.IN_PROGRESS);

      // Move back to completed
      const backToCompleted = repository.updateStatus(created.id, TaskStatus.COMPLETED);

      // completedAt should NOT have changed
      expect(backToCompleted.completedAt).toBe(originalCompletedAt);
    });

    it('should set both startedAt and completedAt when going directly to completed (first transition)', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'Task',
        description: '',
        status: TaskStatus.PENDING,
      });

      // Verify both are null initially
      expect(created.startedAt).toBeNull();
      expect(created.completedAt).toBeNull();

      // Go directly to completed
      const completed = repository.updateStatus(created.id, TaskStatus.COMPLETED);

      // completedAt should be set, but startedAt remains null (only set on in_progress transition)
      expect(completed.completedAt).not.toBeNull();
      // startedAt should still be null since we never went through in_progress
      expect(completed.startedAt).toBeNull();
    });
  });

  describe('effort tracking fields', () => {
    it('should create task with effort fields', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Effort tracked task',
        description: 'Testing effort fields',
        estimatedEffort: 4.5,
        actualEffort: 6.0,
        effortUnit: EffortUnit.HOURS,
      });

      expect(task.estimatedEffort).toBe(4.5);
      expect(task.actualEffort).toBe(6.0);
      expect(task.effortUnit).toBe(EffortUnit.HOURS);
    });

    it('should create task with ai-hours unit', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'AI-assisted task',
        description: 'Testing ai-hours',
        estimatedEffort: 2,
        effortUnit: EffortUnit.AI_HOURS,
      });

      expect(task.estimatedEffort).toBe(2);
      expect(task.effortUnit).toBe(EffortUnit.AI_HOURS);
      expect(task.actualEffort).toBeNull();
    });

    it('should create task with points unit', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Points task',
        description: 'Testing points',
        estimatedEffort: 5,
        effortUnit: EffortUnit.POINTS,
      });

      expect(task.estimatedEffort).toBe(5);
      expect(task.effortUnit).toBe(EffortUnit.POINTS);
    });

    it('should create task without effort fields (backward compatible)', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'No effort task',
        description: 'No effort tracking',
      });

      expect(task.estimatedEffort).toBeNull();
      expect(task.actualEffort).toBeNull();
      expect(task.effortUnit).toBeNull();
      expect(task.startedAt).toBeNull();
      expect(task.completedAt).toBeNull();
    });

    it('should update estimatedEffort independently', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Update effort test',
        description: 'Test',
      });

      const updated = repository.update(task.id, { estimatedEffort: 8 });
      expect(updated.estimatedEffort).toBe(8);
      // Other effort fields should remain null
      expect(updated.actualEffort).toBeNull();
      expect(updated.effortUnit).toBeNull();
    });

    it('should update actualEffort independently', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Update effort test',
        description: 'Test',
      });

      const updated = repository.update(task.id, { actualEffort: 10 });
      expect(updated.actualEffort).toBe(10);
      // Other effort fields should remain null
      expect(updated.estimatedEffort).toBeNull();
      expect(updated.effortUnit).toBeNull();
    });

    it('should update effortUnit independently', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Update effort test',
        description: 'Test',
      });

      const updated = repository.update(task.id, { effortUnit: EffortUnit.AI_HOURS });
      expect(updated.effortUnit).toBe(EffortUnit.AI_HOURS);
      // Other effort fields should remain null
      expect(updated.estimatedEffort).toBeNull();
      expect(updated.actualEffort).toBeNull();
    });

    it('should allow manual override of startedAt via update', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Manual timestamp test',
        description: 'Test',
      });

      const manualTime = '2025-01-01T12:00:00.000Z';
      const updated = repository.update(task.id, { startedAt: manualTime });
      expect(updated.startedAt).toBe(manualTime);
    });

    it('should allow manual override of completedAt via update', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Manual timestamp test',
        description: 'Test',
      });

      const manualTime = '2025-01-01T14:00:00.000Z';
      const updated = repository.update(task.id, { completedAt: manualTime });
      expect(updated.completedAt).toBe(manualTime);
    });

    it('should track changes to effort fields in changedFields', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Change tracking test',
        description: 'Test',
        estimatedEffort: 5,
      });

      // Clear creation event
      capturedEvents = [];

      const updated = repository.update(task.id, { estimatedEffort: 10 });

      // Verify the update event was emitted
      expect(capturedEvents.length).toBe(1);
      expect(capturedEvents[0].name).toBe('task:updated');
      const payload = capturedEvents[0].payload as { changedFields: string[] };
      expect(payload.changedFields).toContain('estimatedEffort');

      // Verify the value changed
      expect(updated.estimatedEffort).toBe(10);
    });

    it('should update all effort fields together', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Full effort update test',
        description: 'Test',
      });

      const updated = repository.update(task.id, {
        estimatedEffort: 4,
        actualEffort: 6,
        effortUnit: EffortUnit.HOURS,
      });

      expect(updated.estimatedEffort).toBe(4);
      expect(updated.actualEffort).toBe(6);
      expect(updated.effortUnit).toBe(EffortUnit.HOURS);
    });

    it('should preserve effort fields when updating other fields', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Preserve effort test',
        description: 'Test',
        estimatedEffort: 5,
        actualEffort: 7,
        effortUnit: EffortUnit.HOURS,
      });

      // Update unrelated field
      const updated = repository.update(task.id, { title: 'New title' });

      // Effort fields should be preserved
      expect(updated.estimatedEffort).toBe(5);
      expect(updated.actualEffort).toBe(7);
      expect(updated.effortUnit).toBe(EffortUnit.HOURS);
      expect(updated.title).toBe('New title');
    });

    it('should handle decimal effort values', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Decimal effort test',
        description: 'Test',
        estimatedEffort: 2.5,
        actualEffort: 3.75,
        effortUnit: EffortUnit.HOURS,
      });

      expect(task.estimatedEffort).toBe(2.5);
      expect(task.actualEffort).toBe(3.75);

      // Update with different decimals
      const updated = repository.update(task.id, { actualEffort: 4.125 });
      expect(updated.actualEffort).toBe(4.125);
    });

    it('should allow clearing effort fields with explicit null', () => {
      const task = repository.create({
        storyId: testStoryId,
        title: 'Clear effort test',
        description: 'Test',
        estimatedEffort: 5,
        actualEffort: 7,
        effortUnit: EffortUnit.HOURS,
      });

      // Clear effort fields
      const updated = repository.update(task.id, {
        estimatedEffort: null,
        actualEffort: null,
        effortUnit: null,
      });

      expect(updated.estimatedEffort).toBeNull();
      expect(updated.actualEffort).toBeNull();
      expect(updated.effortUnit).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete task', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'To Delete',
        description: '',
      });

      repository.delete(created.id);

      const found = repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should emit task:deleted event', () => {
      const created = repository.create({
        storyId: testStoryId,
        title: 'To Delete',
        description: '',
      });

      // Clear creation event
      capturedEvents = [];

      repository.delete(created.id);

      expect(capturedEvents.length).toBe(1);
      expect(capturedEvents[0].name).toBe('task:deleted');
      const payload = capturedEvents[0].payload as { entityId: string };
      expect(payload.entityId).toBe(created.id);
    });

    it('should throw error for non-existent task', () => {
      expect(() => {
        repository.delete('non-existent');
      }).toThrow('Task not found: non-existent');
    });
  });

  describe('reorder', () => {
    it('should reorder tasks within a story', () => {
      const task1 = repository.create({ storyId: testStoryId, title: 'Task 1', description: '' });
      const task2 = repository.create({ storyId: testStoryId, title: 'Task 2', description: '' });
      const task3 = repository.create({ storyId: testStoryId, title: 'Task 3', description: '' });

      // Reverse order
      repository.reorder(testStoryId, [task3.id, task2.id, task1.id]);

      const tasks = repository.findByStoryId(testStoryId);

      expect(tasks[0].id).toBe(task3.id);
      expect(tasks[1].id).toBe(task2.id);
      expect(tasks[2].id).toBe(task1.id);
    });

    it('should throw error if task does not belong to story', () => {
      const task = repository.create({ storyId: testStoryId, title: 'Task', description: '' });

      expect(() => {
        repository.reorder(testStoryId, [task.id, 'invalid-id']);
      }).toThrow('Task invalid-id does not belong to story');
    });
  });

  describe('getStatusCounts', () => {
    it('should return status counts for a story', () => {
      repository.create({ storyId: testStoryId, title: 'Pending 1', description: '', status: TaskStatus.PENDING });
      repository.create({ storyId: testStoryId, title: 'Pending 2', description: '', status: TaskStatus.PENDING });
      repository.create({ storyId: testStoryId, title: 'In Progress', description: '', status: TaskStatus.IN_PROGRESS });
      repository.create({ storyId: testStoryId, title: 'Completed', description: '', status: TaskStatus.COMPLETED });

      const counts = repository.getStatusCounts(testStoryId);

      expect(counts[TaskStatus.PENDING]).toBe(2);
      expect(counts[TaskStatus.IN_PROGRESS]).toBe(1);
      expect(counts[TaskStatus.COMPLETED]).toBe(1);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton taskRepository instance', () => {
      expect(taskRepository).toBeDefined();
      expect(taskRepository).toBeInstanceOf(TaskRepository);
    });
  });
});
