/**
 * Outbound Sync Service (trak -> ADO)
 *
 * This module handles synchronization from trak to Azure DevOps.
 * Features:
 * - Push state changes to ADO work items
 * - Batch pending changes sync
 * - Outbound status tracking
 * - Integration with daemon REST API for hook scripts
 *
 * Workflow:
 * 1. trak CLI changes story status
 * 2. Hook script triggered (story-status-changed.sh)
 * 3. Hook calls: POST http://localhost:9271/ado/work-item/:id/state
 * 4. Daemon receives request
 * 5. FieldMapper.trakStatusToAdoState() converts status
 * 6. ADOClient.updateWorkItemState() sends to ADO
 * 7. Return success/failure to hook
 *
 * @module outbound-sync
 */

import { Database } from 'bun:sqlite';
import { homedir } from 'os';
import { join } from 'path';

import type { ADOClient } from './api';
import { ADONotFoundError, ADOAuthenticationError, ADOAuthorizationError, ADOValidationError, ADORateLimitError } from './api';
import type { FieldMapper, TrakStoryStatus, TrakStory, TrakPriority } from './mapping';
import type { SyncResult, ADOWorkItemState, ADOStoryExtensions } from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Status of the outbound sync service
 */
export interface OutboundSyncStatus {
  /** Timestamp of last push operation (ISO string) */
  lastPush: string | null;
  /** Number of items pushed in last operation */
  itemsPushed: number;
  /** Total number of errors */
  errors: number;
  /** Last error message */
  lastError: string | null;
  /** Number of stories with pending changes */
  pendingChanges: number;
}

/**
 * Result of a single outbound sync operation
 */
export interface OutboundSyncResult {
  success: boolean;
  workItemId: number;
  storyId: string;
  previousState: ADOWorkItemState;
  newState: ADOWorkItemState;
  error?: string;
  errorCode?: string;
}

/**
 * Result of creating a work item from a story
 */
export interface CreateWorkItemResult {
  success: boolean;
  storyId: string;
  adoWorkItemId?: number;
  url?: string;
  error?: string;
  errorCode?: OutboundErrorCode;
}

/**
 * Error codes for hook scripts to handle
 */
export const OutboundErrorCodes = {
  SUCCESS: 'SUCCESS',
  WORK_ITEM_NOT_FOUND: 'WORK_ITEM_NOT_FOUND',
  STORY_NOT_FOUND: 'STORY_NOT_FOUND',
  NO_ADO_LINK: 'NO_ADO_LINK',
  ALREADY_LINKED: 'ALREADY_LINKED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  ADO_ERROR: 'ADO_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type OutboundErrorCode = typeof OutboundErrorCodes[keyof typeof OutboundErrorCodes];

/**
 * Story row from SQLite database
 */
interface StoryRow {
  id: string;
  code: string;
  feature_id: string;
  title: string;
  description: string;
  why: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  estimated_complexity: string | null;
  extensions: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Default database path */
const DEFAULT_DB_PATH = join(homedir(), '.board', 'data.db');

/** Service name for logging */
const SERVICE_NAME = 'OutboundSync';

// =============================================================================
// OutboundSyncService Class
// =============================================================================

/**
 * Outbound Sync Service
 *
 * Pushes changes from trak stories to Azure DevOps work items.
 * Used by the daemon's REST API to handle hook script requests.
 *
 * @example
 * ```typescript
 * const outboundSync = new OutboundSyncService(adoClient, fieldMapper, dbPath);
 *
 * // Push a single state change
 * const result = await outboundSync.pushStateChange(storyId, 'completed');
 *
 * // Push all pending changes
 * const batchResult = await outboundSync.pushPendingChanges();
 *
 * // Get status
 * const status = outboundSync.getOutboundStatus();
 * ```
 */
export class OutboundSyncService {
  private readonly adoClient: ADOClient;
  private readonly fieldMapper: FieldMapper;
  private readonly dbPath: string;
  private db: Database | null = null;

  private status: OutboundSyncStatus = {
    lastPush: null,
    itemsPushed: 0,
    errors: 0,
    lastError: null,
    pendingChanges: 0,
  };

  /**
   * Create a new OutboundSyncService
   *
   * @param adoClient - Configured ADO client for API calls
   * @param fieldMapper - Field mapper for trak <-> ADO conversion
   * @param dbPath - Path to trak's SQLite database (default: ~/.board/data.db)
   */
  constructor(
    adoClient: ADOClient,
    fieldMapper: FieldMapper,
    dbPath: string = DEFAULT_DB_PATH
  ) {
    this.adoClient = adoClient;
    this.fieldMapper = fieldMapper;
    this.dbPath = dbPath;
  }

  // ===========================================================================
  // Public Methods
  // ===========================================================================

  /**
   * Push a state change from trak story to ADO work item
   *
   * This is the primary method called by the daemon's REST API when
   * a hook script reports a story status change.
   *
   * @param storyId - trak story ID
   * @param newStatus - New trak status (e.g., 'completed', 'in_progress')
   * @returns Result of the push operation
   */
  async pushStateChange(storyId: string, newStatus: TrakStoryStatus): Promise<OutboundSyncResult> {
    console.log(`[${SERVICE_NAME}] Pushing state change for story ${storyId} to status: ${newStatus}`);

    try {
      // Open database
      this.openDatabase();

      // Find story
      const story = this.findStoryById(storyId);
      if (!story) {
        return this.createErrorResult(0, storyId, OutboundErrorCodes.STORY_NOT_FOUND, `Story ${storyId} not found`);
      }

      // Parse extensions to get ADO work item ID
      let extensions: Partial<ADOStoryExtensions>;
      try {
        extensions = JSON.parse(story.extensions || '{}');
      } catch {
        extensions = {};
      }

      const workItemId = extensions.adoWorkItemId;
      if (!workItemId) {
        return this.createErrorResult(0, storyId, OutboundErrorCodes.NO_ADO_LINK, `Story ${storyId} is not linked to an ADO work item`);
      }

      // Map trak status to ADO state
      const newAdoState = this.fieldMapper.trakStatusToAdoState(newStatus);
      console.log(`[${SERVICE_NAME}] Mapped status "${newStatus}" to ADO state "${newAdoState}"`);

      // Get current ADO state for tracking
      let previousState: ADOWorkItemState;
      try {
        const currentWorkItem = await this.adoClient.getWorkItem(workItemId);
        previousState = currentWorkItem.fields['System.State'];
      } catch (error) {
        return this.handleAdoError(error, workItemId, storyId);
      }

      // Skip if state is unchanged
      if (previousState === newAdoState) {
        console.log(`[${SERVICE_NAME}] ADO work item ${workItemId} is already in state "${newAdoState}", skipping`);
        return {
          success: true,
          workItemId,
          storyId,
          previousState,
          newState: newAdoState,
        };
      }

      // Update ADO work item state
      try {
        await this.adoClient.updateWorkItemState(workItemId, newAdoState);
      } catch (error) {
        return this.handleAdoError(error, workItemId, storyId);
      }

      // Update story extensions with push tracking
      this.updateStoryPushMetadata(storyId, newStatus);

      // Update status
      this.status.lastPush = new Date().toISOString();
      this.status.itemsPushed++;

      console.log(`[${SERVICE_NAME}] Successfully pushed state change: ADO work item ${workItemId} from "${previousState}" to "${newAdoState}"`);

      return {
        success: true,
        workItemId,
        storyId,
        previousState,
        newState: newAdoState,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${SERVICE_NAME}] Error pushing state change:`, errorMessage);

      this.status.errors++;
      this.status.lastError = errorMessage;

      return this.createErrorResult(0, storyId, OutboundErrorCodes.INTERNAL_ERROR, errorMessage);
    } finally {
      this.closeDatabase();
    }
  }

  /**
   * Push state change using ADO work item ID directly
   *
   * This method is called by the API server when the work item ID is known
   * (e.g., from /ado/work-item/:id/state endpoint).
   *
   * @param workItemId - ADO work item ID
   * @param newTrakStatus - New trak status to map and push
   * @returns Result of the push operation
   */
  async pushStateChangeByWorkItemId(
    workItemId: number,
    newTrakStatus: TrakStoryStatus
  ): Promise<OutboundSyncResult> {
    console.log(`[${SERVICE_NAME}] Pushing state change for ADO work item ${workItemId} to status: ${newTrakStatus}`);

    try {
      // Open database
      this.openDatabase();

      // Find story by ADO work item ID
      const story = this.findStoryByAdoId(workItemId);
      const storyId = story?.id || '';

      // Map trak status to ADO state
      const newAdoState = this.fieldMapper.trakStatusToAdoState(newTrakStatus);
      console.log(`[${SERVICE_NAME}] Mapped status "${newTrakStatus}" to ADO state "${newAdoState}"`);

      // Get current ADO state for tracking
      let previousState: ADOWorkItemState;
      try {
        const currentWorkItem = await this.adoClient.getWorkItem(workItemId);
        previousState = currentWorkItem.fields['System.State'];
      } catch (error) {
        return this.handleAdoError(error, workItemId, storyId);
      }

      // Skip if state is unchanged
      if (previousState === newAdoState) {
        console.log(`[${SERVICE_NAME}] ADO work item ${workItemId} is already in state "${newAdoState}", skipping`);
        return {
          success: true,
          workItemId,
          storyId,
          previousState,
          newState: newAdoState,
        };
      }

      // Update ADO work item state
      try {
        await this.adoClient.updateWorkItemState(workItemId, newAdoState);
      } catch (error) {
        return this.handleAdoError(error, workItemId, storyId);
      }

      // Update story extensions with push tracking (if story exists)
      if (storyId) {
        this.updateStoryPushMetadata(storyId, newTrakStatus);
      }

      // Update status
      this.status.lastPush = new Date().toISOString();
      this.status.itemsPushed++;

      console.log(`[${SERVICE_NAME}] Successfully pushed state change: ADO work item ${workItemId} from "${previousState}" to "${newAdoState}"`);

      return {
        success: true,
        workItemId,
        storyId,
        previousState,
        newState: newAdoState,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${SERVICE_NAME}] Error pushing state change:`, errorMessage);

      this.status.errors++;
      this.status.lastError = errorMessage;

      return this.createErrorResult(workItemId, '', OutboundErrorCodes.INTERNAL_ERROR, errorMessage);
    } finally {
      this.closeDatabase();
    }
  }

  /**
   * Push all pending changes to ADO
   *
   * Finds all stories with local modifications since last push and
   * syncs them to ADO. Used for batch synchronization.
   *
   * @returns Sync result with statistics
   */
  async pushPendingChanges(): Promise<SyncResult> {
    const startedAt = new Date().toISOString();
    console.log(`[${SERVICE_NAME}] Starting push of pending changes`);

    const result: SyncResult = {
      success: true,
      direction: 'outbound',
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      errors: [],
      startedAt,
      completedAt: '',
    };

    try {
      // Open database
      this.openDatabase();

      // Find stories with pending changes
      // These are stories that have:
      // 1. An ADO work item link
      // 2. updated_at > lastPushedAt (or no lastPushedAt)
      const pendingStories = this.findStoriesWithPendingChanges();

      console.log(`[${SERVICE_NAME}] Found ${pendingStories.length} stories with pending changes`);

      for (const story of pendingStories) {
        result.itemsProcessed++;

        try {
          // Parse extensions
          let extensions: Partial<ADOStoryExtensions & { lastPushedAt?: string; lastPushedStatus?: string }>;
          try {
            extensions = JSON.parse(story.extensions || '{}');
          } catch {
            extensions = {};
          }

          const workItemId = extensions.adoWorkItemId;
          if (!workItemId) {
            result.itemsSkipped++;
            continue;
          }

          // Push the current status
          const pushResult = await this.pushStateChangeByWorkItemId(
            workItemId,
            story.status as TrakStoryStatus
          );

          if (pushResult.success) {
            result.itemsUpdated++;
          } else {
            result.errors.push({
              workItemId,
              error: pushResult.error || 'Unknown error',
            });
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push({
            workItemId: 0,
            error: `Error processing story ${story.id}: ${errorMessage}`,
          });
        }
      }

      // Update pending changes count
      this.status.pendingChanges = 0;

    } catch (error) {
      result.success = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({ workItemId: 0, error: errorMessage });

      this.status.errors++;
      this.status.lastError = errorMessage;

      console.error(`[${SERVICE_NAME}] Push pending changes failed:`, errorMessage);
    } finally {
      this.closeDatabase();

      result.completedAt = new Date().toISOString();

      // Update status
      this.status.lastPush = result.completedAt;

      console.log(`[${SERVICE_NAME}] Push completed: ${result.itemsProcessed} processed, ${result.itemsUpdated} updated, ${result.errors.length} errors`);
    }

    return result;
  }

  /**
   * Get current outbound sync status
   *
   * @returns Current status including last push time, items pushed, errors
   */
  getOutboundStatus(): OutboundSyncStatus {
    // Update pending changes count
    try {
      this.openDatabase();
      const pendingStories = this.findStoriesWithPendingChanges();
      this.status.pendingChanges = pendingStories.length;
      this.closeDatabase();
    } catch {
      // Ignore errors when checking pending count
    }

    return { ...this.status };
  }

  /**
   * Reset error count
   */
  resetErrors(): void {
    this.status.errors = 0;
    this.status.lastError = null;
  }

  /**
   * Create a work item in ADO from a trak story
   *
   * Creates a new ADO work item using the story's fields. This is idempotent -
   * if the story already has an adoWorkItemId, it returns an error (use update instead).
   *
   * @param storyId - trak story ID to create work item from
   * @param workItemType - ADO work item type (default: 'Issue')
   * @returns Result with success status, work item ID and URL, or error
   *
   * @example
   * ```typescript
   * const result = await outboundSync.createWorkItemFromStory('story-123');
   * if (result.success) {
   *   console.log(`Created work item ${result.adoWorkItemId}: ${result.url}`);
   * }
   * ```
   */
  async createWorkItemFromStory(
    storyId: string,
    workItemType: string = 'Issue'
  ): Promise<CreateWorkItemResult> {
    console.log(`[${SERVICE_NAME}] Creating ADO work item from story ${storyId} (type: ${workItemType})`);

    try {
      // Open database
      this.openDatabase();

      // Find story
      const storyRow = this.findStoryById(storyId);
      if (!storyRow) {
        return this.createCreateErrorResult(
          storyId,
          OutboundErrorCodes.STORY_NOT_FOUND,
          `Story ${storyId} not found`
        );
      }

      // Parse extensions to check if already linked
      let extensions: Partial<ADOStoryExtensions>;
      try {
        extensions = JSON.parse(storyRow.extensions || '{}');
      } catch {
        extensions = {};
      }

      // Idempotent check: if already linked to ADO, return error
      if (extensions.adoWorkItemId) {
        return this.createCreateErrorResult(
          storyId,
          OutboundErrorCodes.ALREADY_LINKED,
          `Story ${storyId} is already linked to ADO work item ${extensions.adoWorkItemId}. Use update instead.`
        );
      }

      // Convert StoryRow to TrakStory format for field mapper
      const trakStory = this.storyRowToTrakStory(storyRow);

      // Map trak story fields to ADO fields
      const adoFields = this.fieldMapper.trakToAdoFields(trakStory);
      console.log(`[${SERVICE_NAME}] Mapped fields for ADO work item:`, Object.keys(adoFields).join(', '));

      // Log field values for debugging (truncated for readability)
      if (adoFields['System.Description']) {
        const desc = String(adoFields['System.Description']);
        console.log(`[${SERVICE_NAME}]   System.Description: ${desc.length > 100 ? desc.slice(0, 100) + '...' : desc}`);
      } else {
        console.log(`[${SERVICE_NAME}]   System.Description: (empty)`);
      }
      if (adoFields['Microsoft.VSTS.Common.AcceptanceCriteria']) {
        const ac = String(adoFields['Microsoft.VSTS.Common.AcceptanceCriteria']);
        console.log(`[${SERVICE_NAME}]   AcceptanceCriteria: ${ac.length > 100 ? ac.slice(0, 100) + '...' : ac}`);
      } else {
        console.log(`[${SERVICE_NAME}]   AcceptanceCriteria: (empty)`);
      }

      // Create work item in ADO
      let createdWorkItem;
      try {
        createdWorkItem = await this.adoClient.createWorkItem(workItemType, adoFields);
      } catch (error) {
        return this.handleAdoCreateError(error, storyId);
      }

      const workItemId = createdWorkItem.id;
      const workItemUrl = createdWorkItem.url || createdWorkItem._links?.html?.href || '';

      // Update story extensions with ADO work item ID
      this.updateStoryAdoLink(storyId, workItemId, workItemUrl);

      // Update status
      this.status.lastPush = new Date().toISOString();
      this.status.itemsPushed++;

      console.log(`[${SERVICE_NAME}] Successfully created ADO work item ${workItemId} from story ${storyId}`);

      return {
        success: true,
        storyId,
        adoWorkItemId: workItemId,
        url: workItemUrl,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${SERVICE_NAME}] Error creating work item from story:`, errorMessage);

      this.status.errors++;
      this.status.lastError = errorMessage;

      return this.createCreateErrorResult(storyId, OutboundErrorCodes.INTERNAL_ERROR, errorMessage);
    } finally {
      this.closeDatabase();
    }
  }

  // ===========================================================================
  // Database Operations
  // ===========================================================================

  /**
   * Open database connection
   */
  private openDatabase(): void {
    if (!this.db) {
      this.db = new Database(this.dbPath);
    }
  }

  /**
   * Close database connection
   */
  private closeDatabase(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Find a story by its ID
   */
  private findStoryById(storyId: string): StoryRow | null {
    if (!this.db) {
      throw new Error('Database not open');
    }

    const story = this.db.query<StoryRow, [string]>(
      'SELECT * FROM stories WHERE id = ?'
    ).get(storyId);

    return story || null;
  }

  /**
   * Find a story by ADO work item ID
   */
  private findStoryByAdoId(adoWorkItemId: number): StoryRow | null {
    if (!this.db) {
      throw new Error('Database not open');
    }

    const stories = this.db.query<StoryRow, []>(
      `SELECT * FROM stories WHERE json_extract(extensions, '$.adoWorkItemId') = ${adoWorkItemId}`
    ).all();

    return stories.length > 0 ? stories[0] : null;
  }

  /**
   * Find stories with pending changes (updated since last push)
   */
  private findStoriesWithPendingChanges(): StoryRow[] {
    if (!this.db) {
      throw new Error('Database not open');
    }

    // Find stories where:
    // 1. They have an ADO work item ID
    // 2. updated_at > lastPushedAt OR lastPushedAt is null
    const stories = this.db.query<StoryRow, []>(`
      SELECT * FROM stories
      WHERE json_extract(extensions, '$.adoWorkItemId') IS NOT NULL
        AND (
          json_extract(extensions, '$.lastPushedAt') IS NULL
          OR updated_at > json_extract(extensions, '$.lastPushedAt')
        )
    `).all();

    return stories;
  }

  /**
   * Update story extensions with push metadata
   */
  private updateStoryPushMetadata(storyId: string, pushedStatus: string): void {
    if (!this.db) {
      return;
    }

    try {
      // Get current extensions
      const story = this.findStoryById(storyId);
      if (!story) return;

      let extensions: Record<string, unknown>;
      try {
        extensions = JSON.parse(story.extensions || '{}');
      } catch {
        extensions = {};
      }

      // Update push tracking fields
      extensions.lastPushedAt = new Date().toISOString();
      extensions.lastPushedStatus = pushedStatus;

      // Save back
      this.db.run(
        'UPDATE stories SET extensions = ? WHERE id = ?',
        [JSON.stringify(extensions), storyId]
      );
    } catch (error) {
      console.warn(`[${SERVICE_NAME}] Failed to update push metadata for story ${storyId}:`, error);
    }
  }

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  /**
   * Handle ADO API errors and convert to OutboundSyncResult
   */
  private handleAdoError(error: unknown, workItemId: number, storyId: string): OutboundSyncResult {
    if (error instanceof ADONotFoundError) {
      this.status.errors++;
      this.status.lastError = `Work item ${workItemId} not found`;
      return this.createErrorResult(workItemId, storyId, OutboundErrorCodes.WORK_ITEM_NOT_FOUND, `Work item ${workItemId} not found in ADO`);
    }

    if (error instanceof ADOAuthenticationError) {
      this.status.errors++;
      this.status.lastError = 'Authentication failed';
      return this.createErrorResult(workItemId, storyId, OutboundErrorCodes.AUTHENTICATION_FAILED, 'ADO authentication failed - check PAT validity');
    }

    if (error instanceof ADOAuthorizationError) {
      this.status.errors++;
      this.status.lastError = 'Authorization failed';
      return this.createErrorResult(workItemId, storyId, OutboundErrorCodes.AUTHORIZATION_FAILED, 'ADO authorization failed - check PAT permissions');
    }

    if (error instanceof ADOValidationError) {
      this.status.errors++;
      this.status.lastError = error.message;
      return this.createErrorResult(workItemId, storyId, OutboundErrorCodes.VALIDATION_ERROR, error.message);
    }

    if (error instanceof ADORateLimitError) {
      this.status.errors++;
      this.status.lastError = 'Rate limited';
      return this.createErrorResult(workItemId, storyId, OutboundErrorCodes.RATE_LIMITED, 'ADO rate limit exceeded - retry later');
    }

    // Generic error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.status.errors++;
    this.status.lastError = errorMessage;
    return this.createErrorResult(workItemId, storyId, OutboundErrorCodes.ADO_ERROR, errorMessage);
  }

  /**
   * Create an error result
   */
  private createErrorResult(
    workItemId: number,
    storyId: string,
    errorCode: OutboundErrorCode,
    errorMessage: string
  ): OutboundSyncResult {
    return {
      success: false,
      workItemId,
      storyId,
      previousState: 'Unknown' as ADOWorkItemState,
      newState: 'Unknown' as ADOWorkItemState,
      error: errorMessage,
      errorCode,
    };
  }

  /**
   * Create an error result for createWorkItemFromStory
   */
  private createCreateErrorResult(
    storyId: string,
    errorCode: OutboundErrorCode,
    errorMessage: string
  ): CreateWorkItemResult {
    return {
      success: false,
      storyId,
      error: errorMessage,
      errorCode,
    };
  }

  /**
   * Handle ADO API errors for createWorkItemFromStory
   */
  private handleAdoCreateError(error: unknown, storyId: string): CreateWorkItemResult {
    if (error instanceof ADOAuthenticationError) {
      this.status.errors++;
      this.status.lastError = 'Authentication failed';
      return this.createCreateErrorResult(storyId, OutboundErrorCodes.AUTHENTICATION_FAILED, 'ADO authentication failed - check PAT validity');
    }

    if (error instanceof ADOAuthorizationError) {
      this.status.errors++;
      this.status.lastError = 'Authorization failed';
      return this.createCreateErrorResult(storyId, OutboundErrorCodes.AUTHORIZATION_FAILED, 'ADO authorization failed - check PAT permissions');
    }

    if (error instanceof ADOValidationError) {
      this.status.errors++;
      this.status.lastError = error.message;
      return this.createCreateErrorResult(storyId, OutboundErrorCodes.VALIDATION_ERROR, error.message);
    }

    if (error instanceof ADORateLimitError) {
      this.status.errors++;
      this.status.lastError = 'Rate limited';
      return this.createCreateErrorResult(storyId, OutboundErrorCodes.RATE_LIMITED, 'ADO rate limit exceeded - retry later');
    }

    // Generic error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.status.errors++;
    this.status.lastError = errorMessage;
    return this.createCreateErrorResult(storyId, OutboundErrorCodes.ADO_ERROR, errorMessage);
  }

  /**
   * Convert a StoryRow from database to TrakStory format for field mapping
   */
  private storyRowToTrakStory(storyRow: StoryRow): TrakStory {
    let extensions: Record<string, unknown> & Partial<ADOStoryExtensions>;
    try {
      extensions = JSON.parse(storyRow.extensions || '{}');
    } catch {
      extensions = {};
    }

    return {
      id: storyRow.id,
      code: storyRow.code,
      featureId: storyRow.feature_id,
      title: storyRow.title,
      description: storyRow.description,
      why: storyRow.why,
      status: storyRow.status as TrakStoryStatus,
      priority: storyRow.priority as TrakPriority,
      assignedTo: storyRow.assigned_to,
      estimatedComplexity: storyRow.estimated_complexity,
      createdAt: storyRow.created_at,
      updatedAt: storyRow.updated_at,
      extensions: extensions as TrakStory['extensions'],
    };
  }

  /**
   * Update story extensions with ADO work item link
   */
  private updateStoryAdoLink(storyId: string, adoWorkItemId: number, adoWorkItemUrl: string): void {
    if (!this.db) {
      return;
    }

    try {
      // Get current extensions
      const story = this.findStoryById(storyId);
      if (!story) return;

      let extensions: Record<string, unknown>;
      try {
        extensions = JSON.parse(story.extensions || '{}');
      } catch {
        extensions = {};
      }

      // Update ADO link fields
      extensions.adoWorkItemId = adoWorkItemId;
      extensions.adoWorkItemUrl = adoWorkItemUrl;
      extensions.adoLastSyncAt = new Date().toISOString();

      // Save back
      this.db.run(
        'UPDATE stories SET extensions = ?, updated_at = datetime(\'now\') WHERE id = ?',
        [JSON.stringify(extensions), storyId]
      );
    } catch (error) {
      console.warn(`[${SERVICE_NAME}] Failed to update ADO link for story ${storyId}:`, error);
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an OutboundSyncService with default database path
 */
export function createOutboundSyncService(
  adoClient: ADOClient,
  fieldMapper: FieldMapper
): OutboundSyncService {
  return new OutboundSyncService(adoClient, fieldMapper);
}

/**
 * Create an OutboundSyncService with custom database path
 */
export function createOutboundSyncServiceWithDbPath(
  adoClient: ADOClient,
  fieldMapper: FieldMapper,
  dbPath: string
): OutboundSyncService {
  return new OutboundSyncService(adoClient, fieldMapper, dbPath);
}
