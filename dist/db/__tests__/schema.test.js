/**
 * Tests for Database Schema and Migrations
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createTestDb, TABLES } from '../index';
import * as migration001 from '../migrations/001_initial';
describe('Database Schema', () => {
    let db;
    beforeEach(() => {
        db = createTestDb();
    });
    afterEach(() => {
        db.close();
    });
    describe('Initial Migration', () => {
        it('should create all required tables', () => {
            const tables = db
                .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .all();
            const tableNames = tables.map((t) => t.name);
            expect(tableNames).toContain(TABLES.SCHEMA_VERSIONS);
            expect(tableNames).toContain(TABLES.FEATURES);
            expect(tableNames).toContain(TABLES.STORIES);
            expect(tableNames).toContain(TABLES.TASKS);
            expect(tableNames).toContain(TABLES.ACCEPTANCE_CRITERIA);
            expect(tableNames).toContain(TABLES.HISTORY);
            expect(tableNames).toContain(TABLES.SESSIONS);
        });
        it('should record migration version', () => {
            const result = db
                .query(`SELECT version FROM ${TABLES.SCHEMA_VERSIONS}`)
                .all();
            expect(result).toHaveLength(1);
            expect(result[0].version).toBe(1);
        });
        it('should be idempotent (running twice does nothing)', () => {
            const result = migration001.run(db);
            expect(result.applied).toBe(false);
        });
    });
    describe('Features Table', () => {
        it('should have correct columns', () => {
            const columns = db
                .query(`PRAGMA table_info(${TABLES.FEATURES})`)
                .all();
            const columnNames = columns.map((c) => c.name);
            expect(columnNames).toContain('id');
            expect(columnNames).toContain('code');
            expect(columnNames).toContain('name');
            expect(columnNames).toContain('description');
            expect(columnNames).toContain('story_counter');
            expect(columnNames).toContain('extensions');
            expect(columnNames).toContain('created_at');
            expect(columnNames).toContain('updated_at');
        });
        it('should enforce unique code constraint', () => {
            db.run(`INSERT INTO ${TABLES.FEATURES} (id, code, name) VALUES ('1', 'TEST', 'Test Feature')`);
            expect(() => {
                db.run(`INSERT INTO ${TABLES.FEATURES} (id, code, name) VALUES ('2', 'TEST', 'Another Feature')`);
            }).toThrow();
        });
        it('should insert feature with defaults', () => {
            db.run(`INSERT INTO ${TABLES.FEATURES} (id, code, name) VALUES ('feat-1', 'NOTIFY', 'Notifications')`);
            const feature = db
                .query(`SELECT * FROM ${TABLES.FEATURES} WHERE id = ?`)
                .get('feat-1');
            expect(feature.code).toBe('NOTIFY');
            expect(feature.name).toBe('Notifications');
            expect(feature.story_counter).toBe(0);
            expect(feature.extensions).toBe('{}');
        });
    });
    describe('Stories Table', () => {
        beforeEach(() => {
            db.run(`INSERT INTO ${TABLES.FEATURES} (id, code, name) VALUES ('feat-1', 'NOTIFY', 'Notifications')`);
        });
        it('should have correct columns', () => {
            const columns = db
                .query(`PRAGMA table_info(${TABLES.STORIES})`)
                .all();
            const columnNames = columns.map((c) => c.name);
            expect(columnNames).toContain('id');
            expect(columnNames).toContain('code');
            expect(columnNames).toContain('feature_id');
            expect(columnNames).toContain('title');
            expect(columnNames).toContain('description');
            expect(columnNames).toContain('why');
            expect(columnNames).toContain('status');
            expect(columnNames).toContain('priority');
            expect(columnNames).toContain('assigned_to');
            expect(columnNames).toContain('extensions');
        });
        it('should enforce unique code constraint', () => {
            db.run(`INSERT INTO ${TABLES.STORIES} (id, code, feature_id, title) VALUES ('1', 'NOTIFY-001', 'feat-1', 'Story 1')`);
            expect(() => {
                db.run(`INSERT INTO ${TABLES.STORIES} (id, code, feature_id, title) VALUES ('2', 'NOTIFY-001', 'feat-1', 'Story 2')`);
            }).toThrow();
        });
        it('should enforce foreign key constraint', () => {
            expect(() => {
                db.run(`INSERT INTO ${TABLES.STORIES} (id, code, feature_id, title) VALUES ('1', 'FAKE-001', 'non-existent', 'Story')`);
            }).toThrow();
        });
        it('should cascade delete when feature is deleted', () => {
            db.run(`INSERT INTO ${TABLES.STORIES} (id, code, feature_id, title) VALUES ('story-1', 'NOTIFY-001', 'feat-1', 'Story 1')`);
            db.run(`DELETE FROM ${TABLES.FEATURES} WHERE id = 'feat-1'`);
            const story = db
                .query(`SELECT * FROM ${TABLES.STORIES} WHERE id = ?`)
                .get('story-1');
            expect(story).toBeNull();
        });
        it('should insert story with defaults', () => {
            db.run(`INSERT INTO ${TABLES.STORIES} (id, code, feature_id, title) VALUES ('story-1', 'NOTIFY-001', 'feat-1', 'Test Story')`);
            const story = db
                .query(`SELECT * FROM ${TABLES.STORIES} WHERE id = ?`)
                .get('story-1');
            expect(story.status).toBe('draft');
            expect(story.priority).toBe('P2');
            expect(story.assigned_to).toBeNull();
        });
    });
    describe('Tasks Table', () => {
        beforeEach(() => {
            db.run(`INSERT INTO ${TABLES.FEATURES} (id, code, name) VALUES ('feat-1', 'NOTIFY', 'Notifications')`);
            db.run(`INSERT INTO ${TABLES.STORIES} (id, code, feature_id, title) VALUES ('story-1', 'NOTIFY-001', 'feat-1', 'Story 1')`);
        });
        it('should have correct columns', () => {
            const columns = db
                .query(`PRAGMA table_info(${TABLES.TASKS})`)
                .all();
            const columnNames = columns.map((c) => c.name);
            expect(columnNames).toContain('id');
            expect(columnNames).toContain('story_id');
            expect(columnNames).toContain('title');
            expect(columnNames).toContain('description');
            expect(columnNames).toContain('status');
            expect(columnNames).toContain('priority');
            expect(columnNames).toContain('assigned_to');
            expect(columnNames).toContain('order_num');
            expect(columnNames).toContain('dependencies');
            expect(columnNames).toContain('ac_coverage');
            expect(columnNames).toContain('estimated_complexity');
        });
        it('should insert task with defaults', () => {
            db.run(`INSERT INTO ${TABLES.TASKS} (id, story_id, title) VALUES ('task-1', 'story-1', 'Test Task')`);
            const task = db
                .query(`SELECT * FROM ${TABLES.TASKS} WHERE id = ?`)
                .get('task-1');
            expect(task.status).toBe('pending');
            expect(task.priority).toBe('P2');
            expect(task.order_num).toBe(0);
            expect(task.dependencies).toBe('[]');
            expect(task.ac_coverage).toBe('[]');
            expect(task.estimated_complexity).toBe('medium');
        });
        it('should cascade delete when story is deleted', () => {
            db.run(`INSERT INTO ${TABLES.TASKS} (id, story_id, title) VALUES ('task-1', 'story-1', 'Test Task')`);
            db.run(`DELETE FROM ${TABLES.STORIES} WHERE id = 'story-1'`);
            const task = db
                .query(`SELECT * FROM ${TABLES.TASKS} WHERE id = ?`)
                .get('task-1');
            expect(task).toBeNull();
        });
    });
    describe('Acceptance Criteria Table', () => {
        beforeEach(() => {
            db.run(`INSERT INTO ${TABLES.FEATURES} (id, code, name) VALUES ('feat-1', 'NOTIFY', 'Notifications')`);
            db.run(`INSERT INTO ${TABLES.STORIES} (id, code, feature_id, title) VALUES ('story-1', 'NOTIFY-001', 'feat-1', 'Story 1')`);
        });
        it('should have correct columns', () => {
            const columns = db
                .query(`PRAGMA table_info(${TABLES.ACCEPTANCE_CRITERIA})`)
                .all();
            const columnNames = columns.map((c) => c.name);
            expect(columnNames).toContain('id');
            expect(columnNames).toContain('story_id');
            expect(columnNames).toContain('code');
            expect(columnNames).toContain('description');
            expect(columnNames).toContain('status');
            expect(columnNames).toContain('verification_notes');
            expect(columnNames).toContain('verified_at');
        });
        it('should insert acceptance criteria with defaults', () => {
            db.run(`INSERT INTO ${TABLES.ACCEPTANCE_CRITERIA} (id, story_id, code, description) VALUES ('ac-1', 'story-1', 'AC-001', 'Test criterion')`);
            const ac = db
                .query(`SELECT * FROM ${TABLES.ACCEPTANCE_CRITERIA} WHERE id = ?`)
                .get('ac-1');
            expect(ac.status).toBe('pending');
            expect(ac.verification_notes).toBeNull();
            expect(ac.verified_at).toBeNull();
        });
    });
    describe('History Table', () => {
        it('should have correct columns', () => {
            const columns = db
                .query(`PRAGMA table_info(${TABLES.HISTORY})`)
                .all();
            const columnNames = columns.map((c) => c.name);
            expect(columnNames).toContain('id');
            expect(columnNames).toContain('entity_type');
            expect(columnNames).toContain('entity_id');
            expect(columnNames).toContain('action');
            expect(columnNames).toContain('actor');
            expect(columnNames).toContain('summary');
            expect(columnNames).toContain('changes');
            expect(columnNames).toContain('previous_state');
        });
        it('should insert history entry', () => {
            db.run(`INSERT INTO ${TABLES.HISTORY} (id, entity_type, entity_id, action, actor, summary) VALUES ('hist-1', 'story', 'story-1', 'created', 'cli', 'Created story')`);
            const entry = db
                .query(`SELECT * FROM ${TABLES.HISTORY} WHERE id = ?`)
                .get('hist-1');
            expect(entry.entity_type).toBe('story');
            expect(entry.action).toBe('created');
            expect(entry.changes).toBe('{}');
        });
    });
    describe('Sessions Table', () => {
        beforeEach(() => {
            db.run(`INSERT INTO ${TABLES.FEATURES} (id, code, name) VALUES ('feat-1', 'NOTIFY', 'Notifications')`);
            db.run(`INSERT INTO ${TABLES.STORIES} (id, code, feature_id, title) VALUES ('story-1', 'NOTIFY-001', 'feat-1', 'Story 1')`);
            db.run(`INSERT INTO ${TABLES.TASKS} (id, story_id, title) VALUES ('task-1', 'story-1', 'Test Task')`);
        });
        it('should have correct columns', () => {
            const columns = db
                .query(`PRAGMA table_info(${TABLES.SESSIONS})`)
                .all();
            const columnNames = columns.map((c) => c.name);
            expect(columnNames).toContain('id');
            expect(columnNames).toContain('actor');
            expect(columnNames).toContain('active_story_id');
            expect(columnNames).toContain('active_task_id');
            expect(columnNames).toContain('started_at');
            expect(columnNames).toContain('ended_at');
            expect(columnNames).toContain('phase');
            expect(columnNames).toContain('compaction_count');
        });
        it('should insert session with defaults', () => {
            db.run(`INSERT INTO ${TABLES.SESSIONS} (id, actor) VALUES ('sess-1', 'backend-dev')`);
            const session = db
                .query(`SELECT * FROM ${TABLES.SESSIONS} WHERE id = ?`)
                .get('sess-1');
            expect(session.actor).toBe('backend-dev');
            expect(session.active_story_id).toBeNull();
            expect(session.active_task_id).toBeNull();
            expect(session.ended_at).toBeNull();
            expect(session.compaction_count).toBe(0);
        });
        it('should set null on story delete (not cascade)', () => {
            db.run(`INSERT INTO ${TABLES.SESSIONS} (id, actor, active_story_id, active_task_id) VALUES ('sess-1', 'backend-dev', 'story-1', 'task-1')`);
            db.run(`DELETE FROM ${TABLES.STORIES} WHERE id = 'story-1'`);
            const session = db
                .query(`SELECT * FROM ${TABLES.SESSIONS} WHERE id = ?`)
                .get('sess-1');
            expect(session).not.toBeNull();
            expect(session.active_story_id).toBeNull();
            expect(session.active_task_id).toBeNull();
        });
    });
    describe('Indexes', () => {
        it('should create all required indexes', () => {
            const indexes = db
                .query("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
                .all();
            const indexNames = indexes.map((i) => i.name);
            // Features indexes
            expect(indexNames).toContain('idx_features_code');
            // Stories indexes
            expect(indexNames).toContain('idx_stories_feature_id');
            expect(indexNames).toContain('idx_stories_status');
            expect(indexNames).toContain('idx_stories_code');
            // Tasks indexes
            expect(indexNames).toContain('idx_tasks_story_id');
            expect(indexNames).toContain('idx_tasks_status');
            // Acceptance criteria indexes
            expect(indexNames).toContain('idx_acceptance_criteria_story_id');
            expect(indexNames).toContain('idx_acceptance_criteria_status');
            // History indexes
            expect(indexNames).toContain('idx_history_entity_type');
            expect(indexNames).toContain('idx_history_entity_id');
            expect(indexNames).toContain('idx_history_entity_type_id');
            expect(indexNames).toContain('idx_history_action');
            // Sessions indexes
            expect(indexNames).toContain('idx_sessions_actor');
            expect(indexNames).toContain('idx_sessions_active_story_id');
            expect(indexNames).toContain('idx_sessions_active_task_id');
        });
    });
});
