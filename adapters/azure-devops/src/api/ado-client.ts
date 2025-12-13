/**
 * Azure DevOps REST API Client
 *
 * This module provides a typed client for interacting with Azure DevOps REST API.
 * Features:
 * - PAT-based authentication (stored in memory only)
 * - Work item CRUD operations
 * - WIQL query support
 * - Batch operations for efficiency
 * - Typed error handling
 * - Rate limit awareness
 *
 * Security: PAT is stored in memory only and never logged or persisted.
 */

import type {
  ADOWorkItem,
  ADOWorkItemBatchResponse,
  ADOWIQLResponse,
  ADOConnectionConfig,
} from '../types';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base error for ADO API operations
 */
export class ADOApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ADOApiError';
  }
}

/**
 * Authentication failed (401)
 */
export class ADOAuthenticationError extends ADOApiError {
  constructor(message = 'Authentication failed. Check your PAT validity and permissions.') {
    super(message, 401, 'AUTHENTICATION_FAILED');
    this.name = 'ADOAuthenticationError';
  }
}

/**
 * Authorization failed (403)
 */
export class ADOAuthorizationError extends ADOApiError {
  constructor(message = 'Access denied. Your PAT may lack required permissions.') {
    super(message, 403, 'AUTHORIZATION_FAILED');
    this.name = 'ADOAuthorizationError';
  }
}

/**
 * Resource not found (404)
 */
export class ADONotFoundError extends ADOApiError {
  constructor(resource: string, id?: number | string) {
    const message = id
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.name = 'ADONotFoundError';
  }
}

/**
 * Rate limit exceeded (429)
 */
export class ADORateLimitError extends ADOApiError {
  constructor(
    public readonly retryAfter?: number,
    message = 'Rate limit exceeded. Please retry later.'
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'ADORateLimitError';
  }
}

/**
 * Invalid request (400)
 */
export class ADOValidationError extends ADOApiError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ADOValidationError';
  }
}

/**
 * Server error (5xx)
 */
export class ADOServerError extends ADOApiError {
  constructor(message = 'Azure DevOps server error. Please retry later.', statusCode = 500) {
    super(message, statusCode, 'SERVER_ERROR');
    this.name = 'ADOServerError';
  }
}

// =============================================================================
// Patch Operation Type
// =============================================================================

/**
 * JSON Patch operation for updating work items
 */
export interface PatchOperation {
  op: 'add' | 'remove' | 'replace' | 'copy' | 'move' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

// =============================================================================
// ADO Client
// =============================================================================

/**
 * Azure DevOps REST API Client
 *
 * Handles all communication with Azure DevOps REST API including:
 * - Authentication via PAT
 * - Work item operations (get, create, update)
 * - WIQL queries
 * - Batch operations
 *
 * @example
 * ```typescript
 * const client = new ADOClient(pat, { organization: 'ively', project: 'ively.core' });
 *
 * // Test connection
 * const isValid = await client.testConnection();
 *
 * // Get work items
 * const workItems = await client.getBoardWorkItems();
 *
 * // Update state
 * await client.updateWorkItemState(123, 'Active');
 * ```
 */
export class ADOClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly apiVersion = '7.1';

  /**
   * Create a new ADO client
   *
   * @param pat - Personal Access Token (stored in memory only, never logged)
   * @param config - Connection configuration (org, project)
   */
  constructor(
    pat: string,
    private readonly config: ADOConnectionConfig
  ) {
    // Validate PAT format (basic check - should be base64-like string)
    if (!pat || pat.trim().length === 0) {
      throw new Error('PAT is required and cannot be empty');
    }

    // Build base URL
    this.baseUrl = `https://dev.azure.com/${config.organization}/${config.project}/_apis`;

    // Create Basic auth header
    // ADO uses ':PAT' format (empty username with PAT as password)
    this.authHeader = `Basic ${this.encodeCredentials(pat)}`;
  }

  /**
   * Encode PAT for Basic auth header
   * Format: base64(':' + pat)
   */
  private encodeCredentials(pat: string): string {
    // Using Buffer for Node.js/Bun compatibility
    return Buffer.from(`:${pat}`).toString('base64');
  }

  /**
   * Make an authenticated request to the ADO API
   */
  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      contentType?: string;
      apiVersion?: string;
    } = {}
  ): Promise<T> {
    const version = options.apiVersion || this.apiVersion;
    const separator = path.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${path}${separator}api-version=${version}`;

    const headers: Record<string, string> = {
      'Authorization': this.authHeader,
      'Accept': 'application/json',
    };

    if (options.body) {
      headers['Content-Type'] = options.contentType || 'application/json';
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);

    // Handle error responses
    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    // Parse response
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json() as Promise<T>;
    }

    // For non-JSON responses, return empty object
    return {} as T;
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorDetails: unknown;

    try {
      errorDetails = await response.json();
    } catch {
      errorDetails = await response.text();
    }

    // Log error (but NEVER log PAT or auth header)
    console.error(`[ADO API Error] Status: ${response.status}, URL: ${response.url}`);

    switch (response.status) {
      case 401:
        throw new ADOAuthenticationError();

      case 403:
        throw new ADOAuthorizationError();

      case 404:
        throw new ADONotFoundError('Resource');

      case 429: {
        const retryAfter = response.headers.get('Retry-After');
        throw new ADORateLimitError(
          retryAfter ? parseInt(retryAfter, 10) : undefined
        );
      }

      case 400: {
        const message = this.extractErrorMessage(errorDetails) || 'Invalid request';
        throw new ADOValidationError(message, errorDetails);
      }

      default:
        if (response.status >= 500) {
          throw new ADOServerError(
            `Server error: ${response.status} ${response.statusText}`,
            response.status
          );
        }
        throw new ADOApiError(
          `API error: ${response.status} ${response.statusText}`,
          response.status,
          'UNKNOWN_ERROR',
          errorDetails
        );
    }
  }

  /**
   * Extract error message from ADO error response
   */
  private extractErrorMessage(errorDetails: unknown): string | null {
    if (typeof errorDetails === 'object' && errorDetails !== null) {
      const details = errorDetails as Record<string, unknown>;
      if (typeof details.message === 'string') {
        return details.message;
      }
      if (typeof details.Message === 'string') {
        return details.Message;
      }
      // ADO sometimes nests errors
      if (details.value && typeof details.value === 'object') {
        const value = details.value as Record<string, unknown>;
        if (typeof value.Message === 'string') {
          return value.Message;
        }
      }
    }
    return null;
  }

  // ===========================================================================
  // Work Item Operations
  // ===========================================================================

  /**
   * Get a single work item by ID
   *
   * @param id - Work item ID
   * @param expand - Optional fields to expand (e.g., 'Relations', 'Fields')
   * @returns The work item
   * @throws ADONotFoundError if work item doesn't exist
   */
  async getWorkItem(id: number, expand?: string): Promise<ADOWorkItem> {
    let path = `/wit/workitems/${id}`;
    if (expand) {
      path += `?$expand=${expand}`;
    }

    try {
      return await this.request<ADOWorkItem>('GET', path);
    } catch (error) {
      if (error instanceof ADONotFoundError) {
        throw new ADONotFoundError('Work item', id);
      }
      throw error;
    }
  }

  /**
   * Get multiple work items by IDs (batch operation)
   *
   * @param ids - Array of work item IDs (max 200)
   * @param fields - Optional list of fields to return
   * @returns Array of work items
   */
  async getWorkItems(ids: number[], fields?: string[]): Promise<ADOWorkItem[]> {
    if (ids.length === 0) {
      return [];
    }

    if (ids.length > 200) {
      throw new ADOValidationError('Cannot fetch more than 200 work items at once');
    }

    const body: {
      ids: number[];
      fields?: string[];
      $expand?: string;
    } = { ids };

    if (fields && fields.length > 0) {
      body.fields = fields;
    }

    const response = await this.request<ADOWorkItemBatchResponse>(
      'POST',
      '/wit/workitemsbatch',
      { body }
    );

    return response.value || [];
  }

  /**
   * Query work items using WIQL (Work Item Query Language)
   *
   * @param wiql - WIQL query string
   * @param top - Maximum number of results (default: 200)
   * @returns Array of work items matching the query
   *
   * @example
   * ```typescript
   * const workItems = await client.queryWorkItems(
   *   "SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'"
   * );
   * ```
   */
  async queryWorkItems(wiql: string, top = 200): Promise<ADOWorkItem[]> {
    // First, execute the WIQL query to get work item IDs
    const queryResponse = await this.request<ADOWIQLResponse>(
      'POST',
      `/wit/wiql?$top=${top}`,
      {
        body: { query: wiql },
      }
    );

    // If no results, return empty array
    if (!queryResponse.workItems || queryResponse.workItems.length === 0) {
      return [];
    }

    // Extract IDs and fetch full work items
    const ids = queryResponse.workItems.map((wi) => wi.id);

    // Batch fetch in chunks of 200 (API limit)
    const workItems: ADOWorkItem[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const items = await this.getWorkItems(chunk);
      workItems.push(...items);
    }

    return workItems;
  }

  /**
   * Get all work items from a board/team
   *
   * @param team - Optional team name (defaults to config.board or project name)
   * @param workItemTypes - Optional array of work item types to filter
   * @returns Array of work items on the board
   */
  async getBoardWorkItems(
    _team?: string,
    workItemTypes?: string[]
  ): Promise<ADOWorkItem[]> {
    // Note: team parameter reserved for future team-specific queries
    const types = workItemTypes || ['User Story', 'Bug', 'Task', 'Feature'];

    // Build WIQL query
    const typeFilter = types.map((t) => `'${t}'`).join(', ');
    const areaPath = this.config.areaPath
      ? ` AND [System.AreaPath] UNDER '${this.config.areaPath}'`
      : '';
    const iterationPath = this.config.iterationPath
      ? ` AND [System.IterationPath] UNDER '${this.config.iterationPath}'`
      : '';

    const wiql = `
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.TeamProject] = '${this.config.project}'
        AND [System.WorkItemType] IN (${typeFilter})
        AND [System.State] <> 'Removed'
        ${areaPath}
        ${iterationPath}
      ORDER BY [System.ChangedDate] DESC
    `.trim();

    return this.queryWorkItems(wiql);
  }

  /**
   * Update a work item's state
   *
   * @param id - Work item ID
   * @param state - New state value (e.g., 'Active', 'Resolved', 'Closed')
   * @param reason - Optional reason for the state change
   * @returns Updated work item
   */
  async updateWorkItemState(
    id: number,
    state: string,
    reason?: string
  ): Promise<ADOWorkItem> {
    const operations: PatchOperation[] = [
      {
        op: 'add',
        path: '/fields/System.State',
        value: state,
      },
    ];

    if (reason) {
      operations.push({
        op: 'add',
        path: '/fields/System.Reason',
        value: reason,
      });
    }

    return this.updateWorkItem(id, operations);
  }

  /**
   * Update a work item with JSON Patch operations
   *
   * @param id - Work item ID
   * @param operations - Array of JSON Patch operations
   * @returns Updated work item
   *
   * @example
   * ```typescript
   * const updated = await client.updateWorkItem(123, [
   *   { op: 'add', path: '/fields/System.Title', value: 'New Title' },
   *   { op: 'add', path: '/fields/System.State', value: 'Active' }
   * ]);
   * ```
   */
  async updateWorkItem(
    id: number,
    operations: PatchOperation[]
  ): Promise<ADOWorkItem> {
    if (operations.length === 0) {
      throw new ADOValidationError('At least one operation is required');
    }

    try {
      return await this.request<ADOWorkItem>(
        'PATCH',
        `/wit/workitems/${id}`,
        {
          body: operations,
          contentType: 'application/json-patch+json',
        }
      );
    } catch (error) {
      if (error instanceof ADONotFoundError) {
        throw new ADONotFoundError('Work item', id);
      }
      throw error;
    }
  }

  /**
   * Create a new work item
   *
   * @param type - Work item type (e.g., 'User Story', 'Bug', 'Task')
   * @param fields - Field values for the new work item
   * @returns Created work item
   *
   * @example
   * ```typescript
   * const workItem = await client.createWorkItem('User Story', {
   *   'System.Title': 'My new story',
   *   'System.Description': 'Description here',
   *   'System.State': 'New'
   * });
   * ```
   */
  async createWorkItem(
    type: string,
    fields: Record<string, unknown>
  ): Promise<ADOWorkItem> {
    // Convert fields to patch operations
    const operations: PatchOperation[] = [];

    for (const [field, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null) {
        operations.push({
          op: 'add',
          path: `/fields/${field}`,
          value,
        });
      }
    }

    if (operations.length === 0) {
      throw new ADOValidationError('At least one field is required to create a work item');
    }

    // URL-encode the type for the path
    const encodedType = encodeURIComponent(type);

    return await this.request<ADOWorkItem>(
      'POST',
      `/wit/workitems/$${encodedType}`,
      {
        body: operations,
        contentType: 'application/json-patch+json',
      }
    );
  }

  // ===========================================================================
  // Connection Testing
  // ===========================================================================

  /**
   * Test the connection and validate the PAT
   *
   * @returns true if connection is successful and PAT is valid
   */
  async testConnection(): Promise<boolean> {
    try {
      // Try to get the project details - this validates both connection and auth
      const response = await fetch(
        `https://dev.azure.com/${this.config.organization}/_apis/projects/${this.config.project}?api-version=${this.apiVersion}`,
        {
          method: 'GET',
          headers: {
            'Authorization': this.authHeader,
            'Accept': 'application/json',
          },
        }
      );

      if (response.ok) {
        return true;
      }

      // Check specific error cases
      if (response.status === 401) {
        console.error('[ADO] Authentication failed - PAT may be invalid or expired');
        return false;
      }

      if (response.status === 404) {
        console.error(`[ADO] Project '${this.config.project}' not found in organization '${this.config.organization}'`);
        return false;
      }

      console.error(`[ADO] Connection test failed with status ${response.status}`);
      return false;
    } catch (error) {
      console.error('[ADO] Connection test failed:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get the organization name
   */
  get organization(): string {
    return this.config.organization;
  }

  /**
   * Get the project name
   */
  get project(): string {
    return this.config.project;
  }

  /**
   * Get the configured board name
   */
  get board(): string | undefined {
    return this.config.board;
  }
}
