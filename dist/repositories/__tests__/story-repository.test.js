/**
 * Story Repository Tests
 *
 * Tests all StoryRepository methods including CRUD operations
 * and event emission.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { StoryRepository } from '../story-repository';
import { FeatureRepository } from '../feature-repository';
import { StoryStatus, Priority } from '../../types';
import { eventBus, resetEventBus } from '../../events';
import { initDb, closeDb } from '../../db';
// Test database path (in-memory equivalent for each test)
const TEST_DB_PATH = ':memory:';
let storyRepo;
let featureRepo;
let createdFeatureId;
// Track emitted events
let emittedEvents = [];
describe('StoryRepository', () => {
    beforeEach(() => {
        // Initialize in-memory database
        initDb({ dbPath: TEST_DB_PATH });
        // Reset event bus and track events
        resetEventBus();
        emittedEvents = [];
        // Subscribe to all story events
        eventBus.on('story:created', (payload) => {
            emittedEvents.push({ name: 'story:created', payload });
        });
        eventBus.on('story:updated', (payload) => {
            emittedEvents.push({ name: 'story:updated', payload });
        });
        eventBus.on('story:deleted', (payload) => {
            emittedEvents.push({ name: 'story:deleted', payload });
        });
        eventBus.on('story:status-changed', (payload) => {
            emittedEvents.push({ name: 'story:status-changed', payload });
        });
        // Create fresh repository instances
        storyRepo = new StoryRepository();
        featureRepo = new FeatureRepository();
        // Clear prepared statement cache for feature repository
        featureRepo.clearCache();
        // Create a test feature for stories
        const feature = featureRepo.create({
            code: 'TEST',
            name: 'Test Feature',
            description: 'A test feature',
        });
        createdFeatureId = feature.id;
    });
    afterEach(() => {
        closeDb();
        resetEventBus();
    });
    describe('create', () => {
        it('should create a story with auto-generated code', () => {
            const story = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Test Story',
                description: 'A test story',
                why: 'For testing purposes',
            });
            expect(story.id).toBeDefined();
            expect(story.code).toBe('TEST-001');
            expect(story.featureId).toBe(createdFeatureId);
            expect(story.title).toBe('Test Story');
            expect(story.description).toBe('A test story');
            expect(story.why).toBe('For testing purposes');
            expect(story.status).toBe(StoryStatus.DRAFT);
            expect(story.priority).toBe(Priority.P2);
        });
        it('should increment story counter for each new story', () => {
            const story1 = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Story 1',
                description: 'First story',
                why: 'Testing',
            });
            const story2 = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Story 2',
                description: 'Second story',
                why: 'Testing',
            });
            expect(story1.code).toBe('TEST-001');
            expect(story2.code).toBe('TEST-002');
        });
        it('should emit story:created event', () => {
            const story = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Test Story',
                description: 'A test story',
                why: 'For testing',
            });
            const createdEvent = emittedEvents.find((e) => e.name === 'story:created');
            expect(createdEvent).toBeDefined();
            expect((createdEvent?.payload).entityId).toBe(story.id);
        });
        it('should throw error for non-existent feature', () => {
            expect(() => {
                storyRepo.create({
                    featureId: 'non-existent-id',
                    title: 'Test Story',
                    description: 'A test story',
                    why: 'Testing',
                });
            }).toThrow('Feature not found');
        });
    });
    describe('findById', () => {
        it('should find a story by id', () => {
            const created = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Test Story',
                description: 'A test story',
                why: 'Testing',
            });
            const found = storyRepo.findById(created.id);
            expect(found).toBeDefined();
            expect(found?.id).toBe(created.id);
            expect(found?.title).toBe('Test Story');
        });
        it('should return null for non-existent id', () => {
            const found = storyRepo.findById('non-existent-id');
            expect(found).toBeNull();
        });
    });
    describe('findByCode', () => {
        it('should find a story by code', () => {
            const created = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Test Story',
                description: 'A test story',
                why: 'Testing',
            });
            const found = storyRepo.findByCode('TEST-001');
            expect(found).toBeDefined();
            expect(found?.id).toBe(created.id);
        });
        it('should return null for non-existent code', () => {
            const found = storyRepo.findByCode('NONEXISTENT-001');
            expect(found).toBeNull();
        });
    });
    describe('findByFeatureId', () => {
        it('should find all stories for a feature', () => {
            storyRepo.create({
                featureId: createdFeatureId,
                title: 'Story 1',
                description: 'First',
                why: 'Testing',
            });
            storyRepo.create({
                featureId: createdFeatureId,
                title: 'Story 2',
                description: 'Second',
                why: 'Testing',
            });
            const stories = storyRepo.findByFeatureId(createdFeatureId);
            expect(stories.length).toBe(2);
            expect(stories[0].code).toBe('TEST-001');
            expect(stories[1].code).toBe('TEST-002');
        });
        it('should return empty array for feature with no stories', () => {
            const stories = storyRepo.findByFeatureId(createdFeatureId);
            expect(stories.length).toBe(0);
        });
    });
    describe('findAll', () => {
        it('should find all stories', () => {
            storyRepo.create({
                featureId: createdFeatureId,
                title: 'Story 1',
                description: 'First',
                why: 'Testing',
            });
            storyRepo.create({
                featureId: createdFeatureId,
                title: 'Story 2',
                description: 'Second',
                why: 'Testing',
            });
            const stories = storyRepo.findAll();
            expect(stories.length).toBe(2);
        });
        it('should filter by status', () => {
            storyRepo.create({
                featureId: createdFeatureId,
                title: 'Draft Story',
                description: 'A draft',
                why: 'Testing',
                status: StoryStatus.DRAFT,
            });
            storyRepo.create({
                featureId: createdFeatureId,
                title: 'In Progress Story',
                description: 'In progress',
                why: 'Testing',
                status: StoryStatus.IN_PROGRESS,
            });
            const draftStories = storyRepo.findAll({ status: StoryStatus.DRAFT });
            const inProgressStories = storyRepo.findAll({ status: StoryStatus.IN_PROGRESS });
            expect(draftStories.length).toBe(1);
            expect(draftStories[0].title).toBe('Draft Story');
            expect(inProgressStories.length).toBe(1);
            expect(inProgressStories[0].title).toBe('In Progress Story');
        });
        it('should filter by featureId', () => {
            // Create another feature
            const feature2 = featureRepo.create({
                code: 'OTHER',
                name: 'Other Feature',
                description: 'Another feature',
            });
            storyRepo.create({
                featureId: createdFeatureId,
                title: 'TEST Story',
                description: 'In TEST',
                why: 'Testing',
            });
            storyRepo.create({
                featureId: feature2.id,
                title: 'OTHER Story',
                description: 'In OTHER',
                why: 'Testing',
            });
            const testStories = storyRepo.findAll({ featureId: createdFeatureId });
            const otherStories = storyRepo.findAll({ featureId: feature2.id });
            expect(testStories.length).toBe(1);
            expect(testStories[0].title).toBe('TEST Story');
            expect(otherStories.length).toBe(1);
            expect(otherStories[0].title).toBe('OTHER Story');
        });
    });
    describe('update', () => {
        it('should update story fields', () => {
            const created = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Original Title',
                description: 'Original description',
                why: 'Original why',
            });
            const updated = storyRepo.update(created.id, {
                title: 'Updated Title',
                description: 'Updated description',
            });
            expect(updated.title).toBe('Updated Title');
            expect(updated.description).toBe('Updated description');
            expect(updated.why).toBe('Original why'); // Unchanged
        });
        it('should emit story:updated event', () => {
            const created = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Original',
                description: 'Desc',
                why: 'Why',
            });
            // Reset events after create
            emittedEvents = [];
            storyRepo.update(created.id, { title: 'Updated' });
            const updatedEvent = emittedEvents.find((e) => e.name === 'story:updated');
            expect(updatedEvent).toBeDefined();
            expect((updatedEvent?.payload).changedFields).toContain('title');
        });
        it('should throw error for non-existent story', () => {
            expect(() => {
                storyRepo.update('non-existent-id', { title: 'New Title' });
            }).toThrow('Story not found');
        });
    });
    describe('updateStatus', () => {
        it('should update story status', () => {
            const created = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Test Story',
                description: 'Desc',
                why: 'Why',
            });
            const updated = storyRepo.updateStatus(created.id, StoryStatus.IN_PROGRESS);
            expect(updated.status).toBe(StoryStatus.IN_PROGRESS);
        });
        it('should emit story:status-changed event', () => {
            const created = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Test Story',
                description: 'Desc',
                why: 'Why',
            });
            // Reset events
            emittedEvents = [];
            storyRepo.updateStatus(created.id, StoryStatus.IN_PROGRESS);
            const statusEvent = emittedEvents.find((e) => e.name === 'story:status-changed');
            expect(statusEvent).toBeDefined();
            expect((statusEvent?.payload).previousStatus).toBe(StoryStatus.DRAFT);
            expect((statusEvent?.payload).newStatus).toBe(StoryStatus.IN_PROGRESS);
        });
        it('should not emit event if status unchanged', () => {
            const created = storyRepo.create({
                featureId: createdFeatureId,
                title: 'Test Story',
                description: 'Desc',
                why: 'Why',
                status: StoryStatus.DRAFT,
            });
            // Reset events
            emittedEvents = [];
            storyRepo.updateStatus(created.id, StoryStatus.DRAFT);
            const statusEvent = emittedEvents.find((e) => e.name === 'story:status-changed');
            expect(statusEvent).toBeUndefined();
        });
    });
    describe('delete', () => {
        it('should delete a story', () => {
            const created = storyRepo.create({
                featureId: createdFeatureId,
                title: 'To Delete',
                description: 'Desc',
                why: 'Why',
            });
            storyRepo.delete(created.id);
            const found = storyRepo.findById(created.id);
            expect(found).toBeNull();
        });
        it('should emit story:deleted event', () => {
            const created = storyRepo.create({
                featureId: createdFeatureId,
                title: 'To Delete',
                description: 'Desc',
                why: 'Why',
            });
            // Reset events
            emittedEvents = [];
            storyRepo.delete(created.id);
            const deletedEvent = emittedEvents.find((e) => e.name === 'story:deleted');
            expect(deletedEvent).toBeDefined();
            expect((deletedEvent?.payload).entityId).toBe(created.id);
        });
        it('should throw error for non-existent story', () => {
            expect(() => {
                storyRepo.delete('non-existent-id');
            }).toThrow('Story not found');
        });
    });
});
