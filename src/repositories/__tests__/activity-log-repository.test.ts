/**
 * Tests for ActivityLogRepository
 *
 * Tests the activity log repository CRUD operations, filtering,
 * and cleanup functionality for the TUI activity panel.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, closeDb } from '../../db';
import { resetEventBus, eventBus } from '../../events';
import { ActivityLogRepository, activityLogRepository } from '../activity-log-repository';
import type { DataEvent } from '../../events';

describe('ActivityLogRepository', () => {
  let repository: ActivityLogRepository;
  let capturedEvents: DataEvent[] = [];

  beforeEach(() => {
    initDb({ dbPath: ':memory:', runMigrations: true });
    repository = new ActivityLogRepository();

    // Reset event capture
    capturedEvents = [];
    resetEventBus();

    // Capture data events
    eventBus.on('data', (e) => capturedEvents.push(e as DataEvent));
  });

  afterEach(() => {
    closeDb();
    resetEventBus();
  });

  describe('create', () => {
    it('should create a log entry with all required fields', () => {
      const log = repository.create({
        source: 'test-hook',
        message: 'Test log message',
      });

      expect(log).toBeDefined();
      expect(log.id).toBeDefined();
      expect(log.source).toBe('test-hook');
      expect(log.message).toBe('Test log message');
      expect(log.level).toBe('info'); // default level
      expect(log.timestamp).toBeDefined();
      expect(log.storyId).toBeNull();
      expect(log.metadata).toEqual({});
      expect(log.createdAt).toBeDefined();
    });

    it('should create a log entry with all fields including optional ones', () => {
      const log = repository.create({
        source: 'my-adapter',
        message: 'Something happened',
        level: 'warn',
        storyId: 'story-123',
        metadata: { key: 'value', count: 42 },
      });

      expect(log.source).toBe('my-adapter');
      expect(log.message).toBe('Something happened');
      expect(log.level).toBe('warn');
      expect(log.storyId).toBe('story-123');
      expect(log.metadata).toEqual({ key: 'value', count: 42 });
    });

    it('should create log entry with error level', () => {
      const log = repository.create({
        source: 'error-source',
        message: 'Error occurred',
        level: 'error',
      });

      expect(log.level).toBe('error');
    });

    it('should emit data event on create', () => {
      const log = repository.create({
        source: 'test-hook',
        message: 'Test message',
      });

      const event = capturedEvents.find(
        (e) => e.table === 'activity_logs' && e.id === log.id
      );
      expect(event).toBeDefined();
      expect(event!.type).toBe('created');
    });

    it('should generate unique IDs for each log entry', () => {
      const log1 = repository.create({ source: 'src', message: 'msg1' });
      const log2 = repository.create({ source: 'src', message: 'msg2' });
      const log3 = repository.create({ source: 'src', message: 'msg3' });

      expect(log1.id).not.toBe(log2.id);
      expect(log2.id).not.toBe(log3.id);
      expect(log1.id).not.toBe(log3.id);
    });
  });

  describe('findById', () => {
    it('should find log entry by ID', () => {
      const created = repository.create({
        source: 'test-source',
        message: 'Test message',
      });

      const found = repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.source).toBe('test-source');
      expect(found!.message).toBe('Test message');
    });

    it('should return null for non-existent ID', () => {
      const found = repository.findById('non-existent-id');
      expect(found).toBeNull();
    });

    it('should deserialize metadata correctly', () => {
      const created = repository.create({
        source: 'test',
        message: 'msg',
        metadata: { nested: { value: 123 }, array: [1, 2, 3] },
      });

      const found = repository.findById(created.id);

      expect(found!.metadata).toEqual({
        nested: { value: 123 },
        array: [1, 2, 3],
      });
    });
  });

  describe('findRecent', () => {
    it('should return logs with default limit', () => {
      // Create 15 logs
      for (let i = 0; i < 15; i++) {
        repository.create({ source: 'src', message: `msg ${i}` });
      }

      const logs = repository.findRecent();

      expect(logs).toHaveLength(10); // default limit
    });

    it('should respect custom limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        repository.create({ source: 'src', message: `msg ${i}` });
      }

      const logs = repository.findRecent(5);

      expect(logs).toHaveLength(5);
    });

    it('should return logs in DESC order (newest first)', () => {
      // Create logs with different sources to identify order
      repository.create({ source: 'first', message: 'First created' });
      repository.create({ source: 'second', message: 'Second created' });
      repository.create({ source: 'third', message: 'Third created' });

      const logs = repository.findRecent(10);

      // Most recent (third) should be first
      expect(logs[0].source).toBe('third');
      expect(logs[1].source).toBe('second');
      expect(logs[2].source).toBe('first');
    });

    it('should filter by storyId when provided', () => {
      repository.create({ source: 'src', message: 'msg1', storyId: 'story-A' });
      repository.create({ source: 'src', message: 'msg2', storyId: 'story-A' });
      repository.create({ source: 'src', message: 'msg3', storyId: 'story-B' });
      repository.create({ source: 'src', message: 'msg4' }); // no story

      const logs = repository.findRecent(10, 'story-A');

      expect(logs).toHaveLength(2);
      for (const log of logs) {
        expect(log.storyId).toBe('story-A');
      }
    });

    it('should return empty array when no logs exist', () => {
      const logs = repository.findRecent();
      expect(logs).toEqual([]);
    });

    it('should return empty array when storyId filter matches nothing', () => {
      repository.create({ source: 'src', message: 'msg', storyId: 'story-A' });

      const logs = repository.findRecent(10, 'non-existent-story');

      expect(logs).toEqual([]);
    });
  });

  describe('findBySource', () => {
    it('should find logs by source', () => {
      repository.create({ source: 'hook-a', message: 'msg1' });
      repository.create({ source: 'hook-a', message: 'msg2' });
      repository.create({ source: 'hook-b', message: 'msg3' });

      const logs = repository.findBySource('hook-a');

      expect(logs).toHaveLength(2);
      for (const log of logs) {
        expect(log.source).toBe('hook-a');
      }
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        repository.create({ source: 'my-source', message: `msg ${i}` });
      }

      const logs = repository.findBySource('my-source', 5);

      expect(logs).toHaveLength(5);
    });

    it('should return logs ordered by timestamp DESC', () => {
      repository.create({ source: 'src', message: 'first' });
      repository.create({ source: 'src', message: 'second' });
      repository.create({ source: 'src', message: 'third' });

      const logs = repository.findBySource('src');

      // Verify all logs are returned
      expect(logs).toHaveLength(3);
      const messages = logs.map(l => l.message);
      expect(messages).toContain('first');
      expect(messages).toContain('second');
      expect(messages).toContain('third');

      // Verify timestamps are in DESC order (or equal when created quickly)
      for (let i = 1; i < logs.length; i++) {
        expect(new Date(logs[i - 1].timestamp).getTime())
          .toBeGreaterThanOrEqual(new Date(logs[i].timestamp).getTime());
      }
    });

    it('should return empty array for non-existent source', () => {
      repository.create({ source: 'other', message: 'msg' });

      const logs = repository.findBySource('non-existent');

      expect(logs).toEqual([]);
    });

    it('should use default limit of 50', () => {
      // Create 60 logs
      for (let i = 0; i < 60; i++) {
        repository.create({ source: 'bulk', message: `msg ${i}` });
      }

      const logs = repository.findBySource('bulk');

      expect(logs).toHaveLength(50);
    });
  });

  describe('cleanup', () => {
    it('should delete logs older than specified date', () => {
      // Create logs
      const log1 = repository.create({ source: 'src', message: 'old log' });
      const log2 = repository.create({ source: 'src', message: 'new log' });

      // Set cutoff to future (delete all)
      const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour in future
      const deleted = repository.cleanup(futureDate);

      expect(deleted).toBe(2);
      expect(repository.findById(log1.id)).toBeNull();
      expect(repository.findById(log2.id)).toBeNull();
    });

    it('should not delete logs newer than cutoff date', () => {
      const log = repository.create({ source: 'src', message: 'recent log' });

      // Set cutoff to past (delete nothing recent)
      const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const deleted = repository.cleanup(pastDate);

      expect(deleted).toBe(0);
      expect(repository.findById(log.id)).not.toBeNull();
    });

    it('should return count of deleted entries', () => {
      for (let i = 0; i < 5; i++) {
        repository.create({ source: 'src', message: `msg ${i}` });
      }

      const futureDate = new Date(Date.now() + 1000);
      const deleted = repository.cleanup(futureDate);

      expect(deleted).toBe(5);
    });

    it('should return 0 when no logs to delete', () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60);
      const deleted = repository.cleanup(pastDate);

      expect(deleted).toBe(0);
    });

    it('should emit data event when logs are deleted', () => {
      repository.create({ source: 'src', message: 'msg' });

      // Clear events from create
      capturedEvents = [];

      const futureDate = new Date(Date.now() + 1000);
      repository.cleanup(futureDate);

      const event = capturedEvents.find(
        (e) => e.table === 'activity_logs' && e.type === 'deleted'
      );
      expect(event).toBeDefined();
      expect(event!.id).toBe('cleanup');
    });

    it('should not emit event when nothing deleted', () => {
      capturedEvents = [];

      const pastDate = new Date(Date.now() - 1000);
      repository.cleanup(pastDate);

      const deleteEvents = capturedEvents.filter(
        (e) => e.table === 'activity_logs' && e.type === 'deleted'
      );
      expect(deleteEvents).toHaveLength(0);
    });
  });

  describe('clearAll', () => {
    it('should delete all logs', () => {
      repository.create({ source: 'src1', message: 'msg1' });
      repository.create({ source: 'src2', message: 'msg2' });
      repository.create({ source: 'src3', message: 'msg3' });

      const deleted = repository.clearAll();

      expect(deleted).toBe(3);
      expect(repository.count()).toBe(0);
    });

    it('should return 0 when no logs exist', () => {
      const deleted = repository.clearAll();
      expect(deleted).toBe(0);
    });

    it('should emit data event when logs cleared', () => {
      repository.create({ source: 'src', message: 'msg' });
      capturedEvents = [];

      repository.clearAll();

      const event = capturedEvents.find(
        (e) => e.table === 'activity_logs' && e.type === 'deleted'
      );
      expect(event).toBeDefined();
      expect(event!.id).toBe('clear-all');
    });
  });

  describe('count', () => {
    it('should return correct count of logs', () => {
      expect(repository.count()).toBe(0);

      repository.create({ source: 'src', message: 'msg1' });
      expect(repository.count()).toBe(1);

      repository.create({ source: 'src', message: 'msg2' });
      expect(repository.count()).toBe(2);

      repository.create({ source: 'src', message: 'msg3' });
      expect(repository.count()).toBe(3);
    });

    it('should return 0 for empty database', () => {
      expect(repository.count()).toBe(0);
    });

    it('should reflect changes after cleanup', () => {
      for (let i = 0; i < 5; i++) {
        repository.create({ source: 'src', message: `msg ${i}` });
      }
      expect(repository.count()).toBe(5);

      const futureDate = new Date(Date.now() + 1000);
      repository.cleanup(futureDate);

      expect(repository.count()).toBe(0);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton activityLogRepository instance', () => {
      expect(activityLogRepository).toBeInstanceOf(ActivityLogRepository);
    });
  });

  describe('edge cases', () => {
    it('should handle empty message', () => {
      const log = repository.create({ source: 'src', message: '' });
      expect(log.message).toBe('');
    });

    it('should handle long messages', () => {
      const longMessage = 'x'.repeat(10000);
      const log = repository.create({ source: 'src', message: longMessage });
      expect(log.message).toBe(longMessage);

      const found = repository.findById(log.id);
      expect(found!.message).toBe(longMessage);
    });

    it('should handle special characters in source and message', () => {
      const log = repository.create({
        source: "hook's \"special\" <chars>",
        message: 'Line1\nLine2\tTabbed & more',
      });

      const found = repository.findById(log.id);
      expect(found!.source).toBe("hook's \"special\" <chars>");
      expect(found!.message).toBe('Line1\nLine2\tTabbed & more');
    });

    it('should handle complex metadata', () => {
      const complexMetadata = {
        string: 'value',
        number: 123.456,
        boolean: true,
        null: null,
        array: [1, 'two', { three: 3 }],
        nested: {
          deep: {
            value: 'found',
          },
        },
      };

      const log = repository.create({
        source: 'src',
        message: 'msg',
        metadata: complexMetadata,
      });

      const found = repository.findById(log.id);
      expect(found!.metadata).toEqual(complexMetadata);
    });
  });
});
