/**
 * Tests for AcceptanceCriteriaRepository
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, closeDb, createTestDb } from '../../db';
import { resetEventBus, eventBus } from '../../events';
import {
  AcceptanceCriteriaRepository,
  acceptanceCriteriaRepository,
} from '../criteria-repository';
import { FeatureRepository } from '../feature-repository';
import { StoryRepository } from '../story-repository';
import type { ACCreatedEvent, ACUpdatedEvent, ACDeletedEvent, ACVerifiedEvent } from '../../events';

describe('AcceptanceCriteriaRepository', () => {
  let repository: AcceptanceCriteriaRepository;
  let featureRepository: FeatureRepository;
  let storyRepository: StoryRepository;
  let testStoryId: string;
  let capturedEvents: unknown[] = [];

  beforeEach(() => {
    // Use in-memory database for testing
    const db = createTestDb();
    // Override getDb to return our test db
    initDb({ dbPath: ':memory:', runMigrations: true });

    repository = new AcceptanceCriteriaRepository();
    featureRepository = new FeatureRepository();
    storyRepository = new StoryRepository();

    // Create test feature and story
    const feature = featureRepository.create({
      code: 'TEST',
      name: 'Test Feature',
      description: 'For testing',
    });

    const story = storyRepository.create({
      featureId: feature.id,
      title: 'Test Story',
      description: 'For testing',
      why: 'Testing',
    });
    testStoryId = story.id;

    // Reset event capture
    capturedEvents = [];
    resetEventBus();

    // Capture all AC events
    eventBus.on('ac:created', (e) => capturedEvents.push(e));
    eventBus.on('ac:updated', (e) => capturedEvents.push(e));
    eventBus.on('ac:deleted', (e) => capturedEvents.push(e));
    eventBus.on('ac:verified', (e) => capturedEvents.push(e));
  });

  afterEach(() => {
    closeDb();
    resetEventBus();
  });

  describe('create', () => {
    it('should create acceptance criteria with required fields', () => {
      const ac = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'User can log in with valid credentials',
      });

      expect(ac).toBeDefined();
      expect(ac.id).toBeDefined();
      expect(ac.storyId).toBe(testStoryId);
      expect(ac.code).toBe('AC-001');
      expect(ac.description).toBe('User can log in with valid credentials');
      expect(ac.status).toBe('pending');
      expect(ac.verificationNotes).toBeNull();
      expect(ac.verifiedAt).toBeNull();
      expect(ac.extensions).toEqual({});
      expect(ac.createdAt).toBeDefined();
      expect(ac.updatedAt).toBeDefined();
    });

    it('should create acceptance criteria with optional fields', () => {
      const ac = repository.create({
        storyId: testStoryId,
        code: 'AC-002',
        description: 'Test description',
        status: 'verified',
        extensions: { priority: 'high' },
      });

      expect(ac.status).toBe('verified');
      expect(ac.extensions).toEqual({ priority: 'high' });
    });

    it('should emit ac:created event', () => {
      const startEventCount = capturedEvents.length;
      const ac = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'Test',
      });

      // Find the create event for this AC
      const createEvents = capturedEvents.slice(startEventCount).filter(
        (e) => (e as ACCreatedEvent).entityId === ac.id
      );
      expect(createEvents.length).toBeGreaterThanOrEqual(1);
      const event = createEvents[0] as ACCreatedEvent;
      expect(event.entityId).toBe(ac.id);
      expect(event.entity.code).toBe('AC-001');
    });
  });

  describe('findById', () => {
    it('should find acceptance criteria by ID', () => {
      const created = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'Test',
      });

      const found = repository.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.code).toBe('AC-001');
    });

    it('should return null for non-existent ID', () => {
      const found = repository.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('findByStoryId', () => {
    it('should find all acceptance criteria for a story', () => {
      repository.create({ storyId: testStoryId, code: 'AC-001', description: 'First' });
      repository.create({ storyId: testStoryId, code: 'AC-002', description: 'Second' });
      repository.create({ storyId: testStoryId, code: 'AC-003', description: 'Third' });

      const criteria = repository.findByStoryId(testStoryId);

      expect(criteria).toHaveLength(3);
      // Should be ordered by code
      expect(criteria[0].code).toBe('AC-001');
      expect(criteria[1].code).toBe('AC-002');
      expect(criteria[2].code).toBe('AC-003');
    });

    it('should return empty array for story with no criteria', () => {
      const criteria = repository.findByStoryId('non-existent-story');
      expect(criteria).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update acceptance criteria fields', () => {
      const created = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'Original',
      });

      const updated = repository.update(created.id, {
        description: 'Updated description',
        verificationNotes: 'Some notes',
      });

      expect(updated.description).toBe('Updated description');
      expect(updated.verificationNotes).toBe('Some notes');
    });

    it('should emit ac:updated event', () => {
      const created = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'Original',
      });

      const startEventCount = capturedEvents.length;
      repository.update(created.id, { description: 'Updated' });

      // Find the update event for this AC
      const updateEvents = capturedEvents.slice(startEventCount).filter(
        (e) => (e as ACUpdatedEvent).entityId === created.id
      );
      expect(updateEvents.length).toBeGreaterThanOrEqual(1);
      const event = updateEvents[0] as ACUpdatedEvent;
      expect(event.entityId).toBe(created.id);
      expect(event.changedFields).toContain('description');
      expect(event.previousState.description).toBe('Original');
    });

    it('should throw error for non-existent ID', () => {
      expect(() => {
        repository.update('non-existent-id', { description: 'New' });
      }).toThrow('AcceptanceCriteria not found');
    });
  });

  describe('verify', () => {
    it('should verify acceptance criteria', () => {
      const created = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'Test',
      });

      const verified = repository.verify(created.id, 'Tested manually');

      expect(verified.status).toBe('verified');
      expect(verified.verificationNotes).toBe('Tested manually');
      expect(verified.verifiedAt).toBeDefined();
    });

    it('should emit ac:verified event', () => {
      const created = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'Test',
      });

      const startEventCount = capturedEvents.length;
      repository.verify(created.id, 'Passed');

      // Find the verify event for this AC
      const verifyEvents = capturedEvents.slice(startEventCount).filter(
        (e) => (e as ACVerifiedEvent).entityId === created.id
      );
      expect(verifyEvents.length).toBeGreaterThanOrEqual(1);
      const event = verifyEvents[0] as ACVerifiedEvent;
      expect(event.entityId).toBe(created.id);
      expect(event.verificationResult).toBe('verified');
      expect(event.verificationNotes).toBe('Passed');
    });
  });

  describe('fail', () => {
    it('should mark acceptance criteria as failed', () => {
      const created = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'Test',
      });

      const failed = repository.fail(created.id, 'Did not meet requirements');

      expect(failed.status).toBe('failed');
      expect(failed.verificationNotes).toBe('Did not meet requirements');
      expect(failed.verifiedAt).toBeDefined();
    });

    it('should emit ac:verified event with failed result', () => {
      const created = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'Test',
      });

      const startEventCount = capturedEvents.length;
      repository.fail(created.id, 'Failed');

      // Find the verify event for this AC
      const verifyEvents = capturedEvents.slice(startEventCount).filter(
        (e) => (e as ACVerifiedEvent).entityId === created.id
      );
      expect(verifyEvents.length).toBeGreaterThanOrEqual(1);
      const event = verifyEvents[0] as ACVerifiedEvent;
      expect(event.verificationResult).toBe('failed');
    });
  });

  describe('delete', () => {
    it('should delete acceptance criteria', () => {
      const created = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'Test',
      });

      repository.delete(created.id);

      const found = repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should emit ac:deleted event', () => {
      const created = repository.create({
        storyId: testStoryId,
        code: 'AC-001',
        description: 'Test',
      });

      const startEventCount = capturedEvents.length;
      const deletedId = created.id;
      repository.delete(created.id);

      // Find the delete event for this AC
      const deleteEvents = capturedEvents.slice(startEventCount).filter(
        (e) => (e as ACDeletedEvent).entityId === deletedId
      );
      expect(deleteEvents.length).toBeGreaterThanOrEqual(1);
      const event = deleteEvents[0] as ACDeletedEvent;
      expect(event.entityId).toBe(deletedId);
    });

    it('should throw error for non-existent ID', () => {
      expect(() => {
        repository.delete('non-existent-id');
      }).toThrow('AcceptanceCriteria not found');
    });
  });

  describe('countByStatus', () => {
    it('should count acceptance criteria by status', () => {
      repository.create({ storyId: testStoryId, code: 'AC-001', description: 'Test 1' });
      repository.create({ storyId: testStoryId, code: 'AC-002', description: 'Test 2' });
      const ac3 = repository.create({ storyId: testStoryId, code: 'AC-003', description: 'Test 3' });
      const ac4 = repository.create({ storyId: testStoryId, code: 'AC-004', description: 'Test 4' });

      repository.verify(ac3.id, 'Passed');
      repository.fail(ac4.id, 'Failed');

      const counts = repository.countByStatus(testStoryId);

      expect(counts.pending).toBe(2);
      expect(counts.verified).toBe(1);
      expect(counts.failed).toBe(1);
    });
  });

  describe('allVerified', () => {
    it('should return true when all criteria are verified', () => {
      const ac1 = repository.create({ storyId: testStoryId, code: 'AC-001', description: 'Test 1' });
      const ac2 = repository.create({ storyId: testStoryId, code: 'AC-002', description: 'Test 2' });

      repository.verify(ac1.id, 'Passed');
      repository.verify(ac2.id, 'Passed');

      expect(repository.allVerified(testStoryId)).toBe(true);
    });

    it('should return false when some criteria are pending', () => {
      const ac1 = repository.create({ storyId: testStoryId, code: 'AC-001', description: 'Test 1' });
      repository.create({ storyId: testStoryId, code: 'AC-002', description: 'Test 2' });

      repository.verify(ac1.id, 'Passed');

      expect(repository.allVerified(testStoryId)).toBe(false);
    });

    it('should return false when some criteria are failed', () => {
      const ac1 = repository.create({ storyId: testStoryId, code: 'AC-001', description: 'Test 1' });
      const ac2 = repository.create({ storyId: testStoryId, code: 'AC-002', description: 'Test 2' });

      repository.verify(ac1.id, 'Passed');
      repository.fail(ac2.id, 'Failed');

      expect(repository.allVerified(testStoryId)).toBe(false);
    });

    it('should return false for story with no criteria', () => {
      expect(repository.allVerified(testStoryId)).toBe(false);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton acceptanceCriteriaRepository instance', () => {
      expect(acceptanceCriteriaRepository).toBeInstanceOf(AcceptanceCriteriaRepository);
    });
  });
});
