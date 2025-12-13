/**
 * Tests for SessionRepository
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { initDb, closeDb } from '../../db';
import { resetEventBus, eventBus } from '../../events';
import { SessionRepository, sessionRepository } from '../session-repository';
describe('SessionRepository', () => {
    let repository;
    let capturedEvents = [];
    beforeEach(() => {
        initDb({ dbPath: ':memory:', runMigrations: true });
        repository = new SessionRepository();
        // Reset event capture
        capturedEvents = [];
        resetEventBus();
        // Capture all session events
        eventBus.on('session:started', (e) => capturedEvents.push(e));
        eventBus.on('session:ended', (e) => capturedEvents.push(e));
        eventBus.on('session:updated', (e) => capturedEvents.push(e));
    });
    afterEach(() => {
        closeDb();
        resetEventBus();
    });
    describe('start', () => {
        it('should start a session with required fields', () => {
            const session = repository.start({
                actor: 'backend-dev',
            });
            expect(session).toBeDefined();
            expect(session.id).toBeDefined();
            expect(session.actor).toBe('backend-dev');
            expect(session.activeStoryId).toBeNull();
            expect(session.activeTaskId).toBeNull();
            expect(session.startedAt).toBeDefined();
            expect(session.endedAt).toBeNull();
            expect(session.phase).toBeNull();
            expect(session.compactionCount).toBe(0);
            expect(session.extensions).toEqual({});
        });
        it('should start a session with optional fields', () => {
            // Note: activeStoryId and activeTaskId require valid foreign keys
            // so we just test with phase and extensions
            const session = repository.start({
                actor: 'frontend-dev',
                phase: 'planning',
                extensions: { context: 'test' },
            });
            expect(session.phase).toBe('planning');
            expect(session.extensions).toEqual({ context: 'test' });
        });
        it('should emit session:started event', () => {
            const session = repository.start({ actor: 'backend-dev' });
            // Find the event for this specific session
            const events = capturedEvents.filter((e) => e.entityId === session.id);
            expect(events.length).toBeGreaterThanOrEqual(1);
            const event = events[0];
            expect(event.entityId).toBe(session.id);
            expect(event.actor).toBe('backend-dev');
        });
    });
    describe('findById', () => {
        it('should find session by ID', () => {
            const created = repository.start({ actor: 'backend-dev' });
            const found = repository.findById(created.id);
            expect(found).toBeDefined();
            expect(found.id).toBe(created.id);
        });
        it('should return null for non-existent ID', () => {
            const found = repository.findById('non-existent-id');
            expect(found).toBeNull();
        });
    });
    describe('findActive', () => {
        it('should find the active session', () => {
            repository.start({ actor: 'backend-dev' });
            repository.start({ actor: 'frontend-dev' });
            const active = repository.findActive();
            expect(active).toBeDefined();
            // Should return an active session (order may vary in fast tests)
            expect(active.endedAt).toBeNull();
        });
        it('should return null when no active sessions', () => {
            const session = repository.start({ actor: 'backend-dev' });
            repository.end(session.id);
            const active = repository.findActive();
            expect(active).toBeNull();
        });
    });
    describe('findAllActive', () => {
        it('should find all active sessions', () => {
            repository.start({ actor: 'backend-dev' });
            repository.start({ actor: 'frontend-dev' });
            const session3 = repository.start({ actor: 'qa-dev' });
            repository.end(session3.id);
            const active = repository.findAllActive();
            expect(active).toHaveLength(2);
        });
    });
    describe('findByActor', () => {
        it('should find sessions by actor', () => {
            repository.start({ actor: 'backend-dev' });
            repository.start({ actor: 'backend-dev' });
            repository.start({ actor: 'frontend-dev' });
            const sessions = repository.findByActor('backend-dev');
            expect(sessions).toHaveLength(2);
            for (const session of sessions) {
                expect(session.actor).toBe('backend-dev');
            }
        });
    });
    describe('update', () => {
        it('should update session fields', () => {
            const created = repository.start({ actor: 'backend-dev' });
            const updated = repository.update(created.id, {
                phase: 'execution',
                compactionCount: 5,
            });
            expect(updated.phase).toBe('execution');
            expect(updated.compactionCount).toBe(5);
        });
        it('should emit session:updated event', () => {
            const created = repository.start({ actor: 'backend-dev' });
            const startEventCount = capturedEvents.length;
            repository.update(created.id, { phase: 'planning' });
            // Find the update event for this session
            const updateEvents = capturedEvents.slice(startEventCount).filter((e) => e.entityId === created.id);
            expect(updateEvents.length).toBeGreaterThanOrEqual(1);
            const event = updateEvents[0];
            expect(event.entityId).toBe(created.id);
            expect(event.changedFields).toContain('phase');
        });
        it('should throw error for non-existent ID', () => {
            expect(() => {
                repository.update('non-existent-id', { phase: 'test' });
            }).toThrow('Session not found');
        });
    });
    describe('end', () => {
        it('should end a session', () => {
            const created = repository.start({ actor: 'backend-dev' });
            const ended = repository.end(created.id);
            expect(ended.endedAt).toBeDefined();
            expect(ended.endedAt).not.toBeNull();
        });
        it('should emit session:ended event with duration', () => {
            const created = repository.start({ actor: 'backend-dev' });
            const startEventCount = capturedEvents.length;
            repository.end(created.id);
            // Find the ended event for this session
            const endEvents = capturedEvents.slice(startEventCount).filter((e) => e.entityId === created.id);
            expect(endEvents.length).toBeGreaterThanOrEqual(1);
            const event = endEvents[0];
            expect(event.entityId).toBe(created.id);
            expect(event.durationMs).toBeGreaterThanOrEqual(0);
        });
        it('should throw error for non-existent ID', () => {
            expect(() => {
                repository.end('non-existent-id');
            }).toThrow('Session not found');
        });
    });
    describe('incrementCompactionCount', () => {
        it('should increment compaction count', () => {
            const created = repository.start({ actor: 'backend-dev' });
            expect(created.compactionCount).toBe(0);
            const updated1 = repository.incrementCompactionCount(created.id);
            expect(updated1.compactionCount).toBe(1);
            const updated2 = repository.incrementCompactionCount(created.id);
            expect(updated2.compactionCount).toBe(2);
        });
        it('should emit session:updated event', () => {
            const created = repository.start({ actor: 'backend-dev' });
            const startEventCount = capturedEvents.length;
            repository.incrementCompactionCount(created.id);
            // Find the update event for this session
            const updateEvents = capturedEvents.slice(startEventCount).filter((e) => e.entityId === created.id);
            expect(updateEvents.length).toBeGreaterThanOrEqual(1);
            const event = updateEvents[0];
            expect(event.changedFields).toContain('compactionCount');
        });
    });
    describe('findRecent', () => {
        it('should find recent sessions with limit', () => {
            for (let i = 0; i < 10; i++) {
                repository.start({ actor: `actor-${i}` });
            }
            const sessions = repository.findRecent(5);
            expect(sessions).toHaveLength(5);
            // All sessions should be valid
            for (const session of sessions) {
                expect(session.id).toBeDefined();
                expect(session.actor).toMatch(/^actor-\d+$/);
            }
        });
    });
    describe('getDuration', () => {
        it('should get duration for ended session', () => {
            const created = repository.start({ actor: 'backend-dev' });
            repository.end(created.id);
            const duration = repository.getDuration(created.id);
            expect(duration).toBeGreaterThanOrEqual(0);
        });
        it('should get duration for active session', () => {
            const created = repository.start({ actor: 'backend-dev' });
            const duration = repository.getDuration(created.id);
            expect(duration).toBeGreaterThanOrEqual(0);
        });
        it('should throw error for non-existent ID', () => {
            expect(() => {
                repository.getDuration('non-existent-id');
            }).toThrow('Session not found');
        });
    });
    describe('endAllActive', () => {
        it('should end all active sessions', () => {
            repository.start({ actor: 'backend-dev' });
            repository.start({ actor: 'frontend-dev' });
            repository.start({ actor: 'qa-dev' });
            const ended = repository.endAllActive();
            expect(ended).toHaveLength(3);
            for (const session of ended) {
                expect(session.endedAt).not.toBeNull();
            }
            const active = repository.findActive();
            expect(active).toBeNull();
        });
    });
    describe('singleton instance', () => {
        it('should export a singleton sessionRepository instance', () => {
            expect(sessionRepository).toBeInstanceOf(SessionRepository);
        });
    });
});
