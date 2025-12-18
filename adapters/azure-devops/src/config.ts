/**
 * Azure DevOps Adapter Configuration
 *
 * This module handles configuration loading and defaults for the ADO adapter.
 * Configuration sources (in order of precedence):
 * 1. CLI arguments
 * 2. Environment variables
 * 3. Configuration file (YAML)
 * 4. Default values
 */

import type {
  AdapterConfig,
  ADOConnectionConfig,
  SyncConfig,
  FieldMappingConfig,
  ServerConfig,
  CLIArgs,
  StateMapping,
  PriorityMapping,
  FieldMapping,
} from './types';

// =============================================================================
// Default Values
// =============================================================================

/** Default REST API server port */
export const DEFAULT_PORT = 9271;

/** Default poll interval in milliseconds (30 seconds) */
export const DEFAULT_POLL_INTERVAL = 30_000;

/** Default batch size for work item queries */
export const DEFAULT_BATCH_SIZE = 100;

/** Default server host (localhost only for security) */
export const DEFAULT_HOST = '127.0.0.1';

/** Default work item types to sync (supports Basic, Agile, and Scrum process templates) */
export const DEFAULT_WORK_ITEM_TYPES = [
  'User Story',           // Agile process
  'Product Backlog Item', // Scrum process (PBI)
  'Bug',                  // All processes
  'Issue',                // Basic process
  'Task',                 // All processes
  'Epic',                 // Agile/Scrum
  'Feature',              // Agile/Scrum
];

/** Adapter version */
export const VERSION = '0.1.0';

// =============================================================================
// Default Field Mappings
// =============================================================================

/**
 * Default state mapping between ADO and trak
 *
 * Supports Agile, Scrum, and Basic process templates:
 *
 * Agile States -> Trak Status:
 * - New -> draft
 * - Active -> in_progress
 * - Resolved -> review
 * - Closed -> completed
 * - Removed -> cancelled
 *
 * Scrum States -> Trak Status:
 * - New -> draft
 * - Approved -> planned
 * - Committed -> in_progress
 * - Done -> completed
 * - Removed -> cancelled
 *
 * Basic States -> Trak Status:
 * - To Do -> draft
 * - Doing -> in_progress
 * - Done -> completed
 */
export const DEFAULT_STATE_MAPPING: StateMapping = {
  inbound: {
    // Agile process states
    'New': 'draft',
    'Active': 'in_progress',
    'Resolved': 'review',
    'Closed': 'completed',
    'Removed': 'cancelled',
    // Scrum process states
    'Approved': 'planned',
    'Committed': 'in_progress',
    'Done': 'completed',
    // Basic process states
    'To Do': 'draft',
    'Doing': 'in_progress',
  },
  outbound: {
    'draft': 'New',
    'planned': 'Approved',      // Maps to Scrum 'Approved' (falls back to 'New' in Agile)
    'in_progress': 'Active',    // Works for Agile; Scrum uses 'Committed' but 'Active' is safer
    'review': 'Resolved',
    'completed': 'Closed',
    'cancelled': 'Removed',
  },
};

/**
 * Scrum-specific state mapping for outbound sync
 * Use with --process-template scrum
 */
export const SCRUM_STATE_MAPPING: StateMapping = {
  inbound: {
    'New': 'draft',
    'Approved': 'planned',
    'Committed': 'in_progress',
    'Done': 'completed',
    'Removed': 'cancelled',
  },
  outbound: {
    'draft': 'New',
    'planned': 'Approved',
    'in_progress': 'Committed',  // Scrum uses Committed, not Active
    'review': 'Committed',       // Scrum doesn't have review state, keep in Committed
    'completed': 'Done',         // Scrum uses Done, not Closed
    'cancelled': 'Removed',
  },
};

/**
 * Basic process template state mapping
 * Use with --process-template basic
 */
export const BASIC_STATE_MAPPING: StateMapping = {
  inbound: {
    'To Do': 'draft',
    'Doing': 'in_progress',
    'Done': 'completed',
  },
  outbound: {
    'draft': 'To Do',
    'planned': 'To Do',
    'in_progress': 'Doing',
    'review': 'Doing',
    'completed': 'Done',
    'cancelled': 'Done',  // Basic doesn't have Removed
  },
};

/**
 * Default priority mapping between ADO and trak
 *
 * ADO Priority (1-4) -> Trak Priority (P0-P3):
 * - 1 (Critical) -> P0
 * - 2 (High) -> P1
 * - 3 (Medium) -> P2
 * - 4 (Low) -> P3
 */
export const DEFAULT_PRIORITY_MAPPING: PriorityMapping = {
  inbound: {
    1: 'P0',
    2: 'P1',
    3: 'P2',
    4: 'P3',
  },
  outbound: {
    'P0': 1,
    'P1': 2,
    'P2': 3,
    'P3': 4,
  },
};

/**
 * Default field mappings between trak and ADO
 */
export const DEFAULT_FIELD_MAPPINGS: FieldMapping[] = [
  {
    trakField: 'title',
    adoField: 'System.Title',
  },
  {
    trakField: 'description',
    adoField: 'System.Description',
  },
  {
    trakField: 'why',
    adoField: 'Microsoft.VSTS.Common.AcceptanceCriteria',
    readOnly: false,
  },
  {
    trakField: 'assignedTo',
    adoField: 'System.AssignedTo',
    inboundTransform: 'extractDisplayName',
    outboundTransform: 'findUserByName',
  },
  {
    trakField: 'extensions.adoWorkItemId',
    adoField: 'System.Id',
    readOnly: true,
  },
  {
    trakField: 'extensions.adoRevision',
    adoField: 'System.Rev',
    readOnly: true,
  },
  {
    trakField: 'extensions.adoWorkItemType',
    adoField: 'System.WorkItemType',
    readOnly: true,
  },
  {
    trakField: 'createdAt',
    adoField: 'System.CreatedDate',
    readOnly: true,
  },
  {
    trakField: 'updatedAt',
    adoField: 'System.ChangedDate',
    readOnly: true,
  },
];

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Create default server configuration
 */
export function createDefaultServerConfig(): ServerConfig {
  return {
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
  };
}

/**
 * Create default sync configuration
 */
export function createDefaultSyncConfig(): SyncConfig {
  return {
    pollInterval: DEFAULT_POLL_INTERVAL,
    batchSize: DEFAULT_BATCH_SIZE,
    inboundEnabled: true,
    outboundEnabled: true,
    conflictResolution: 'last-write-wins',
  };
}

/**
 * Create default field mapping configuration
 *
 * @param processTemplate - ADO process template to use for state mapping (default: agile)
 */
export function createDefaultMappingConfig(
  processTemplate?: 'agile' | 'scrum' | 'basic'
): FieldMappingConfig {
  // Select state mapping based on process template
  let stateMapping: StateMapping;
  switch (processTemplate) {
    case 'scrum':
      stateMapping = SCRUM_STATE_MAPPING;
      break;
    case 'basic':
      stateMapping = BASIC_STATE_MAPPING;
      break;
    default:
      stateMapping = DEFAULT_STATE_MAPPING;
  }

  return {
    states: stateMapping,
    priorities: DEFAULT_PRIORITY_MAPPING,
    fields: DEFAULT_FIELD_MAPPINGS,
    workItemTypes: DEFAULT_WORK_ITEM_TYPES,
  };
}

// =============================================================================
// Configuration Building
// =============================================================================

/**
 * Parse CLI arguments into structured format
 */
export function parseCLIArgs(args: string[]): CLIArgs {
  const result: CLIArgs = {
    patStdin: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--pat-stdin':
        result.patStdin = true;
        break;
      case '--org':
      case '-o':
        result.org = nextArg;
        i++;
        break;
      case '--project':
      case '-p':
        result.project = nextArg;
        i++;
        break;
      case '--board':
      case '-b':
        result.board = nextArg;
        i++;
        break;
      case '--port':
        result.port = parseInt(nextArg, 10);
        i++;
        break;
      case '--poll-interval':
        result.pollInterval = parseInt(nextArg, 10);
        i++;
        break;
      case '--mapping-config':
      case '-m':
        result.mappingConfig = nextArg;
        i++;
        break;
      case '--db-path':
      case '-d':
        result.dbPath = nextArg;
        i++;
        break;
      case '--process-template':
      case '-t':
        if (nextArg === 'agile' || nextArg === 'scrum' || nextArg === 'basic') {
          result.processTemplate = nextArg;
        } else {
          console.warn(`[Config] Invalid process template "${nextArg}", using default (agile)`);
        }
        i++;
        break;
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      case '--version':
        result.version = true;
        break;
    }
  }

  return result;
}

/**
 * Get configuration from environment variables
 */
export function getEnvConfig(): Partial<{
  org: string;
  project: string;
  board: string;
  port: number;
  pollInterval: number;
  dbPath: string;
  processTemplate: 'agile' | 'scrum' | 'basic';
}> {
  const env = process.env;

  // Parse process template from env
  let processTemplate: 'agile' | 'scrum' | 'basic' | undefined;
  const templateEnv = env.ADO_PROCESS_TEMPLATE || env.AZURE_DEVOPS_PROCESS_TEMPLATE;
  if (templateEnv === 'agile' || templateEnv === 'scrum' || templateEnv === 'basic') {
    processTemplate = templateEnv;
  }

  return {
    org: env.ADO_ORG || env.AZURE_DEVOPS_ORG,
    project: env.ADO_PROJECT || env.AZURE_DEVOPS_PROJECT,
    board: env.ADO_BOARD || env.AZURE_DEVOPS_BOARD,
    port: env.ADO_PORT ? parseInt(env.ADO_PORT, 10) : undefined,
    pollInterval: env.ADO_POLL_INTERVAL
      ? parseInt(env.ADO_POLL_INTERVAL, 10) * 1000
      : undefined,
    dbPath: env.BOARD_DB_PATH,
    processTemplate,
  };
}

/**
 * Build connection configuration from CLI args and environment
 */
export function buildConnectionConfig(
  cliArgs: CLIArgs,
  envConfig: ReturnType<typeof getEnvConfig>
): ADOConnectionConfig {
  const org = cliArgs.org || envConfig.org;
  const project = cliArgs.project || envConfig.project;

  if (!org) {
    throw new Error(
      'ADO organization is required. Use --org flag or set ADO_ORG environment variable.'
    );
  }

  if (!project) {
    throw new Error(
      'ADO project is required. Use --project flag or set ADO_PROJECT environment variable.'
    );
  }

  return {
    organization: org,
    project: project,
    board: cliArgs.board || envConfig.board || project,
  };
}

/**
 * Build complete adapter configuration
 */
export function buildConfig(cliArgs: CLIArgs): AdapterConfig {
  const envConfig = getEnvConfig();

  const connection = buildConnectionConfig(cliArgs, envConfig);

  const sync = createDefaultSyncConfig();
  if (cliArgs.pollInterval) {
    sync.pollInterval = cliArgs.pollInterval * 1000; // Convert seconds to ms
  } else if (envConfig.pollInterval) {
    sync.pollInterval = envConfig.pollInterval;
  }

  // Set database path from CLI or env
  const dbPath = cliArgs.dbPath || envConfig.dbPath;
  if (dbPath) {
    sync.dbPath = dbPath;
  }

  const server = createDefaultServerConfig();
  if (cliArgs.port) {
    server.port = cliArgs.port;
  } else if (envConfig.port) {
    server.port = envConfig.port;
  }

  // Determine process template from CLI or env (default: agile)
  const processTemplate = cliArgs.processTemplate || envConfig.processTemplate;
  const mapping = createDefaultMappingConfig(processTemplate);

  return {
    connection,
    sync,
    mapping,
    server,
  };
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that required configuration is present
 */
export function validateConfig(config: AdapterConfig): string[] {
  const errors: string[] = [];

  if (!config.connection.organization) {
    errors.push('ADO organization is required');
  }

  if (!config.connection.project) {
    errors.push('ADO project is required');
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push('Server port must be between 1 and 65535');
  }

  if (config.sync.pollInterval < 1000) {
    errors.push('Poll interval must be at least 1000ms (1 second)');
  }

  if (config.sync.batchSize < 1 || config.sync.batchSize > 200) {
    errors.push('Batch size must be between 1 and 200');
  }

  return errors;
}

// =============================================================================
// Help Text
// =============================================================================

/**
 * Generate help text for CLI
 */
export function getHelpText(): string {
  return `
trak-ado - Azure DevOps adapter daemon for trak

USAGE:
  echo $PAT | trak-ado --pat-stdin --org <org> --project <project>

OPTIONS:
  --pat-stdin             Read PAT from stdin (required for security)
  -o, --org <org>         Azure DevOps organization name
  -p, --project <name>    Azure DevOps project name
  -b, --board <name>      Board name (defaults to project name)
  --port <port>           REST API port (default: ${DEFAULT_PORT})
  --poll-interval <sec>   Polling interval in seconds (default: ${DEFAULT_POLL_INTERVAL / 1000})
  -m, --mapping-config    Path to custom field mapping YAML file
  -d, --db-path <path>    Path to trak SQLite database (default: ~/.board/data.db)
  -t, --process-template  ADO process template: agile, scrum, basic (default: agile)
  -v, --verbose           Enable verbose logging
  -h, --help              Show this help message
  --version               Show version

ENVIRONMENT VARIABLES:
  ADO_ORG                 Azure DevOps organization
  ADO_PROJECT             Azure DevOps project
  ADO_BOARD               Board name
  ADO_PORT                REST API port
  ADO_POLL_INTERVAL       Polling interval in seconds
  ADO_PROCESS_TEMPLATE    Process template (agile, scrum, basic)
  BOARD_DB_PATH           Path to trak SQLite database

PROCESS TEMPLATES:
  agile   Agile process - uses New/Active/Resolved/Closed states (default)
  scrum   Scrum process - uses New/Approved/Committed/Done states
  basic   Basic process - uses To Do/Doing/Done states

EXAMPLES:
  # Start daemon with PAT from environment variable
  echo $ADO_PAT | trak-ado --pat-stdin --org ively --project ively.core

  # Start with Scrum process template
  echo $ADO_PAT | trak-ado --pat-stdin --org ively --project Trak --process-template scrum

  # Start with custom database path
  echo $ADO_PAT | trak-ado --pat-stdin --org ively --project Trak --db-path ./.board.db

  # Start with custom port and polling interval
  echo $ADO_PAT | trak-ado --pat-stdin --org ively --project ively.core --port 9280 --poll-interval 60

  # Use custom field mapping
  echo $ADO_PAT | trak-ado --pat-stdin --org ively --project ively.core -m ./my-mapping.yaml

REST API ENDPOINTS:
  GET  /health                      Daemon health status
  GET  /status                      Sync status and statistics
  POST /ado/work-item               Create ADO work item from trak story
  POST /ado/work-item/:id/state     Update ADO work item state
  POST /ado/work-item/:id/sync      Force sync single work item
  POST /sync                        Trigger full sync

For more information, see: adapters/azure-devops/README.md
`.trim();
}

/**
 * Get version string
 */
export function getVersionText(): string {
  return `trak-ado version ${VERSION}`;
}
