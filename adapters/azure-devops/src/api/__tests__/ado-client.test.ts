/**
 * ADO Client Unit Tests
 *
 * Tests the Azure DevOps API client including:
 * - Authentication header construction
 * - Error handling for various HTTP status codes
 * - Work item operations (mocked responses)
 * - WIQL query handling
 *
 * Note: Integration tests with real ADO instance are in separate file
 * and require ADO_PAT environment variable.
 */

import { describe, it, expect, beforeEach, mock, afterAll } from 'bun:test';
import {
  ADOClient,
  ADOAuthenticationError,
  ADOAuthorizationError,
  ADONotFoundError,
  ADORateLimitError,
  ADOValidationError,
  ADOServerError,
} from '../ado-client';
import type { ADOConnectionConfig, ADOWorkItemBatchResponse, ADOWIQLResponse } from '../../types';

// Mock fetch globally
const originalFetch = globalThis.fetch;

describe('ADOClient', () => {
  const testConfig: ADOConnectionConfig = {
    organization: 'ively',
    project: 'ively.core',
    board: 'ively.core Team',
  };

  const testPAT = 'test-pat-token-12345';

  let client: ADOClient;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock(() => Promise.resolve(new Response()));
    // Cast to any to avoid type issues with mock
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    client = new ADOClient(testPAT, testConfig);
  });

  // Restore original fetch after all tests
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should throw error if PAT is empty', () => {
      expect(() => new ADOClient('', testConfig)).toThrow('PAT is required');
    });

    it('should throw error if PAT is whitespace only', () => {
      expect(() => new ADOClient('   ', testConfig)).toThrow('PAT is required');
    });

    it('should create client with valid PAT', () => {
      const client = new ADOClient(testPAT, testConfig);
      expect(client.organization).toBe('ively');
      expect(client.project).toBe('ively.core');
      expect(client.board).toBe('ively.core Team');
    });

    it('should create correct Basic auth header', () => {
      // The auth header should be 'Basic base64(:PAT)'
      const expectedBase64 = Buffer.from(`:${testPAT}`).toString('base64');

      // Create client and trigger a request to check the header
      const client = new ADOClient(testPAT, testConfig);

      // Mock successful response
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 123 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      // Make a request
      client.getWorkItem(123);

      // Check that fetch was called with correct auth header
      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      const requestOptions = callArgs[1] as RequestInit;
      expect(requestOptions.headers).toHaveProperty('Authorization', `Basic ${expectedBase64}`);
    });
  });

  describe('getWorkItem', () => {
    it('should fetch a single work item', async () => {
      const mockWorkItem: Partial<ADOWorkItem> = {
        id: 123,
        rev: 5,
        url: 'https://dev.azure.com/ively/ively.core/_apis/wit/workitems/123',
        fields: {
          'System.Id': 123,
          'System.Title': 'Test Work Item',
          'System.State': 'Active',
          'System.WorkItemType': 'User Story',
          'System.AreaPath': 'ively.core',
          'System.IterationPath': 'ively.core\\Sprint 1',
          'System.CreatedDate': '2025-01-01T00:00:00Z',
          'System.CreatedBy': { displayName: 'Test User', url: '', id: '1', uniqueName: 'test@test.com' },
          'System.ChangedDate': '2025-01-02T00:00:00Z',
          'System.ChangedBy': { displayName: 'Test User', url: '', id: '1', uniqueName: 'test@test.com' },
          'System.Rev': 5,
        },
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockWorkItem), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const result = await client.getWorkItem(123);

      expect(result.id).toBe(123);
      expect(result.fields['System.Title']).toBe('Test Work Item');
      expect(result.fields['System.State']).toBe('Active');
    });

    it('should throw ADONotFoundError for 404', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await expect(client.getWorkItem(999)).rejects.toBeInstanceOf(ADONotFoundError);
    });

    it('should include expand parameter when provided', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 123 }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await client.getWorkItem(123, 'Relations');

      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0] as string;
      expect(url).toContain('$expand=Relations');
    });
  });

  describe('getWorkItems', () => {
    it('should return empty array for empty IDs', async () => {
      const result = await client.getWorkItems([]);
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw error for more than 200 IDs', async () => {
      const ids = Array.from({ length: 201 }, (_, i) => i + 1);
      await expect(client.getWorkItems(ids)).rejects.toBeInstanceOf(ADOValidationError);
    });

    it('should fetch multiple work items in batch', async () => {
      const mockResponse: ADOWorkItemBatchResponse = {
        count: 2,
        value: [
          { id: 1, rev: 1, url: '', fields: {} as any },
          { id: 2, rev: 1, url: '', fields: {} as any },
        ],
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const result = await client.getWorkItems([1, 2]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });
  });

  describe('queryWorkItems', () => {
    it('should return empty array when no results', async () => {
      const mockWIQLResponse: ADOWIQLResponse = {
        queryType: 'flat',
        queryResultType: 'workItem',
        asOf: '2025-01-01T00:00:00Z',
        columns: [],
        workItems: [],
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockWIQLResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const result = await client.queryWorkItems('SELECT [System.Id] FROM WorkItems WHERE 1=0');

      expect(result).toEqual([]);
    });

    it('should execute WIQL query and fetch work items', async () => {
      // First call returns WIQL results
      const mockWIQLResponse: ADOWIQLResponse = {
        queryType: 'flat',
        queryResultType: 'workItem',
        asOf: '2025-01-01T00:00:00Z',
        columns: [],
        workItems: [
          { id: 1, url: '' },
          { id: 2, url: '' },
        ],
      };

      // Second call returns batch work items
      const mockBatchResponse: ADOWorkItemBatchResponse = {
        count: 2,
        value: [
          { id: 1, rev: 1, url: '', fields: {} as any },
          { id: 2, rev: 1, url: '', fields: {} as any },
        ],
      };

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        const response = callCount === 1 ? mockWIQLResponse : mockBatchResponse;
        return Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      });

      const result = await client.queryWorkItems("SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'");

      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateWorkItemState', () => {
    it('should update work item state', async () => {
      const mockUpdatedItem: Partial<ADOWorkItem> = {
        id: 123,
        rev: 6,
        url: '',
        fields: {
          'System.Id': 123,
          'System.State': 'Resolved',
        } as any,
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockUpdatedItem), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const result = await client.updateWorkItemState(123, 'Resolved');

      expect(result.fields['System.State']).toBe('Resolved');

      // Verify the patch operation
      const callArgs = mockFetch.mock.calls[0];
      const options = callArgs[1] as RequestInit;
      expect(options.method).toBe('PATCH');
      expect(options.headers).toHaveProperty('Content-Type', 'application/json-patch+json');

      const body = JSON.parse(options.body as string);
      expect(body).toContainEqual({
        op: 'add',
        path: '/fields/System.State',
        value: 'Resolved',
      });
    });

    it('should include reason when provided', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 123, fields: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await client.updateWorkItemState(123, 'Resolved', 'Fixed the issue');

      const callArgs = mockFetch.mock.calls[0];
      const options = callArgs[1] as RequestInit;
      const body = JSON.parse(options.body as string);

      expect(body).toContainEqual({
        op: 'add',
        path: '/fields/System.Reason',
        value: 'Fixed the issue',
      });
    });
  });

  describe('updateWorkItem', () => {
    it('should throw error for empty operations', async () => {
      await expect(client.updateWorkItem(123, [])).rejects.toBeInstanceOf(ADOValidationError);
    });

    it('should apply multiple patch operations', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 123, fields: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await client.updateWorkItem(123, [
        { op: 'add', path: '/fields/System.Title', value: 'New Title' },
        { op: 'add', path: '/fields/System.State', value: 'Active' },
      ]);

      const callArgs = mockFetch.mock.calls[0];
      const options = callArgs[1] as RequestInit;
      const body = JSON.parse(options.body as string);

      expect(body).toHaveLength(2);
    });
  });

  describe('createWorkItem', () => {
    it('should throw error for empty fields', async () => {
      await expect(client.createWorkItem('User Story', {})).rejects.toBeInstanceOf(ADOValidationError);
    });

    it('should create work item with fields', async () => {
      const mockCreatedItem: Partial<ADOWorkItem> = {
        id: 456,
        rev: 1,
        url: '',
        fields: {
          'System.Id': 456,
          'System.Title': 'New Story',
          'System.State': 'New',
        } as any,
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockCreatedItem), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const result = await client.createWorkItem('User Story', {
        'System.Title': 'New Story',
        'System.Description': 'Test description',
      });

      expect(result.id).toBe(456);

      // Verify the request
      const callArgs = mockFetch.mock.calls[0];
      const url = callArgs[0] as string;
      const options = callArgs[1] as RequestInit;

      expect(url).toContain('/wit/workitems/$User%20Story');
      expect(options.method).toBe('POST');
      expect(options.headers).toHaveProperty('Content-Type', 'application/json-patch+json');
    });

    it('should skip null and undefined fields', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 456, fields: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await client.createWorkItem('Bug', {
        'System.Title': 'Bug Title',
        'System.Description': null,
        'System.Tags': undefined,
      });

      const callArgs = mockFetch.mock.calls[0];
      const options = callArgs[1] as RequestInit;
      const body = JSON.parse(options.body as string);

      // Should only have Title operation
      expect(body).toHaveLength(1);
      expect(body[0].path).toBe('/fields/System.Title');
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'project-id', name: 'ively.core' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const result = await client.testConnection();

      expect(result).toBe(true);
    });

    it('should return false for 401', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const result = await client.testConnection();

      expect(result).toBe(false);
    });

    it('should return false for 404', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      const result = await client.testConnection();

      expect(result).toBe(false);
    });

    it('should return false for network errors', async () => {
      mockFetch.mockImplementation(() => Promise.reject(new Error('Network error')));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw ADOAuthenticationError for 401', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await expect(client.getWorkItem(123)).rejects.toBeInstanceOf(ADOAuthenticationError);
    });

    it('should throw ADOAuthorizationError for 403', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await expect(client.getWorkItem(123)).rejects.toBeInstanceOf(ADOAuthorizationError);
    });

    it('should throw ADORateLimitError for 429', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Rate limited' }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '60',
            },
          })
        )
      );

      try {
        await client.getWorkItem(123);
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ADORateLimitError);
        expect((error as ADORateLimitError).retryAfter).toBe(60);
      }
    });

    it('should throw ADOServerError for 5xx', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'Internal error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await expect(client.getWorkItem(123)).rejects.toBeInstanceOf(ADOServerError);
    });

    it('should include error details in ADOValidationError', async () => {
      const errorDetails = {
        message: 'Invalid field value',
        innerException: { message: 'Field System.State is invalid' },
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(errorDetails), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      try {
        await client.getWorkItem(123);
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ADOValidationError);
        expect((error as ADOValidationError).message).toContain('Invalid field value');
      }
    });
  });

  describe('getBoardWorkItems', () => {
    it('should build correct WIQL query', async () => {
      // Mock WIQL response
      const mockWIQLResponse: ADOWIQLResponse = {
        queryType: 'flat',
        queryResultType: 'workItem',
        asOf: '2025-01-01T00:00:00Z',
        columns: [],
        workItems: [],
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockWIQLResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await client.getBoardWorkItems();

      // Verify WIQL query includes project filter
      const callArgs = mockFetch.mock.calls[0];
      const options = callArgs[1] as RequestInit;
      const body = JSON.parse(options.body as string);

      expect(body.query).toContain("System.TeamProject] = 'ively.core'");
      expect(body.query).toContain('User Story');
      expect(body.query).toContain('Bug');
    });

    it('should filter by area path when configured', async () => {
      const configWithAreaPath: ADOConnectionConfig = {
        ...testConfig,
        areaPath: 'ively.core\\Team A',
      };
      const clientWithAreaPath = new ADOClient(testPAT, configWithAreaPath);

      const mockWIQLResponse: ADOWIQLResponse = {
        queryType: 'flat',
        queryResultType: 'workItem',
        asOf: '2025-01-01T00:00:00Z',
        columns: [],
        workItems: [],
      };

      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify(mockWIQLResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      );

      await clientWithAreaPath.getBoardWorkItems();

      const callArgs = mockFetch.mock.calls[0];
      const options = callArgs[1] as RequestInit;
      const body = JSON.parse(options.body as string);

      expect(body.query).toContain('[System.AreaPath] UNDER');
    });
  });
});
