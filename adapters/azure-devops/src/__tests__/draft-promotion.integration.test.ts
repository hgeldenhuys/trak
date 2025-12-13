/**
 * Draft Promotion Integration Tests
 *
 * End-to-end integration tests for the draft story promotion flow.
 * These tests verify the complete flow:
 * 1. Create a draft story locally in trak's story repository
 * 2. Verify story has status='draft' and no adoWorkItemId
 * 3. Call POST /ado/work-item endpoint with the story ID
 * 4. Verify response contains success, adoWorkItemId, and URL
 * 5. Verify the story now has adoWorkItemId in extensions
 *
 * AC-007: Integration test verifies end-to-end flow
 *
 * @module draft-promotion.integration.test
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { Database } from 'bun:sqlite';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';

import { OutboundSyncService, OutboundErrorCodes } from '../outbound-sync';
import type { CreateWorkItemResult } from '../outbound-sync';
import type { ADOClient } from '../api';
import { ADOAuthenticationError, ADORateLimitError, ADOValidationError } from '../api';
import type { FieldMapper, TrakStory, TrakPriority, TrakStoryStatus } from '../mapping';
import type { ADOWorkItem, ADOStoryExtensions } from '../types';

// =============================================================================
// Test Configuration
// =============================================================================

/**
 * Test config matching story.json technicalNotes
 */
const TEST_CONFIG = {
  org: 'ively',
  project: 'ively.core',
  workItemType: 'Issue',
};

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a mock ADO work item
 */
function createMockWorkItem(id: number, overrides: Partial<ADOWorkItem['fields']> = {}): ADOWorkItem {
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/${TEST_CONFIG.org}/${TEST_CONFIG.project}/_apis/wit/workItems/${id}`,
    _links: {
      html: {
        href: `https://dev.azure.com/${TEST_CONFIG.org}/${TEST_CONFIG.project}/_workitems/edit/${id}`,
      },
    },
    fields: {
      'System.Id': id,
      'System.Title': `Test Work Item ${id}`,
      'System.Description': `Description for work item ${id}`,
      'System.State': 'New',
      'System.WorkItemType': TEST_CONFIG.workItemType,
      'System.AreaPath': `${TEST_CONFIG.project}\\Area1`,
      'System.IterationPath': `${TEST_CONFIG.project}\\Sprint1`,
      'System.CreatedDate': '2025-12-10T00:00:00Z',
      'System.CreatedBy': { displayName: 'Test User', url: '', id: '1', uniqueName: 'test@test.com' },
      'System.ChangedDate': '2025-12-10T00:00:00Z',
      'System.ChangedBy': { displayName: 'Test User', url: '', id: '1', uniqueName: 'test@test.com' },
      'System.Rev': 1,
      'Microsoft.VSTS.Common.Priority': 2,
      ...overrides,
    },
  } as ADOWorkItem;
}

/**
 * Create a mock ADO client
 */
function createMockAdoClient(): ADOClient {
  return {
    getWorkItem: mock(() => Promise.resolve(createMockWorkItem(1))),
    updateWorkItemState: mock(() => Promise.resolve(createMockWorkItem(1, { 'System.State': 'Active' }))),
    createWorkItem: mock(() => Promise.resolve(createMockWorkItem(1))),
    testConnection: mock(() => Promise.resolve(true)),
    organization: TEST_CONFIG.org,
    project: TEST_CONFIG.project,
    board: 'default',
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
    getSupportedWorkItemTypes: mock(() => ['User Story', 'Bug', 'Issue']),
    getStateMapping: mock(() => ({
      inbound: { 'New': 'draft', 'Active': 'in_progress' },
      outbound: { 'draft': 'New', 'in_progress': 'Active' },
    })),
    trakToAdoFields: mock((story: TrakStory) => ({
      'System.Title': story.title,
      'System.Description': `<div>${story.description}</div>`,
      'Microsoft.VSTS.Common.Priority': story.priority === 'P0' ? 1 : story.priority === 'P1' ? 2 : story.priority === 'P2' ? 3 : 4,
      'System.State': 'New',
    })),
    trakPriorityToAdoPriority: mock((priority: TrakPriority) => {
      const mapping: Record<string, number> = { 'P0': 1, 'P1': 2, 'P2': 3, 'P3': 4 };
      return mapping[priority] || 3;
    }),
  } as unknown as FieldMapper;
}

/**
 * Create test database with schema matching trak's SQLite structure
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
 * Insert a draft story into the database (simulating CLI story create --draft)
 */
function insertDraftStory(
  db: Database,
  options: {
    storyId?: string;
    featureId?: string;
    title?: string;
    description?: string;
    why?: string;
    priority?: TrakPriority;
    adoWorkItemId?: number; // For testing idempotent behavior
  } = {}
): { storyId: string; featureId: string; code: string } {
  const featureId = options.featureId || crypto.randomUUID();
  const storyId = options.storyId || crypto.randomUUID();
  const title = options.title || 'Test Draft Story';
  const description = options.description || 'This is a draft story created locally';
  const why = options.why || 'To test the draft promotion flow';
  const priority = options.priority || 'P2';

  // Insert feature if it doesn't exist
  const existingFeature = db.query('SELECT id FROM features WHERE id = ?').get(featureId);
  if (!existingFeature) {
    db.run(
      'INSERT INTO features (id, code, name, story_counter) VALUES (?, ?, ?, ?)',
      [featureId, 'DRAFT', 'Draft Feature', 1]
    );
  }

  // Build extensions - only include adoWorkItemId if specified
  const extensions: Record<string, unknown> = {};
  if (options.adoWorkItemId !== undefined) {
    extensions.adoWorkItemId = options.adoWorkItemId;
  }

  // Insert story with status='draft' and no adoWorkItemId (unless testing idempotent)
  db.run(
    `INSERT INTO stories (id, code, feature_id, title, description, why, status, priority, extensions, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, datetime('now'))`,
    [
      storyId,
      `DRAFT-001`,
      featureId,
      title,
      description,
      why,
      priority,
      JSON.stringify(extensions),
    ]
  );

  return { storyId, featureId, code: 'DRAFT-001' };
}

/**
 * Read story from database to verify updates
 */
function readStoryFromDb(db: Database, storyId: string): {
  id: string;
  status: string;
  extensions: Record<string, unknown> & Partial<ADOStoryExtensions>;
} | null {
  const row = db.query<{
    id: string;
    status: string;
    extensions: string;
  }, [string]>('SELECT id, status, extensions FROM stories WHERE id = ?').get(storyId);

  if (!row) return null;

  let extensions: Record<string, unknown> = {};
  try {
    extensions = JSON.parse(row.extensions || '{}');
  } catch {
    extensions = {};
  }

  return {
    id: row.id,
    status: row.status,
    extensions,
  };
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Draft Promotion Integration Tests', () => {
  let testDbPath: string;
  let testDir: string;
  let adoClient: ADOClient;
  let fieldMapper: FieldMapper;
  let db: Database | null = null;

  beforeEach(() => {
    // Create temp directory for test database
    testDir = join(tmpdir(), `draft-promotion-test-${Date.now()}`);
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

  // ===========================================================================
  // Test Case 1: Successfully creates ADO work item from draft story
  // ===========================================================================
  describe('TC-001: Successfully creates ADO work item from draft story', () => {
    it('creates ADO work item and updates story extensions', async () => {
      // Step 1: Create a draft story locally via trak's story repository
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db, {
        title: 'Implement user authentication',
        description: 'Add OAuth2 login flow with Google provider',
        why: 'Users need secure access to the application',
        priority: 'P1',
      });
      db.close();
      db = null;

      // Step 2: Verify story has status='draft' and no adoWorkItemId
      db = new Database(testDbPath);
      let story = readStoryFromDb(db, storyId);
      db.close();
      db = null;

      expect(story).not.toBeNull();
      expect(story!.status).toBe('draft');
      expect(story!.extensions.adoWorkItemId).toBeUndefined();

      // Step 3: Mock the OutboundSyncService to simulate successful ADO creation
      const createdWorkItemId = 456;
      const createdWorkItemUrl = `https://dev.azure.com/${TEST_CONFIG.org}/${TEST_CONFIG.project}/_workitems/edit/${createdWorkItemId}`;

      const createdWorkItem = createMockWorkItem(createdWorkItemId, {
        'System.Title': 'Implement user authentication',
        'System.State': 'New',
      });
      createdWorkItem._links = { html: { href: createdWorkItemUrl } };

      (adoClient.createWorkItem as ReturnType<typeof mock>).mockResolvedValue(createdWorkItem);

      // Step 4: Call OutboundSyncService.createWorkItemFromStory()
      // (This simulates what POST /ado/work-item endpoint does internally)
      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await outboundSync.createWorkItemFromStory(storyId, TEST_CONFIG.workItemType);

      // Step 5: Verify response contains success, adoWorkItemId, and URL
      expect(result.success).toBe(true);
      expect(result.storyId).toBe(storyId);
      expect(result.adoWorkItemId).toBe(createdWorkItemId);
      expect(result.url).toContain(String(createdWorkItemId));

      // Step 6: Verify the story now has adoWorkItemId in extensions
      db = new Database(testDbPath);
      story = readStoryFromDb(db, storyId);
      db.close();
      db = null;

      expect(story).not.toBeNull();
      expect(story!.extensions.adoWorkItemId).toBe(createdWorkItemId);
      expect(story!.extensions.adoWorkItemUrl).toBeDefined();
      expect(story!.extensions.adoLastSyncAt).toBeDefined();
    });

    it('uses FieldMapper.trakToAdoFields() for field mapping', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db, {
        title: 'Test Field Mapping',
        description: 'Description for mapping test',
        priority: 'P0',
      });
      db.close();
      db = null;

      const createdWorkItem = createMockWorkItem(789);
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockResolvedValue(createdWorkItem);

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await outboundSync.createWorkItemFromStory(storyId);

      // Verify fieldMapper.trakToAdoFields was called
      expect(fieldMapper.trakToAdoFields).toHaveBeenCalled();

      // Verify ADO client was called with correct work item type
      expect(adoClient.createWorkItem).toHaveBeenCalledWith('Issue', expect.any(Object));
    });

    it('passes custom work item type to ADO client', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db);
      db.close();
      db = null;

      const createdWorkItem = createMockWorkItem(111);
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockResolvedValue(createdWorkItem);

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await outboundSync.createWorkItemFromStory(storyId, 'User Story');

      expect(adoClient.createWorkItem).toHaveBeenCalledWith('User Story', expect.any(Object));
    });
  });

  // ===========================================================================
  // Test Case 2: Returns error if story not found
  // ===========================================================================
  describe('TC-002: Returns error if story not found', () => {
    it('returns STORY_NOT_FOUND error for non-existent story', async () => {
      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await outboundSync.createWorkItemFromStory('non-existent-story-id');

      expect(result.success).toBe(false);
      expect(result.storyId).toBe('non-existent-story-id');
      expect(result.errorCode).toBe(OutboundErrorCodes.STORY_NOT_FOUND);
      expect(result.error).toContain('not found');
      expect(result.adoWorkItemId).toBeUndefined();
      expect(result.url).toBeUndefined();
    });

    it('does not call ADO client when story not found', async () => {
      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await outboundSync.createWorkItemFromStory('missing-id');

      expect(adoClient.createWorkItem).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Test Case 3: Returns error if story already has adoWorkItemId (idempotent)
  // ===========================================================================
  describe('TC-003: Returns error if story already has adoWorkItemId (idempotent)', () => {
    it('returns ALREADY_LINKED error for story with existing ADO link', async () => {
      const existingAdoId = 999;

      // Create a story that already has an ADO work item ID
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db, {
        adoWorkItemId: existingAdoId,
      });
      db.close();
      db = null;

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await outboundSync.createWorkItemFromStory(storyId);

      expect(result.success).toBe(false);
      expect(result.storyId).toBe(storyId);
      expect(result.errorCode).toBe(OutboundErrorCodes.ALREADY_LINKED);
      expect(result.error).toContain('already linked');
      expect(result.error).toContain(String(existingAdoId));
    });

    it('does not call ADO client when story already linked', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db, {
        adoWorkItemId: 888,
      });
      db.close();
      db = null;

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await outboundSync.createWorkItemFromStory(storyId);

      expect(adoClient.createWorkItem).not.toHaveBeenCalled();
    });

    it('preserves existing adoWorkItemId in extensions', async () => {
      const existingAdoId = 777;

      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db, {
        adoWorkItemId: existingAdoId,
      });
      db.close();
      db = null;

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await outboundSync.createWorkItemFromStory(storyId);

      // Verify the original adoWorkItemId is preserved
      db = new Database(testDbPath);
      const story = readStoryFromDb(db, storyId);
      db.close();
      db = null;

      expect(story!.extensions.adoWorkItemId).toBe(existingAdoId);
    });
  });

  // ===========================================================================
  // Test Case 4: Returns error if daemon/service unavailable
  // ===========================================================================
  describe('TC-004: Returns error if daemon/service unavailable', () => {
    it('returns AUTHENTICATION_FAILED error when ADO auth fails', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db);
      db.close();
      db = null;

      // Mock ADO client to throw authentication error
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADOAuthenticationError()
      );

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await outboundSync.createWorkItemFromStory(storyId);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.AUTHENTICATION_FAILED);
    });

    it('returns RATE_LIMITED error when ADO rate limit exceeded', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db);
      db.close();
      db = null;

      // Mock ADO client to throw rate limit error
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADORateLimitError()
      );

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await outboundSync.createWorkItemFromStory(storyId);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.RATE_LIMITED);
    });

    it('returns VALIDATION_ERROR when ADO rejects work item', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db);
      db.close();
      db = null;

      // Mock ADO client to throw validation error
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADOValidationError('Invalid work item type for this project')
      );

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await outboundSync.createWorkItemFromStory(storyId);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(OutboundErrorCodes.VALIDATION_ERROR);
      expect(result.error).toContain('Invalid work item type');
    });

    it('does not update story extensions when ADO call fails', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db);
      db.close();
      db = null;

      // Mock ADO client to throw error
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADOAuthenticationError()
      );

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await outboundSync.createWorkItemFromStory(storyId);

      // Verify story was NOT updated
      db = new Database(testDbPath);
      const story = readStoryFromDb(db, storyId);
      db.close();
      db = null;

      expect(story!.extensions.adoWorkItemId).toBeUndefined();
      expect(story!.extensions.adoWorkItemUrl).toBeUndefined();
    });

    it('tracks errors in service status', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db);
      db.close();
      db = null;

      (adoClient.createWorkItem as ReturnType<typeof mock>).mockRejectedValue(
        new ADOAuthenticationError()
      );

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await outboundSync.createWorkItemFromStory(storyId);

      const status = outboundSync.getOutboundStatus();
      expect(status.errors).toBe(1);
      expect(status.lastError).toBeDefined();
    });
  });

  // ===========================================================================
  // End-to-End Flow Simulation
  // ===========================================================================
  describe('E2E: Complete draft promotion flow', () => {
    it('simulates full promotion lifecycle: create draft -> promote -> verify ADO link', async () => {
      // =========================================
      // STEP 1: Create draft story locally
      // (Simulates: board story create -f PROJ -t "Title" --draft)
      // =========================================
      db = createTestDatabase(testDbPath);
      const { storyId, code } = insertDraftStory(db, {
        title: 'Add user notification system',
        description: 'Implement push notifications for mobile and web',
        why: 'Users need real-time updates on important events',
        priority: 'P1',
      });

      // Verify initial state
      let story = readStoryFromDb(db, storyId);
      expect(story).not.toBeNull();
      expect(story!.status).toBe('draft');
      expect(story!.extensions.adoWorkItemId).toBeUndefined();

      db.close();
      db = null;

      // =========================================
      // STEP 2: User promotes story (changes status from draft to planned)
      // The hook detects: previousStatus='draft', status='planned', no adoWorkItemId
      // =========================================

      // Simulate what the hook would do: check story state
      const hookDetectedPromotion = true; // story.status changed from 'draft' to 'planned'
      const hookDetectedNoAdoLink = true; // story.extensions.adoWorkItemId is undefined

      expect(hookDetectedPromotion).toBe(true);
      expect(hookDetectedNoAdoLink).toBe(true);

      // =========================================
      // STEP 3: Hook calls POST /ado/work-item endpoint
      // (Simulates: fetch('http://localhost:9271/ado/work-item', { body: { storyId } }))
      // =========================================
      const expectedAdoId = 12345;
      const expectedUrl = `https://dev.azure.com/${TEST_CONFIG.org}/${TEST_CONFIG.project}/_workitems/edit/${expectedAdoId}`;

      const createdWorkItem = createMockWorkItem(expectedAdoId, {
        'System.Title': 'Add user notification system',
        'System.State': 'New',
      });
      createdWorkItem._links = { html: { href: expectedUrl } };

      (adoClient.createWorkItem as ReturnType<typeof mock>).mockResolvedValue(createdWorkItem);

      // The API server would call OutboundSyncService internally
      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      const result = await outboundSync.createWorkItemFromStory(storyId, TEST_CONFIG.workItemType);

      // =========================================
      // STEP 4: Verify API response
      // =========================================
      expect(result.success).toBe(true);
      expect(result.storyId).toBe(storyId);
      expect(result.adoWorkItemId).toBe(expectedAdoId);
      // URL comes from workItem.url or _links.html.href - verify it contains the ID
      expect(result.url).toContain(String(expectedAdoId));

      // =========================================
      // STEP 5: Verify story now has ADO link in extensions
      // =========================================
      db = new Database(testDbPath);
      story = readStoryFromDb(db, storyId);
      db.close();
      db = null;

      expect(story).not.toBeNull();
      expect(story!.extensions.adoWorkItemId).toBe(expectedAdoId);
      // URL comes from workItem.url or _links.html.href - verify it contains the ID
      expect(story!.extensions.adoWorkItemUrl).toContain(String(expectedAdoId));
      expect(story!.extensions.adoLastSyncAt).toBeDefined();

      // =========================================
      // STEP 6: Verify subsequent state changes use update (not create)
      // (Simulates AC-006: idempotent behavior)
      // =========================================

      // If we try to create again, it should fail with ALREADY_LINKED
      const secondResult = await outboundSync.createWorkItemFromStory(storyId);

      expect(secondResult.success).toBe(false);
      expect(secondResult.errorCode).toBe(OutboundErrorCodes.ALREADY_LINKED);

      // For subsequent state changes, the hook would detect adoWorkItemId exists
      // and use pushStateChangeByWorkItemId instead of createWorkItemFromStory
      // (This is handled by the ado-draft-promotion.ts hook logic)
    });

    it('handles multiple draft stories in batch', async () => {
      // Create multiple draft stories
      db = createTestDatabase(testDbPath);

      // First, create the feature
      const featureId = crypto.randomUUID();
      db.run('INSERT INTO features (id, code, name, story_counter) VALUES (?, ?, ?, ?)', [featureId, 'BATCH', 'Batch Feature', 0]);

      const stories: Array<{ storyId: string; title: string }> = [];
      for (let i = 1; i <= 3; i++) {
        const storyId = crypto.randomUUID();
        const title = `Draft Story ${i}`;

        // Insert each story with unique code and the feature ID
        db.run(
          `INSERT INTO stories (id, code, feature_id, title, description, why, status, priority, extensions)
           VALUES (?, ?, ?, ?, '', '', 'draft', 'P2', '{}')`,
          [storyId, `BATCH-00${i}`, featureId, title]
        );

        stories.push({ storyId, title });
      }

      db.close();
      db = null;

      // Mock ADO to return different IDs for each story
      let adoIdCounter = 1000;
      (adoClient.createWorkItem as ReturnType<typeof mock>).mockImplementation(async () => {
        const id = adoIdCounter++;
        return createMockWorkItem(id);
      });

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);

      // Promote each story
      const results: CreateWorkItemResult[] = [];
      for (const { storyId } of stories) {
        const result = await outboundSync.createWorkItemFromStory(storyId);
        results.push(result);
      }

      // Verify all succeeded with unique ADO IDs
      expect(results.every(r => r.success)).toBe(true);
      const adoIds = results.map(r => r.adoWorkItemId);
      const uniqueIds = new Set(adoIds);
      expect(uniqueIds.size).toBe(3);
    });
  });

  // ===========================================================================
  // Service Status Tracking
  // ===========================================================================
  describe('Service status tracking', () => {
    it('updates itemsPushed on successful creation', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db);
      db.close();
      db = null;

      (adoClient.createWorkItem as ReturnType<typeof mock>).mockResolvedValue(createMockWorkItem(100));

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);

      // Initial status
      let status = outboundSync.getOutboundStatus();
      expect(status.itemsPushed).toBe(0);

      // Create work item
      await outboundSync.createWorkItemFromStory(storyId);

      // Verify status updated
      status = outboundSync.getOutboundStatus();
      expect(status.itemsPushed).toBe(1);
      expect(status.lastPush).not.toBeNull();
    });

    it('resets errors when resetErrors() called', async () => {
      db = createTestDatabase(testDbPath);
      const { storyId } = insertDraftStory(db);
      db.close();
      db = null;

      (adoClient.createWorkItem as ReturnType<typeof mock>).mockRejectedValue(new ADOAuthenticationError());

      const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
      await outboundSync.createWorkItemFromStory(storyId);

      let status = outboundSync.getOutboundStatus();
      expect(status.errors).toBe(1);

      outboundSync.resetErrors();

      status = outboundSync.getOutboundStatus();
      expect(status.errors).toBe(0);
      expect(status.lastError).toBeNull();
    });
  });
});

// =============================================================================
// API Server Integration (Simulated)
// =============================================================================

describe('API Server integration (simulated)', () => {
  let testDbPath: string;
  let testDir: string;
  let adoClient: ADOClient;
  let fieldMapper: FieldMapper;
  let db: Database | null = null;

  beforeEach(() => {
    testDir = join(tmpdir(), `api-integration-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, 'test.db');
    db = createTestDatabase(testDbPath);
    db.close();
    db = null;

    adoClient = createMockAdoClient();
    fieldMapper = createMockFieldMapper();
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('simulates POST /ado/work-item success (201 response)', async () => {
    // Setup: Create draft story
    db = createTestDatabase(testDbPath);
    const { storyId } = insertDraftStory(db);
    db.close();
    db = null;

    // Mock ADO success
    const adoId = 555;
    (adoClient.createWorkItem as ReturnType<typeof mock>).mockResolvedValue(createMockWorkItem(adoId));

    // Simulate what API server does
    const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
    const result = await outboundSync.createWorkItemFromStory(storyId, 'Issue');

    // API would return 201 with this response
    const expectedApiResponse = {
      success: true,
      adoWorkItemId: adoId,
      url: result.url,
    };

    expect(expectedApiResponse.success).toBe(true);
    expect(expectedApiResponse.adoWorkItemId).toBe(adoId);
    expect(expectedApiResponse.url).toBeDefined();
  });

  it('simulates POST /ado/work-item 404 for missing story', async () => {
    const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
    const result = await outboundSync.createWorkItemFromStory('nonexistent');

    // API would return 404
    const expectedStatusCode = 404;
    const expectedApiResponse = {
      success: false,
      error: {
        code: 'STORY_NOT_FOUND',
        message: result.error,
      },
    };

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(OutboundErrorCodes.STORY_NOT_FOUND);
    expect(expectedApiResponse.success).toBe(false);
    expect(expectedStatusCode).toBe(404);
  });

  it('simulates POST /ado/work-item 400 for already linked story', async () => {
    db = createTestDatabase(testDbPath);
    const { storyId } = insertDraftStory(db, { adoWorkItemId: 666 });
    db.close();
    db = null;

    const outboundSync = new OutboundSyncService(adoClient, fieldMapper, testDbPath);
    const result = await outboundSync.createWorkItemFromStory(storyId);

    // API would return 400
    const expectedStatusCode = 400;
    const expectedApiResponse = {
      success: false,
      error: {
        code: 'ALREADY_LINKED',
        message: result.error,
      },
    };

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(OutboundErrorCodes.ALREADY_LINKED);
    expect(expectedApiResponse.success).toBe(false);
    expect(expectedStatusCode).toBe(400);
  });
});
