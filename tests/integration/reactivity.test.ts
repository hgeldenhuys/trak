/**
 * Integration Tests: Event-driven Reactivity
 *
 * Validates that the TUI receives events within 100ms latency requirements.
 * Tests event emission from repositories and payload correctness.
 *
 * AC-001: Event emission on entity mutations
 * AC-002: Latency under 100ms for all events
 * AC-003: Event payloads contain correct entity data
 *
 * Note: Due to a known issue where repositories inconsistently use eventBus vs
 * getEventBus(), we subscribe to the eventBus constant directly here to ensure
 * we receive events from all repositories (story/task use eventBus, feature uses
 * getEventBus()). This test validates the current behavior.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'bun:test';
import { initDb, closeDb, getDb, TABLES } from '../../src/db';
import { eventBus, getEventBus, resetEventBus } from '../../src/events';
import type { BoardEventName } from '../../src/events';
import {
  FeatureRepository,
  StoryRepository,
  TaskRepository,
} from '../../src/repositories';

/**
 * Simple inline harness that subscribes to BOTH eventBus constant AND
 * getEventBus() to capture events from all repositories.
 *
 * Note: There's an inconsistency in the codebase where FeatureRepository
 * uses getEventBus() while Story/Task repositories use the eventBus constant.
 * After resetEventBus(), these point to different instances. This harness
 * subscribes to both to ensure complete coverage.
 */
interface EventRecord {
  event: string;
  timestamp: number;
  payload: unknown;
}

class InlineTestHarness {
  public events: EventRecord[] = [];
  private listeners: Map<string, (payload: unknown) => void> = new Map();
  private getEventBusListeners: Map<string, (payload: unknown) => void> =
    new Map();

  constructor() {
    const eventTypes: BoardEventName[] = [
      'feature:created',
      'feature:updated',
      'feature:deleted',
      'story:created',
      'story:updated',
      'story:deleted',
      'story:status-changed',
      'task:created',
      'task:updated',
      'task:deleted',
      'task:status-changed',
    ];

    // Subscribe to eventBus constant (used by story/task repositories)
    for (const eventType of eventTypes) {
      const handler = (payload: unknown) => {
        this.events.push({
          event: eventType,
          timestamp: performance.now(),
          payload,
        });
      };
      this.listeners.set(eventType, handler);
      eventBus.on(eventType, handler);
    }

    // Also subscribe to getEventBus() (used by feature repository)
    // This handles the case where they're different instances after reset
    const bus = getEventBus();
    if (bus !== eventBus) {
      for (const eventType of eventTypes) {
        const handler = (payload: unknown) => {
          this.events.push({
            event: eventType,
            timestamp: performance.now(),
            payload,
          });
        };
        this.getEventBusListeners.set(eventType, handler);
        bus.on(eventType, handler);
      }
    }
  }

  getEventsByType(type: string): EventRecord[] {
    return this.events.filter((e) => e.event === type);
  }

  getLastEvent(): EventRecord | undefined {
    return this.events[this.events.length - 1];
  }

  clearEvents(): void {
    this.events = [];
  }

  cleanup(): void {
    // Clean up listeners from eventBus constant
    for (const [eventType, handler] of this.listeners) {
      eventBus.off(eventType as BoardEventName, handler);
    }
    this.listeners.clear();

    // Clean up listeners from getEventBus()
    const bus = getEventBus();
    for (const [eventType, handler] of this.getEventBusListeners) {
      bus.off(eventType as BoardEventName, handler);
    }
    this.getEventBusListeners.clear();

    this.events = [];
  }

  async measureLatency<T>(
    action: () => T,
    expectedEvent: string,
    timeout: number = 1000
  ): Promise<{ result: T; latencyMs: number }> {
    const start = performance.now();
    const result = action();

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${expectedEvent}`));
      }, timeout);

      const check = () => {
        const event = this.events.find(
          (e) => e.event === expectedEvent && e.timestamp >= start
        );
        if (event) {
          clearTimeout(timeoutId);
          resolve();
        } else {
          setTimeout(check, 1);
        }
      };
      check();
    });

    const event = this.events.find(
      (e) => e.event === expectedEvent && e.timestamp >= start
    );
    const latencyMs = event ? event.timestamp - start : -1;

    return { result, latencyMs };
  }

  getEventCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of this.events) {
      counts[event.event] = (counts[event.event] || 0) + 1;
    }
    return counts;
  }

  getTotalEventCount(): number {
    return this.events.length;
  }

  getEvents(): EventRecord[] {
    return [...this.events];
  }
}

describe('Event-driven reactivity', () => {
  let harness: InlineTestHarness;
  let featureRepo: FeatureRepository;
  let storyRepo: StoryRepository;
  let taskRepo: TaskRepository;

  beforeAll(() => {
    // Initialize in-memory database
    initDb({ dbPath: ':memory:' });
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    // Reset event bus and create fresh harness
    resetEventBus();
    harness = new InlineTestHarness();

    // Create fresh repository instances
    featureRepo = new FeatureRepository();
    featureRepo.clearCache();
    storyRepo = new StoryRepository();
    taskRepo = new TaskRepository();

    // Clean database tables
    const db = getDb();
    db.run('BEGIN TRANSACTION');
    try {
      db.run(`DELETE FROM ${TABLES.TASKS}`);
      db.run(`DELETE FROM ${TABLES.ACCEPTANCE_CRITERIA}`);
      db.run(`DELETE FROM ${TABLES.STORIES}`);
      db.run(`DELETE FROM ${TABLES.FEATURES}`);
      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  });

  afterEach(() => {
    harness.cleanup();
  });

  describe('Event emission', () => {
    test('feature:created emits on feature creation', () => {
      featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const events = harness.getEventsByType('feature:created');
      expect(events.length).toBe(1);
    });

    test('feature:updated emits on feature update', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      featureRepo.update(feature.id, { name: 'Updated Feature' });

      const events = harness.getEventsByType('feature:updated');
      expect(events.length).toBe(1);
    });

    test('feature:deleted emits on feature deletion', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      featureRepo.delete(feature.id);

      const events = harness.getEventsByType('feature:deleted');
      expect(events.length).toBe(1);
    });

    test('story:created emits on story creation', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });

      const events = harness.getEventsByType('story:created');
      expect(events.length).toBe(1);
    });

    test('story:status-changed emits on status update', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });

      storyRepo.updateStatus(story.id, 'in_progress');

      const events = harness.getEventsByType('story:status-changed');
      expect(events.length).toBe(1);
    });

    test('task:created emits on task creation', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });

      taskRepo.create({
        storyId: story.id,
        title: 'Test Task',
        description: 'A test task',
      });

      const events = harness.getEventsByType('task:created');
      expect(events.length).toBe(1);
    });

    test('task:status-changed emits on status update', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });

      const task = taskRepo.create({
        storyId: story.id,
        title: 'Test Task',
        description: 'A test task',
      });

      taskRepo.updateStatus(task.id, 'in_progress');

      const events = harness.getEventsByType('task:status-changed');
      expect(events.length).toBe(1);
    });

    test('task:deleted emits on task deletion', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });

      const task = taskRepo.create({
        storyId: story.id,
        title: 'Test Task',
        description: 'A test task',
      });

      taskRepo.delete(task.id);

      const events = harness.getEventsByType('task:deleted');
      expect(events.length).toBe(1);
    });
  });

  describe('Latency requirements', () => {
    test('feature creation event latency is under 100ms', async () => {
      const { latencyMs } = await harness.measureLatency(
        () =>
          featureRepo.create({
            code: 'FAST',
            name: 'Fast Feature',
            description: 'Testing latency',
          }),
        'feature:created'
      );

      expect(latencyMs).toBeLessThan(100);
      console.log(`Feature creation event latency: ${latencyMs.toFixed(2)}ms`);
    });

    test('story creation event latency is under 100ms', async () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });
      harness.clearEvents();

      const { latencyMs } = await harness.measureLatency(
        () =>
          storyRepo.create({
            featureId: feature.id,
            title: 'Fast Story',
            description: 'Testing latency',
            why: 'To test latency',
          }),
        'story:created'
      );

      expect(latencyMs).toBeLessThan(100);
      console.log(`Story creation event latency: ${latencyMs.toFixed(2)}ms`);
    });

    test('task creation event latency is under 100ms', async () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });
      harness.clearEvents();

      const { latencyMs } = await harness.measureLatency(
        () =>
          taskRepo.create({
            storyId: story.id,
            title: 'Fast Task',
            description: 'Testing latency',
          }),
        'task:created'
      );

      expect(latencyMs).toBeLessThan(100);
      console.log(`Task creation event latency: ${latencyMs.toFixed(2)}ms`);
    });

    test('task status change event latency is under 100ms', async () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });

      const task = taskRepo.create({
        storyId: story.id,
        title: 'Test Task',
        description: 'A test task',
      });
      harness.clearEvents();

      const { latencyMs } = await harness.measureLatency(
        () => taskRepo.updateStatus(task.id, 'in_progress'),
        'task:status-changed'
      );

      expect(latencyMs).toBeLessThan(100);
      console.log(
        `Task status change event latency: ${latencyMs.toFixed(2)}ms`
      );
    });

    test('bulk task creation events all under 100ms each', async () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });
      harness.clearEvents();

      const latencies: number[] = [];

      for (let i = 0; i < 10; i++) {
        const { latencyMs } = await harness.measureLatency(
          () =>
            taskRepo.create({
              storyId: story.id,
              title: `Task ${i}`,
              description: `Bulk task ${i}`,
            }),
          'task:created'
        );
        latencies.push(latencyMs);
        harness.clearEvents(); // Clear for next measurement
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      expect(maxLatency).toBeLessThan(100);
      console.log(
        `Bulk task creation - Avg: ${avgLatency.toFixed(2)}ms, Min: ${minLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms`
      );
    });

    test('sequential status updates all under 100ms each', async () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });

      // Create multiple tasks
      const tasks = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(
          taskRepo.create({
            storyId: story.id,
            title: `Task ${i}`,
            description: `Task ${i}`,
          })
        );
      }
      harness.clearEvents();

      const latencies: number[] = [];

      // Update each task status
      for (const task of tasks) {
        const { latencyMs } = await harness.measureLatency(
          () => taskRepo.updateStatus(task.id, 'in_progress'),
          'task:status-changed'
        );
        latencies.push(latencyMs);
        harness.clearEvents();
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);

      expect(maxLatency).toBeLessThan(100);
      console.log(
        `Sequential status updates - Avg: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms`
      );
    });
  });

  describe('Event payload correctness', () => {
    test('feature:created payload contains correct entity data', () => {
      const feature = featureRepo.create({
        code: 'PAYLOAD',
        name: 'Payload Test',
        description: 'Testing payload correctness',
      });

      const event = harness.getLastEvent();
      expect(event?.event).toBe('feature:created');

      const payload = event?.payload as {
        entityId: string;
        entity: { code: string; name: string; description: string };
        timestamp: string;
      };
      expect(payload.entityId).toBe(feature.id);
      expect(payload.entity.code).toBe('PAYLOAD');
      expect(payload.entity.name).toBe('Payload Test');
      expect(payload.entity.description).toBe('Testing payload correctness');
      expect(payload.timestamp).toBeDefined();
    });

    test('story:created payload contains correct entity data', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Payload Story',
        description: 'Testing story payload',
        why: 'To verify payloads',
      });

      const events = harness.getEventsByType('story:created');
      const event = events[0];
      expect(event).toBeDefined();

      const payload = event?.payload as {
        entityId: string;
        entity: { title: string; description: string; why: string };
      };
      expect(payload.entityId).toBe(story.id);
      expect(payload.entity.title).toBe('Payload Story');
      expect(payload.entity.description).toBe('Testing story payload');
      expect(payload.entity.why).toBe('To verify payloads');
    });

    test('task:created payload contains correct entity data', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });

      const task = taskRepo.create({
        storyId: story.id,
        title: 'My Task',
        description: 'Task description',
        priority: 'P0',
      });

      const events = harness.getEventsByType('task:created');
      const event = events[0];
      expect(event).toBeDefined();

      const payload = event?.payload as {
        entityId: string;
        entity: { title: string; priority: string };
      };
      expect(payload.entityId).toBe(task.id);
      expect(payload.entity.title).toBe('My Task');
      expect(payload.entity.priority).toBe('P0');
    });

    test('task:status-changed includes previousStatus and newStatus', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });

      const task = taskRepo.create({
        storyId: story.id,
        title: 'Status Task',
        description: 'Testing status change',
      });
      harness.clearEvents();

      taskRepo.updateStatus(task.id, 'completed');

      const event = harness.getLastEvent();
      expect(event?.event).toBe('task:status-changed');

      const payload = event?.payload as {
        entityId: string;
        entity: { status: string };
        previousStatus: string;
        newStatus: string;
      };
      expect(payload.entityId).toBe(task.id);
      expect(payload.previousStatus).toBe('pending');
      expect(payload.newStatus).toBe('completed');
      expect(payload.entity.status).toBe('completed');
    });

    test('story:status-changed includes previousStatus and newStatus', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Status Story',
        description: 'Testing status change',
        why: 'To test status',
      });
      harness.clearEvents();

      storyRepo.updateStatus(story.id, 'in_progress');

      const event = harness.getLastEvent();
      expect(event?.event).toBe('story:status-changed');

      const payload = event?.payload as {
        entityId: string;
        entity: { status: string };
        previousStatus: string;
        newStatus: string;
      };
      expect(payload.entityId).toBe(story.id);
      expect(payload.previousStatus).toBe('draft');
      expect(payload.newStatus).toBe('in_progress');
      expect(payload.entity.status).toBe('in_progress');
    });

    test('feature:updated includes previousState and changedFields', () => {
      const feature = featureRepo.create({
        code: 'UPDATE',
        name: 'Original Name',
        description: 'Original description',
      });
      harness.clearEvents();

      featureRepo.update(feature.id, { name: 'Updated Name' });

      const event = harness.getLastEvent();
      expect(event?.event).toBe('feature:updated');

      const payload = event?.payload as {
        entityId: string;
        entity: { name: string };
        previousState: { name: string };
        changedFields: string[];
      };
      expect(payload.entityId).toBe(feature.id);
      expect(payload.entity.name).toBe('Updated Name');
      expect(payload.previousState.name).toBe('Original Name');
      expect(payload.changedFields).toContain('name');
    });

    test('task:deleted contains the deleted entity state', () => {
      const feature = featureRepo.create({
        code: 'TEST',
        name: 'Test Feature',
        description: 'A test feature',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Test Story',
        description: 'A test story',
        why: 'To test things',
      });

      const task = taskRepo.create({
        storyId: story.id,
        title: 'To Delete',
        description: 'This will be deleted',
      });
      const taskId = task.id;
      harness.clearEvents();

      taskRepo.delete(taskId);

      const event = harness.getLastEvent();
      expect(event?.event).toBe('task:deleted');

      const payload = event?.payload as {
        entityId: string;
        entity: { id: string; title: string };
      };
      expect(payload.entityId).toBe(taskId);
      expect(payload.entity.id).toBe(taskId);
      expect(payload.entity.title).toBe('To Delete');
    });
  });

  describe('Event ordering and counts', () => {
    test('multiple events are received in correct order', () => {
      const feature = featureRepo.create({
        code: 'ORDER',
        name: 'Order Test',
        description: 'Testing order',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Order Story',
        description: 'Testing order',
        why: 'To test order',
      });

      taskRepo.create({
        storyId: story.id,
        title: 'Order Task',
        description: 'Testing order',
      });

      const events = harness.getEvents();
      expect(events.length).toBe(3);
      expect(events[0].event).toBe('feature:created');
      expect(events[1].event).toBe('story:created');
      expect(events[2].event).toBe('task:created');
    });

    test('event counts are accurate for bulk operations', () => {
      const feature = featureRepo.create({
        code: 'BULK',
        name: 'Bulk Test',
        description: 'Testing bulk',
      });

      const story = storyRepo.create({
        featureId: feature.id,
        title: 'Bulk Story',
        description: 'Testing bulk',
        why: 'To test bulk',
      });

      // Create 5 tasks
      for (let i = 0; i < 5; i++) {
        taskRepo.create({
          storyId: story.id,
          title: `Bulk Task ${i}`,
          description: `Task ${i}`,
        });
      }

      const counts = harness.getEventCounts();
      expect(counts['feature:created']).toBe(1);
      expect(counts['story:created']).toBe(1);
      expect(counts['task:created']).toBe(5);
      expect(harness.getTotalEventCount()).toBe(7);
    });
  });
});
