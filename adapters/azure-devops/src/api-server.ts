/**
 * Azure DevOps Adapter REST API Server
 *
 * Lightweight HTTP server that hooks can call to trigger ADO updates.
 * Binds to localhost only for security (127.0.0.1).
 *
 * Features:
 * - Health check endpoint
 * - Daemon status endpoint
 * - Work item state updates
 * - Single work item sync
 * - Full sync trigger
 *
 * SECURITY: Binds to localhost only - no external access possible.
 */

import type { Daemon } from './daemon';
import type { ServerConfig, ADOWorkItem, ADOWorkItemState } from './types';
import {
  ADONotFoundError,
  ADOAuthenticationError,
  ADOAuthorizationError,
  ADOValidationError,
  ADORateLimitError,
  ADOApiError,
} from './api';
import { OutboundSyncService, OutboundErrorCodes } from './outbound-sync';
import type { TrakStoryStatus } from './mapping';

// =============================================================================
// Types
// =============================================================================

/**
 * Standard API success response
 */
interface SuccessResponse<T = unknown> {
  success: true;
  data?: T;
  [key: string]: unknown;
}

/**
 * Standard API error response
 */
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/**
 * Update work item state request body
 */
interface UpdateStateBody {
  state: string;
  reason?: string;
  /** Optional: trak status to map to ADO state (preferred over raw state) */
  trakStatus?: TrakStoryStatus;
}

/**
 * Create work item from story request body
 */
interface CreateWorkItemBody {
  /** trak story ID */
  storyId: string;
  /** ADO work item type (default: 'Issue') */
  type?: string;
}

/**
 * Request log entry
 */
interface RequestLogEntry {
  method: string;
  path: string;
  status: number;
  duration: number;
}

// =============================================================================
// Error Codes
// =============================================================================

const ErrorCodes = {
  DAEMON_NOT_RUNNING: 'DAEMON_NOT_RUNNING',
  WORK_ITEM_NOT_FOUND: 'WORK_ITEM_NOT_FOUND',
  STORY_NOT_FOUND: 'STORY_NOT_FOUND',
  ALREADY_LINKED: 'ALREADY_LINKED',
  OUTBOUND_SYNC_UNAVAILABLE: 'OUTBOUND_SYNC_UNAVAILABLE',
  INVALID_REQUEST: 'INVALID_REQUEST',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  ADO_ERROR: 'ADO_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
} as const;

// =============================================================================
// API Server Class
// =============================================================================

/**
 * REST API Server for Azure DevOps Adapter
 *
 * Provides HTTP endpoints for hooks to trigger ADO operations.
 * Binds to localhost only for security.
 *
 * @example
 * ```typescript
 * const apiServer = new APIServer(daemon, { port: 9271, host: '127.0.0.1' });
 * await apiServer.start();
 *
 * // Later...
 * await apiServer.stop();
 * ```
 */
export class APIServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private running = false;
  private outboundSync: OutboundSyncService | null = null;

  /**
   * Create a new API server instance
   *
   * @param daemon - The daemon instance to use for ADO operations
   * @param config - Server configuration (port, host)
   */
  constructor(
    private readonly daemon: Daemon,
    private readonly config: ServerConfig
  ) {
    // Ensure we only bind to localhost for security
    if (config.host !== '127.0.0.1' && config.host !== 'localhost') {
      console.warn('[API Server] Warning: Host overridden to 127.0.0.1 for security');
      this.config = { ...config, host: '127.0.0.1' };
    }
  }

  /**
   * Initialize the outbound sync service
   * Called after daemon is fully started
   */
  initializeOutboundSync(): void {
    const client = this.daemon.getAdoClient();
    const fieldMapper = this.daemon.getFieldMapper();

    if (client && fieldMapper) {
      this.outboundSync = new OutboundSyncService(client, fieldMapper);
      console.log('[API Server] Outbound sync service initialized');
    }
  }

  /**
   * Get the outbound sync service
   */
  getOutboundSync(): OutboundSyncService | null {
    return this.outboundSync;
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn('[API Server] Server is already running');
      return;
    }

    // Initialize outbound sync service
    this.initializeOutboundSync();

    this.server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,
      fetch: (request) => this.handleRequest(request),
    });

    this.running = true;
    console.log(`[API Server] Listening on http://${this.config.host}:${this.config.port}`);
  }

  /**
   * Stop the HTTP server gracefully
   */
  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    this.server.stop(true); // true = close existing connections
    this.server = null;
    this.running = false;
    console.log('[API Server] Stopped');
  }

  /**
   * Check if the server is running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ===========================================================================
  // Request Handling
  // ===========================================================================

  /**
   * Main request handler
   */
  private async handleRequest(request: Request): Promise<Response> {
    const startTime = Date.now();
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    let response: Response;

    try {
      response = await this.route(method, path, request);
    } catch (error) {
      response = this.handleError(error);
    }

    // Log request (never log request bodies)
    this.logRequest({
      method,
      path,
      status: response.status,
      duration: Date.now() - startTime,
    });

    return response;
  }

  /**
   * Route request to appropriate handler
   */
  private async route(method: string, path: string, request: Request): Promise<Response> {
    // Health check
    if (path === '/health' && method === 'GET') {
      return this.handleHealth();
    }

    // Status
    if (path === '/status' && method === 'GET') {
      return this.handleStatus();
    }

    // Force full sync
    if (path === '/sync' && method === 'POST') {
      return this.handleSync();
    }

    // Work item routes
    const workItemStateMatch = path.match(/^\/ado\/work-item\/(\d+)\/state$/);
    if (workItemStateMatch) {
      const id = parseInt(workItemStateMatch[1], 10);
      if (method === 'POST') {
        return this.handleUpdateWorkItemState(id, request);
      }
      return this.methodNotAllowed(['POST']);
    }

    const workItemSyncMatch = path.match(/^\/ado\/work-item\/(\d+)\/sync$/);
    if (workItemSyncMatch) {
      const id = parseInt(workItemSyncMatch[1], 10);
      if (method === 'POST') {
        return this.handleSyncWorkItem(id);
      }
      return this.methodNotAllowed(['POST']);
    }

    // Create work item from story
    if (path === '/ado/work-item' && method === 'POST') {
      return this.handleCreateWorkItem(request);
    }

    // 404 Not Found
    return this.notFound(path);
  }

  // ===========================================================================
  // Endpoint Handlers
  // ===========================================================================

  /**
   * GET /health
   * Returns basic health status
   */
  private handleHealth(): Response {
    const health = this.daemon.getHealth();

    return this.jsonResponse({
      ok: health.status !== 'unhealthy',
      uptime: health.uptime,
    });
  }

  /**
   * GET /status
   * Returns detailed daemon status
   */
  private handleStatus(): Response {
    if (!this.daemon.isActive()) {
      return this.errorResponse(
        503,
        ErrorCodes.DAEMON_NOT_RUNNING,
        'Daemon is not running'
      );
    }

    const state = this.daemon.getState();
    const config = this.daemon.getConfig();

    if (!state || !config) {
      return this.errorResponse(
        503,
        ErrorCodes.DAEMON_NOT_RUNNING,
        'Daemon state not available'
      );
    }

    return this.jsonResponse({
      connected: state.health.adoConnected,
      lastSync: this.getLatestSyncTime(state.inboundSync.lastSyncAt, state.outboundSync.lastSyncAt),
      inbound: {
        lastRun: state.inboundSync.lastSyncAt,
        itemsSynced: state.inboundSync.totalSynced,
        errors: state.inboundSync.errorCount,
      },
      outbound: {
        lastRun: state.outboundSync.lastSyncAt,
        itemsSynced: state.outboundSync.totalSynced,
        errors: state.outboundSync.errorCount,
      },
      config: {
        org: config.connection.organization,
        project: config.connection.project,
        pollInterval: config.sync.pollInterval,
      },
    });
  }

  /**
   * POST /ado/work-item/:id/state
   * Update work item state
   *
   * Supports two modes:
   * 1. trakStatus: Pass a trak status and it will be mapped to ADO state
   * 2. state: Pass a raw ADO state directly
   *
   * Hook scripts should use trakStatus for proper mapping:
   * POST /ado/work-item/123/state { "trakStatus": "completed" }
   */
  private async handleUpdateWorkItemState(id: number, request: Request): Promise<Response> {
    // Validate daemon is running
    if (!this.daemon.isActive()) {
      return this.errorResponse(
        503,
        ErrorCodes.DAEMON_NOT_RUNNING,
        'Daemon is not running'
      );
    }

    const client = this.daemon.getAdoClient();
    if (!client) {
      return this.errorResponse(
        503,
        ErrorCodes.DAEMON_NOT_RUNNING,
        'ADO client not initialized'
      );
    }

    // Parse request body
    let body: UpdateStateBody;
    try {
      body = await request.json() as UpdateStateBody;
    } catch {
      return this.errorResponse(
        400,
        ErrorCodes.INVALID_REQUEST,
        'Invalid JSON body'
      );
    }

    // Validate required fields - need either state or trakStatus
    if ((!body.state || typeof body.state !== 'string') && !body.trakStatus) {
      return this.errorResponse(
        400,
        ErrorCodes.INVALID_REQUEST,
        'Missing or invalid "state" or "trakStatus" field'
      );
    }

    // If trakStatus is provided, use outbound sync service for proper mapping
    if (body.trakStatus && this.outboundSync) {
      const result = await this.outboundSync.pushStateChangeByWorkItemId(id, body.trakStatus);

      if (!result.success) {
        // Map outbound error codes to HTTP status codes
        const statusCode = this.getHttpStatusFromOutboundError(result.errorCode);
        return this.errorResponse(
          statusCode,
          result.errorCode || ErrorCodes.ADO_ERROR,
          result.error || 'Unknown error'
        );
      }

      return this.jsonResponse({
        success: true,
        workItem: {
          id: result.workItemId,
          state: result.newState,
          previousState: result.previousState,
          mappedFrom: body.trakStatus,
        },
      });
    }

    // Fallback: Use raw state directly (original behavior)
    // Get current state before update
    let previousState: ADOWorkItemState;
    try {
      const existingWorkItem = await client.getWorkItem(id);
      previousState = existingWorkItem.fields['System.State'];
    } catch (error) {
      return this.handleAdoError(error, id);
    }

    // Update work item state
    let updatedWorkItem: ADOWorkItem;
    try {
      updatedWorkItem = await client.updateWorkItemState(id, body.state, body.reason);
    } catch (error) {
      return this.handleAdoError(error, id);
    }

    return this.jsonResponse({
      success: true,
      workItem: {
        id: updatedWorkItem.id,
        state: updatedWorkItem.fields['System.State'],
        previousState,
        title: updatedWorkItem.fields['System.Title'],
        rev: updatedWorkItem.rev,
      },
    });
  }

  /**
   * Map outbound sync error codes to HTTP status codes
   */
  private getHttpStatusFromOutboundError(errorCode: string | undefined): number {
    switch (errorCode) {
      case OutboundErrorCodes.WORK_ITEM_NOT_FOUND:
      case OutboundErrorCodes.STORY_NOT_FOUND:
        return 404;
      case OutboundErrorCodes.AUTHENTICATION_FAILED:
        return 401;
      case OutboundErrorCodes.AUTHORIZATION_FAILED:
        return 403;
      case OutboundErrorCodes.VALIDATION_ERROR:
        return 400;
      case OutboundErrorCodes.RATE_LIMITED:
        return 429;
      case OutboundErrorCodes.ADO_ERROR:
        return 502;
      default:
        return 500;
    }
  }

  /**
   * POST /ado/work-item/:id/sync
   * Force sync a single work item
   */
  private async handleSyncWorkItem(id: number): Promise<Response> {
    // Validate daemon is running
    if (!this.daemon.isActive()) {
      return this.errorResponse(
        503,
        ErrorCodes.DAEMON_NOT_RUNNING,
        'Daemon is not running'
      );
    }

    const syncService = this.daemon.getSyncService();
    if (!syncService) {
      return this.errorResponse(
        503,
        ErrorCodes.DAEMON_NOT_RUNNING,
        'Sync service not initialized'
      );
    }

    // Sync the work item to trak database
    let workItem: ADOWorkItem | null;
    try {
      workItem = await syncService.syncWorkItem(id);
    } catch (error) {
      return this.handleAdoError(error, id);
    }

    if (!workItem) {
      return this.errorResponse(
        400,
        ErrorCodes.INVALID_REQUEST,
        'Work item type not supported for sync'
      );
    }

    return this.jsonResponse({
      success: true,
      synced: true,
      workItem: {
        id: workItem.id,
        state: workItem.fields['System.State'],
        title: workItem.fields['System.Title'],
        type: workItem.fields['System.WorkItemType'],
        rev: workItem.rev,
      },
    });
  }

  /**
   * POST /ado/work-item
   * Create an ADO work item from a trak story
   *
   * Request body:
   * - storyId: string (required) - trak story ID
   * - type: string (optional) - ADO work item type (default: 'Issue')
   *
   * Response (201):
   * - success: true
   * - adoWorkItemId: number
   * - url: string
   *
   * Errors:
   * - 400 ALREADY_LINKED: Story already linked to an ADO work item
   * - 404 STORY_NOT_FOUND: Story not found
   * - 503 OUTBOUND_SYNC_UNAVAILABLE: Outbound sync service not available
   */
  private async handleCreateWorkItem(request: Request): Promise<Response> {
    // Check outbound sync service is available
    const outboundSync = this.getOutboundSync();
    if (!outboundSync) {
      return this.errorResponse(
        503,
        ErrorCodes.OUTBOUND_SYNC_UNAVAILABLE,
        'Outbound sync service unavailable'
      );
    }

    // Parse request body
    let body: CreateWorkItemBody;
    try {
      body = await request.json() as CreateWorkItemBody;
    } catch {
      return this.errorResponse(
        400,
        ErrorCodes.INVALID_REQUEST,
        'Invalid JSON body'
      );
    }

    // Validate required fields
    if (!body.storyId || typeof body.storyId !== 'string') {
      return this.errorResponse(
        400,
        ErrorCodes.INVALID_REQUEST,
        'Missing or invalid "storyId" field'
      );
    }

    // Optional type field defaults to 'Issue'
    const workItemType = body.type || 'Issue';

    // Create work item via outbound sync service
    const result = await outboundSync.createWorkItemFromStory(body.storyId, workItemType);

    if (!result.success) {
      // Map error codes to HTTP status codes
      let statusCode = 500;
      let errorCode: string = ErrorCodes.INTERNAL_ERROR;

      switch (result.errorCode) {
        case OutboundErrorCodes.STORY_NOT_FOUND:
          statusCode = 404;
          errorCode = ErrorCodes.STORY_NOT_FOUND;
          break;
        case OutboundErrorCodes.ALREADY_LINKED:
          statusCode = 400;
          errorCode = ErrorCodes.ALREADY_LINKED;
          break;
        case OutboundErrorCodes.AUTHENTICATION_FAILED:
          statusCode = 401;
          errorCode = ErrorCodes.AUTHENTICATION_FAILED;
          break;
        case OutboundErrorCodes.AUTHORIZATION_FAILED:
          statusCode = 403;
          errorCode = ErrorCodes.AUTHORIZATION_FAILED;
          break;
        case OutboundErrorCodes.VALIDATION_ERROR:
          statusCode = 400;
          errorCode = ErrorCodes.INVALID_REQUEST;
          break;
        case OutboundErrorCodes.RATE_LIMITED:
          statusCode = 429;
          errorCode = ErrorCodes.RATE_LIMITED;
          break;
        case OutboundErrorCodes.ADO_ERROR:
          statusCode = 502;
          errorCode = ErrorCodes.ADO_ERROR;
          break;
      }

      return this.errorResponse(
        statusCode,
        errorCode,
        result.error || 'Unknown error'
      );
    }

    // Success response with 201 Created
    return this.jsonResponse({
      success: true,
      adoWorkItemId: result.adoWorkItemId,
      url: result.url,
    }, 201);
  }

  /**
   * POST /sync
   * Force full sync
   */
  private async handleSync(): Promise<Response> {
    // Validate daemon is running
    if (!this.daemon.isActive()) {
      return this.errorResponse(
        503,
        ErrorCodes.DAEMON_NOT_RUNNING,
        'Daemon is not running'
      );
    }

    const syncService = this.daemon.getSyncService();
    if (!syncService) {
      return this.errorResponse(
        503,
        ErrorCodes.DAEMON_NOT_RUNNING,
        'Sync service not initialized'
      );
    }

    // Trigger full sync
    try {
      const result = await syncService.syncNow();

      return this.jsonResponse({
        success: result.success,
        itemsProcessed: result.itemsProcessed,
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        itemsSkipped: result.itemsSkipped,
        errors: result.errors.length,
        completedAt: result.completedAt,
      });
    } catch (error) {
      return this.handleAdoError(error);
    }
  }

  // ===========================================================================
  // Response Helpers
  // ===========================================================================

  /**
   * Create a JSON response
   */
  private jsonResponse(data: SuccessResponse | Record<string, unknown>, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create an error response
   */
  private errorResponse(status: number, code: string, message: string): Response {
    const body: ErrorResponse = {
      success: false,
      error: {
        code,
        message,
      },
    };

    return new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Handle ADO API errors and convert to appropriate HTTP responses
   */
  private handleAdoError(error: unknown, workItemId?: number): Response {
    if (error instanceof ADONotFoundError) {
      return this.errorResponse(
        404,
        ErrorCodes.WORK_ITEM_NOT_FOUND,
        workItemId ? `Work item ${workItemId} not found` : 'Resource not found'
      );
    }

    if (error instanceof ADOAuthenticationError) {
      return this.errorResponse(
        401,
        ErrorCodes.AUTHENTICATION_FAILED,
        'ADO authentication failed'
      );
    }

    if (error instanceof ADOAuthorizationError) {
      return this.errorResponse(
        403,
        ErrorCodes.AUTHORIZATION_FAILED,
        'ADO authorization failed - check PAT permissions'
      );
    }

    if (error instanceof ADOValidationError) {
      return this.errorResponse(
        400,
        ErrorCodes.INVALID_REQUEST,
        error.message
      );
    }

    if (error instanceof ADORateLimitError) {
      return this.errorResponse(
        429,
        ErrorCodes.RATE_LIMITED,
        'ADO rate limit exceeded - please retry later'
      );
    }

    if (error instanceof ADOApiError) {
      return this.errorResponse(
        502,
        ErrorCodes.ADO_ERROR,
        error.message
      );
    }

    // Unknown error
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API Server] Unhandled error:', message);
    return this.errorResponse(
      500,
      ErrorCodes.INTERNAL_ERROR,
      'Internal server error'
    );
  }

  /**
   * Handle generic errors
   */
  private handleError(error: unknown): Response {
    return this.handleAdoError(error);
  }

  /**
   * Return 404 Not Found
   */
  private notFound(path: string): Response {
    return this.errorResponse(
      404,
      ErrorCodes.NOT_FOUND,
      `Endpoint not found: ${path}`
    );
  }

  /**
   * Return 405 Method Not Allowed
   */
  private methodNotAllowed(allowedMethods: string[]): Response {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: ErrorCodes.METHOD_NOT_ALLOWED,
          message: `Method not allowed. Allowed: ${allowedMethods.join(', ')}`,
        },
      }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Allow': allowedMethods.join(', '),
        },
      }
    );
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get the latest sync time between two timestamps
   */
  private getLatestSyncTime(time1: string | null, time2: string | null): string | null {
    if (!time1 && !time2) return null;
    if (!time1) return time2;
    if (!time2) return time1;

    return new Date(time1) > new Date(time2) ? time1 : time2;
  }

  /**
   * Log request details (never logs sensitive data)
   */
  private logRequest(entry: RequestLogEntry): void {
    console.log(
      `[API Server] ${entry.method} ${entry.path} -> ${entry.status} (${entry.duration}ms)`
    );
  }
}

// =============================================================================
// Exports
// =============================================================================

export { ErrorCodes };
