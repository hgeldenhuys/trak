/**
 * Azure DevOps Adapter Daemon
 *
 * Main entry point for the trak-ado daemon that handles:
 * - PAT input from stdin (secure, never persisted)
 * - ADO client initialization
 * - Daemon lifecycle management
 * - Component coordination
 *
 * SECURITY: PAT is stored in memory only and is NEVER logged or persisted.
 */

import { ADOClient, ADOAuthenticationError } from './api';
import { FieldMapper, createDefaultFieldMapper } from './mapping';
import {
  parseCLIArgs,
  buildConfig,
  getHelpText,
  getVersionText,
  VERSION,
} from './config';
import { APIServer } from './api-server';
import { SyncService } from './sync-service';
import type {
  DaemonState,
  DaemonHealth,
  SyncStatus,
  AdapterConfig,
} from './types';

// =============================================================================
// Constants
// =============================================================================

/** Daemon name for logging */
const DAEMON_NAME = 'trak-ado';

/** Maximum time to wait for stdin (10 seconds) */
const STDIN_TIMEOUT_MS = 10_000;

// =============================================================================
// PAT Input Handling
// =============================================================================

/**
 * Read PAT from stdin securely
 *
 * Reads the PAT from stdin, trims whitespace, and validates it's non-empty.
 * PAT is NEVER logged or persisted.
 *
 * @returns The PAT string
 * @throws Error if stdin is empty or times out
 */
async function readPatFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let resolved = false;

    // Timeout handler
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Timeout waiting for PAT from stdin. Ensure you pipe the PAT correctly.'));
      }
    }, STDIN_TIMEOUT_MS);

    // Check if stdin is a TTY (interactive terminal)
    if (process.stdin.isTTY) {
      clearTimeout(timeout);
      reject(new Error(
        'PAT must be provided via stdin pipe, not interactive terminal.\n' +
        'Example: echo $ADO_PAT | trak-ado --pat-stdin --org ively --project ively.core'
      ));
      return;
    }

    process.stdin.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);

      const pat = Buffer.concat(chunks).toString('utf-8').trim();

      if (!pat) {
        reject(new Error(
          'PAT is required but stdin was empty.\n' +
          'Example: echo $ADO_PAT | trak-ado --pat-stdin --org ively --project ively.core'
        ));
        return;
      }

      // Basic validation - PAT should be a reasonable length
      if (pat.length < 20) {
        reject(new Error('PAT appears to be too short. Azure DevOps PATs are typically 52+ characters.'));
        return;
      }

      resolve(pat);
    });

    process.stdin.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      reject(new Error(`Error reading from stdin: ${err.message}`));
    });

    // Start reading
    process.stdin.resume();
  });
}

// =============================================================================
// Daemon Class
// =============================================================================

/**
 * Azure DevOps Adapter Daemon
 *
 * Manages the lifecycle of the ADO adapter including:
 * - ADO client initialization
 * - Field mapper configuration
 * - Sync service coordination (placeholder for T-006)
 * - API server management (placeholder for T-005)
 *
 * @example
 * ```typescript
 * const daemon = new Daemon();
 * await daemon.start();
 *
 * // Later...
 * await daemon.stop();
 * ```
 */
export class Daemon {
  private adoClient: ADOClient | null = null;
  private fieldMapper: FieldMapper | null = null;
  private config: AdapterConfig | null = null;
  private startTime: number | null = null;
  private isRunning = false;
  private isShuttingDown = false;

  // Sync state tracking
  private inboundSyncStatus: SyncStatus = this.createInitialSyncStatus();
  private outboundSyncStatus: SyncStatus = this.createInitialSyncStatus();

  // API Server (T-005)
  private apiServer: APIServer | null = null;

  // Inbound sync service (T-006)
  private syncService: SyncService | null = null;

  // Polling interval reference
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Create initial sync status object
   */
  private createInitialSyncStatus(): SyncStatus {
    return {
      isRunning: false,
      lastSyncAt: null,
      lastError: null,
      lastSyncCount: 0,
      totalSynced: 0,
      errorCount: 0,
    };
  }

  /**
   * Start the daemon
   *
   * Performs the following startup sequence:
   * 1. Parse CLI arguments
   * 2. Read PAT from stdin (if --pat-stdin)
   * 3. Validate PAT by testing connection
   * 4. Initialize ADOClient with PAT
   * 5. Initialize FieldMapper
   * 6. Start API server (placeholder for T-005)
   * 7. Start sync polling (placeholder for T-006)
   *
   * @throws Error if startup fails
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.error(`[${DAEMON_NAME}] Daemon is already running`);
      return;
    }

    this.startTime = Date.now();

    try {
      // Step 1: Parse CLI arguments
      const cliArgs = parseCLIArgs(process.argv.slice(2));

      // Handle help and version flags
      if (cliArgs.help) {
        console.log(getHelpText());
        process.exit(0);
      }

      if (cliArgs.version) {
        console.log(getVersionText());
        process.exit(0);
      }

      // Step 2: Build configuration
      this.config = buildConfig(cliArgs);

      console.log(`[${DAEMON_NAME}] Starting daemon v${VERSION}...`);
      console.log(`[${DAEMON_NAME}] Organization: ${this.config.connection.organization}`);
      console.log(`[${DAEMON_NAME}] Project: ${this.config.connection.project}`);
      console.log(`[${DAEMON_NAME}] Port: ${this.config.server.port}`);
      console.log(`[${DAEMON_NAME}] Poll interval: ${this.config.sync.pollInterval}ms`);

      // Step 3: Read PAT from stdin
      let pat: string;

      if (cliArgs.patStdin) {
        console.log(`[${DAEMON_NAME}] Reading PAT from stdin...`);
        pat = await readPatFromStdin();
        console.log(`[${DAEMON_NAME}] PAT received (length: ${pat.length} chars)`);
      } else {
        throw new Error(
          'PAT input method required. Use --pat-stdin flag.\n' +
          'Example: echo $ADO_PAT | trak-ado --pat-stdin --org ively --project ively.core'
        );
      }

      // Step 4: Initialize ADO client
      console.log(`[${DAEMON_NAME}] Initializing ADO client...`);
      this.adoClient = new ADOClient(pat, this.config.connection);

      // Step 5: Validate PAT by testing connection
      console.log(`[${DAEMON_NAME}] Testing ADO connection...`);
      const isConnected = await this.adoClient.testConnection();

      if (!isConnected) {
        throw new ADOAuthenticationError(
          'Failed to connect to Azure DevOps. Verify your PAT is valid and has appropriate permissions.'
        );
      }

      console.log(`[${DAEMON_NAME}] ADO connection successful`);

      // Step 6: Initialize FieldMapper
      console.log(`[${DAEMON_NAME}] Initializing field mapper...`);
      this.fieldMapper = createDefaultFieldMapper();

      // Step 7: Start API server
      console.log(`[${DAEMON_NAME}] Starting API server on port ${this.config.server.port}...`);
      this.apiServer = new APIServer(this, this.config.server);
      await this.apiServer.start();

      // Step 8: Start sync service
      console.log(`[${DAEMON_NAME}] Starting sync service with ${this.config.sync.pollInterval}ms interval...`);
      if (this.config.sync.dbPath) {
        console.log(`[${DAEMON_NAME}] Using database path: ${this.config.sync.dbPath}`);
      }
      this.syncService = new SyncService(
        this.adoClient,
        this.fieldMapper,
        this.config.sync,
        this.config.sync.dbPath
      );
      this.syncService.startPolling();

      this.isRunning = true;
      console.log(`[${DAEMON_NAME}] Daemon started successfully`);
      console.log(`[${DAEMON_NAME}] Press Ctrl+C to stop`);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${DAEMON_NAME}] Failed to start daemon: ${message}`);
      throw error;
    }
  }

  /**
   * Stop the daemon gracefully
   *
   * Performs the following shutdown sequence:
   * 1. Stop sync polling
   * 2. Close API server
   * 3. Clean up resources
   */
  async stop(): Promise<void> {
    if (!this.isRunning || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log(`[${DAEMON_NAME}] Shutting down daemon...`);

    // Stop polling
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }

    // Stop sync service
    if (this.syncService) {
      this.syncService.stopPolling();
      this.syncService = null;
    }

    // Stop API server
    if (this.apiServer) {
      await this.apiServer.stop();
      this.apiServer = null;
    }

    // Clear references (PAT is garbage collected)
    this.adoClient = null;
    this.fieldMapper = null;
    this.config = null;

    this.isRunning = false;
    this.isShuttingDown = false;

    console.log(`[${DAEMON_NAME}] Daemon stopped`);
  }

  /**
   * Get current daemon state
   */
  getState(): DaemonState | null {
    if (!this.config) {
      return null;
    }

    return {
      health: this.getHealth(),
      inboundSync: this.inboundSyncStatus,
      outboundSync: this.outboundSyncStatus,
      config: this.config,
      cachedWorkItems: 0, // TODO: Get from sync service
    };
  }

  /**
   * Get daemon health status
   */
  getHealth(): DaemonHealth {
    const uptime = this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0;

    // Determine health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (!this.isRunning) {
      status = 'unhealthy';
    } else if (
      this.inboundSyncStatus.errorCount > 5 ||
      this.outboundSyncStatus.errorCount > 5
    ) {
      status = 'degraded';
    }

    return {
      status,
      uptime,
      adoConnected: this.adoClient !== null,
      trakConnected: true, // TODO: Check actual trak DB connection
      version: VERSION,
      startedAt: this.startTime ? new Date(this.startTime).toISOString() : '',
    };
  }

  /**
   * Check if daemon is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get the ADO client (for API server use)
   */
  getAdoClient(): ADOClient | null {
    return this.adoClient;
  }

  /**
   * Get the field mapper (for API server use)
   */
  getFieldMapper(): FieldMapper | null {
    return this.fieldMapper;
  }

  /**
   * Get the configuration (for API server use)
   */
  getConfig(): AdapterConfig | null {
    return this.config;
  }

  /**
   * Get the sync service (for API server use)
   */
  getSyncService(): SyncService | null {
    return this.syncService;
  }

  /**
   * Update inbound sync status (called by SyncService in T-006)
   */
  updateInboundSyncStatus(update: Partial<SyncStatus>): void {
    this.inboundSyncStatus = { ...this.inboundSyncStatus, ...update };
  }

  /**
   * Update outbound sync status (called by SyncService in T-006)
   */
  updateOutboundSyncStatus(update: Partial<SyncStatus>): void {
    this.outboundSyncStatus = { ...this.outboundSyncStatus, ...update };
  }
}

// =============================================================================
// Signal Handlers
// =============================================================================

/**
 * Set up graceful shutdown handlers
 */
function setupSignalHandlers(daemon: Daemon): void {
  const shutdown = async (signal: string) => {
    console.log(`\n[${DAEMON_NAME}] Received ${signal} signal`);
    await daemon.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error(`[${DAEMON_NAME}] Uncaught exception:`, error.message);
    await daemon.stop();
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason) => {
    console.error(`[${DAEMON_NAME}] Unhandled rejection:`, reason);
    await daemon.stop();
    process.exit(1);
  });
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Main function - creates and starts the daemon
 */
async function main(): Promise<void> {
  const daemon = new Daemon();

  // Set up signal handlers for graceful shutdown
  setupSignalHandlers(daemon);

  // Start the daemon
  try {
    await daemon.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${DAEMON_NAME}] Fatal error: ${message}`);
    process.exit(1);
  }
}

// Run if this is the main module
// Using Bun's import.meta.main for module detection
if (import.meta.main) {
  main().catch((error) => {
    console.error(`[${DAEMON_NAME}] Failed to start:`, error.message);
    process.exit(1);
  });
}

// =============================================================================
// Exports
// =============================================================================

export { readPatFromStdin, setupSignalHandlers, main };
