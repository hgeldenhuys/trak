/**
 * Centralized Notification Service Types
 *
 * Type definitions for the notification service configuration,
 * payloads, and API contracts.
 */

/**
 * Global service configuration stored at ~/.claude-notify/config.json
 */
export interface ServiceConfig {
  version: string;
  server: {
    port: number;
    host: string;
    publicUrl?: string;  // Base URL for links (e.g., http://192.168.68.61:7777)
  };
  channels: {
    tts: {
      enabled: boolean;
      apiKey?: string;
      voiceId: string;
      model: string;
    };
    discord: {
      enabled: boolean;
      webhookUrl?: string;
      mentionRole?: string;
      username: string;
    };
    console: {
      enabled: boolean;
    };
  };
  /**
   * Server-side summarization configuration (AC-001, AC-002)
   * Uses Anthropic API to generate summaries from raw event data
   */
  summarization: {
    enabled: boolean;
    apiKey?: string;        // Anthropic API key for Claude
    apiUrl?: string;        // API URL (default: https://api.anthropic.com)
    model?: string;         // Model to use (default: claude-3-haiku-20240307)
  };
  audio: {
    fallbackSound: string;
    cleanupDelayMs: number;
  };
  defaults: {
    durationThresholdMs: number;
  };
  ngrok: {
    enabled: boolean;
    authToken?: string;
    subdomain?: string;
  };
  responseStorage: {
    enabled: boolean;
    ttlMs: number;
    maxEntries: number;
  };
}

/**
 * Notification payload received from client hooks
 */
export interface NotificationPayload {
  project: string;
  summary: string;
  fullResponse?: string;
  channelPrefs?: ChannelPreferences;
  metadata?: NotificationMetadata;
  /** Human-readable session name (e.g., "brave-elephant") */
  sessionName?: string;
  /** Per-project Discord webhook URL (NOTIFY-003) */
  discordWebhookUrl?: string;
  /** Per-project ElevenLabs voice ID (NOTIFY-004) */
  voiceId?: string;
}

/**
 * Per-request channel override preferences
 */
export interface ChannelPreferences {
  tts?: boolean;
  discord?: boolean;
  console?: boolean;
}

/**
 * Optional metadata for richer notifications
 */
export interface NotificationMetadata {
  durationMs?: number;
  filesModified?: number;
  filesList?: string[];  // Actual file paths for table display
  toolsUsed?: string[];
  contextUsagePercent?: number;
  keyOutcomes?: string[];
}

/**
 * Response from /notify endpoint
 */
export interface NotifyResponse {
  success: boolean;
  queued: boolean;
  queuePosition?: number;
  channels: {
    tts: boolean;
    discord: boolean;
    console: boolean;
  };
  /** URL to the generated TTS audio file */
  audioUrl?: string;
  /** URL to the response page with full context */
  responseUrl?: string;
  error?: string;
}

/**
 * Health check response from /health endpoint
 */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime: number;
  channels: {
    tts: 'ready' | 'disabled' | 'error';
    discord: 'ready' | 'disabled' | 'error';
    console: 'ready' | 'disabled';
  };
  ngrok?: {
    status: 'connected' | 'disconnected' | 'not_configured';
    publicUrl?: string;
  };
  responseStore?: {
    count: number;
    oldestEntryAge?: number;
  };
}

/**
 * Queue status response from /queue endpoint
 */
export interface QueueStatusResponse {
  queueLength: number;
  isPlaying: boolean;
  items: QueueItemInfo[];
}

/**
 * Information about a queued item
 */
export interface QueueItemInfo {
  project: string;
  addedAt: string;
  position: number;
}

/**
 * Result from dispatching to a channel
 */
export interface ChannelResult {
  channel: string;
  success: boolean;
  error?: string;
  duration?: number;
}

/**
 * PID file structure for daemon management
 */
export interface DaemonPidFile {
  pid: number;
  port: number;
  startedAt: string;
  ngrokUrl?: string;
}

/**
 * Raw event payload for thin client mode (AC-002, AC-005)
 *
 * Clients send raw event data instead of pre-processed summaries.
 * The server handles summarization, TTS generation, and Discord dispatch.
 */
export interface RawEventPayload {
  /** Project name/identifier */
  project: string;
  /** Path to the transcript JSONL file for AI response extraction */
  transcriptPath: string;
  /** Duration of the task in milliseconds */
  durationMs: number;
  /** Array of file paths that were modified */
  filesModified: string[];
  /** Array of tool names that were used */
  toolsUsed: string[];
  /** Token usage statistics */
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  /** Model used for the task */
  model?: string;
  /** Human-friendly session name (e.g., "brave-elephant") */
  sessionName?: string;
  /** Optional user prompt text */
  promptText?: string;
}

/**
 * Type guard to check if payload is a RawEventPayload (vs NotificationPayload)
 *
 * RawEventPayload has transcriptPath, NotificationPayload has summary
 */
export function isRawEventPayload(payload: unknown): payload is RawEventPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return typeof p.transcriptPath === 'string' && typeof p.project === 'string';
}

/**
 * Type guard to check if payload is a NotificationPayload (pre-processed)
 */
export function isNotificationPayload(payload: unknown): payload is NotificationPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return typeof p.summary === 'string' && typeof p.project === 'string';
}

// ============================================================================
// Event Streaming Types (NOTIFY-012)
// ============================================================================

/**
 * Event types that hooks can emit
 */
export type HookEventType = 'SessionStart' | 'UserPromptSubmit' | 'PostToolUse' | 'Stop';

/**
 * Git context for an event
 */
export interface EventGitContext {
  repo?: string;
  branch?: string;
  commit?: string;
  dirty?: boolean;
}

/**
 * Token usage statistics
 */
export interface EventUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * Universal event payload sent from hooks to the server
 *
 * All hook events (SessionStart, UserPromptSubmit, PostToolUse, Stop) use this
 * unified format. Event-specific fields are optional and only populated when
 * relevant for that event type.
 */
export interface EventPayload {
  // Identity
  eventType: HookEventType;
  sessionId: string;
  sessionName?: string;
  projectId: string;        // UUID from project-identity.json
  projectName: string;      // Friendly name like "claude-loom"

  // Context
  transcriptPath?: string;
  cwd?: string;
  timestamp: string;        // ISO 8601 timestamp
  git?: EventGitContext;

  // Event-specific: UserPromptSubmit
  promptText?: string;

  // Event-specific: PostToolUse
  toolName?: string;
  toolInput?: Record<string, unknown>;

  // Event-specific: Stop
  filesModified?: string[];
  toolsUsed?: string[];
  usage?: EventUsage;
  model?: string;
  stopReason?: string;

  // Per-project channel overrides (NOTIFY-003, NOTIFY-004)
  discordWebhookUrl?: string;  // Project-specific Discord webhook URL
  voiceId?: string;            // Project-specific ElevenLabs voice ID

  // Raw transcript data (sent by hook for server to process)
  aiResponse?: string;      // Full AI response text
  userPrompt?: string;      // User's prompt text
  toolCalls?: Array<{       // Tool calls with inputs (for files modified table)
    tool: string;
    input: Record<string, unknown>;
  }>;
}

/**
 * Response from POST /events endpoint
 */
export interface EventsResponse {
  success: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Stored event with server-added metadata
 */
export interface StoredEvent extends EventPayload {
  id: number;               // SQLite auto-increment ID
  receivedAt: string;       // When server received the event
  notificationSent?: boolean;
  notificationId?: string;
}

/**
 * SSE event format for debug endpoint
 */
export interface SSEEvent {
  id: string;
  event: string;            // 'event' | 'notification' | 'heartbeat'
  data: string;             // JSON stringified StoredEvent or heartbeat
}

/**
 * Type guard for EventPayload
 */
export function isEventPayload(payload: unknown): payload is EventPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.eventType === 'string' &&
    ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop'].includes(p.eventType as string) &&
    typeof p.sessionId === 'string' &&
    typeof p.projectId === 'string' &&
    typeof p.projectName === 'string' &&
    typeof p.timestamp === 'string'
  );
}

// ============================================================================
// SDK Key Types (NOTIFY-013)
// ============================================================================

/**
 * SDK key record stored in the database
 */
export interface SDKKeyRecord {
  id: number;
  keyHash: string;
  name: string;
  projectId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/**
 * Result of generating a new SDK key
 */
export interface GeneratedKey {
  /** Plain-text key - shown only once during creation */
  plainKey: string;
  /** SHA-256 hash of the key - stored in database */
  hash: string;
}

/**
 * Result of authenticating an SDK key (T-003)
 *
 * Returned by validateBearerToken() to indicate whether authentication
 * succeeded and provide details about the authenticated key.
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  valid: boolean;
  /** ID of the authenticated key (when valid) */
  keyId?: number;
  /** Human-readable name of the key (when valid) */
  keyName?: string;
  /** Error message (when invalid) */
  error?: string;
}
