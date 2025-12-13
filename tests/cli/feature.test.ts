/**
 * Integration Tests for Feature CLI Commands
 *
 * Tests feature CRUD operations, validation, and event emission.
 * Uses in-memory SQLite for fast, isolated tests.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { setupTestDb, cleanupTestDb, resetTestDb } from '../helpers/test-db';
import { FeatureRepository, featureRepository } from '../../src/repositories';
import { getEventBus, resetEventBus } from '../../src/events';
import type { Feature } from '../../src/types';

describe('board feature commands', () => {
  let repository: FeatureRepository;
  let capturedEvents: Array<{ event: string; payload: unknown }>;

  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();

    // Create fresh repository instance that uses the singleton db
    repository = new FeatureRepository();
    repository.clearCache();

    // Reset and capture events
    resetEventBus();
    capturedEvents = [];

    const eventBus = getEventBus();
    eventBus.on('feature:created', (payload) => {
      capturedEvents.push({ event: 'feature:created', payload });
    });
    eventBus.on('feature:updated', (payload) => {
      capturedEvents.push({ event: 'feature:updated', payload });
    });
    eventBus.on('feature:deleted', (payload) => {
      capturedEvents.push({ event: 'feature:deleted', payload });
    });
  });

  describe('create', () => {
    test('creates a feature with code and name', () => {
      const feature = repository.create({
        code: 'NOTIFY',
        name: 'Notification System',
        description: 'Handle notifications',
      });

      expect(feature.code).toBe('NOTIFY');
      expect(feature.name).toBe('Notification System');
      expect(feature.description).toBe('Handle notifications');
      expect(feature.id).toBeDefined();
      expect(feature.storyCounter).toBe(0);
      expect(feature.createdAt).toBeDefined();
      expect(feature.updatedAt).toBeDefined();
    });

    test('creates a feature with minimal fields', () => {
      const feature = repository.create({
        code: 'MIN',
        name: 'Minimal Feature',
        description: '',
      });

      expect(feature.code).toBe('MIN');
      expect(feature.name).toBe('Minimal Feature');
      expect(feature.description).toBe('');
      expect(feature.extensions).toEqual({});
    });

    test('creates a feature with extensions', () => {
      const feature = repository.create({
        code: 'EXT',
        name: 'Extended Feature',
        description: 'Has extensions',
        extensions: { priority: 'high', team: 'backend' },
      });

      expect(feature.extensions).toEqual({ priority: 'high', team: 'backend' });
    });

    test('uppercases the feature code', () => {
      const feature = repository.create({
        code: 'lowercase',
        name: 'Test',
        description: '',
      });

      expect(feature.code).toBe('LOWERCASE');
    });

    test('rejects duplicate feature codes', () => {
      repository.create({ code: 'DUP', name: 'First', description: '' });

      expect(() => {
        repository.create({ code: 'DUP', name: 'Second', description: '' });
      }).toThrow();
    });

    test('rejects duplicate codes regardless of case', () => {
      repository.create({ code: 'CASE', name: 'First', description: '' });

      expect(() => {
        repository.create({ code: 'case', name: 'Second', description: '' });
      }).toThrow();
    });

    test('emits feature:created event', () => {
      const feature = repository.create({
        code: 'EVENT',
        name: 'Event Test',
        description: '',
      });

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('feature:created');
      expect((capturedEvents[0].payload as { entityId: string }).entityId).toBe(feature.id);
      expect((capturedEvents[0].payload as { entity: Feature }).entity).toEqual(feature);
    });
  });

  describe('list', () => {
    test('returns empty array when no features exist', () => {
      const features = repository.findAll();
      expect(features).toEqual([]);
    });

    test('returns all features', () => {
      repository.create({ code: 'A', name: 'Feature A', description: '' });
      repository.create({ code: 'B', name: 'Feature B', description: '' });

      const features = repository.findAll();
      expect(features.length).toBe(2);
    });

    test('returns features in creation order', () => {
      repository.create({ code: 'FIRST', name: 'First', description: '' });
      repository.create({ code: 'SECOND', name: 'Second', description: '' });
      repository.create({ code: 'THIRD', name: 'Third', description: '' });

      const features = repository.findAll();
      expect(features[0].code).toBe('FIRST');
      expect(features[1].code).toBe('SECOND');
      expect(features[2].code).toBe('THIRD');
    });
  });

  describe('get by id', () => {
    test('finds feature by id', () => {
      const created = repository.create({
        code: 'FIND',
        name: 'Find Me',
        description: 'Test',
      });

      const found = repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.code).toBe('FIND');
    });

    test('returns null for non-existent id', () => {
      const found = repository.findById('non-existent-uuid');
      expect(found).toBeNull();
    });
  });

  describe('get by code', () => {
    test('finds feature by code', () => {
      repository.create({
        code: 'SEARCH',
        name: 'Searchable',
        description: 'Test',
      });

      const found = repository.findByCode('SEARCH');

      expect(found).not.toBeNull();
      expect(found!.code).toBe('SEARCH');
      expect(found!.name).toBe('Searchable');
    });

    test('finds feature by code case-insensitively', () => {
      repository.create({
        code: 'CASETEST',
        name: 'Case Test',
        description: '',
      });

      const found = repository.findByCode('casetest');

      expect(found).not.toBeNull();
      expect(found!.code).toBe('CASETEST');
    });

    test('returns null for non-existent code', () => {
      const found = repository.findByCode('NONEXISTENT');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    let feature: Feature;

    beforeEach(() => {
      feature = repository.create({
        code: 'UPD',
        name: 'Update Me',
        description: 'Original description',
      });
      capturedEvents = [];
    });

    test('updates feature name', () => {
      const updated = repository.update(feature.id, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Original description');
      expect(updated.code).toBe('UPD'); // Code should not change
    });

    test('updates feature description', () => {
      const updated = repository.update(feature.id, { description: 'New description' });

      expect(updated.description).toBe('New description');
      expect(updated.name).toBe('Update Me');
    });

    test('updates feature extensions', () => {
      const updated = repository.update(feature.id, {
        extensions: { newKey: 'newValue' },
      });

      expect(updated.extensions).toEqual({ newKey: 'newValue' });
    });

    test('updates multiple fields at once', () => {
      const updated = repository.update(feature.id, {
        name: 'New Name',
        description: 'New Description',
        extensions: { updated: true },
      });

      expect(updated.name).toBe('New Name');
      expect(updated.description).toBe('New Description');
      expect(updated.extensions).toEqual({ updated: true });
    });

    test('updates updatedAt timestamp', async () => {
      const originalUpdatedAt = feature.updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = repository.update(feature.id, { name: 'New Name' });

      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });

    test('emits feature:updated event with changed fields', () => {
      repository.update(feature.id, { name: 'New Name', description: 'New Desc' });

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('feature:updated');

      const payload = capturedEvents[0].payload as {
        entityId: string;
        previousState: Feature;
        entity: Feature;
        changedFields: (keyof Feature)[];
      };

      expect(payload.entityId).toBe(feature.id);
      expect(payload.previousState.name).toBe('Update Me');
      expect(payload.entity.name).toBe('New Name');
      expect(payload.changedFields).toContain('name');
      expect(payload.changedFields).toContain('description');
    });

    test('throws error for non-existent feature', () => {
      expect(() => {
        repository.update('non-existent-id', { name: 'New Name' });
      }).toThrow('Feature not found: non-existent-id');
    });
  });

  describe('delete', () => {
    let feature: Feature;

    beforeEach(() => {
      feature = repository.create({
        code: 'DEL',
        name: 'Delete Me',
        description: 'To be deleted',
      });
      capturedEvents = [];
    });

    test('deletes the feature', () => {
      repository.delete(feature.id);

      const found = repository.findById(feature.id);
      expect(found).toBeNull();
    });

    test('removes feature from list', () => {
      const before = repository.findAll();
      expect(before.length).toBe(1);

      repository.delete(feature.id);

      const after = repository.findAll();
      expect(after.length).toBe(0);
    });

    test('emits feature:deleted event', () => {
      repository.delete(feature.id);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('feature:deleted');

      const payload = capturedEvents[0].payload as {
        entityId: string;
        entity: Feature;
      };

      expect(payload.entityId).toBe(feature.id);
      expect(payload.entity.code).toBe('DEL');
    });

    test('throws error for non-existent feature', () => {
      expect(() => {
        repository.delete('non-existent-id');
      }).toThrow('Feature not found: non-existent-id');
    });
  });

  describe('story counter', () => {
    test('increments story counter', () => {
      const feature = repository.create({
        code: 'CNT',
        name: 'Counter Test',
        description: '',
      });

      const count1 = repository.incrementStoryCounter(feature.id);
      const count2 = repository.incrementStoryCounter(feature.id);
      const count3 = repository.incrementStoryCounter(feature.id);

      expect(count1).toBe(1);
      expect(count2).toBe(2);
      expect(count3).toBe(3);
    });

    test('persists counter value', () => {
      const feature = repository.create({
        code: 'PERSIST',
        name: 'Persist Test',
        description: '',
      });

      repository.incrementStoryCounter(feature.id);
      repository.incrementStoryCounter(feature.id);

      const found = repository.findById(feature.id);
      expect(found!.storyCounter).toBe(2);
    });

    test('throws error for non-existent feature', () => {
      expect(() => {
        repository.incrementStoryCounter('non-existent-id');
      }).toThrow('Feature not found: non-existent-id');
    });
  });

  describe('JSON output format', () => {
    test('feature has correct JSON structure', () => {
      const feature = repository.create({
        code: 'JSON',
        name: 'JSON Test',
        description: 'Test description',
        extensions: { key: 'value' },
      });

      // Verify all expected fields are present
      expect(feature).toHaveProperty('id');
      expect(feature).toHaveProperty('code');
      expect(feature).toHaveProperty('name');
      expect(feature).toHaveProperty('description');
      expect(feature).toHaveProperty('storyCounter');
      expect(feature).toHaveProperty('extensions');
      expect(feature).toHaveProperty('createdAt');
      expect(feature).toHaveProperty('updatedAt');

      // Verify types
      expect(typeof feature.id).toBe('string');
      expect(typeof feature.code).toBe('string');
      expect(typeof feature.name).toBe('string');
      expect(typeof feature.description).toBe('string');
      expect(typeof feature.storyCounter).toBe('number');
      expect(typeof feature.extensions).toBe('object');
      expect(typeof feature.createdAt).toBe('string');
      expect(typeof feature.updatedAt).toBe('string');
    });

    test('feature serializes to valid JSON', () => {
      const feature = repository.create({
        code: 'SERIAL',
        name: 'Serialize Test',
        description: 'Test',
        extensions: { nested: { key: 'value' } },
      });

      const json = JSON.stringify(feature);
      const parsed = JSON.parse(json);

      expect(parsed.code).toBe('SERIAL');
      expect(parsed.extensions.nested.key).toBe('value');
    });
  });
});
