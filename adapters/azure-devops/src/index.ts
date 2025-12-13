/**
 * Azure DevOps Adapter for trak
 *
 * This module provides bidirectional synchronization between trak stories
 * and Azure DevOps work items.
 *
 * @example
 * ```typescript
 * // Start the daemon from CLI
 * // echo $ADO_PAT | trak-ado --pat-stdin --org ively --project ively.core
 *
 * // Or import components directly
 * import { ADOClient, FieldMapper, Daemon } from '@trak/azure-devops-adapter';
 * ```
 */

// API Client
export {
  ADOClient,
  ADOApiError,
  ADOAuthenticationError,
  ADOAuthorizationError,
  ADONotFoundError,
  ADORateLimitError,
  ADOValidationError,
  ADOServerError,
  type PatchOperation,
} from './api';

// Field Mapping
export {
  FieldMapper,
  createDefaultFieldMapper,
  createFieldMapper,
  loadMappingFromYaml,
  transformFunctions,
  type TrakStoryStatus,
  type TrakPriority,
  type TrakStory,
  type CreateStoryFromADOInput,
} from './mapping';

// Configuration
export {
  parseCLIArgs,
  buildConfig,
  validateConfig,
  getHelpText,
  getVersionText,
  createDefaultServerConfig,
  createDefaultSyncConfig,
  createDefaultMappingConfig,
  DEFAULT_PORT,
  DEFAULT_POLL_INTERVAL,
  DEFAULT_BATCH_SIZE,
  DEFAULT_HOST,
  DEFAULT_WORK_ITEM_TYPES,
  DEFAULT_STATE_MAPPING,
  DEFAULT_PRIORITY_MAPPING,
  DEFAULT_FIELD_MAPPINGS,
  VERSION,
} from './config';

// Daemon
export { Daemon, readPatFromStdin, setupSignalHandlers, main } from './daemon';

// API Server
export { APIServer, ErrorCodes } from './api-server';

// Sync Service (Inbound: ADO -> trak)
export {
  SyncService,
  createSyncService,
  createSyncServiceWithDbPath,
  type InboundSyncStatus,
} from './sync-service';

// Outbound Sync Service (trak -> ADO)
export {
  OutboundSyncService,
  createOutboundSyncService,
  createOutboundSyncServiceWithDbPath,
  OutboundErrorCodes,
  type OutboundSyncStatus,
  type OutboundSyncResult,
  type OutboundErrorCode,
  type CreateWorkItemResult,
} from './outbound-sync';

// Types
export type {
  // Work Item Types
  ADOWorkItemState,
  ADOWorkItemType,
  ADOPriority,
  ADOWorkItemFields,
  ADOIdentityRef,
  ADOWorkItem,
  ADOWorkItemUpdate,
  ADOWorkItemBatchResponse,
  ADOWIQLResponse,

  // Mapping Types
  StateMapping,
  PriorityMapping,
  FieldMapping,
  FieldMappingConfig,

  // Configuration Types
  ADOConnectionConfig,
  SyncConfig,
  AdapterConfig,
  ServerConfig,
  CLIArgs,

  // Daemon State Types
  SyncStatus,
  DaemonHealth,
  DaemonState,

  // API Request/Response Types
  UpdateWorkItemStateRequest,
  SyncWorkItemRequest,
  TriggerSyncRequest,
  APISuccessResponse,
  APIErrorResponse,
  APIResponse,
  HealthResponse,
  StatusResponse,
  WorkItemUpdateResponse,
  SyncTriggerResponse,

  // Extension Types
  ADOStoryExtensions,

  // Internal Types
  CachedWorkItem,
  SyncResult,
} from './types';
