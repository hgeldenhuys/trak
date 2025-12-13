/**
 * API Server Tests
 *
 * Tests for the REST API server that hooks use to trigger ADO operations.
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { APIServer } from '../api-server';
import type { Daemon } from '../daemon';
import type { ADOClient } from '../api';
import { OutboundSyncService, OutboundErrorCodes } from '../outbound-sync';
import type { CreateWorkItemResult } from '../outbound-sync';
import type {
  ServerConfig,
  DaemonHealth,
  DaemonState,
  AdapterConfig,
  ADOWorkItem,
  SyncStatus,
} from '../types';
import {
  ADONotFoundError,
  ADOAuthenticationError,
  ADOAuthorizationError,
  ADORateLimitError,
} from '../api';

// =============================================================================
// Response Types
// =============================================================================

interface HealthApiResponse {
  ok: boolean;
  uptime: number;
}

interface StatusApiResponse {
  connected: boolean;
  lastSync: string | null;
  inbound: { lastRun: string | null; itemsSynced: number; errors: number };
  outbound: { lastRun: string | null; itemsSynced: number; errors: number };
  config: { org: string; project: string; pollInterval: number };
}

interface WorkItemApiResponse {
  success: boolean;
  workItem?: {
    id: number;
    state: string;
    previousState?: string;
    title?: string;
    rev?: number;
    type?: string;
  };
  synced?: boolean;
}

interface SyncApiResponse {
  success: boolean;
  itemsSynced: number;
}

interface CreateWorkItemApiResponse {
  success: boolean;
  adoWorkItemId?: number;
  url?: string;
}

interface ErrorApiResponse {
  success: false;
  error: { code: string; message: string };
}

// =============================================================================
// Mock Helpers
// =============================================================================

function createMockWorkItem(overrides: Partial<ADOWorkItem> = {}): ADOWorkItem {
  return {
    id: 123,
    rev: 1,
    url: 'https://dev.azure.com/ively/ively.core/_apis/wit/workitems/123',
    fields: {
      'System.Id': 123,
      'System.Title': 'Test Work Item',
      'System.State': 'New',
      'System.WorkItemType': 'User Story',
      'System.AreaPath': 'ively.core',
      'System.IterationPath': 'ively.core\\Sprint 1',
      'System.CreatedDate': '2025-12-01T10:00:00Z',
      'System.CreatedBy': {
        displayName: 'Test User',
        url: '',
        id: 'user-1',
        uniqueName: 'test@ively.com',
      },
      'System.ChangedDate': '2025-12-10T10:00:00Z',
      'System.ChangedBy': {
        displayName: 'Test User',
        url: '',
        id: 'user-1',
        uniqueName: 'test@ively.com',
      },
      'System.Rev': 1,
    },
    ...overrides,
  };
}

function createMockSyncStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    isRunning: false,
    lastSyncAt: '2025-12-10T21:00:00Z',
    lastError: null,
    lastSyncCount: 10,
    totalSynced: 42,
    errorCount: 0,
    ...overrides,
  };
}

function createMockConfig(): AdapterConfig {
  return {
    connection: {
      organization: 'ively',
      project: 'ively.core',
    },
    sync: {
      pollInterval: 30000,
      batchSize: 100,
      inboundEnabled: true,
      outboundEnabled: true,
      conflictResolution: 'last-write-wins',
    },
    mapping: {
      states: {
        inbound: { 'New': 'backlog', 'Active': 'in-progress', 'Closed': 'done' },
        outbound: { 'backlog': 'New', 'in-progress': 'Active', 'done': 'Closed' },
      },
      priorities: {
        inbound: { 1: 'P0', 2: 'P1', 3: 'P2', 4: 'P3' },
        outbound: { 'P0': 1, 'P1': 2, 'P2': 3, 'P3': 4 },
      },
      fields: [],
      workItemTypes: ['User Story', 'Bug'],
    },
    server: {
      port: 9271,
      host: '127.0.0.1',
    },
  };
}

function createMockHealth(overrides: Partial<DaemonHealth> = {}): DaemonHealth {
  return {
    status: 'healthy',
    uptime: 12345,
    adoConnected: true,
    trakConnected: true,
    version: '0.1.0',
    startedAt: '2025-12-10T18:00:00Z',
    ...overrides,
  };
}

function createMockState(overrides: Partial<DaemonState> = {}): DaemonState {
  return {
    health: createMockHealth(),
    inboundSync: createMockSyncStatus(),
    outboundSync: createMockSyncStatus({ totalSynced: 5 }),
    config: createMockConfig(),
    cachedWorkItems: 42,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('APIServer', () => {
  let apiServer: APIServer;
  let mockDaemon: Daemon;
  let mockClient: ADOClient;
  const serverConfig: ServerConfig = { port: 0, host: '127.0.0.1' }; // Port 0 = random available port

  beforeEach(() => {
    // Create mock ADO client
    mockClient = {
      getWorkItem: mock(() => Promise.resolve(createMockWorkItem())),
      updateWorkItemState: mock(() => Promise.resolve(createMockWorkItem({ fields: { ...createMockWorkItem().fields, 'System.State': 'Active' } }))),
      getBoardWorkItems: mock(() => Promise.resolve([createMockWorkItem(), createMockWorkItem({ id: 124 })])),
    } as unknown as ADOClient;

    // Create mock daemon
    mockDaemon = {
      isActive: mock(() => true),
      getHealth: mock(() => createMockHealth()),
      getState: mock(() => createMockState()),
      getConfig: mock(() => createMockConfig()),
      getAdoClient: mock(() => mockClient),
      getFieldMapper: mock(() => ({
        trakStatusToAdoState: (status: string) => {
          const mapping: Record<string, string> = {
            'draft': 'New',
            'in_progress': 'Active',
            'review': 'Resolved',
            'completed': 'Closed',
            'cancelled': 'Removed',
          };
          return mapping[status] || 'New';
        },
      })),
      getSyncService: mock(() => ({
        syncNow: mock(() => Promise.resolve({ itemsProcessed: 2, itemsCreated: 1, itemsUpdated: 1, itemsSkipped: 0, errors: 0 })),
        syncWorkItem: mock(() => Promise.resolve(createMockWorkItem())),
      })),
    } as unknown as Daemon;

    apiServer = new APIServer(mockDaemon, serverConfig);
  });

  afterEach(async () => {
    if (apiServer.isRunning()) {
      await apiServer.stop();
    }
  });

  describe('Server Lifecycle', () => {
    it('starts and stops correctly', async () => {
      expect(apiServer.isRunning()).toBe(false);

      await apiServer.start();
      expect(apiServer.isRunning()).toBe(true);

      await apiServer.stop();
      expect(apiServer.isRunning()).toBe(false);
    });

    it('handles multiple start calls gracefully', async () => {
      await apiServer.start();
      await apiServer.start(); // Should not throw
      expect(apiServer.isRunning()).toBe(true);
    });

    it('handles multiple stop calls gracefully', async () => {
      await apiServer.start();
      await apiServer.stop();
      await apiServer.stop(); // Should not throw
      expect(apiServer.isRunning()).toBe(false);
    });

    it('forces localhost binding for security', () => {
      const unsafeConfig: ServerConfig = { port: 9271, host: '0.0.0.0' };
      const consoleSpy = spyOn(console, 'warn');

      new APIServer(mockDaemon, unsafeConfig);

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('GET /health', () => {
    it('returns health status when daemon is healthy', async () => {
      await apiServer.start();

      const response = await fetch('http://127.0.0.1:0/health'.replace(':0', `:${getServerPort()}`));
      const data = await response.json() as HealthApiResponse;

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.uptime).toBe(12345);
    });

    it('returns ok=false when daemon is unhealthy', async () => {
      (mockDaemon.getHealth as ReturnType<typeof mock>).mockImplementation(() =>
        createMockHealth({ status: 'unhealthy' })
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/health`);
      const data = await response.json() as HealthApiResponse;

      expect(response.status).toBe(200);
      expect(data.ok).toBe(false);
    });
  });

  describe('GET /status', () => {
    it('returns detailed status', async () => {
      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/status`);
      const data = await response.json() as StatusApiResponse;

      expect(response.status).toBe(200);
      expect(data.connected).toBe(true);
      expect(data.inbound.itemsSynced).toBe(42);
      expect(data.outbound.itemsSynced).toBe(5);
      expect(data.config.org).toBe('ively');
      expect(data.config.project).toBe('ively.core');
      expect(data.config.pollInterval).toBe(30000);
    });

    it('returns 503 when daemon is not running', async () => {
      (mockDaemon.isActive as ReturnType<typeof mock>).mockImplementation(() => false);

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/status`);
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('DAEMON_NOT_RUNNING');
    });
  });

  describe('POST /ado/work-item/:id/state', () => {
    it('updates work item state successfully', async () => {
      const updatedWorkItem = createMockWorkItem({
        fields: {
          ...createMockWorkItem().fields,
          'System.State': 'Active',
        },
      });

      (mockClient.updateWorkItemState as ReturnType<typeof mock>).mockImplementation(
        () => Promise.resolve(updatedWorkItem)
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/123/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'Active' }),
      });
      const data = await response.json() as WorkItemApiResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.workItem?.id).toBe(123);
      expect(data.workItem?.state).toBe('Active');
      expect(data.workItem?.previousState).toBe('New');
    });

    it('includes reason when provided', async () => {
      await apiServer.start();

      await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/123/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'Active', reason: 'Starting work' }),
      });

      expect(mockClient.updateWorkItemState).toHaveBeenCalledWith(123, 'Active', 'Starting work');
    });

    it('returns 400 for invalid JSON', async () => {
      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/123/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 for missing state field', async () => {
      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/123/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('state');
    });

    it('returns 404 when work item not found', async () => {
      (mockClient.getWorkItem as ReturnType<typeof mock>).mockImplementation(
        () => Promise.reject(new ADONotFoundError('Work item', 999))
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/999/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'Active' }),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('WORK_ITEM_NOT_FOUND');
    });

    it('returns 401 for authentication errors', async () => {
      (mockClient.getWorkItem as ReturnType<typeof mock>).mockImplementation(
        () => Promise.reject(new ADOAuthenticationError())
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/123/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'Active' }),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('returns 403 for authorization errors', async () => {
      (mockClient.getWorkItem as ReturnType<typeof mock>).mockImplementation(
        () => Promise.reject(new ADOAuthorizationError())
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/123/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'Active' }),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(403);
      expect(data.error.code).toBe('AUTHORIZATION_FAILED');
    });

    it('returns 429 for rate limit errors', async () => {
      (mockClient.getWorkItem as ReturnType<typeof mock>).mockImplementation(
        () => Promise.reject(new ADORateLimitError())
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/123/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'Active' }),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(429);
      expect(data.error.code).toBe('RATE_LIMITED');
    });

    it('returns 503 when daemon is not running', async () => {
      (mockDaemon.isActive as ReturnType<typeof mock>).mockImplementation(() => false);

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/123/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: 'Active' }),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(503);
      expect(data.error.code).toBe('DAEMON_NOT_RUNNING');
    });

    it('returns 405 for non-POST methods', async () => {
      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/123/state`, {
        method: 'GET',
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(405);
      expect(data.error.code).toBe('METHOD_NOT_ALLOWED');
      expect(response.headers.get('Allow')).toBe('POST');
    });
  });

  describe('POST /ado/work-item/:id/sync', () => {
    it('syncs work item successfully', async () => {
      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/123/sync`, {
        method: 'POST',
      });
      const data = await response.json() as WorkItemApiResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.synced).toBe(true);
      expect(data.workItem?.id).toBe(123);
    });

    it('returns 404 when work item not found', async () => {
      (mockClient.getWorkItem as ReturnType<typeof mock>).mockImplementation(
        () => Promise.reject(new ADONotFoundError('Work item', 999))
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item/999/sync`, {
        method: 'POST',
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(404);
      expect(data.error.code).toBe('WORK_ITEM_NOT_FOUND');
    });
  });

  describe('POST /sync', () => {
    it('triggers full sync successfully', async () => {
      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/sync`, {
        method: 'POST',
      });
      const data = await response.json() as SyncApiResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.itemsSynced).toBe(2);
    });

    it('returns 503 when daemon is not running', async () => {
      (mockDaemon.isActive as ReturnType<typeof mock>).mockImplementation(() => false);

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/sync`, {
        method: 'POST',
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(503);
      expect(data.error.code).toBe('DAEMON_NOT_RUNNING');
    });
  });

  describe('POST /ado/work-item', () => {
    let mockOutboundSync: Partial<OutboundSyncService>;

    beforeEach(() => {
      mockOutboundSync = {
        createWorkItemFromStory: mock(() => Promise.resolve({
          success: true,
          storyId: 'story-123',
          adoWorkItemId: 456,
          url: 'https://dev.azure.com/org/project/_workitems/edit/456',
        } as CreateWorkItemResult)),
      };

      // Set up the outbound sync service mock
      spyOn(apiServer, 'getOutboundSync').mockReturnValue(mockOutboundSync as OutboundSyncService);
    });

    it('creates work item successfully with 201 status', async () => {
      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: 'story-123' }),
      });
      const data = await response.json() as CreateWorkItemApiResponse;

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.adoWorkItemId).toBe(456);
      expect(data.url).toBe('https://dev.azure.com/org/project/_workitems/edit/456');
    });

    it('passes custom work item type', async () => {
      await apiServer.start();

      await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: 'story-123', type: 'User Story' }),
      });

      expect(mockOutboundSync.createWorkItemFromStory).toHaveBeenCalledWith('story-123', 'User Story');
    });

    it('defaults type to Issue when not provided', async () => {
      await apiServer.start();

      await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: 'story-123' }),
      });

      expect(mockOutboundSync.createWorkItemFromStory).toHaveBeenCalledWith('story-123', 'Issue');
    });

    it('returns 400 for invalid JSON', async () => {
      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 400 for missing storyId', async () => {
      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_REQUEST');
      expect(data.error.message).toContain('storyId');
    });

    it('returns 404 when story not found', async () => {
      (mockOutboundSync.createWorkItemFromStory as ReturnType<typeof mock>).mockImplementation(
        () => Promise.resolve({
          success: false,
          storyId: 'non-existent',
          error: 'Story non-existent not found',
          errorCode: OutboundErrorCodes.STORY_NOT_FOUND,
        } as CreateWorkItemResult)
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: 'non-existent' }),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('STORY_NOT_FOUND');
    });

    it('returns 400 when story already linked to ADO', async () => {
      (mockOutboundSync.createWorkItemFromStory as ReturnType<typeof mock>).mockImplementation(
        () => Promise.resolve({
          success: false,
          storyId: 'story-123',
          error: 'Story story-123 is already linked to ADO work item 456',
          errorCode: OutboundErrorCodes.ALREADY_LINKED,
        } as CreateWorkItemResult)
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: 'story-123' }),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('ALREADY_LINKED');
    });

    it('returns 503 when outbound sync service unavailable', async () => {
      spyOn(apiServer, 'getOutboundSync').mockReturnValue(null);

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: 'story-123' }),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(503);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('OUTBOUND_SYNC_UNAVAILABLE');
    });

    it('returns 401 for authentication errors', async () => {
      (mockOutboundSync.createWorkItemFromStory as ReturnType<typeof mock>).mockImplementation(
        () => Promise.resolve({
          success: false,
          storyId: 'story-123',
          error: 'Authentication failed',
          errorCode: OutboundErrorCodes.AUTHENTICATION_FAILED,
        } as CreateWorkItemResult)
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: 'story-123' }),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('returns 429 for rate limit errors', async () => {
      (mockOutboundSync.createWorkItemFromStory as ReturnType<typeof mock>).mockImplementation(
        () => Promise.resolve({
          success: false,
          storyId: 'story-123',
          error: 'Rate limit exceeded',
          errorCode: OutboundErrorCodes.RATE_LIMITED,
        } as CreateWorkItemResult)
      );

      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/ado/work-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: 'story-123' }),
      });
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(429);
      expect(data.error.code).toBe('RATE_LIMITED');
    });
  });

  describe('404 Not Found', () => {
    it('returns 404 for unknown paths', async () => {
      await apiServer.start();

      const response = await fetch(`http://127.0.0.1:${getServerPort()}/unknown/path`);
      const data = await response.json() as ErrorApiResponse;

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  // Helper to get the actual port the server bound to
  function getServerPort(): number {
    // Access the internal server port - this works because Bun.serve assigns a random port when port=0
    return (apiServer as unknown as { server: { port: number } }).server?.port || serverConfig.port;
  }
});
