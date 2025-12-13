/**
 * Sync Service Tests
 *
 * Tests for the inbound sync service (ADO -> trak)
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

import { SyncService } from '../sync-service';
import type { ADOClient } from '../api';
import type { FieldMapper } from '../mapping';
import type { SyncConfig, ADOWorkItem } from '../types';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock ADO client
 */
function createMockAdoClient(): ADOClient {
  return {
    getBoardWorkItems: mock(() => Promise.resolve([])),
    getWorkItem: mock(() => Promise.resolve(createMockWorkItem(1))),
    testConnection: mock(() => Promise.resolve(true)),
    organization: 'test-org',
    project: 'test-project',
    board: 'test-board',
  } as unknown as ADOClient;
}

/**
 * Create a mock field mapper
 */
function createMockFieldMapper(): FieldMapper {
  return {
    adoToTrak: mock((workItem: ADOWorkItem) => ({
      featureId: '',
      title: workItem.fields['System.Title'],
      description: workItem.fields['System.Description'] || '',
      why: workItem.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
      status: 'draft',
      priority: 'P2',
      assignedTo: null,
      adoWorkItemId: workItem.id,
      extensions: {
        adoWorkItemId: workItem.id,
        adoWorkItemUrl: workItem.url,
        adoLastSyncAt: new Date().toISOString(),
        adoRevision: workItem.rev,
        adoWorkItemType: workItem.fields['System.WorkItemType'],
      },
    })),
    isWorkItemTypeSupported: mock(() => true),
    getSupportedWorkItemTypes: mock(() => ['User Story', 'Bug']),
    getStateMapping: mock(() => ({ inbound: {}, outbound: {} })),
    getPriorityMapping: mock(() => ({ inbound: {}, outbound: {} })),
  } as unknown as FieldMapper;
}

/**
 * Create a mock work item
 */
function createMockWorkItem(id: number, overrides: Partial<ADOWorkItem['fields']> = {}): ADOWorkItem {
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/test-org/test-project/_apis/wit/workItems/${id}`,
    fields: {
      'System.Id': id,
      'System.Title': `Test Work Item ${id}`,
      'System.Description': `Description for work item ${id}`,
      'System.State': 'New',
      'System.WorkItemType': 'User Story',
      'System.AreaPath': 'test-project\\Area1',
      'System.IterationPath': 'test-project\\Sprint1',
      'System.CreatedDate': '2025-01-01T00:00:00Z',
      'System.CreatedBy': { displayName: 'Test User', url: '', id: '1', uniqueName: 'test@test.com' },
      'System.ChangedDate': '2025-01-02T00:00:00Z',
      'System.ChangedBy': { displayName: 'Test User', url: '', id: '1', uniqueName: 'test@test.com' },
      'System.Rev': 1,
      'Microsoft.VSTS.Common.Priority': 2,
      'Microsoft.VSTS.Common.AcceptanceCriteria': 'AC for work item',
      ...overrides,
    },
  };
}

/**
 * Create default sync config
 */
function createSyncConfig(): SyncConfig {
  return {
    pollInterval: 1000,
    batchSize: 100,
    inboundEnabled: true,
    outboundEnabled: false,
    conflictResolution: 'ado-wins',
  };
}

/**
 * Create test database with schema
 */
function createTestDatabase(dbPath: string): Database {
  const db = new Database(dbPath);

  // Create features table
  db.run(`
    CREATE TABLE IF NOT EXISTS features (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      story_counter INTEGER NOT NULL DEFAULT 0,
      extensions TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Create stories table
  db.run(`
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      feature_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      why TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      priority TEXT NOT NULL DEFAULT 'P2',
      assigned_to TEXT,
      estimated_complexity TEXT,
      extensions TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (feature_id) REFERENCES features(id) ON DELETE CASCADE
    );
  `);

  // Create index on extensions for ADO ID lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_stories_code ON stories(code);`);

  return db;
}

// =============================================================================
// Test Suite
// =============================================================================

describe('SyncService', () => {
  let testDbPath: string;
  let testDir: string;
  let adoClient: ADOClient;
  let fieldMapper: FieldMapper;
  let syncConfig: SyncConfig;
  let db: Database | null = null;

  beforeEach(() => {
    // Create temp directory for test database
    testDir = join(tmpdir(), `sync-service-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, 'test.db');

    // Initialize test database
    db = createTestDatabase(testDbPath);
    db.close();
    db = null;

    // Create mocks
    adoClient = createMockAdoClient();
    fieldMapper = createMockFieldMapper();
    syncConfig = createSyncConfig();
  });

  afterEach(() => {
    // Clean up
    if (db) {
      db.close();
      db = null;
    }

    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('creates a SyncService with default database path', () => {
      const service = new SyncService(adoClient, fieldMapper, syncConfig);
      expect(service).toBeDefined();
    });

    it('creates a SyncService with custom database path', () => {
      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      expect(service).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('returns initial status', () => {
      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      const status = service.getStatus();

      expect(status.lastRun).toBeNull();
      expect(status.nextRun).toBeNull();
      expect(status.itemsSynced).toBe(0);
      expect(status.itemsCreated).toBe(0);
      expect(status.itemsUpdated).toBe(0);
      expect(status.errors).toBe(0);
      expect(status.lastError).toBeNull();
    });
  });

  describe('syncNow', () => {
    it('returns success with empty work items', async () => {
      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);

      const result = await service.syncNow();

      expect(result.success).toBe(true);
      expect(result.direction).toBe('inbound');
      expect(result.itemsProcessed).toBe(0);
      expect(result.itemsCreated).toBe(0);
      expect(result.itemsUpdated).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('creates new story from ADO work item', async () => {
      // Setup mock to return work items
      const workItem = createMockWorkItem(101);
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockResolvedValue([workItem]);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      const result = await service.syncNow();

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(1);
      expect(result.itemsCreated).toBe(1);
      expect(result.itemsUpdated).toBe(0);

      // Verify story was created in database
      db = new Database(testDbPath);
      const stories = db.query('SELECT * FROM stories').all();
      expect(stories.length).toBe(1);

      const story = stories[0] as { title: string; extensions: string };
      expect(story.title).toBe('Test Work Item 101');

      const extensions = JSON.parse(story.extensions);
      expect(extensions.adoWorkItemId).toBe(101);
    });

    it('updates existing story from ADO work item', async () => {
      // Pre-create a feature and story (with non-draft status so it can be updated)
      db = new Database(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run(
        `INSERT INTO features (id, code, name, story_counter) VALUES (?, ?, ?, ?)`,
        [featureId, 'AREA1', 'Area 1', 1]
      );

      db.run(
        `INSERT INTO stories (id, code, feature_id, title, description, status, extensions) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          storyId,
          'AREA1-001',
          featureId,
          'Old Title',
          'Old Description',
          'planned', // Non-draft status so ADO can update it
          JSON.stringify({ adoWorkItemId: 102 }),
        ]
      );
      db.close();
      db = null;

      // Setup mock to return updated work item
      const workItem = createMockWorkItem(102, {
        'System.Title': 'Updated Title',
        'System.Description': 'Updated Description',
      });
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockResolvedValue([workItem]);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      const result = await service.syncNow();

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(1);
      expect(result.itemsCreated).toBe(0);
      expect(result.itemsUpdated).toBe(1);

      // Verify story was updated
      db = new Database(testDbPath);
      const story = db.query('SELECT * FROM stories WHERE id = ?').get(storyId) as { title: string };
      expect(story.title).toBe('Updated Title');
    });

    it('skips draft stories during inbound sync', async () => {
      // Pre-create a feature and a DRAFT story
      db = new Database(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run(
        `INSERT INTO features (id, code, name, story_counter) VALUES (?, ?, ?, ?)`,
        [featureId, 'DRAFT1', 'Draft Area', 1]
      );

      db.run(
        `INSERT INTO stories (id, code, feature_id, title, description, status, extensions) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          storyId,
          'DRAFT1-001',
          featureId,
          'My Draft Story',
          'Local draft description',
          'draft', // This is a draft story
          JSON.stringify({ adoWorkItemId: 201 }),
        ]
      );
      db.close();
      db = null;

      // Setup mock to return work item that would normally update this story
      const workItem = createMockWorkItem(201, {
        'System.Title': 'ADO Updated Title',
        'System.Description': 'ADO Description',
      });
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockResolvedValue([workItem]);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      const result = await service.syncNow();

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(1);
      expect(result.itemsCreated).toBe(0);
      expect(result.itemsUpdated).toBe(0);
      expect(result.itemsSkipped).toBe(1); // Draft was skipped

      // Verify story was NOT updated - should retain original draft values
      db = new Database(testDbPath);
      const story = db.query('SELECT * FROM stories WHERE id = ?').get(storyId) as {
        title: string;
        description: string;
        status: string;
      };
      expect(story.title).toBe('My Draft Story'); // Original title preserved
      expect(story.description).toBe('Local draft description'); // Original description preserved
      expect(story.status).toBe('draft'); // Still a draft
    });

    it('updates non-draft stories normally during inbound sync', async () => {
      // Pre-create a feature and a NON-draft story (status = 'planned')
      db = new Database(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run(
        `INSERT INTO features (id, code, name, story_counter) VALUES (?, ?, ?, ?)`,
        [featureId, 'NONDRAFT', 'Non-Draft Area', 1]
      );

      db.run(
        `INSERT INTO stories (id, code, feature_id, title, description, status, extensions) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          storyId,
          'NONDRAFT-001',
          featureId,
          'Original Title',
          'Original description',
          'planned', // This is NOT a draft
          JSON.stringify({ adoWorkItemId: 202 }),
        ]
      );
      db.close();
      db = null;

      // Setup mock to return work item
      const workItem = createMockWorkItem(202, {
        'System.Title': 'Updated From ADO',
        'System.Description': 'Updated Description',
      });
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockResolvedValue([workItem]);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      const result = await service.syncNow();

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(1);
      expect(result.itemsCreated).toBe(0);
      expect(result.itemsUpdated).toBe(1); // Non-draft was updated
      expect(result.itemsSkipped).toBe(0);

      // Verify story WAS updated
      db = new Database(testDbPath);
      const story = db.query('SELECT * FROM stories WHERE id = ?').get(storyId) as { title: string };
      expect(story.title).toBe('Updated From ADO');
    });

    it('auto-creates feature for new ADO area path', async () => {
      const workItem = createMockWorkItem(103, {
        'System.AreaPath': 'test-project\\NewArea',
      });
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockResolvedValue([workItem]);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      await service.syncNow();

      // Verify feature was created
      db = new Database(testDbPath);
      const features = db.query('SELECT * FROM features').all();
      expect(features.length).toBe(1);

      const feature = features[0] as { code: string; name: string };
      expect(feature.code).toBe('NEWAREA');
      expect(feature.name).toBe('NewArea');
    });

    it('handles sync errors gracefully', async () => {
      // Setup mock to throw error
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockRejectedValue(
        new Error('API Error')
      );

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      const result = await service.syncNow();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toBe('API Error');

      // Status should reflect the error
      const status = service.getStatus();
      expect(status.lastError).toBe('API Error');
    });

    it('skips unsupported work item types', async () => {
      const workItem = createMockWorkItem(104, {
        'System.WorkItemType': 'Epic',
      });
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockResolvedValue([workItem]);
      (fieldMapper.isWorkItemTypeSupported as ReturnType<typeof mock>).mockReturnValue(false);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      const result = await service.syncNow();

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(1);
      expect(result.itemsSkipped).toBe(1);
      expect(result.itemsCreated).toBe(0);
    });

    it('prevents concurrent sync operations', async () => {
      // Create a slow mock
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return [];
      });

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);

      // Start two syncs concurrently
      const [result1, result2] = await Promise.all([service.syncNow(), service.syncNow()]);

      // One should succeed, one should fail due to concurrent sync
      const successCount = [result1, result2].filter((r) => r.success).length;
      const failCount = [result1, result2].filter((r) => !r.success).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
    });
  });

  describe('syncWorkItem', () => {
    it('syncs a single work item by ID', async () => {
      const workItem = createMockWorkItem(105);
      (adoClient.getWorkItem as ReturnType<typeof mock>).mockResolvedValue(workItem);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      const result = await service.syncWorkItem(105);

      expect(result).toBeDefined();
      expect(result?.id).toBe(105);

      // Verify story was created
      db = new Database(testDbPath);
      const stories = db.query('SELECT * FROM stories').all();
      expect(stories.length).toBe(1);
    });

    it('returns null for unsupported work item types', async () => {
      const workItem = createMockWorkItem(106, {
        'System.WorkItemType': 'Epic',
      });
      (adoClient.getWorkItem as ReturnType<typeof mock>).mockResolvedValue(workItem);
      (fieldMapper.isWorkItemTypeSupported as ReturnType<typeof mock>).mockReturnValue(false);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      const result = await service.syncWorkItem(106);

      expect(result).toBeNull();
    });
  });

  describe('startPolling / stopPolling', () => {
    it('starts and stops polling', async () => {
      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);

      service.startPolling();

      // Status should show next run scheduled
      let status = service.getStatus();
      expect(status.nextRun).not.toBeNull();

      // Wait a bit for first sync to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      service.stopPolling();

      // Status should show no next run
      status = service.getStatus();
      expect(status.nextRun).toBeNull();
    });

    it('prevents double start', () => {
      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);

      service.startPolling();
      service.startPolling(); // Should be a no-op

      service.stopPolling();
    });
  });

  describe('status updates', () => {
    it('updates status after successful sync', async () => {
      const workItems = [createMockWorkItem(107), createMockWorkItem(108)];
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockResolvedValue(workItems);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      await service.syncNow();

      const status = service.getStatus();
      expect(status.lastRun).not.toBeNull();
      expect(status.itemsSynced).toBe(2);
      expect(status.itemsCreated).toBe(2);
      expect(status.errors).toBe(0);
    });

    it('updates status after failed sync', async () => {
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockRejectedValue(
        new Error('Network error')
      );

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      await service.syncNow();

      const status = service.getStatus();
      expect(status.lastRun).not.toBeNull();
      expect(status.errors).toBe(1);
      expect(status.lastError).toBe('Network error');
    });
  });

  describe('feature auto-creation', () => {
    it('reuses existing feature for same area path', async () => {
      const workItems = [
        createMockWorkItem(109, { 'System.AreaPath': 'test-project\\SharedArea' }),
        createMockWorkItem(110, { 'System.AreaPath': 'test-project\\SharedArea' }),
      ];
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockResolvedValue(workItems);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      await service.syncNow();

      // Should only create one feature
      db = new Database(testDbPath);
      const features = db.query('SELECT * FROM features').all();
      expect(features.length).toBe(1);

      // But two stories
      const stories = db.query('SELECT * FROM stories').all();
      expect(stories.length).toBe(2);
    });

    it('increments story counter correctly', async () => {
      const workItems = [
        createMockWorkItem(111, { 'System.AreaPath': 'test-project\\Counter' }),
        createMockWorkItem(112, { 'System.AreaPath': 'test-project\\Counter' }),
        createMockWorkItem(113, { 'System.AreaPath': 'test-project\\Counter' }),
      ];
      (adoClient.getBoardWorkItems as ReturnType<typeof mock>).mockResolvedValue(workItems);

      const service = new SyncService(adoClient, fieldMapper, syncConfig, testDbPath);
      await service.syncNow();

      db = new Database(testDbPath);
      const feature = db.query('SELECT * FROM features').get() as { story_counter: number };
      expect(feature.story_counter).toBe(3);

      // Verify story codes
      const stories = db.query('SELECT code FROM stories ORDER BY code').all() as { code: string }[];
      expect(stories.map((s) => s.code)).toEqual(['COUNTER-001', 'COUNTER-002', 'COUNTER-003']);
    });
  });
});
