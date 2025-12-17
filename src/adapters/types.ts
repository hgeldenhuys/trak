/**
 * Adapter Discovery Types
 *
 * Type definitions for adapter discovery and status reporting.
 */

/**
 * Adapter health information from /health endpoint
 */
export interface AdapterHealth {
  /** Whether the adapter is connected to the external system */
  adoConnected?: boolean;
  /** Whether the adapter is connected to trak */
  trakConnected?: boolean;
  /** Adapter uptime in seconds */
  uptime?: number;
}

/**
 * Adapter sync statistics from /status endpoint
 */
export interface AdapterSync {
  /** ISO timestamp of last inbound sync */
  lastInboundSync?: string;
  /** ISO timestamp of last outbound sync */
  lastOutboundSync?: string;
  /** Number of items synced inbound */
  inboundCount?: number;
  /** Number of items synced outbound */
  outboundCount?: number;
  /** Total error count */
  errorCount?: number;
}

/**
 * Adapter configuration from /status endpoint
 */
export interface AdapterConfig {
  /** Organization name (e.g., Azure DevOps organization) */
  org?: string;
  /** Project name */
  project?: string;
  /** Board name */
  board?: string;
}

/**
 * Full adapter information returned by discovery
 */
export interface AdapterInfo {
  /** Internal adapter name (e.g., 'azure-devops') */
  name: string;
  /** Human-readable display name (e.g., 'Azure DevOps') */
  displayName: string;
  /** Port the adapter is running on */
  port: number;
  /** Adapter version string */
  version: string;
  /** Current adapter status */
  status: 'online' | 'offline' | 'error';
  /** Health information (only present when online) */
  health?: AdapterHealth;
  /** Sync statistics (only present when online) */
  sync?: AdapterSync;
  /** Adapter configuration (only present when online) */
  config?: AdapterConfig;
}

/**
 * Known adapter definition used in the registry
 */
export interface KnownAdapter {
  /** Internal adapter name */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Default port the adapter runs on */
  defaultPort: number;
}

/**
 * Response from adapter /health endpoint
 */
export interface AdapterHealthResponse {
  ok: boolean;
  uptime?: number;
}

/**
 * Response from adapter /status endpoint
 */
export interface AdapterStatusResponse {
  connected?: boolean;
  lastSync?: string | null;
  inbound?: {
    lastRun?: string | null;
    itemsSynced?: number;
    errors?: number;
  };
  outbound?: {
    lastRun?: string | null;
    itemsSynced?: number;
    errors?: number;
  };
  config?: {
    org?: string;
    project?: string;
    pollInterval?: number;
  };
}
