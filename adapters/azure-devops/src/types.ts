/**
 * Azure DevOps Adapter Type Definitions
 *
 * This module defines all TypeScript types for the ADO adapter including:
 * - ADO work item structures
 * - Sync configuration
 * - Field mapping types
 * - Daemon state
 * - API request/response types
 */

// =============================================================================
// Azure DevOps Work Item Types
// =============================================================================

/**
 * ADO Work Item states (default board configuration)
 * These map to columns on the ADO board
 */
export type ADOWorkItemState = 'New' | 'Active' | 'Resolved' | 'Closed' | 'Removed' | string;

/**
 * ADO Work Item types supported by trak adapter
 */
export type ADOWorkItemType = 'User Story' | 'Bug' | 'Task' | 'Feature' | 'Epic' | string;

/**
 * ADO Work Item priority (1 = highest, 4 = lowest)
 */
export type ADOPriority = 1 | 2 | 3 | 4;

/**
 * Core fields present on all ADO work items
 */
export interface ADOWorkItemFields {
  'System.Id': number;
  'System.Title': string;
  'System.Description'?: string;
  'System.State': ADOWorkItemState;
  'System.WorkItemType': ADOWorkItemType;
  'System.AreaPath': string;
  'System.IterationPath': string;
  'System.AssignedTo'?: ADOIdentityRef;
  'System.CreatedDate': string;
  'System.CreatedBy': ADOIdentityRef;
  'System.ChangedDate': string;
  'System.ChangedBy': ADOIdentityRef;
  'System.Rev': number;
  'System.Tags'?: string;
  'Microsoft.VSTS.Common.Priority'?: ADOPriority;
  'Microsoft.VSTS.Common.AcceptanceCriteria'?: string;
  'Microsoft.VSTS.Scheduling.StoryPoints'?: number;
  // Allow additional custom fields
  [key: string]: unknown;
}

/**
 * ADO Identity Reference (user/group)
 */
export interface ADOIdentityRef {
  displayName: string;
  url: string;
  id: string;
  uniqueName: string;
  imageUrl?: string;
  descriptor?: string;
}

/**
 * ADO Work Item as returned by the API
 */
export interface ADOWorkItem {
  id: number;
  rev: number;
  fields: ADOWorkItemFields;
  url: string;
  _links?: {
    self: { href: string };
    workItemUpdates?: { href: string };
    workItemRevisions?: { href: string };
    workItemComments?: { href: string };
    html?: { href: string };
    workItemType?: { href: string };
    fields?: { href: string };
  };
}

/**
 * ADO Work Item Update operation
 */
export interface ADOWorkItemUpdate {
  op: 'add' | 'remove' | 'replace' | 'copy' | 'move' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

/**
 * Response from ADO batch work item query
 */
export interface ADOWorkItemBatchResponse {
  count: number;
  value: ADOWorkItem[];
}

/**
 * Response from ADO WIQL query
 */
export interface ADOWIQLResponse {
  queryType: string;
  queryResultType: string;
  asOf: string;
  columns: Array<{ referenceName: string; name: string; url: string }>;
  workItems: Array<{ id: number; url: string }>;
}

// =============================================================================
// Field Mapping Types
// =============================================================================

/**
 * Mapping between trak story statuses and ADO work item states
 */
export interface StateMapping {
  /** ADO state -> trak status */
  inbound: Record<ADOWorkItemState, string>;
  /** trak status -> ADO state */
  outbound: Record<string, ADOWorkItemState>;
}

/**
 * Mapping between trak priority and ADO priority
 */
export interface PriorityMapping {
  /** ADO priority (1-4) -> trak priority (P0-P3) */
  inbound: Record<number, string>;
  /** trak priority -> ADO priority */
  outbound: Record<string, number>;
}

/**
 * Field mapping between trak entity fields and ADO work item fields
 */
export interface FieldMapping {
  /** trak field name */
  trakField: string;
  /** ADO field path (e.g., 'System.Title') */
  adoField: string;
  /** Optional transform function name for inbound sync */
  inboundTransform?: string;
  /** Optional transform function name for outbound sync */
  outboundTransform?: string;
  /** Whether this field is read-only (ADO -> trak only) */
  readOnly?: boolean;
}

/**
 * Complete field mapping configuration
 */
export interface FieldMappingConfig {
  /** State mappings */
  states: StateMapping;
  /** Priority mappings */
  priorities: PriorityMapping;
  /** Individual field mappings */
  fields: FieldMapping[];
  /** ADO work item types to sync (default: ['User Story', 'Bug']) */
  workItemTypes: ADOWorkItemType[];
}

// =============================================================================
// Sync Configuration
// =============================================================================

/**
 * ADO connection configuration
 */
export interface ADOConnectionConfig {
  /** Azure DevOps organization name */
  organization: string;
  /** Azure DevOps project name */
  project: string;
  /** Optional: specific board name (defaults to project name) */
  board?: string;
  /** Optional: specific area path filter */
  areaPath?: string;
  /** Optional: specific iteration path filter */
  iterationPath?: string;
}

/**
 * Sync behavior configuration
 */
export interface SyncConfig {
  /** Polling interval in milliseconds (default: 30000) */
  pollInterval: number;
  /** Maximum items to fetch per poll (default: 100) */
  batchSize: number;
  /** Enable inbound sync (ADO -> trak) */
  inboundEnabled: boolean;
  /** Enable outbound sync (trak -> ADO) */
  outboundEnabled: boolean;
  /** Conflict resolution strategy */
  conflictResolution: 'last-write-wins' | 'ado-wins' | 'trak-wins';
  /** Only sync items modified after this date (ISO string) */
  syncSince?: string;
}

/**
 * Complete adapter configuration
 */
export interface AdapterConfig {
  /** ADO connection settings */
  connection: ADOConnectionConfig;
  /** Sync behavior settings */
  sync: SyncConfig;
  /** Field mapping configuration */
  mapping: FieldMappingConfig;
  /** REST API server settings */
  server: ServerConfig;
}

// =============================================================================
// Server Configuration
// =============================================================================

/**
 * REST API server configuration
 */
export interface ServerConfig {
  /** Port to bind to (default: 9271) */
  port: number;
  /** Host to bind to (default: '127.0.0.1') */
  host: string;
}

// =============================================================================
// Daemon State Types
// =============================================================================

/**
 * Sync status for tracking
 */
export interface SyncStatus {
  /** Whether sync is currently running */
  isRunning: boolean;
  /** Last successful sync timestamp */
  lastSyncAt: string | null;
  /** Last sync error (if any) */
  lastError: string | null;
  /** Number of items synced in last poll */
  lastSyncCount: number;
  /** Total items synced since daemon start */
  totalSynced: number;
  /** Number of sync errors since daemon start */
  errorCount: number;
}

/**
 * Daemon health status
 */
export interface DaemonHealth {
  /** Daemon status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Daemon uptime in seconds */
  uptime: number;
  /** ADO API connectivity */
  adoConnected: boolean;
  /** trak database connectivity */
  trakConnected: boolean;
  /** Daemon version */
  version: string;
  /** Daemon start time */
  startedAt: string;
}

/**
 * Complete daemon state
 */
export interface DaemonState {
  /** Health status */
  health: DaemonHealth;
  /** Inbound sync status */
  inboundSync: SyncStatus;
  /** Outbound sync status */
  outboundSync: SyncStatus;
  /** Active configuration */
  config: AdapterConfig;
  /** Cached work items count */
  cachedWorkItems: number;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request to update ADO work item state
 */
export interface UpdateWorkItemStateRequest {
  /** Target state for the work item */
  state: ADOWorkItemState;
  /** Optional reason for state change */
  reason?: string;
}

/**
 * Request to force sync a specific work item
 */
export interface SyncWorkItemRequest {
  /** Direction of sync */
  direction: 'inbound' | 'outbound' | 'both';
}

/**
 * Request to trigger full sync
 */
export interface TriggerSyncRequest {
  /** Direction of sync */
  direction: 'inbound' | 'outbound' | 'both';
  /** Force sync even if recently synced */
  force?: boolean;
}

/**
 * Generic API success response
 */
export interface APISuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Generic API error response
 */
export interface APIErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

/**
 * API response type (success or error)
 */
export type APIResponse<T = unknown> = APISuccessResponse<T> | APIErrorResponse;

/**
 * Health check response
 */
export type HealthResponse = APIResponse<DaemonHealth>;

/**
 * Status response
 */
export type StatusResponse = APIResponse<{
  health: DaemonHealth;
  inboundSync: SyncStatus;
  outboundSync: SyncStatus;
  cachedWorkItems: number;
}>;

/**
 * Work item update response
 */
export type WorkItemUpdateResponse = APIResponse<{
  workItemId: number;
  previousState: ADOWorkItemState;
  newState: ADOWorkItemState;
  updatedAt: string;
}>;

/**
 * Sync trigger response
 */
export type SyncTriggerResponse = APIResponse<{
  syncId: string;
  direction: 'inbound' | 'outbound' | 'both';
  itemsProcessed: number;
  startedAt: string;
  completedAt: string;
}>;

// =============================================================================
// Trak Entity Extensions
// =============================================================================

/**
 * Extension fields added to trak stories for ADO sync
 */
export interface ADOStoryExtensions {
  /** ADO work item ID */
  adoWorkItemId?: number;
  /** ADO work item URL */
  adoWorkItemUrl?: string;
  /** Last sync timestamp from ADO */
  adoLastSyncAt?: string;
  /** ADO revision number at last sync */
  adoRevision?: number;
  /** ADO work item type */
  adoWorkItemType?: ADOWorkItemType;
}

// =============================================================================
// CLI Types
// =============================================================================

/**
 * Command-line arguments for the daemon
 */
export interface CLIArgs {
  /** Read PAT from stdin */
  patStdin: boolean;
  /** ADO organization name */
  org?: string;
  /** ADO project name */
  project?: string;
  /** ADO board name */
  board?: string;
  /** Server port */
  port?: number;
  /** Poll interval in seconds */
  pollInterval?: number;
  /** Path to mapping config file */
  mappingConfig?: string;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Show help */
  help?: boolean;
  /** Show version */
  version?: boolean;
}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Work item cache entry
 */
export interface CachedWorkItem {
  workItem: ADOWorkItem;
  fetchedAt: string;
  trakStoryId?: string;
}

/**
 * Sync operation result
 */
export interface SyncResult {
  success: boolean;
  direction: 'inbound' | 'outbound';
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  errors: Array<{
    workItemId: number;
    error: string;
  }>;
  startedAt: string;
  completedAt: string;
}
