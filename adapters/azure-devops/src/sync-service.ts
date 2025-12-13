/**
 * Inbound Sync Service (ADO -> trak)
 *
 * This module handles synchronization from Azure DevOps to trak's SQLite database.
 * Features:
 * - Configurable polling interval
 * - Rate limit handling with exponential backoff
 * - Feature auto-creation
 * - Error tracking per work item
 * - Conflict resolution (ADO wins by default)
 *
 * @module sync-service
 */

import { Database } from 'bun:sqlite';
import { homedir } from 'os';
import { join } from 'path';

import type { ADOClient } from './api';
import type { FieldMapper } from './mapping';
import type {
  SyncConfig,
  SyncResult,
  ADOWorkItem,
  ADOStoryExtensions,
} from './types';

// =============================================================================
// Types
// =============================================================================

/**
 * Status of the inbound sync service
 */
export interface InboundSyncStatus {
  /** Timestamp of last sync run (ISO string) */
  lastRun: string | null;
  /** Timestamp of next scheduled sync run (ISO string) */
  nextRun: string | null;
  /** Number of items synced in last run */
  itemsSynced: number;
  /** Number of items created in last run */
  itemsCreated: number;
  /** Number of items updated in last run */
  itemsUpdated: number;
  /** Number of errors in last run */
  errors: number;
  /** Last error message */
  lastError: string | null;
}

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

/**
 * Feature row from SQLite database
 */
interface FeatureRow {
  id: string;
  code: string;
  name: string;
  description: string;
  story_counter: number;
  extensions: string;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Default database path */
const DEFAULT_DB_PATH = join(homedir(), '.board', 'data.db');

/** Minimum backoff time for rate limiting (ms) */
const MIN_BACKOFF_MS = 5_000;

/** Maximum backoff time for rate limiting (ms) */
const MAX_BACKOFF_MS = 300_000; // 5 minutes

/** Service name for logging */
const SERVICE_NAME = 'SyncService';

// =============================================================================
// SyncService Class
// =============================================================================

/**
 * Inbound Sync Service
 *
 * Polls Azure DevOps for work items and syncs them to trak's SQLite database.
 * Handles rate limiting, feature auto-creation, and error tracking.
 *
 * @example
 * ```typescript
 * const syncService = new SyncService(adoClient, fieldMapper, config, dbPath);
 *
 * // Start polling
 * syncService.startPolling();
 *
 * // Force immediate sync
 * const result = await syncService.syncNow();
 *
 * // Stop polling
 * syncService.stopPolling();
 * ```
 */
export class SyncService {
  private readonly adoClient: ADOClient;
  private readonly fieldMapper: FieldMapper;
  private readonly config: SyncConfig;
  private readonly dbPath: string;
  private db: Database | null = null;

  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private isSyncing = false;
  private currentBackoff = 0;

  private status: InboundSyncStatus = {
    lastRun: null,
    nextRun: null,
    itemsSynced: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    errors: 0,
    lastError: null,
  };

  /**
   * Create a new SyncService
   *
   * @param adoClient - Configured ADO client for API calls
   * @param fieldMapper - Field mapper for ADO <-> trak conversion
   * @param config - Sync configuration
   * @param dbPath - Path to trak's SQLite database (default: ~/.board/data.db)
   */
  constructor(
    adoClient: ADOClient,
    fieldMapper: FieldMapper,
    config: SyncConfig,
    dbPath: string = DEFAULT_DB_PATH
  ) {
    this.adoClient = adoClient;
    this.fieldMapper = fieldMapper;
    this.config = config;
    this.dbPath = dbPath;
  }

  // ===========================================================================
  // Polling Control
  // ===========================================================================

  /**
   * Start polling at configured interval
   *
   * Immediately triggers a sync, then schedules subsequent syncs
   * at the configured poll interval.
   */
  startPolling(): void {
    if (this.isPolling) {
      console.log(`[${SERVICE_NAME}] Polling already running`);
      return;
    }

    console.log(`[${SERVICE_NAME}] Starting polling with ${this.config.pollInterval}ms interval`);
    this.isPolling = true;

    // Trigger immediate sync
    this.scheduleSyncWithBackoff();

    // Schedule recurring sync
    this.pollIntervalId = setInterval(() => {
      if (this.isPolling && !this.isSyncing) {
        this.scheduleSyncWithBackoff();
      }
    }, this.config.pollInterval);

    this.updateNextRun();
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (!this.isPolling) {
      return;
    }

    console.log(`[${SERVICE_NAME}] Stopping polling`);
    this.isPolling = false;

    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }

    this.status.nextRun = null;
  }

  /**
   * Schedule a sync with backoff handling
   */
  private scheduleSyncWithBackoff(): void {
    if (this.currentBackoff > 0) {
      console.log(`[${SERVICE_NAME}] Rate limited, backing off for ${this.currentBackoff}ms`);
      setTimeout(() => {
        this.currentBackoff = 0;
        if (this.isPolling) {
          this.syncNow().catch((error) => {
            console.error(`[${SERVICE_NAME}] Sync error after backoff:`, error.message);
          });
        }
      }, this.currentBackoff);
    } else {
      this.syncNow().catch((error) => {
        console.error(`[${SERVICE_NAME}] Sync error:`, error.message);
      });
    }
  }

  /**
   * Update the next run timestamp
   */
  private updateNextRun(): void {
    if (this.isPolling) {
      const nextTime = Date.now() + this.config.pollInterval + this.currentBackoff;
      this.status.nextRun = new Date(nextTime).toISOString();
    }
  }

  // ===========================================================================
  // Sync Operations
  // ===========================================================================

  /**
   * Force immediate sync
   *
   * Fetches all work items from ADO and syncs them to trak's database.
   * Handles rate limiting by setting backoff for subsequent syncs.
   *
   * @returns Sync result with statistics
   */
  async syncNow(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        direction: 'inbound',
        itemsProcessed: 0,
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        errors: [{ workItemId: 0, error: 'Sync already in progress' }],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
    }

    this.isSyncing = true;
    const startedAt = new Date().toISOString();

    const result: SyncResult = {
      success: true,
      direction: 'inbound',
      itemsProcessed: 0,
      itemsCreated: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      errors: [],
      startedAt,
      completedAt: '',
    };

    try {
      // Open database connection
      this.openDatabase();

      // Get supported work item types from field mapper
      const workItemTypes = this.fieldMapper.getSupportedWorkItemTypes();

      // Fetch work items from ADO
      console.log(`[${SERVICE_NAME}] Fetching work items from ADO...`);
      const adoItems = await this.adoClient.getBoardWorkItems(undefined, workItemTypes);
      console.log(`[${SERVICE_NAME}] Retrieved ${adoItems.length} work items from ADO`);

      // Process each work item
      for (const item of adoItems) {
        try {
          const wasCreated = await this.syncWorkItemToDb(item);
          result.itemsProcessed++;

          if (wasCreated === true) {
            result.itemsCreated++;
          } else if (wasCreated === false) {
            result.itemsUpdated++;
          } else {
            result.itemsSkipped++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push({
            workItemId: item.id,
            error: errorMessage,
          });
          console.error(`[${SERVICE_NAME}] Error syncing work item ${item.id}:`, errorMessage);
        }
      }

      // Reset backoff on success
      this.currentBackoff = 0;

    } catch (error) {
      result.success = false;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push({ workItemId: 0, error: errorMessage });

      // Handle rate limiting
      if (this.isRateLimitError(error)) {
        this.increaseBackoff();
        console.warn(`[${SERVICE_NAME}] Rate limited, backoff set to ${this.currentBackoff}ms`);
      }

      this.status.lastError = errorMessage;
      console.error(`[${SERVICE_NAME}] Sync failed:`, errorMessage);
    } finally {
      this.closeDatabase();
      this.isSyncing = false;

      result.completedAt = new Date().toISOString();

      // Update status
      this.status.lastRun = result.completedAt;
      this.status.itemsSynced = result.itemsProcessed;
      this.status.itemsCreated = result.itemsCreated;
      this.status.itemsUpdated = result.itemsUpdated;
      this.status.errors = result.errors.length;

      if (result.errors.length > 0 && !this.status.lastError) {
        this.status.lastError = result.errors[0].error;
      }

      this.updateNextRun();

      console.log(`[${SERVICE_NAME}] Sync completed: ${result.itemsProcessed} processed, ${result.itemsCreated} created, ${result.itemsUpdated} updated, ${result.errors.length} errors`);
    }

    return result;
  }

  /**
   * Sync a single work item by ID
   *
   * @param id - ADO work item ID
   * @returns The synced work item, or null if not found
   */
  async syncWorkItem(id: number): Promise<ADOWorkItem | null> {
    try {
      const workItem = await this.adoClient.getWorkItem(id);

      // Check if work item type is supported
      const workItemType = workItem.fields['System.WorkItemType'];
      if (!this.fieldMapper.isWorkItemTypeSupported(workItemType)) {
        console.log(`[${SERVICE_NAME}] Work item type "${workItemType}" not supported, skipping`);
        return null;
      }

      this.openDatabase();
      await this.syncWorkItemToDb(workItem);
      this.closeDatabase();

      return workItem;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${SERVICE_NAME}] Failed to sync work item ${id}:`, errorMessage);
      throw error;
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): InboundSyncStatus {
    return { ...this.status };
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
   * Sync a single work item to the database
   *
   * @param workItem - ADO work item to sync
   * @returns true if created, false if updated, null if skipped
   */
  private async syncWorkItemToDb(workItem: ADOWorkItem): Promise<boolean | null> {
    if (!this.db) {
      throw new Error('Database not open');
    }

    // Check if work item type is supported
    const workItemType = workItem.fields['System.WorkItemType'];
    if (!this.fieldMapper.isWorkItemTypeSupported(workItemType)) {
      return null;
    }

    // Map ADO work item to trak story fields
    const storyData = this.fieldMapper.adoToTrak(workItem);

    // Find existing story by ADO work item ID
    const existingStory = this.findStoryByAdoId(workItem.id);

    if (existingStory) {
      // Check if story is a draft - drafts are local-only and should not be overwritten
      if (existingStory.status === 'draft') {
        console.log(`[${SERVICE_NAME}] Skipping draft story ${existingStory.code} - draft stories are local-only`);
        return null;
      }

      // Update existing story
      await this.updateStory(existingStory.id, workItem, storyData);
      return false;
    } else {
      // Create new story
      await this.createStory(workItem, storyData);
      return true;
    }
  }

  /**
   * Find a story by ADO work item ID
   */
  private findStoryByAdoId(adoWorkItemId: number): StoryRow | null {
    if (!this.db) {
      throw new Error('Database not open');
    }

    // Query stories where extensions JSON contains the ADO work item ID
    const stories = this.db.query<StoryRow, []>(
      `SELECT * FROM stories WHERE json_extract(extensions, '$.adoWorkItemId') = ${adoWorkItemId}`
    ).all();

    return stories.length > 0 ? stories[0] : null;
  }

  /**
   * Create a new story from ADO work item
   */
  private async createStory(
    workItem: ADOWorkItem,
    storyData: ReturnType<FieldMapper['adoToTrak']>
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database not open');
    }

    // Get or create feature for this project
    const feature = await this.getOrCreateFeature(workItem);
    const featureId = feature.id;

    // Generate story ID and code
    const storyId = this.generateId();
    const storyCode = this.generateStoryCode(feature);

    // Increment feature's story counter
    this.incrementFeatureCounter(featureId);

    // Build extensions JSON
    const extensions: ADOStoryExtensions = {
      adoWorkItemId: workItem.id,
      adoWorkItemUrl: workItem.url,
      adoLastSyncAt: new Date().toISOString(),
      adoRevision: workItem.rev,
      adoWorkItemType: workItem.fields['System.WorkItemType'],
    };

    const now = new Date().toISOString();

    // Insert story
    this.db.run(
      `INSERT INTO stories (
        id, code, feature_id, title, description, why, status, priority,
        assigned_to, estimated_complexity, extensions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        storyId,
        storyCode,
        featureId,
        storyData.title,
        storyData.description,
        storyData.why,
        storyData.status || 'draft',
        storyData.priority || 'P2',
        storyData.assignedTo || null,
        storyData.estimatedComplexity || null,
        JSON.stringify(extensions),
        now,
        now,
      ]
    );

    console.log(`[${SERVICE_NAME}] Created story ${storyCode} from ADO work item ${workItem.id}`);
  }

  /**
   * Update an existing story from ADO work item
   */
  private async updateStory(
    storyId: string,
    workItem: ADOWorkItem,
    storyData: ReturnType<FieldMapper['adoToTrak']>
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database not open');
    }

    // Get existing story to preserve feature_id and code
    const existingStory = this.db.query<StoryRow, [string]>(
      'SELECT * FROM stories WHERE id = ?'
    ).get(storyId);

    if (!existingStory) {
      throw new Error(`Story ${storyId} not found`);
    }

    // Parse existing extensions and update
    let existingExtensions: Record<string, unknown> = {};
    try {
      existingExtensions = JSON.parse(existingStory.extensions);
    } catch {
      // Ignore parse errors
    }

    const extensions: ADOStoryExtensions = {
      ...existingExtensions,
      adoWorkItemId: workItem.id,
      adoWorkItemUrl: workItem.url,
      adoLastSyncAt: new Date().toISOString(),
      adoRevision: workItem.rev,
      adoWorkItemType: workItem.fields['System.WorkItemType'],
    };

    const now = new Date().toISOString();

    // Update story (ADO wins for inbound sync)
    this.db.run(
      `UPDATE stories SET
        title = ?,
        description = ?,
        why = ?,
        status = ?,
        priority = ?,
        assigned_to = ?,
        extensions = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        storyData.title,
        storyData.description,
        storyData.why,
        storyData.status || existingStory.status,
        storyData.priority || existingStory.priority,
        storyData.assignedTo || existingStory.assigned_to,
        JSON.stringify(extensions),
        now,
        storyId,
      ]
    );

    console.log(`[${SERVICE_NAME}] Updated story ${existingStory.code} from ADO work item ${workItem.id}`);
  }

  /**
   * Get or create a feature for the ADO project
   */
  private async getOrCreateFeature(workItem: ADOWorkItem): Promise<FeatureRow> {
    if (!this.db) {
      throw new Error('Database not open');
    }

    // Use area path or project name as feature code
    const areaPath = workItem.fields['System.AreaPath'];
    const featureCode = this.sanitizeFeatureCode(areaPath);

    // Check if feature exists
    const existingFeature = this.db.query<FeatureRow, [string]>(
      'SELECT * FROM features WHERE code = ?'
    ).get(featureCode);

    if (existingFeature) {
      return existingFeature;
    }

    // Create new feature
    const featureId = this.generateId();
    const featureName = areaPath.split('\\').pop() || areaPath;
    const now = new Date().toISOString();

    const extensions = {
      adoAreaPath: areaPath,
      adoCreatedFromSync: true,
    };

    this.db.run(
      `INSERT INTO features (
        id, code, name, description, story_counter, extensions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        featureId,
        featureCode,
        featureName,
        `Feature auto-created from ADO area path: ${areaPath}`,
        0,
        JSON.stringify(extensions),
        now,
        now,
      ]
    );

    console.log(`[${SERVICE_NAME}] Created feature ${featureCode} from ADO area path`);

    return {
      id: featureId,
      code: featureCode,
      name: featureName,
      description: `Feature auto-created from ADO area path: ${areaPath}`,
      story_counter: 0,
      extensions: JSON.stringify(extensions),
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Increment feature's story counter and return new value
   */
  private incrementFeatureCounter(featureId: string): number {
    if (!this.db) {
      throw new Error('Database not open');
    }

    // Increment counter
    this.db.run(
      'UPDATE features SET story_counter = story_counter + 1, updated_at = ? WHERE id = ?',
      [new Date().toISOString(), featureId]
    );

    // Get new value
    const feature = this.db.query<{ story_counter: number }, [string]>(
      'SELECT story_counter FROM features WHERE id = ?'
    ).get(featureId);

    return feature?.story_counter || 1;
  }

  /**
   * Generate a story code from feature
   */
  private generateStoryCode(feature: FeatureRow): string {
    const nextNumber = feature.story_counter + 1;
    return `${feature.code}-${String(nextNumber).padStart(3, '0')}`;
  }

  /**
   * Sanitize area path to create a valid feature code
   */
  private sanitizeFeatureCode(areaPath: string): string {
    // Take the last part of the area path and clean it
    const parts = areaPath.split('\\');
    const lastPart = parts[parts.length - 1] || parts[0] || 'ADO';

    return lastPart
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10) || 'ADO';
  }

  /**
   * Generate a unique ID (UUID v4 style)
   */
  private generateId(): string {
    return crypto.randomUUID();
  }

  // ===========================================================================
  // Rate Limit Handling
  // ===========================================================================

  /**
   * Check if an error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('too many requests')
      );
    }
    return false;
  }

  /**
   * Increase backoff time exponentially
   */
  private increaseBackoff(): void {
    if (this.currentBackoff === 0) {
      this.currentBackoff = MIN_BACKOFF_MS;
    } else {
      this.currentBackoff = Math.min(this.currentBackoff * 2, MAX_BACKOFF_MS);
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a SyncService with default database path
 */
export function createSyncService(
  adoClient: ADOClient,
  fieldMapper: FieldMapper,
  config: SyncConfig
): SyncService {
  return new SyncService(adoClient, fieldMapper, config);
}

/**
 * Create a SyncService with custom database path
 */
export function createSyncServiceWithDbPath(
  adoClient: ADOClient,
  fieldMapper: FieldMapper,
  config: SyncConfig,
  dbPath: string
): SyncService {
  return new SyncService(adoClient, fieldMapper, config, dbPath);
}
