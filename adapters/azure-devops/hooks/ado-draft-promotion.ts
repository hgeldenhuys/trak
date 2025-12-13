#!/usr/bin/env bun
/**
 * ADO Draft Promotion Hook
 *
 * Triggers when a story status changes from 'draft' to any non-draft status.
 * If the story has no adoWorkItemId, calls the daemon API to create one.
 *
 * Input (stdin): JSON object with story status change event:
 * {
 *   "storyId": "uuid",
 *   "code": "PROJ-001",
 *   "status": "planned",
 *   "previousStatus": "draft",
 *   "title": "Story title",
 *   "description": "Story description",
 *   "extensions": {
 *     "adoWorkItemId": null  // or absent
 *   }
 * }
 *
 * Usage:
 *   This script is called automatically by trak when configured as a hook.
 *   Manual testing:
 *   echo '{"storyId":"abc-123","code":"TEST-001","status":"planned","previousStatus":"draft","extensions":{}}' | bun ./ado-draft-promotion.ts
 *
 * Environment Variables:
 *   ADO_DAEMON_HOST - Daemon hostname (default: 127.0.0.1)
 *   ADO_DAEMON_PORT - Daemon port (default: 9271)
 *   ADO_HOOK_DEBUG  - Enable debug logging (default: 0)
 *   ADO_DEFAULT_WORK_ITEM_TYPE - Work item type to create (default: Issue)
 *
 * Exit codes:
 *   0 - Success (or skipped - not a draft promotion)
 *   1 - Error creating ADO work item
 */

// =============================================================================
// Configuration
// =============================================================================

const ADO_DAEMON_HOST = process.env.ADO_DAEMON_HOST || '127.0.0.1';
const ADO_DAEMON_PORT = process.env.ADO_DAEMON_PORT || '9271';
const ADO_DAEMON_URL = `http://${ADO_DAEMON_HOST}:${ADO_DAEMON_PORT}`;
const ADO_WORK_ITEM_TYPE = process.env.ADO_DEFAULT_WORK_ITEM_TYPE || 'Issue';
const DEBUG = process.env.ADO_HOOK_DEBUG === '1';

// =============================================================================
// Types
// =============================================================================

interface StoryStatusChangeEvent {
  storyId: string;
  code: string;
  status: string;
  previousStatus?: string;
  title?: string;
  description?: string;
  featureCode?: string;
  priority?: string;
  extensions?: {
    adoWorkItemId?: number | null;
    [key: string]: unknown;
  };
}

interface CreateWorkItemResponse {
  success: boolean;
  adoWorkItemId?: number;
  url?: string;
  error?: {
    code: string;
    message: string;
  };
}

// =============================================================================
// Logging Utilities
// =============================================================================

function logInfo(message: string): void {
  console.log(`[ado-draft-hook] ${message}`);
}

function logError(message: string): void {
  console.error(`[ado-draft-hook] ERROR: ${message}`);
}

function logDebug(message: string): void {
  if (DEBUG) {
    console.log(`[ado-draft-hook] DEBUG: ${message}`);
  }
}

// =============================================================================
// Daemon Communication
// =============================================================================

/**
 * Check if the ADO daemon is running
 */
async function checkDaemonHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${ADO_DAEMON_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    if (response.ok) {
      const data = await response.json() as { ok: boolean };
      logDebug(`Daemon health check: ok=${data.ok}`);
      return data.ok === true;
    }
    return false;
  } catch (error) {
    logDebug(`Daemon health check failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Create an ADO work item from a trak story via the daemon API
 */
async function createWorkItem(storyId: string, type: string = ADO_WORK_ITEM_TYPE): Promise<CreateWorkItemResponse> {
  try {
    const response = await fetch(`${ADO_DAEMON_URL}/ado/work-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storyId,
        type,
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout for creation
    });

    const data = await response.json() as CreateWorkItemResponse;

    if (!response.ok) {
      return {
        success: false,
        error: data.error || {
          code: `HTTP_${response.status}`,
          message: `HTTP error ${response.status}: ${response.statusText}`,
        },
      };
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: `Failed to call daemon API: ${message}`,
      },
    };
  }
}

// =============================================================================
// Event Processing
// =============================================================================

/**
 * Check if this event represents a draft promotion
 * (status changed from 'draft' to something else)
 */
function isDraftPromotion(event: StoryStatusChangeEvent): boolean {
  return (
    event.previousStatus === 'draft' &&
    event.status !== 'draft'
  );
}

/**
 * Check if the story needs an ADO work item created
 * (has no existing adoWorkItemId)
 */
function needsAdoWorkItem(event: StoryStatusChangeEvent): boolean {
  const adoId = event.extensions?.adoWorkItemId;
  return adoId === undefined || adoId === null;
}

/**
 * Process a story status change event
 */
async function processEvent(event: StoryStatusChangeEvent): Promise<number> {
  logDebug(`Received event: ${JSON.stringify(event)}`);

  // Validate required fields
  if (!event.storyId) {
    logError('Missing storyId in event data');
    return 1;
  }

  if (!event.status) {
    logError('Missing status in event data');
    return 1;
  }

  const storyCode = event.code || event.storyId.substring(0, 8);

  // Check if this is a draft promotion
  if (!isDraftPromotion(event)) {
    logDebug(`Not a draft promotion: ${event.previousStatus} -> ${event.status}`);
    logInfo(`Story ${storyCode} status change is not a draft promotion, skipping`);
    return 0;
  }

  // Check if story needs ADO work item
  if (!needsAdoWorkItem(event)) {
    const adoId = event.extensions?.adoWorkItemId;
    logInfo(`Story ${storyCode} already linked to ADO work item ${adoId}, skipping`);
    return 0;
  }

  logInfo(`Draft promotion detected: ${storyCode} (${event.previousStatus} -> ${event.status})`);
  logInfo(`Creating ADO work item for story ${storyCode}...`);

  // Check if daemon is available
  const daemonHealthy = await checkDaemonHealth();
  if (!daemonHealthy) {
    logError(`ADO daemon is not running at ${ADO_DAEMON_URL}`);
    logError('Story promoted but ADO work item NOT created');
    logInfo(`To create manually later: POST ${ADO_DAEMON_URL}/ado/work-item { "storyId": "${event.storyId}" }`);
    return 1;
  }

  // Create the ADO work item
  const result = await createWorkItem(event.storyId, ADO_WORK_ITEM_TYPE);

  if (!result.success) {
    logError(`Failed to create ADO work item: ${result.error?.message || 'Unknown error'}`);
    logError(`Error code: ${result.error?.code || 'UNKNOWN'}`);
    return 1;
  }

  logInfo(`Successfully created ADO work item ${result.adoWorkItemId} for story ${storyCode}`);
  if (result.url) {
    logInfo(`ADO URL: ${result.url}`);
  }
  logInfo(`Story ${storyCode} is now linked to ADO`);

  return 0;
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  logDebug('Draft promotion hook started');
  logDebug(`Daemon URL: ${ADO_DAEMON_URL}`);
  logDebug(`Work item type: ${ADO_WORK_ITEM_TYPE}`);

  // Read event JSON from stdin
  let eventJson = '';

  // Check if stdin has data (for piped input)
  const stdin = Bun.stdin;

  try {
    // Read all input from stdin
    const reader = stdin.stream().getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      eventJson += decoder.decode(value, { stream: true });
    }
    eventJson += decoder.decode(); // Flush remaining
  } catch (error) {
    // If stdin read fails, check for test/manual mode with args
    logDebug(`Stdin read error: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Trim whitespace
  eventJson = eventJson.trim();

  // If no stdin, check for command line argument (for testing)
  if (!eventJson && process.argv.length > 2) {
    eventJson = process.argv[2];
    logDebug('Using command line argument as event JSON');
  }

  // Validate we have input
  if (!eventJson) {
    logError('No event data provided. Provide JSON via stdin or as first argument.');
    logInfo('Usage: echo \'{"storyId":"...","status":"planned","previousStatus":"draft"}\' | bun ado-draft-promotion.ts');
    process.exit(1);
  }

  // Parse JSON
  let event: StoryStatusChangeEvent;
  try {
    event = JSON.parse(eventJson) as StoryStatusChangeEvent;
  } catch (error) {
    logError(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    logDebug(`Raw input: ${eventJson.substring(0, 200)}...`);
    process.exit(1);
  }

  // Process the event
  const exitCode = await processEvent(event);
  process.exit(exitCode);
}

// Run the hook
main().catch((error) => {
  logError(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
