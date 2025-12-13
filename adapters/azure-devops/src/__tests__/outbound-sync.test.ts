/**
 * Outbound Sync Service Tests
 *
 * Tests for the outbound sync service (trak -> ADO)
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Database } from 'bun:sqlite';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

import { OutboundSyncService, OutboundErrorCodes } from '../outbound-sync';
import type { ADOClient } from '../api';
import { ADONotFoundError, ADOAuthenticationError, ADOValidationError, ADORateLimitError } from '../api';
import type { FieldMapper, TrakStoryStatus } from '../mapping';
import type { ADOWorkItem } from '../types';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock ADO client
 */
function createMockAdoClient(): ADOClient {
  return {
    getWorkItem: mock(() => Promise.resolve(createMockWorkItem(1))),
    updateWorkItemState: mock(() => Promise.resolve(createMockWorkItem(1, { 'System.State': 'Active' }))),
    createWorkItem: mock(() => Promise.resolve(createMockWorkItem(1))),
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
    trakStatusToAdoState: mock((status: TrakStoryStatus) => {
      const mapping: Record<string, string> = {
        'draft': 'New',
        'planned': 'New',
        'in_progress': 'Active',
        'review': 'Resolved',
        'completed': 'Closed',
        'cancelled': 'Removed',
      };
      return mapping[status] || 'New';
    }),
    adoStateToTrakStatus: mock(() => 'draft'),
    isWorkItemTypeSupported: mock(() => true),
    getSupportedWorkItemTypes: mock(() => ['User Story', 'Bug']),
    getStateMapping: mock(() => ({
      inbound: { 'New': 'draft', 'Active': 'in_progress' },
      outbound: { 'draft': 'New', 'in_progress': 'Active' },
    })),
    trakToAdoFields: mock(() => ({
      'System.Title': 'Mock Title',
      'System.State': 'New',
      'Microsoft.VSTS.Common.Priority': 2,
    })),
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
      ...overrides,
    },
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

  return db;
}

/**
 * Insert a test story into the database
 */
function insertTestStory(
  db: Database,
  options: {
    storyId?: string;
    featureId?: string;
    status?: string;
    adoWorkItemId?: number;
    lastPushedAt?: string | null;
  } = {}
): { storyId: string; featureId: string } {
  const featureId = options.featureId || crypto.randomUUID();
  const storyId = options.storyId || crypto.randomUUID();
  const adoWorkItemId = options.adoWorkItemId || 123;

  // Insert feature if it doesn't exist
  const existingFeature = db.query('SELECT id FROM features WHERE id = ?').get(featureId);
  if (!existingFeature) {
    db.run(
      'INSERT INTO features (id, code, name, story_counter) VALUES (?, ?, ?, ?)',
      [featureId, 'TEST', 'Test Feature', 1]
    );
  }

  // Build extensions
  const extensions: Record<string, unknown> = { adoWorkItemId };
  if (options.lastPushedAt !== undefined) {
    extensions.lastPushedAt = options.lastPushedAt;
  }

  // Insert story
  db.run(
    `INSERT INTO stories (id, code, feature_id, title, status, extensions, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      storyId,
      `TEST-001`,
      featureId,
      'Test Story',
      options.status || 'draft',
      JSON.stringify(extensions),
    ]
  );

  return { storyId, featureId };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('OutboundSyncService', () => {
  let testDbPath: string;
  let testDir: string;
  let adoClient: ADOClient;
  let fieldMapper: FieldMapper;
  let db: Database | null = null;

  beforeEach(() => {
    // Create temp directory for test database
    testDir = join(tmpdir(), `outbound-sync-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, 'test.db');

    // Initialize test database
    db = createTestDatabase(testDbPath);
    db.close();
    db = null;

    // Create mocks
    adoClient = createMockAdoClient();
    fieldMapper = createMockFieldMapper();
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
    it('creates an OutboundSyncService with default database path', () => {
      const service = new OutboundSyncService(adoClient, fieldMapper);
      expect(service).toBeDefined();
    });

    it('creates an OutboundSyncService with custom database path', () => {
      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      expect(service).toBeDefined();
    });
  });

  describe('getOutboundStatus', () => {
    it('returns initial status', () => {
      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const status = service.getOutboundStatus();

      expect(status.lastPush).toBeNull();
      expect(status.itemsPushed).toBe(0);
      expect(status.errors).toBe(0);
      expect(status.lastError).toBeNull();
    });
  });

  describe('pushStateChange', () => {
    it('pushes state change to ADO successfully', async () => {
      // Setup: Create a story linked to ADO work item
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 100 });
      db.close();
      db = null;

      // Mock: ADO returns current state as 'New', then update succeeds
      (adoClient.getWorkItem as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(100, { 'System.State': 'New' })
      );
      (adoClient.updateWorkItemState as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(100, { 'System.State': 'Active' })
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushStateChange(storyId, 'in_progress');

      expect(result.success).toBe(true);
      expect(result.workItemId).toBe(100);
      expect(result.previousState).toBe('New');
      expect(result.newState).toBe('Active');

      // Verify status was updated
      const status = service.getOutboundStatus();
      expect(status.itemsPushed).toBe(1);
      expect(status.lastPush).not.toBeNull();
    });

    it('skips update if state is unchanged', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 101 });
      db.close();
      db = null;

      // Mock: ADO is already in the target state
      (adoClient.getWorkItem as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(101, { 'System.State': 'Active' })
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushStateChange(storyId, 'in_progress');

      expect(result.success).toBe(true);
      expect(result.previousState).toBe('Active');
      expect(result.newState).toBe('Active');

      // updateWorkItemState should not be called
      expect(adoClient.updateWorkItemState).not.toHaveBeenCalled();
    });

    it('returns error when story not found', async () => {
      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushStateChange('non-existent-id', 'completed');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.STORY_NOT_FOUND);
      expect(result.error).toContain('not found');
    });

    it('returns error when story has no ADO link', async () => {
      // Create story without ADO work item ID
      db = createTestDatabase(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run('INSERT INTO features (id, code, name) VALUES (?, ?, ?)', [featureId, 'TEST', 'Test']);
      db.run(
        'INSERT INTO stories (id, code, feature_id, title, extensions) VALUES (?, ?, ?, ?, ?)',
        [storyId, 'TEST-001', featureId, 'Test Story', '{}']
      );
      db.close();
      db = null;

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushStateChange(storyId, 'completed');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.NO_ADO_LINK);
    });

    it('handles ADO work item not found error', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 999 });
      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADONotFoundError('Work item', 999)
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushStateChange(storyId, 'completed');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.WORK_ITEM_NOT_FOUND);
    });

    it('handles ADO authentication error', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 102 });
      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADOAuthenticationError()
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushStateChange(storyId, 'completed');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.AUTHENTICATION_FAILED);
    });

    it('handles ADO validation error', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 103 });
      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(103, { 'System.State': 'New' })
      );
      (adoClient.updateWorkItemState as ReturnType<typeof mock>).mockRejectedValue(
        new ADOValidationError('Invalid state transition')
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushStateChange(storyId, 'completed');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.VALIDATION_ERROR);
      expect(result.error).toContain('Invalid state transition');
    });

    it('handles ADO rate limit error', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 104 });
      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADORateLimitError()
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushStateChange(storyId, 'completed');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.RATE_LIMITED);
    });

    it('updates push metadata in story extensions', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 105 });
      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(105, { 'System.State': 'New' })
      );
      (adoClient.updateWorkItemState as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(105, { 'System.State': 'Closed' })
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await service.pushStateChange(storyId, 'completed');

      // Verify extensions were updated
      db = new Database(testDbPath);
      const story = db.query('SELECT extensions FROM stories WHERE id = ?').get(storyId) as { extensions: string };
      const extensions = JSON.parse(story.extensions);

      expect(extensions.lastPushedAt).toBeDefined();
      expect(extensions.lastPushedStatus).toBe('completed');
    });
  });

  describe('pushStateChangeByWorkItemId', () => {
    it('pushes state change using work item ID', async () => {
      db = createTestDatabase(testDbPath);
      insertTestStory(db, { adoWorkItemId: 200 });
      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(200, { 'System.State': 'New' })
      );
      (adoClient.updateWorkItemState as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(200, { 'System.State': 'Resolved' })
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushStateChangeByWorkItemId(200, 'review');

      expect(result.success).toBe(true);
      expect(result.workItemId).toBe(200);
      expect(result.newState).toBe('Resolved');
    });

    it('works even if story is not in trak database', async () => {
      // Don't create any story in the database

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(201, { 'System.State': 'New' })
      );
      (adoClient.updateWorkItemState as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(201, { 'System.State': 'Active' })
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushStateChangeByWorkItemId(201, 'in_progress');

      expect(result.success).toBe(true);
      expect(result.workItemId).toBe(201);
      expect(result.storyId).toBe(''); // No story found
    });
  });

  describe('pushPendingChanges', () => {
    it('pushes all pending changes', async () => {
      db = createTestDatabase(testDbPath);
      const featureId = crypto.randomUUID();
      db.run('INSERT INTO features (id, code, name) VALUES (?, ?, ?)', [featureId, 'TEST', 'Test']);

      // Story 1: has pending changes (no lastPushedAt)
      const storyId1 = crypto.randomUUID();
      db.run(
        `INSERT INTO stories (id, code, feature_id, title, status, extensions) VALUES (?, ?, ?, ?, ?, ?)`,
        [storyId1, 'TEST-001', featureId, 'Story 1', 'completed', JSON.stringify({ adoWorkItemId: 301 })]
      );

      // Story 2: has pending changes (updated_at > lastPushedAt)
      const storyId2 = crypto.randomUUID();
      const oldDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
      db.run(
        `INSERT INTO stories (id, code, feature_id, title, status, extensions, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [storyId2, 'TEST-002', featureId, 'Story 2', 'in_progress', JSON.stringify({ adoWorkItemId: 302, lastPushedAt: oldDate })]
      );

      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockImplementation(async (id: number) => {
        return createMockWorkItem(id, { 'System.State': 'New' });
      });
      (adoClient.updateWorkItemState as ReturnType<typeof mock>).mockImplementation(async (id: number, state: string) => {
        return createMockWorkItem(id, { 'System.State': state });
      });

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushPendingChanges();

      expect(result.success).toBe(true);
      expect(result.direction).toBe('outbound');
      expect(result.itemsProcessed).toBe(2);
      expect(result.itemsUpdated).toBe(2);
    });

    it('skips stories without ADO link', async () => {
      db = createTestDatabase(testDbPath);
      const featureId = crypto.randomUUID();
      db.run('INSERT INTO features (id, code, name) VALUES (?, ?, ?)', [featureId, 'TEST', 'Test']);

      // Story without ADO work item ID
      const storyId = crypto.randomUUID();
      db.run(
        `INSERT INTO stories (id, code, feature_id, title, status, extensions) VALUES (?, ?, ?, ?, ?, ?)`,
        [storyId, 'TEST-001', featureId, 'Story 1', 'completed', '{}']
      );

      db.close();
      db = null;

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushPendingChanges();

      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(0); // Not even processed because no ADO link
    });

    it('tracks errors in result', async () => {
      db = createTestDatabase(testDbPath);
      insertTestStory(db, { adoWorkItemId: 400 });
      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADONotFoundError('Work item', 400)
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.pushPendingChanges();

      expect(result.success).toBe(true); // Overall success, but with errors
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].workItemId).toBe(400);
    });
  });

  describe('status tracking', () => {
    it('tracks errors in status', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 500 });
      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADONotFoundError('Work item', 500)
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await service.pushStateChange(storyId, 'completed');

      const status = service.getOutboundStatus();
      expect(status.errors).toBe(1);
      expect(status.lastError).toContain('not found');
    });

    it('allows resetting errors', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 501 });
      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADONotFoundError('Work item', 501)
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await service.pushStateChange(storyId, 'completed');

      let status = service.getOutboundStatus();
      expect(status.errors).toBe(1);

      service.resetErrors();

      status = service.getOutboundStatus();
      expect(status.errors).toBe(0);
      expect(status.lastError).toBeNull();
    });
  });

  describe('state mapping', () => {
    it('maps trak statuses to ADO states correctly', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 600 });
      db.close();
      db = null;

      (adoClient.getWorkItem as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(600, { 'System.State': 'New' })
      );
      (adoClient.updateWorkItemState as ReturnType<typeof mock>).mockResolvedValue(
        createMockWorkItem(600, { 'System.State': 'Closed' })
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await service.pushStateChange(storyId, 'completed');

      // Verify the mapper was called with correct status
      expect(fieldMapper.trakStatusToAdoState).toHaveBeenCalledWith('completed');

      // Verify ADO client was called with mapped state
      expect(adoClient.updateWorkItemState).toHaveBeenCalledWith(600, 'Closed');
    });
  });

  describe('createWorkItemFromStory', () => {
    it('creates ADO work item from story successfully', async () => {
      // Setup: Create a story WITHOUT ADO work item link
      db = createTestDatabase(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run('INSERT INTO features (id, code, name) VALUES (?, ?, ?)', [featureId, 'TEST', 'Test Feature']);
      db.run(
        `INSERT INTO stories (id, code, feature_id, title, description, why, status, priority, extensions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [storyId, 'TEST-001', featureId, 'Test Story Title', 'Story description', 'Why this story', 'draft', 'P1', '{}']
      );
      db.close();
      db = null;

      // Mock: ADO client creates work item
      const createdWorkItem = createMockWorkItem(700, {
        'System.Title': 'Test Story Title',
        'System.State': 'New',
      });
      createdWorkItem._links = { html: { href: 'https://dev.azure.com/org/project/_workitems/edit/700' } };

      (adoClient.createWorkItem as ReturnType<typeof mock>).mockResolvedValue(createdWorkItem);

      // Mock: Field mapper returns ADO fields
      (fieldMapper.trakToAdoFields as ReturnType<typeof mock>).mockReturnValue({
        'System.Title': 'Test Story Title',
        'System.Description': '<div>Story description</div>',
        'Microsoft.VSTS.Common.Priority': 1,
        'System.State': 'New',
      });

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.createWorkItemFromStory(storyId);

      expect(result.success).toBe(true);
      expect(result.storyId).toBe(storyId);
      expect(result.adoWorkItemId).toBe(700);
      expect(result.url).toBeDefined();
      // URL comes from workItem.url or _links.html.href
      expect(result.url).toContain('700');

      // Verify fieldMapper was called
      expect(fieldMapper.trakToAdoFields).toHaveBeenCalled();

      // Verify ADO client was called with correct type (default: Issue)
      expect(adoClient.createWorkItem).toHaveBeenCalledWith('Issue', expect.any(Object));

      // Verify story was updated with ADO link
      db = new Database(testDbPath);
      const story = db.query('SELECT extensions FROM stories WHERE id = ?').get(storyId) as { extensions: string };
      const extensions = JSON.parse(story.extensions);
      expect(extensions.adoWorkItemId).toBe(700);
      expect(extensions.adoWorkItemUrl).toBeDefined();
    });

    it('creates work item with custom work item type', async () => {
      db = createTestDatabase(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run('INSERT INTO features (id, code, name) VALUES (?, ?, ?)', [featureId, 'TEST', 'Test']);
      db.run(
        'INSERT INTO stories (id, code, feature_id, title, extensions) VALUES (?, ?, ?, ?, ?)',
        [storyId, 'TEST-001', featureId, 'Test Story', '{}']
      );
      db.close();
      db = null;

      const createdWorkItem = createMockWorkItem(701);
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockResolvedValue(createdWorkItem);
      (fieldMapper.trakToAdoFields as ReturnType<typeof mock>).mockReturnValue({ 'System.Title': 'Test' });

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.createWorkItemFromStory(storyId, 'User Story');

      expect(result.success).toBe(true);
      expect(adoClient.createWorkItem).toHaveBeenCalledWith('User Story', expect.any(Object));
    });

    it('returns error when story not found', async () => {
      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.createWorkItemFromStory('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.STORY_NOT_FOUND);
      expect(result.error).toContain('not found');
    });

    it('returns error when story already has ADO link (idempotent check)', async () => {
      // Create story that already has an ADO work item ID
      db = createTestDatabase(testDbPath);
      const { storyId } = insertTestStory(db, { adoWorkItemId: 999 });
      db.close();
      db = null;

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.createWorkItemFromStory(storyId);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.ALREADY_LINKED);
      expect(result.error).toContain('already linked');
      expect(result.error).toContain('999');

      // Verify createWorkItem was NOT called
      expect(adoClient.createWorkItem).not.toHaveBeenCalled();
    });

    it('handles ADO authentication error', async () => {
      db = createTestDatabase(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run('INSERT INTO features (id, code, name) VALUES (?, ?, ?)', [featureId, 'TEST', 'Test']);
      db.run(
        'INSERT INTO stories (id, code, feature_id, title, extensions) VALUES (?, ?, ?, ?, ?)',
        [storyId, 'TEST-001', featureId, 'Test Story', '{}']
      );
      db.close();
      db = null;

      (fieldMapper.trakToAdoFields as ReturnType<typeof mock>).mockReturnValue({ 'System.Title': 'Test' });
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADOAuthenticationError()
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.createWorkItemFromStory(storyId);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.AUTHENTICATION_FAILED);
    });

    it('handles ADO validation error', async () => {
      db = createTestDatabase(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run('INSERT INTO features (id, code, name) VALUES (?, ?, ?)', [featureId, 'TEST', 'Test']);
      db.run(
        'INSERT INTO stories (id, code, feature_id, title, extensions) VALUES (?, ?, ?, ?, ?)',
        [storyId, 'TEST-001', featureId, 'Test Story', '{}']
      );
      db.close();
      db = null;

      (fieldMapper.trakToAdoFields as ReturnType<typeof mock>).mockReturnValue({ 'System.Title': 'Test' });
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADOValidationError('Invalid work item type')
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.createWorkItemFromStory(storyId);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.VALIDATION_ERROR);
      expect(result.error).toContain('Invalid work item type');
    });

    it('handles ADO rate limit error', async () => {
      db = createTestDatabase(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run('INSERT INTO features (id, code, name) VALUES (?, ?, ?)', [featureId, 'TEST', 'Test']);
      db.run(
        'INSERT INTO stories (id, code, feature_id, title, extensions) VALUES (?, ?, ?, ?, ?)',
        [storyId, 'TEST-001', featureId, 'Test Story', '{}']
      );
      db.close();
      db = null;

      (fieldMapper.trakToAdoFields as ReturnType<typeof mock>).mockReturnValue({ 'System.Title': 'Test' });
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADORateLimitError()
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await service.createWorkItemFromStory(storyId);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.RATE_LIMITED);
    });

    it('updates status tracking on success', async () => {
      db = createTestDatabase(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run('INSERT INTO features (id, code, name) VALUES (?, ?, ?)', [featureId, 'TEST', 'Test']);
      db.run(
        'INSERT INTO stories (id, code, feature_id, title, extensions) VALUES (?, ?, ?, ?, ?)',
        [storyId, 'TEST-001', featureId, 'Test Story', '{}']
      );
      db.close();
      db = null;

      (adoClient.createWorkItem as ReturnType<typeof mock>).mockResolvedValue(createMockWorkItem(702));
      (fieldMapper.trakToAdoFields as ReturnType<typeof mock>).mockReturnValue({ 'System.Title': 'Test' });

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await service.createWorkItemFromStory(storyId);

      const status = service.getOutboundStatus();
      expect(status.itemsPushed).toBe(1);
      expect(status.lastPush).not.toBeNull();
    });

    it('tracks errors on failure', async () => {
      db = createTestDatabase(testDbPath);
      const featureId = crypto.randomUUID();
      const storyId = crypto.randomUUID();

      db.run('INSERT INTO features (id, code, name) VALUES (?, ?, ?)', [featureId, 'TEST', 'Test']);
      db.run(
        'INSERT INTO stories (id, code, feature_id, title, extensions) VALUES (?, ?, ?, ?, ?)',
        [storyId, 'TEST-001', featureId, 'Test Story', '{}']
      );
      db.close();
      db = null;

      (fieldMapper.trakToAdoFields as ReturnType<typeof mock>).mockReturnValue({ 'System.Title': 'Test' });
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADOValidationError('Error')
      );

      const service = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await service.createWorkItemFromStory(storyId);

      const status = service.getOutboundStatus();
      expect(status.errors).toBe(1);
      expect(status.lastError).toBeDefined();
    });
  });
});
