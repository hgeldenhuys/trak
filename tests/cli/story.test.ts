/**
 * Integration Tests for Story CLI Commands
 *
 * Tests story CRUD operations, status transitions, and event emission.
 * Uses in-memory SQLite for fast, isolated tests.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { setupTestDb, cleanupTestDb, resetTestDb } from '../helpers/test-db';
import {
  FeatureRepository,
  StoryRepository,
  storyRepository,
} from '../../src/repositories';
import { eventBus } from '../../src/events';
import { StoryStatus, Priority } from '../../src/types';
import type { Story, Feature } from '../../src/types';

describe('board story commands', () => {
  let featureRepo: FeatureRepository;
  let storyRepo: StoryRepository;
  let featureId: string;
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

    // Create a feature for stories
    const feature = featureRepo.create({
      code: 'TEST',
      name: 'Test Feature',
      description: 'Feature for testing stories',
    });
    featureId = feature.id;

    // Reset event bus and capture events
    // Note: We use eventBus directly (not getEventBus()) because the repositories
    // import and use the same eventBus const
    // We need to remove listeners from eventBus (not resetEventBus) because
    // the exported const holds the original instance
    eventBus.removeAllListeners();
    capturedEvents = [];

    eventBus.on('story:created', (payload) => {
      capturedEvents.push({ event: 'story:created', payload });
    });
    eventBus.on('story:updated', (payload) => {
      capturedEvents.push({ event: 'story:updated', payload });
    });
    eventBus.on('story:deleted', (payload) => {
      capturedEvents.push({ event: 'story:deleted', payload });
    });
    eventBus.on('story:status-changed', (payload) => {
      capturedEvents.push({ event: 'story:status-changed', payload });
    });
  });

  describe('create', () => {
    test('creates a story with auto-generated code', () => {
      const story = storyRepo.create({
        featureId,
        title: 'First Story',
        description: 'Story description',
        why: 'For testing',
      });

      expect(story.code).toBe('TEST-001');
      expect(story.title).toBe('First Story');
      expect(story.description).toBe('Story description');
      expect(story.why).toBe('For testing');
      expect(story.status).toBe('draft');
      expect(story.featureId).toBe(featureId);
    });

    test('increments story code for same feature', () => {
      const s1 = storyRepo.create({ featureId, title: 'Story 1', description: '', why: '' });
      const s2 = storyRepo.create({ featureId, title: 'Story 2', description: '', why: '' });
      const s3 = storyRepo.create({ featureId, title: 'Story 3', description: '', why: '' });

      expect(s1.code).toBe('TEST-001');
      expect(s2.code).toBe('TEST-002');
      expect(s3.code).toBe('TEST-003');
    });

    test('creates story with default status of draft', () => {
      const story = storyRepo.create({
        featureId,
        title: 'Default Status',
        description: '',
        why: '',
      });

      expect(story.status).toBe(StoryStatus.DRAFT);
    });

    test('creates story with specified status', () => {
      const story = storyRepo.create({
        featureId,
        title: 'With Status',
        description: '',
        why: '',
        status: StoryStatus.PLANNED,
      });

      expect(story.status).toBe(StoryStatus.PLANNED);
    });

    test('creates story with default priority of P2', () => {
      const story = storyRepo.create({
        featureId,
        title: 'Default Priority',
        description: '',
        why: '',
      });

      expect(story.priority).toBe(Priority.P2);
    });

    test('creates story with specified priority', () => {
      const story = storyRepo.create({
        featureId,
        title: 'High Priority',
        description: '',
        why: '',
        priority: Priority.P0,
      });

      expect(story.priority).toBe(Priority.P0);
    });

    test('creates story with assigned user', () => {
      const story = storyRepo.create({
        featureId,
        title: 'Assigned Story',
        description: '',
        why: '',
        assignedTo: 'backend-dev',
      });

      expect(story.assignedTo).toBe('backend-dev');
    });

    test('creates story with extensions', () => {
      const story = storyRepo.create({
        featureId,
        title: 'Extended Story',
        description: '',
        why: '',
        extensions: { customField: 'customValue' },
      });

      expect(story.extensions).toEqual({ customField: 'customValue' });
    });

    test('throws error for non-existent feature', () => {
      expect(() => {
        storyRepo.create({
          featureId: 'non-existent-id',
          title: 'Orphan Story',
          description: '',
          why: '',
        });
      }).toThrow('Feature not found');
    });

    test('emits story:created event', () => {
      const story = storyRepo.create({
        featureId,
        title: 'Event Story',
        description: '',
        why: '',
      });

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('story:created');
      expect((capturedEvents[0].payload as { entityId: string }).entityId).toBe(story.id);
    });

    test('uses different code sequences for different features', () => {
      const feature2 = featureRepo.create({
        code: 'OTHER',
        name: 'Other Feature',
        description: '',
      });

      const s1 = storyRepo.create({ featureId, title: 'TEST Story', description: '', why: '' });
      const s2 = storyRepo.create({ featureId: feature2.id, title: 'OTHER Story', description: '', why: '' });
      const s3 = storyRepo.create({ featureId, title: 'TEST Story 2', description: '', why: '' });

      expect(s1.code).toBe('TEST-001');
      expect(s2.code).toBe('OTHER-001');
      expect(s3.code).toBe('TEST-002');
    });
  });

  describe('list', () => {
    test('returns empty array when no stories exist', () => {
      const stories = storyRepo.findAll();
      expect(stories).toEqual([]);
    });

    test('returns all stories', () => {
      storyRepo.create({ featureId, title: 'Story 1', description: '', why: '' });
      storyRepo.create({ featureId, title: 'Story 2', description: '', why: '' });

      const stories = storyRepo.findAll();
      expect(stories.length).toBe(2);
    });

    test('filters stories by status', () => {
      storyRepo.create({ featureId, title: 'Draft', description: '', why: '', status: StoryStatus.DRAFT });
      storyRepo.create({ featureId, title: 'In Progress', description: '', why: '', status: StoryStatus.IN_PROGRESS });
      storyRepo.create({ featureId, title: 'Another Draft', description: '', why: '', status: StoryStatus.DRAFT });

      const draftStories = storyRepo.findAll({ status: StoryStatus.DRAFT });
      const inProgressStories = storyRepo.findAll({ status: StoryStatus.IN_PROGRESS });

      expect(draftStories.length).toBe(2);
      expect(inProgressStories.length).toBe(1);
    });

    test('filters stories by feature', () => {
      const feature2 = featureRepo.create({ code: 'F2', name: 'Feature 2', description: '' });

      storyRepo.create({ featureId, title: 'F1 Story', description: '', why: '' });
      storyRepo.create({ featureId: feature2.id, title: 'F2 Story', description: '', why: '' });

      const f1Stories = storyRepo.findAll({ featureId });
      const f2Stories = storyRepo.findAll({ featureId: feature2.id });

      expect(f1Stories.length).toBe(1);
      expect(f1Stories[0].title).toBe('F1 Story');
      expect(f2Stories.length).toBe(1);
      expect(f2Stories[0].title).toBe('F2 Story');
    });

    test('returns stories in creation order', () => {
      storyRepo.create({ featureId, title: 'First', description: '', why: '' });
      storyRepo.create({ featureId, title: 'Second', description: '', why: '' });
      storyRepo.create({ featureId, title: 'Third', description: '', why: '' });

      const stories = storyRepo.findAll();

      expect(stories[0].title).toBe('First');
      expect(stories[1].title).toBe('Second');
      expect(stories[2].title).toBe('Third');
    });
  });

  describe('get by id', () => {
    test('finds story by id', () => {
      const created = storyRepo.create({
        featureId,
        title: 'Find Me',
        description: 'Desc',
        why: 'Why',
      });

      const found = storyRepo.findById(created.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.title).toBe('Find Me');
    });

    test('returns null for non-existent id', () => {
      const found = storyRepo.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('get by code', () => {
    test('finds story by code', () => {
      storyRepo.create({
        featureId,
        title: 'Coded Story',
        description: '',
        why: '',
      });

      const found = storyRepo.findByCode('TEST-001');

      expect(found).not.toBeNull();
      expect(found!.code).toBe('TEST-001');
      expect(found!.title).toBe('Coded Story');
    });

    test('returns null for non-existent code', () => {
      const found = storyRepo.findByCode('NONEXISTENT-999');
      expect(found).toBeNull();
    });
  });

  describe('get by feature', () => {
    test('finds all stories for a feature', () => {
      storyRepo.create({ featureId, title: 'Story 1', description: '', why: '' });
      storyRepo.create({ featureId, title: 'Story 2', description: '', why: '' });

      const stories = storyRepo.findByFeatureId(featureId);

      expect(stories.length).toBe(2);
    });

    test('returns empty array for feature with no stories', () => {
      const stories = storyRepo.findByFeatureId(featureId);
      expect(stories).toEqual([]);
    });

    test('only returns stories for specified feature', () => {
      const feature2 = featureRepo.create({ code: 'F2', name: 'Feature 2', description: '' });

      storyRepo.create({ featureId, title: 'F1 Story', description: '', why: '' });
      storyRepo.create({ featureId: feature2.id, title: 'F2 Story', description: '', why: '' });

      const stories = storyRepo.findByFeatureId(featureId);

      expect(stories.length).toBe(1);
      expect(stories[0].title).toBe('F1 Story');
    });
  });

  describe('update', () => {
    let story: Story;

    beforeEach(() => {
      story = storyRepo.create({
        featureId,
        title: 'Original Title',
        description: 'Original description',
        why: 'Original why',
      });
      capturedEvents = [];
    });

    test('updates story title', () => {
      const updated = storyRepo.update(story.id, { title: 'New Title' });

      expect(updated.title).toBe('New Title');
      expect(updated.description).toBe('Original description');
    });

    test('updates story description', () => {
      const updated = storyRepo.update(story.id, { description: 'New description' });

      expect(updated.description).toBe('New description');
      expect(updated.title).toBe('Original Title');
    });

    test('updates story why', () => {
      const updated = storyRepo.update(story.id, { why: 'New why' });

      expect(updated.why).toBe('New why');
    });

    test('updates story priority', () => {
      const updated = storyRepo.update(story.id, { priority: Priority.P1 });

      expect(updated.priority).toBe(Priority.P1);
    });

    test('updates story assignedTo', () => {
      const updated = storyRepo.update(story.id, { assignedTo: 'frontend-dev' });

      expect(updated.assignedTo).toBe('frontend-dev');
    });

    test('updates story extensions', () => {
      const updated = storyRepo.update(story.id, {
        extensions: { newField: 'newValue' },
      });

      expect(updated.extensions).toEqual({ newField: 'newValue' });
    });

    test('updates multiple fields at once', () => {
      const updated = storyRepo.update(story.id, {
        title: 'New Title',
        description: 'New Desc',
        priority: Priority.P0,
      });

      expect(updated.title).toBe('New Title');
      expect(updated.description).toBe('New Desc');
      expect(updated.priority).toBe(Priority.P0);
    });

    test('emits story:updated event with changed fields', () => {
      storyRepo.update(story.id, { title: 'New Title' });

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('story:updated');

      const payload = capturedEvents[0].payload as {
        entityId: string;
        changedFields: (keyof Story)[];
      };

      expect(payload.entityId).toBe(story.id);
      expect(payload.changedFields).toContain('title');
    });

    test('throws error for non-existent story', () => {
      expect(() => {
        storyRepo.update('non-existent-id', { title: 'New' });
      }).toThrow('Story not found');
    });
  });

  describe('status transitions', () => {
    let story: Story;

    beforeEach(() => {
      story = storyRepo.create({
        featureId,
        title: 'Status Test',
        description: '',
        why: '',
      });
      capturedEvents = [];
    });

    test('updates status from draft to planned', () => {
      const updated = storyRepo.updateStatus(story.id, StoryStatus.PLANNED);

      expect(updated.status).toBe(StoryStatus.PLANNED);
    });

    test('updates status from draft to in_progress', () => {
      const updated = storyRepo.updateStatus(story.id, StoryStatus.IN_PROGRESS);

      expect(updated.status).toBe(StoryStatus.IN_PROGRESS);
    });

    test('updates status to completed', () => {
      const updated = storyRepo.updateStatus(story.id, StoryStatus.COMPLETED);

      expect(updated.status).toBe(StoryStatus.COMPLETED);
    });

    test('emits story:status-changed event', () => {
      storyRepo.updateStatus(story.id, StoryStatus.IN_PROGRESS);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('story:status-changed');

      const payload = capturedEvents[0].payload as {
        entityId: string;
        previousStatus: StoryStatus;
        newStatus: StoryStatus;
      };

      expect(payload.entityId).toBe(story.id);
      expect(payload.previousStatus).toBe(StoryStatus.DRAFT);
      expect(payload.newStatus).toBe(StoryStatus.IN_PROGRESS);
    });

    test('does not emit event if status unchanged', () => {
      storyRepo.updateStatus(story.id, StoryStatus.DRAFT);

      expect(capturedEvents).toHaveLength(0);
    });

    test('returns same story if status unchanged', () => {
      const result = storyRepo.updateStatus(story.id, StoryStatus.DRAFT);

      expect(result.id).toBe(story.id);
      expect(result.status).toBe(StoryStatus.DRAFT);
    });

    test('throws error for non-existent story', () => {
      expect(() => {
        storyRepo.updateStatus('non-existent', StoryStatus.PLANNED);
      }).toThrow('Story not found');
    });
  });

  describe('delete', () => {
    let story: Story;

    beforeEach(() => {
      story = storyRepo.create({
        featureId,
        title: 'Delete Me',
        description: '',
        why: '',
      });
      capturedEvents = [];
    });

    test('deletes the story', () => {
      storyRepo.delete(story.id);

      const found = storyRepo.findById(story.id);
      expect(found).toBeNull();
    });

    test('removes story from list', () => {
      const before = storyRepo.findAll();
      expect(before.length).toBe(1);

      storyRepo.delete(story.id);

      const after = storyRepo.findAll();
      expect(after.length).toBe(0);
    });

    test('emits story:deleted event', () => {
      storyRepo.delete(story.id);

      expect(capturedEvents).toHaveLength(1);
      expect(capturedEvents[0].event).toBe('story:deleted');

      const payload = capturedEvents[0].payload as {
        entityId: string;
        entity: Story;
      };

      expect(payload.entityId).toBe(story.id);
      expect(payload.entity.title).toBe('Delete Me');
    });

    test('throws error for non-existent story', () => {
      expect(() => {
        storyRepo.delete('non-existent-id');
      }).toThrow('Story not found');
    });
  });

  describe('JSON output format', () => {
    test('story has correct JSON structure', () => {
      const story = storyRepo.create({
        featureId,
        title: 'JSON Story',
        description: 'Description',
        why: 'Why',
        priority: Priority.P1,
        assignedTo: 'developer',
        extensions: { key: 'value' },
      });

      // Verify all expected fields are present
      expect(story).toHaveProperty('id');
      expect(story).toHaveProperty('code');
      expect(story).toHaveProperty('featureId');
      expect(story).toHaveProperty('title');
      expect(story).toHaveProperty('description');
      expect(story).toHaveProperty('why');
      expect(story).toHaveProperty('status');
      expect(story).toHaveProperty('priority');
      expect(story).toHaveProperty('assignedTo');
      expect(story).toHaveProperty('extensions');
      expect(story).toHaveProperty('createdAt');
      expect(story).toHaveProperty('updatedAt');

      // Verify types
      expect(typeof story.id).toBe('string');
      expect(typeof story.code).toBe('string');
      expect(typeof story.featureId).toBe('string');
      expect(typeof story.title).toBe('string');
      expect(typeof story.status).toBe('string');
      expect(typeof story.priority).toBe('string');
    });

    test('story serializes to valid JSON', () => {
      const story = storyRepo.create({
        featureId,
        title: 'Serialize Test',
        description: 'Desc',
        why: 'Why',
        extensions: { nested: { key: 'value' } },
      });

      const json = JSON.stringify(story);
      const parsed = JSON.parse(json);

      expect(parsed.code).toBe('TEST-001');
      expect(parsed.title).toBe('Serialize Test');
      expect(parsed.extensions.nested.key).toBe('value');
    });
  });
});
