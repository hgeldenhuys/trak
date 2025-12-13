/**
 * Tests for FeatureRepository
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { FeatureRepository } from '../feature-repository';
import { getEventBus, resetEventBus } from '../../events';
import * as migration001 from '../../db/migrations/001_initial';
describe('FeatureRepository', () => {
    let testDb;
    let repository;
    let capturedEvents;
    beforeEach(() => {
        // Create in-memory test database
        testDb = new Database(':memory:');
        testDb.run('PRAGMA foreign_keys = ON');
        migration001.up(testDb);
        // Reset event bus to get a fresh instance
        resetEventBus();
        capturedEvents = [];
        // Get the fresh event bus and subscribe to events
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
        // Create repository with test database
        repository = new FeatureRepository(testDb);
    });
    afterEach(() => {
        testDb.close();
        resetEventBus();
    });
    describe('create', () => {
        it('should create a feature with required fields', () => {
            const feature = repository.create({
                code: 'NOTIFY',
                name: 'Notifications',
                description: 'Push notification system',
            });
            expect(feature.id).toBeDefined();
            expect(feature.code).toBe('NOTIFY');
            expect(feature.name).toBe('Notifications');
            expect(feature.description).toBe('Push notification system');
            expect(feature.storyCounter).toBe(0);
            expect(feature.extensions).toEqual({});
            expect(feature.createdAt).toBeDefined();
            expect(feature.updatedAt).toBeDefined();
        });
        it('should uppercase the code', () => {
            const feature = repository.create({
                code: 'notify',
                name: 'Notifications',
                description: 'Test',
            });
            expect(feature.code).toBe('NOTIFY');
        });
        it('should store extensions', () => {
            const feature = repository.create({
                code: 'AUTH',
                name: 'Authentication',
                description: 'Auth system',
                extensions: { priority: 'high', owner: 'backend-team' },
            });
            expect(feature.extensions).toEqual({ priority: 'high', owner: 'backend-team' });
        });
        it('should emit feature:created event', () => {
            const feature = repository.create({
                code: 'TEST',
                name: 'Test Feature',
                description: 'Testing',
            });
            expect(capturedEvents).toHaveLength(1);
            expect(capturedEvents[0].event).toBe('feature:created');
            expect(capturedEvents[0].payload.entityId).toBe(feature.id);
            expect(capturedEvents[0].payload.entity).toEqual(feature);
        });
        it('should throw on duplicate code', () => {
            repository.create({
                code: 'DUP',
                name: 'First',
                description: 'First feature',
            });
            expect(() => {
                repository.create({
                    code: 'DUP',
                    name: 'Second',
                    description: 'Second feature',
                });
            }).toThrow();
        });
    });
    describe('findById', () => {
        it('should find feature by id', () => {
            const created = repository.create({
                code: 'FIND',
                name: 'Find Me',
                description: 'Test',
            });
            const found = repository.findById(created.id);
            expect(found).not.toBeNull();
            expect(found.id).toBe(created.id);
            expect(found.code).toBe('FIND');
        });
        it('should return null for non-existent id', () => {
            const found = repository.findById('non-existent-id');
            expect(found).toBeNull();
        });
    });
    describe('findByCode', () => {
        it('should find feature by code', () => {
            repository.create({
                code: 'SEARCH',
                name: 'Searchable',
                description: 'Test',
            });
            const found = repository.findByCode('SEARCH');
            expect(found).not.toBeNull();
            expect(found.code).toBe('SEARCH');
        });
        it('should be case-insensitive', () => {
            repository.create({
                code: 'CASE',
                name: 'Case Test',
                description: 'Test',
            });
            const found = repository.findByCode('case');
            expect(found).not.toBeNull();
            expect(found.code).toBe('CASE');
        });
        it('should return null for non-existent code', () => {
            const found = repository.findByCode('NONEXISTENT');
            expect(found).toBeNull();
        });
    });
    describe('findAll', () => {
        it('should return empty array when no features', () => {
            const features = repository.findAll();
            expect(features).toEqual([]);
        });
        it('should return all features ordered by creation date', () => {
            repository.create({ code: 'AAA', name: 'First', description: 'Test' });
            repository.create({ code: 'BBB', name: 'Second', description: 'Test' });
            repository.create({ code: 'CCC', name: 'Third', description: 'Test' });
            const features = repository.findAll();
            expect(features).toHaveLength(3);
            expect(features[0].code).toBe('AAA');
            expect(features[1].code).toBe('BBB');
            expect(features[2].code).toBe('CCC');
        });
    });
    describe('update', () => {
        let feature;
        beforeEach(() => {
            feature = repository.create({
                code: 'UPD',
                name: 'Update Me',
                description: 'Original description',
            });
            // Clear creation event
            capturedEvents = [];
        });
        it('should update name', () => {
            const updated = repository.update(feature.id, { name: 'Updated Name' });
            expect(updated.name).toBe('Updated Name');
            expect(updated.description).toBe('Original description');
        });
        it('should update description', () => {
            const updated = repository.update(feature.id, { description: 'New description' });
            expect(updated.description).toBe('New description');
        });
        it('should update extensions', () => {
            const updated = repository.update(feature.id, {
                extensions: { custom: 'value' },
            });
            expect(updated.extensions).toEqual({ custom: 'value' });
        });
        it('should update updatedAt timestamp', async () => {
            const originalUpdatedAt = feature.updatedAt;
            // Small delay to ensure timestamp difference
            await new Promise((resolve) => setTimeout(resolve, 10));
            const updated = repository.update(feature.id, { name: 'New Name' });
            expect(updated.updatedAt).not.toBe(originalUpdatedAt);
        });
        it('should emit feature:updated event with changed fields', () => {
            repository.update(feature.id, { name: 'New Name', description: 'New Desc' });
            expect(capturedEvents).toHaveLength(1);
            expect(capturedEvents[0].event).toBe('feature:updated');
            const payload = capturedEvents[0].payload;
            expect(payload.entityId).toBe(feature.id);
            expect(payload.previousState.name).toBe('Update Me');
            expect(payload.entity.name).toBe('New Name');
            expect(payload.changedFields).toContain('name');
            expect(payload.changedFields).toContain('description');
        });
        it('should throw for non-existent feature', () => {
            expect(() => {
                repository.update('non-existent', { name: 'New Name' });
            }).toThrow('Feature not found: non-existent');
        });
    });
    describe('delete', () => {
        let feature;
        beforeEach(() => {
            feature = repository.create({
                code: 'DEL',
                name: 'Delete Me',
                description: 'To be deleted',
            });
            capturedEvents = [];
        });
        it('should delete the feature', () => {
            repository.delete(feature.id);
            const found = repository.findById(feature.id);
            expect(found).toBeNull();
        });
        it('should emit feature:deleted event', () => {
            repository.delete(feature.id);
            expect(capturedEvents).toHaveLength(1);
            expect(capturedEvents[0].event).toBe('feature:deleted');
            const payload = capturedEvents[0].payload;
            expect(payload.entityId).toBe(feature.id);
            expect(payload.entity.code).toBe('DEL');
        });
        it('should throw for non-existent feature', () => {
            expect(() => {
                repository.delete('non-existent');
            }).toThrow('Feature not found: non-existent');
        });
    });
    describe('incrementStoryCounter', () => {
        let feature;
        beforeEach(() => {
            feature = repository.create({
                code: 'CNT',
                name: 'Counter Test',
                description: 'Test counter',
            });
        });
        it('should increment counter and return new value', () => {
            const newValue = repository.incrementStoryCounter(feature.id);
            expect(newValue).toBe(1);
        });
        it('should increment multiple times correctly', () => {
            expect(repository.incrementStoryCounter(feature.id)).toBe(1);
            expect(repository.incrementStoryCounter(feature.id)).toBe(2);
            expect(repository.incrementStoryCounter(feature.id)).toBe(3);
        });
        it('should update updatedAt timestamp', async () => {
            const originalUpdatedAt = feature.updatedAt;
            // Small delay to ensure timestamp difference
            await new Promise((resolve) => setTimeout(resolve, 10));
            repository.incrementStoryCounter(feature.id);
            const updated = repository.findById(feature.id);
            expect(updated.updatedAt).not.toBe(originalUpdatedAt);
        });
        it('should throw for non-existent feature', () => {
            expect(() => {
                repository.incrementStoryCounter('non-existent');
            }).toThrow('Feature not found: non-existent');
        });
    });
    describe('clearCache', () => {
        it('should clear prepared statements without error', () => {
            // Create a feature to initialize prepared statements
            repository.create({
                code: 'CACHE',
                name: 'Cache Test',
                description: 'Test',
            });
            // Should not throw
            expect(() => {
                repository.clearCache();
            }).not.toThrow();
        });
    });
});
