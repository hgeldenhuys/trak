/**
 * Integration Tests for Task CLI Commands
 *
 * Tests task CRUD operations, status transitions, filtering, and event emission.
 * Uses in-memory SQLite for fast, isolated tests.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { setupTestDb, cleanupTestDb, resetTestDb } from '../helpers/test-db';
import {
  FeatureRepository,
  StoryRepository,
  TaskRepository,
  taskRepository,
} from '../../src/repositories';
import { eventBus } from '../../src/events';
import { TaskStatus, Priority } from '../../src/types';
import type { Task, Story, Feature } from '../../src/types';

describe('board task commands', () => {
  let featureRepo: FeatureRepository;
  let storyRepo: StoryRepository;
  let taskRepo: TaskRepository;
  let storyId: string;
  let capturedEvents: Array<{ event: string; payload: unknown }>;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();

    // Create fresh repository instances
    featureRepo = new FeatureRepository();
    featureRepo.clearCache();
    storyRepo = new StoryRepository();
    taskRepo = new TaskRepository();

    // Create a feature and story for tasks
    const feature = featureRepo.create({
      code: 'TEST',
      name: 'Test Feature',
      description: '',
    });
    const story = storyRepo.create({
      featureId: feature.id,
      title: 'Test Story',
      description: '',
      why: '',
    });
    storyId = story.id;

    // Reset event bus and capture events
    // Note: We use eventBus directly (not getEventBus()) because the repositories
    // import and use the same eventBus const
    // We need to remove listeners from eventBus (not resetEventBus) because
    // the exported const holds the original instance
    eventBus.removeAllListeners();
    capturedEvents = [];

    eventBus.on('task:created', (payload) => {
      capturedEvents.push({ event: 'task:created', payload });
    });
    eventBus.on('task:updated', (payload) => {
      capturedEvents.push({ event: 'task:updated', payload });
    });
    eventBus.on('task:deleted', (payload) => {
      capturedEvents.push({ event: 'task:deleted', payload });
    });
    eventBus.on('task:status-changed', (payload) => {
      capturedEvents.push({ event: 'task:status-changed', payload });
    });
  });

  describe('create', () => {
    test('creates a task linked to story', () => {
      const task = taskRepo.create({
        storyId,
        title: 'Implement feature',
        description: 'Task description',
      });

      expect(task.title).toBe('Implement feature');
      expect(task.description).toBe('Task description');
      expect(task.storyId).toBe(storyId);
      expect(task.status).toBe('pending');
      expect(task.id).toBeDefined();
    });

    test('creates task with default status of pending', () => {
      const task = taskRepo.create({
        storyId,
        title: 'Default Status',
        description: '',
      });

      expect(task.status).toBe(TaskStatus.PENDING);
    });

    test('creates task with specified status', () => {
      const task = taskRepo.create({
        storyId,
        title: 'In Progress',
        description: '',
        status: TaskStatus.IN_PROGRESS,
      });

      expect(task.status).toBe(TaskStatus.IN_PROGRESS);
    });

    test('creates task with default priority of P2', () => {
      const task = taskRepo.create({
        storyId,
        title: 'Default Priority',
        description: '',
      });

      expect(task.priority).toBe(Priority.P2);
    });

    test('creates task with specified priority', () => {
      const task = taskRepo.create({
        storyId,
        title: 'High Priority',
        description: '',
        priority: Priority.P0,
      });

      expect(task.priority).toBe(Priority.P0);
    });

    test('creates task with assigned user', () => {
      const task = taskRepo.create({
        storyId,
        title: 'Assigned Task',
        description: '',
        assignedTo: 'backend-dev',
      });

      expect(task.assignedTo).toBe('backend-dev');
    });

    test('creates task with dependencies', () => {
      const task = taskRepo.create({
        storyId,
        title: 'Dependent Task',
        description: '',
        dependencies: ['task-1', 'task-2'],
      });

      expect(task.dependencies).toEqual(['task-1', 'task-2']);
    });

    test('creates task with AC coverage', () => {
      const task = taskRepo.create({
        storyId,
        title: 'AC Task',
        description: '',
        acCoverage: ['ac-1', 'ac-2'],
      });

      expect(task.acCoverage).toEqual(['ac-1', 'ac-2']);
    });

    test('creates task with estimated complexity', () => {
      const task = taskRepo.create({
        storyId,
        title: 'Complex Task',
        description: '',
        estimatedComplexity: 'high',
      });

      expect(task.estimatedComplexity).toBe('high');
    });

    test('creates task with extensions', () => {
      const task = taskRepo.create({
        storyId,
        title: 'Extended Task',
        description: '',
        extensions: { customField: 'customValue' },
      });

      expect(task.extensions).toEqual({ customField: 'customValue' });
    });

    test('auto-increments order for tasks in same story', () => {
      const t1 = taskRepo.create({ storyId, title: 'Task 1', description: '' });
      const t2 = taskRepo.create({ storyId, title: 'Task 2', description: '' });
      const t3 = taskRepo.create({ storyId, title: 'Task 3', description: '' });

      expect(t1.order).toBe(0);
      expect(t2.order).toBe(1);
      expect(t3.order).toBe(2);
    });

    test('respects specified order', () => {
      const task = taskRepo.create({
        storyId,
        title: 'Ordered Task',
        description: '',
        order: 10,
      });

      expect(task.order).toBe(10);
    });

    test('emits task:created event', () => {
      const task = taskRepo.create({
        storyId,
        title: 'Event Task',
        description: '',
      });

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('task:created');
      expect((capturedEvents[0].payload as { entityId: string }).entityId).toBe(task.id);
    });
  });

  describe('list', () => {
    test('returns empty array when no tasks exist', () => {
      const tasks = taskRepo.findAll();
      expect(tasks).toEqual([]);
    });

    test('returns all tasks', () => {
      taskRepo.create({ storyId, title: 'Task 1', description: '' });
      taskRepo.create({ storyId, title: 'Task 2', description: '' });

      const tasks = taskRepo.findAll();
      expect(tasks.length).toBe(2);
    });

    test('returns tasks for specific story', () => {
      taskRepo.create({ storyId, title: 'Task 1', description: '' });
      taskRepo.create({ storyId, title: 'Task 2', description: '' });

      const tasks = taskRepo.findByStoryId(storyId);

      expect(tasks.length).toBe(2);
      expect(tasks[0].title).toBe('Task 1');
      expect(tasks[1].title).toBe('Task 2');
    });

    test('returns tasks in order', () => {
      taskRepo.create({ storyId, title: 'Task C', description: '', order: 2 });
      taskRepo.create({ storyId, title: 'Task A', description: '', order: 0 });
      taskRepo.create({ storyId, title: 'Task B', description: '', order: 1 });

      const tasks = taskRepo.findByStoryId(storyId);

      expect(tasks[0].title).toBe('Task A');
      expect(tasks[1].title).toBe('Task B');
      expect(tasks[2].title).toBe('Task C');
    });
  });

  describe('get by id', () => {
    test('finds task by id', () => {
      const created = taskRepo.create({
        storyId,
        title: 'Find Me',
        description: 'Test',
      });

      const found = taskRepo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('Find Me');
    });

    test('returns null for non-existent id', () => {
      const found = taskRepo.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    let task: Task;

    beforeEach(() => {
      task = taskRepo.create({
        storyId,
        title: 'Original Title',
        description: 'Original description',
      });
      capturedEvents = [];
    });

    test('updates task title', () => {
      const updated = taskRepo.update(task.id, { title: 'New Title' });

      expect(updated.title).toBe('New Title');
      expect(updated.description).toBe('Original description');
    });

    test('updates task description', () => {
      const updated = taskRepo.update(task.id, { description: 'New description' });

      expect(updated.description).toBe('New description');
      expect(updated.title).toBe('Original Title');
    });

    test('updates task priority', () => {
      const updated = taskRepo.update(task.id, { priority: Priority.P0 });

      expect(updated.priority).toBe(Priority.P0);
    });

    test('updates task assignedTo', () => {
      const updated = taskRepo.update(task.id, { assignedTo: 'frontend-dev' });

      expect(updated.assignedTo).toBe('frontend-dev');
    });

    test('updates task dependencies', () => {
      const updated = taskRepo.update(task.id, {
        dependencies: ['dep-1', 'dep-2'],
      });

      expect(updated.dependencies).toEqual(['dep-1', 'dep-2']);
    });

    test('updates task AC coverage', () => {
      const updated = taskRepo.update(task.id, {
        acCoverage: ['ac-1', 'ac-2'],
      });

      expect(updated.acCoverage).toEqual(['ac-1', 'ac-2']);
    });

    test('updates task estimated complexity', () => {
      const updated = taskRepo.update(task.id, { estimatedComplexity: 'high' });

      expect(updated.estimatedComplexity).toBe('high');
    });

    test('updates task extensions', () => {
      const updated = taskRepo.update(task.id, {
        extensions: { newField: 'newValue' },
      });

      expect(updated.extensions).toEqual({ newField: 'newValue' });
    });

    test('updates task order', () => {
      const updated = taskRepo.update(task.id, { order: 5 });

      expect(updated.order).toBe(5);
    });

    test('updates multiple fields at once', () => {
      const updated = taskRepo.update(task.id, {
        title: 'New Title',
        description: 'New Desc',
        priority: Priority.P1,
        estimatedComplexity: 'low',
      });

      expect(updated.title).toBe('New Title');
      expect(updated.description).toBe('New Desc');
      expect(updated.priority).toBe(Priority.P1);
      expect(updated.estimatedComplexity).toBe('low');
    });

    test('emits task:updated event with changed fields', () => {
      taskRepo.update(task.id, { title: 'New Title' });

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('task:updated');

      const payload = capturedEvents[0].payload as {
        entityId: string;
        changedFields: (keyof Task)[];
      };

      expect(payload.entityId).toBe(task.id);
      expect(payload.changedFields).toContain('title');
    });

    test('throws error for non-existent task', () => {
      expect(() => {
        taskRepo.update('non-existent-id', { title: 'New' });
      }).toThrow('Task not found');
    });
  });

  describe('update status', () => {
    let task: Task;

    beforeEach(() => {
      task = taskRepo.create({
        storyId,
        title: 'Status Task',
        description: '',
      });
      capturedEvents = [];
    });

    test('updates task status', () => {
      const updated = taskRepo.updateStatus(task.id, TaskStatus.IN_PROGRESS);

      expect(updated.status).toBe(TaskStatus.IN_PROGRESS);
    });

    test('emits task:status-changed event', () => {
      taskRepo.updateStatus(task.id, TaskStatus.COMPLETED);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('task:status-changed');

      const payload = capturedEvents[0].payload as {
        entityId: string;
        previousStatus: TaskStatus;
        newStatus: TaskStatus;
      };

      expect(payload.entityId).toBe(task.id);
      expect(payload.previousStatus).toBe(TaskStatus.PENDING);
      expect(payload.newStatus).toBe(TaskStatus.COMPLETED);
    });

    test('does not emit event if status unchanged', () => {
      taskRepo.updateStatus(task.id, TaskStatus.PENDING);

      expect(capturedEvents).toHaveLength(0);
    });

    test('returns same task if status unchanged', () => {
      const result = taskRepo.updateStatus(task.id, TaskStatus.PENDING);

      expect(result.id).toBe(task.id);
      expect(result.status).toBe(TaskStatus.PENDING);
    });

    test('transitions through all status values', () => {
      let updated = taskRepo.updateStatus(task.id, TaskStatus.IN_PROGRESS);
      expect(updated.status).toBe(TaskStatus.IN_PROGRESS);

      updated = taskRepo.updateStatus(task.id, TaskStatus.BLOCKED);
      expect(updated.status).toBe(TaskStatus.BLOCKED);

      updated = taskRepo.updateStatus(task.id, TaskStatus.IN_PROGRESS);
      expect(updated.status).toBe(TaskStatus.IN_PROGRESS);

      updated = taskRepo.updateStatus(task.id, TaskStatus.COMPLETED);
      expect(updated.status).toBe(TaskStatus.COMPLETED);
    });

    test('throws error for non-existent task', () => {
      expect(() => {
        taskRepo.updateStatus('non-existent', TaskStatus.COMPLETED);
      }).toThrow('Task not found');
    });
  });

  describe('delete', () => {
    let task: Task;

    beforeEach(() => {
      task = taskRepo.create({
        storyId,
        title: 'Delete Me',
        description: '',
      });
      capturedEvents = [];
    });

    test('deletes the task', () => {
      taskRepo.delete(task.id);

      const found = taskRepo.findById(task.id);
      expect(found).toBeNull();
    });

    test('removes task from list', () => {
      const before = taskRepo.findAll();
      expect(before.length).toBe(1);

      taskRepo.delete(task.id);

      const after = taskRepo.findAll();
      expect(after.length).toBe(0);
    });

    test('emits task:deleted event', () => {
      taskRepo.delete(task.id);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('task:deleted');

      const payload = capturedEvents[0].payload as {
        entityId: string;
        entity: Task;
      };

      expect(payload.entityId).toBe(task.id);
      expect(payload.entity.title).toBe('Delete Me');
    });

    test('throws error for non-existent task', () => {
      expect(() => {
        taskRepo.delete('non-existent-id');
      }).toThrow('Task not found');
    });
  });

  describe('filtering', () => {
    beforeEach(() => {
      // Create various tasks for filtering tests
      taskRepo.create({
        storyId,
        title: 'Pending 1',
        description: '',
        status: TaskStatus.PENDING,
        assignedTo: 'backend-dev',
      });
      taskRepo.create({
        storyId,
        title: 'Pending 2',
        description: '',
        status: TaskStatus.PENDING,
        assignedTo: 'frontend-dev',
      });
      taskRepo.create({
        storyId,
        title: 'In Progress',
        description: '',
        status: TaskStatus.IN_PROGRESS,
        assignedTo: 'backend-dev',
      });
      taskRepo.create({
        storyId,
        title: 'Completed',
        description: '',
        status: TaskStatus.COMPLETED,
        assignedTo: 'backend-dev',
      });
    });

    test('filters by status', () => {
      const pending = taskRepo.findByStatus(TaskStatus.PENDING);
      const completed = taskRepo.findByStatus(TaskStatus.COMPLETED);

      expect(pending.length).toBe(2);
      expect(completed.length).toBe(1);
    });

    test('filters by status using findAll', () => {
      const pending = taskRepo.findAll({ status: TaskStatus.PENDING });
      const inProgress = taskRepo.findAll({ status: TaskStatus.IN_PROGRESS });

      expect(pending.length).toBe(2);
      expect(inProgress.length).toBe(1);
    });

    test('filters by assignedTo', () => {
      const backendTasks = taskRepo.findAll({ assignedTo: 'backend-dev' });
      const frontendTasks = taskRepo.findAll({ assignedTo: 'frontend-dev' });

      expect(backendTasks.length).toBe(3);
      expect(frontendTasks.length).toBe(1);
    });

    test('filters by storyId', () => {
      // Create another story with tasks
      const feature2 = featureRepo.create({ code: 'F2', name: 'Feature 2', description: '' });
      const story2 = storyRepo.create({
        featureId: feature2.id,
        title: 'Story 2',
        description: '',
        why: '',
      });
      taskRepo.create({ storyId: story2.id, title: 'Other Task', description: '' });

      const story1Tasks = taskRepo.findAll({ storyId });
      const story2Tasks = taskRepo.findAll({ storyId: story2.id });

      expect(story1Tasks.length).toBe(4);
      expect(story2Tasks.length).toBe(1);
    });

    test('combines multiple filters', () => {
      const tasks = taskRepo.findAll({
        storyId,
        status: TaskStatus.PENDING,
        assignedTo: 'backend-dev',
      });

      expect(tasks.length).toBe(1);
      expect(tasks[0].title).toBe('Pending 1');
    });
  });

  describe('reorder', () => {
    test('reorders tasks within a story', () => {
      const t1 = taskRepo.create({ storyId, title: 'Task 1', description: '' });
      const t2 = taskRepo.create({ storyId, title: 'Task 2', description: '' });
      const t3 = taskRepo.create({ storyId, title: 'Task 3', description: '' });

      // Reverse order
      taskRepo.reorder(storyId, [t3.id, t2.id, t1.id]);

      const tasks = taskRepo.findByStoryId(storyId);

      expect(tasks[0].id).toBe(t3.id);
      expect(tasks[1].id).toBe(t2.id);
      expect(tasks[2].id).toBe(t1.id);
    });

    test('throws error if task does not belong to story', () => {
      const task = taskRepo.create({ storyId, title: 'Task', description: '' });

      expect(() => {
        taskRepo.reorder(storyId, [task.id, 'invalid-id']);
      }).toThrow('Task invalid-id does not belong to story');
    });
  });

  describe('status counts', () => {
    test('returns status counts for a story', () => {
      taskRepo.create({ storyId, title: 'Pending 1', description: '', status: TaskStatus.PENDING });
      taskRepo.create({ storyId, title: 'Pending 2', description: '', status: TaskStatus.PENDING });
      taskRepo.create({ storyId, title: 'In Progress', description: '', status: TaskStatus.IN_PROGRESS });
      taskRepo.create({ storyId, title: 'Completed', description: '', status: TaskStatus.COMPLETED });

      const counts = taskRepo.getStatusCounts(storyId);

      expect(counts[TaskStatus.PENDING]).toBe(2);
      expect(counts[TaskStatus.IN_PROGRESS]).toBe(1);
      expect(counts[TaskStatus.COMPLETED]).toBe(1);
    });

    test('returns empty object for story with no tasks', () => {
      const counts = taskRepo.getStatusCounts(storyId);
      expect(counts).toEqual({});
    });
  });

  describe('JSON output format', () => {
    test('task has correct JSON structure', () => {
      const task = taskRepo.create({
        storyId,
        title: 'JSON Task',
        description: 'Description',
        priority: Priority.P1,
        assignedTo: 'developer',
        dependencies: ['dep-1'],
        acCoverage: ['ac-1'],
        estimatedComplexity: 'high',
        extensions: { key: 'value' },
      });

      // Verify all expected fields are present
      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('storyId');
      expect(task).toHaveProperty('title');
      expect(task).toHaveProperty('description');
      expect(task).toHaveProperty('status');
      expect(task).toHaveProperty('priority');
      expect(task).toHaveProperty('assignedTo');
      expect(task).toHaveProperty('order');
      expect(task).toHaveProperty('dependencies');
      expect(task).toHaveProperty('acCoverage');
      expect(task).toHaveProperty('estimatedComplexity');
      expect(task).toHaveProperty('extensions');
      expect(task).toHaveProperty('createdAt');
      expect(task).toHaveProperty('updatedAt');

      // Verify types
      expect(typeof task.id).toBe('string');
      expect(typeof task.storyId).toBe('string');
      expect(typeof task.title).toBe('string');
      expect(typeof task.status).toBe('string');
      expect(typeof task.order).toBe('number');
      expect(Array.isArray(task.dependencies)).toBe(true);
      expect(Array.isArray(task.acCoverage)).toBe(true);
    });

    test('task serializes to valid JSON', () => {
      const task = taskRepo.create({
        storyId,
        title: 'Serialize Test',
        description: 'Desc',
        dependencies: ['dep-1', 'dep-2'],
        extensions: { nested: { key: 'value' } },
      });

      const json = JSON.stringify(task);
      const parsed = JSON.parse(json);

      expect(parsed.title).toBe('Serialize Test');
      expect(parsed.dependencies).toEqual(['dep-1', 'dep-2']);
      expect(parsed.extensions.nested.key).toBe('value');
    });
  });

  describe('singleton instance', () => {
    test('exports a singleton taskRepository instance', () => {
      expect(taskRepository).toBeDefined();
      expect(taskRepository).toBeInstanceOf(TaskRepository);
    });
  });
});
