/**
 * Tests for HistoryRepository
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, closeDb } from '../../db';
import { HistoryRepository, historyRepository } from '../history-repository';
import { EntityType, HistoryAction } from '../../types';

describe('HistoryRepository', () => {
  let repository: HistoryRepository;

  beforeEach(() => {
    initDb({ dbPath: ':memory:', runMigrations: true });
    repository = new HistoryRepository();
  });

  afterEach(() => {
    closeDb();
  });

  describe('append', () => {
    it('should append a history entry with required fields', () => {
      const entry = repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-123',
        action: HistoryAction.CREATED,
        actor: 'backend-dev',
        summary: 'Created story',
      });

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.entityType).toBe(EntityType.STORY);
      expect(entry.entityId).toBe('story-123');
      expect(entry.action).toBe(HistoryAction.CREATED);
      expect(entry.actor).toBe('backend-dev');
      expect(entry.summary).toBe('Created story');
      expect(entry.changes).toEqual({});
      expect(entry.previousState).toBeNull();
      expect(entry.extensions).toEqual({});
      expect(entry.createdAt).toBeDefined();
    });

    it('should append a history entry with optional fields', () => {
      const entry = repository.append({
        entityType: EntityType.TASK,
        entityId: 'task-456',
        action: HistoryAction.UPDATED,
        actor: 'frontend-dev',
        summary: 'Updated task status',
        changes: { status: 'completed' },
        previousState: { status: 'in_progress' },
        extensions: { source: 'cli' },
      });

      expect(entry.changes).toEqual({ status: 'completed' });
      expect(entry.previousState).toEqual({ status: 'in_progress' });
      expect(entry.extensions).toEqual({ source: 'cli' });
    });
  });

  describe('findById', () => {
    it('should find history entry by ID', () => {
      const created = repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-123',
        action: HistoryAction.CREATED,
        actor: 'backend-dev',
        summary: 'Created story',
      });

      const found = repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should return null for non-existent ID', () => {
      const found = repository.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByEntity', () => {
    it('should find all history entries for an entity', () => {
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-123',
        action: HistoryAction.CREATED,
        actor: 'backend-dev',
        summary: 'Created',
      });
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-123',
        action: HistoryAction.UPDATED,
        actor: 'backend-dev',
        summary: 'Updated',
      });
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-456',
        action: HistoryAction.CREATED,
        actor: 'frontend-dev',
        summary: 'Different story',
      });

      const entries = repository.findByEntity(EntityType.STORY, 'story-123');

      expect(entries).toHaveLength(2);
      // Both actions should be present (order may vary in fast tests)
      const actions = entries.map((e) => e.action);
      expect(actions).toContain(HistoryAction.CREATED);
      expect(actions).toContain(HistoryAction.UPDATED);
    });

    it('should return empty array for entity with no history', () => {
      const entries = repository.findByEntity(EntityType.STORY, 'non-existent');
      expect(entries).toHaveLength(0);
    });
  });

  describe('findByActor', () => {
    it('should find all history entries by actor', () => {
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-123',
        action: HistoryAction.CREATED,
        actor: 'backend-dev',
        summary: 'Created by backend',
      });
      repository.append({
        entityType: EntityType.TASK,
        entityId: 'task-456',
        action: HistoryAction.CREATED,
        actor: 'backend-dev',
        summary: 'Also by backend',
      });
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-789',
        action: HistoryAction.CREATED,
        actor: 'frontend-dev',
        summary: 'By frontend',
      });

      const entries = repository.findByActor('backend-dev');

      expect(entries).toHaveLength(2);
      for (const entry of entries) {
        expect(entry.actor).toBe('backend-dev');
      }
    });
  });

  describe('findRecent', () => {
    it('should find recent history entries with limit', () => {
      for (let i = 0; i < 10; i++) {
        repository.append({
          entityType: EntityType.STORY,
          entityId: `story-${i}`,
          action: HistoryAction.CREATED,
          actor: 'test',
          summary: `Entry ${i}`,
        });
      }

      const entries = repository.findRecent(5);

      expect(entries).toHaveLength(5);
      // All entries should be valid
      for (const entry of entries) {
        expect(entry.id).toBeDefined();
        expect(entry.entityId).toMatch(/^story-\d+$/);
      }
    });
  });

  describe('findByAction', () => {
    it('should find history entries by action type', () => {
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-1',
        action: HistoryAction.CREATED,
        actor: 'test',
        summary: 'Created',
      });
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-1',
        action: HistoryAction.UPDATED,
        actor: 'test',
        summary: 'Updated',
      });
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-2',
        action: HistoryAction.CREATED,
        actor: 'test',
        summary: 'Created again',
      });

      const entries = repository.findByAction(HistoryAction.CREATED);

      expect(entries).toHaveLength(2);
      for (const entry of entries) {
        expect(entry.action).toBe(HistoryAction.CREATED);
      }
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        repository.append({
          entityType: EntityType.STORY,
          entityId: `story-${i}`,
          action: HistoryAction.CREATED,
          actor: 'test',
          summary: `Entry ${i}`,
        });
      }

      const entries = repository.findByAction(HistoryAction.CREATED, 3);

      expect(entries).toHaveLength(3);
    });
  });

  describe('findByEntityType', () => {
    it('should find history entries by entity type', () => {
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-1',
        action: HistoryAction.CREATED,
        actor: 'test',
        summary: 'Story',
      });
      repository.append({
        entityType: EntityType.TASK,
        entityId: 'task-1',
        action: HistoryAction.CREATED,
        actor: 'test',
        summary: 'Task',
      });
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-2',
        action: HistoryAction.CREATED,
        actor: 'test',
        summary: 'Another story',
      });

      const entries = repository.findByEntityType(EntityType.STORY);

      expect(entries).toHaveLength(2);
      for (const entry of entries) {
        expect(entry.entityType).toBe(EntityType.STORY);
      }
    });
  });

  describe('findByTimeRange', () => {
    it('should find history entries within time range', () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-1',
        action: HistoryAction.CREATED,
        actor: 'test',
        summary: 'Recent',
      });

      const entries = repository.findByTimeRange(
        twoHoursAgo.toISOString(),
        now.toISOString()
      );

      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe('countByEntity', () => {
    it('should count history entries for an entity', () => {
      for (let i = 0; i < 5; i++) {
        repository.append({
          entityType: EntityType.STORY,
          entityId: 'story-123',
          action: HistoryAction.UPDATED,
          actor: 'test',
          summary: `Update ${i}`,
        });
      }

      const count = repository.countByEntity(EntityType.STORY, 'story-123');

      expect(count).toBe(5);
    });
  });

  describe('getActorStats', () => {
    it('should get action statistics for an actor', () => {
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-1',
        action: HistoryAction.CREATED,
        actor: 'backend-dev',
        summary: 'Created',
      });
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-1',
        action: HistoryAction.UPDATED,
        actor: 'backend-dev',
        summary: 'Updated',
      });
      repository.append({
        entityType: EntityType.STORY,
        entityId: 'story-1',
        action: HistoryAction.UPDATED,
        actor: 'backend-dev',
        summary: 'Updated again',
      });

      const stats = repository.getActorStats('backend-dev');

      expect(stats[HistoryAction.CREATED]).toBe(1);
      expect(stats[HistoryAction.UPDATED]).toBe(2);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton historyRepository instance', () => {
      expect(historyRepository).toBeInstanceOf(HistoryRepository);
    });
  });
});
