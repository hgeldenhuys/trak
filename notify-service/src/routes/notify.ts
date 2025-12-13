/**
 * Notification Endpoint
 *
 * POST /notify - Accepts notification payload and queues for delivery
 *
 * Supports two payload types:
 * 1. NotificationPayload - Pre-processed with summary (backward compatible)
 * 2. RawEventPayload - Raw event data for server-side summarization (AC-002, AC-005)
 */

import type { NotificationPayload, NotifyResponse, ChannelPreferences, RawEventPayload } from '../types';
import { isRawEventPayload, isNotificationPayload } from '../types';
import { getConfig } from '../config';
import { getAudioQueue } from '../audio-queue';
import { dispatchTTS } from '../channels/tts';
import { dispatchDiscord } from '../channels/discord';
import { dispatchConsole } from '../channels/console';
import { addResponse } from '../response-store';
import { generateSummary, extractFullAIResponse, validateTranscriptPath } from '../summarizer';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

/**
 * Validation result type
 */
type ValidationResult =
  | { valid: true; payloadType: 'notification'; payload: NotificationPayload }
  | { valid: true; payloadType: 'raw'; payload: RawEventPayload }
  | { valid: false; error: string };

/**
 * Validate notification payload (supports both NotificationPayload and RawEventPayload)
 */
function validatePayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const data = body as Record<string, unknown>;

  if (!data.project || typeof data.project !== 'string') {
    return { valid: false, error: 'Missing or invalid "project" field' };
  }

  // Detect payload type: RawEventPayload has transcriptPath, NotificationPayload has summary
  if (isRawEventPayload(data)) {
    // Validate RawEventPayload (AC-002, AC-005)
    const rawPayload: RawEventPayload = {
      project: data.project as string,
      transcriptPath: data.transcriptPath as string,
      durationMs: typeof data.durationMs === 'number' ? data.durationMs : 0,
      filesModified: Array.isArray(data.filesModified) ? data.filesModified : [],
      toolsUsed: Array.isArray(data.toolsUsed) ? data.toolsUsed : [],
      usage: data.usage as RawEventPayload['usage'],
      model: typeof data.model === 'string' ? data.model : undefined,
      sessionName: typeof data.sessionName === 'string' ? data.sessionName : undefined,
      promptText: typeof data.promptText === 'string' ? data.promptText : undefined,
    };

    // Validate transcript path for security
    const pathValidation = validateTranscriptPath(rawPayload.transcriptPath);
    if (!pathValidation.valid) {
      return { valid: false, error: `Invalid transcriptPath: ${pathValidation.error}` };
    }

    return { valid: true, payloadType: 'raw', payload: rawPayload };
  }

  if (isNotificationPayload(data)) {
    // Validate NotificationPayload (backward compatible)
    const payload: NotificationPayload = {
      project: data.project as string,
      summary: data.summary as string,
      fullResponse: typeof data.fullResponse === 'string' ? data.fullResponse : undefined,
      channelPrefs: data.channelPrefs as ChannelPreferences | undefined,
      metadata: data.metadata as NotificationPayload['metadata'],
      sessionName: typeof data.sessionName === 'string' ? data.sessionName : undefined,
      // Per-project channel overrides (NOTIFY-003, NOTIFY-004)
      discordWebhookUrl: typeof data.discordWebhookUrl === 'string' ? data.discordWebhookUrl : undefined,
      voiceId: typeof data.voiceId === 'string' ? data.voiceId : undefined,
    };

    return { valid: true, payloadType: 'notification', payload };
  }

  return { valid: false, error: 'Missing required field: either "summary" (NotificationPayload) or "transcriptPath" (RawEventPayload)' };
}

/**
 * Determine which channels to use based on config and per-request preferences
 */
function resolveChannels(prefs?: ChannelPreferences): { tts: boolean; discord: boolean; console: boolean } {
  const config = getConfig();
  if (!config) {
    return { tts: false, discord: false, console: true };
  }

  return {
    tts: prefs?.tts ?? (config.channels.tts.enabled && !!config.channels.tts.apiKey),
    discord: prefs?.discord ?? (config.channels.discord.enabled && !!config.channels.discord.webhookUrl),
    console: prefs?.console ?? config.channels.console.enabled,
  };
}

/**
 * Process RawEventPayload - generate summary server-side (AC-002)
 */
async function processRawEvent(rawPayload: RawEventPayload): Promise<{
  summary: string;
  fullResponse?: string;
  metadata: NotificationPayload['metadata'];
  userPrompt?: string;
}> {
  // Generate summary server-side
  const summaryResult = await generateSummary({
    transcriptPath: rawPayload.transcriptPath,
    durationMs: rawPayload.durationMs,
    filesModified: rawPayload.filesModified,
    toolsUsed: rawPayload.toolsUsed,
    promptText: rawPayload.promptText,
    usage: rawPayload.usage,
    model: rawPayload.model,
    project: rawPayload.project,
    sessionName: rawPayload.sessionName,
  });

  // Extract full AI response for response page
  let fullResponse: string | undefined;
  try {
    fullResponse = await extractFullAIResponse(rawPayload.transcriptPath) || undefined;
  } catch (err) {
    if (DEBUG) {
      console.error('[notify] Failed to extract full response:', err);
    }
  }

  // Build metadata from raw event
  const metadata: NotificationPayload['metadata'] = {
    durationMs: rawPayload.durationMs,
    filesModified: rawPayload.filesModified.length,
    filesList: rawPayload.filesModified,  // Actual file paths for table display
    toolsUsed: rawPayload.toolsUsed,
    contextUsagePercent: summaryResult.contextUsagePercent,
    keyOutcomes: summaryResult.keyOutcomes,
  };

  return {
    summary: summaryResult.taskCompleted,
    fullResponse,
    metadata,
    userPrompt: rawPayload.promptText,
  };
}

/**
 * Handle notification request
 *
 * Supports two payload types:
 * 1. NotificationPayload - Pre-processed with summary (backward compatible)
 * 2. RawEventPayload - Raw event data for server-side summarization (AC-002)
 */
export async function handleNotify(request: Request): Promise<Response> {
  // Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate payload
  const validation = validatePayload(body);
  if (!validation.valid) {
    return new Response(
      JSON.stringify({ success: false, error: validation.error }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const config = getConfig();

  // Process payload based on type
  let projectName: string;
  let summary: string;
  let fullResponse: string | undefined;
  let metadata: NotificationPayload['metadata'];
  let channelPrefs: ChannelPreferences | undefined;
  let userPrompt: string | undefined;
  let sessionName: string | undefined;
  let discordWebhookUrl: string | undefined;  // Per-project webhook (NOTIFY-003)
  let voiceId: string | undefined;            // Per-project voice (NOTIFY-004)

  if (validation.payloadType === 'raw') {
    // Process raw event - server-side summarization (AC-002)
    const rawPayload = validation.payload;
    projectName = rawPayload.project;
    sessionName = rawPayload.sessionName;

    if (DEBUG) {
      console.error('[notify] Processing raw event payload:', {
        project: rawPayload.project,
        sessionName: rawPayload.sessionName,
        transcriptPath: rawPayload.transcriptPath,
        durationMs: rawPayload.durationMs,
        filesModified: rawPayload.filesModified.length,
      });
    }

    try {
      const processed = await processRawEvent(rawPayload);
      summary = processed.summary;
      fullResponse = processed.fullResponse;
      metadata = processed.metadata;
      userPrompt = processed.userPrompt;
    } catch (err) {
      console.error('[notify] Failed to process raw event:', err);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to process raw event' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else {
    // Pre-processed NotificationPayload (backward compatible)
    const payload = validation.payload;
    projectName = payload.project;
    summary = payload.summary;
    fullResponse = payload.fullResponse;
    metadata = payload.metadata;
    channelPrefs = payload.channelPrefs;
    sessionName = payload.sessionName;
    discordWebhookUrl = payload.discordWebhookUrl;  // Per-project webhook (NOTIFY-003)
    voiceId = payload.voiceId;                      // Per-project voice (NOTIFY-004)

    if (DEBUG) {
      console.error('[notify] Received pre-processed notification:', {
        project: payload.project,
        sessionName: payload.sessionName,
        summaryLength: payload.summary.length,
        hasFullResponse: !!payload.fullResponse,
        hasDiscordWebhook: !!payload.discordWebhookUrl,
        hasVoiceId: !!payload.voiceId,
      });
    }
  }

  const channels = resolveChannels(channelPrefs);

  if (DEBUG) {
    console.error('[notify] Resolved channels:', channels);
  }

  // Generate TTS audio first (needed for response page) - AC-003
  // Uses per-project voice if provided (NOTIFY-004)
  let audioPath: string | undefined;
  if (channels.tts) {
    try {
      audioPath = await dispatchTTS(projectName, summary, voiceId);
      if (DEBUG && audioPath) {
        console.error(`[notify] TTS audio generated: ${audioPath} (voice: ${voiceId || 'global'})`);
      }
    } catch (err) {
      console.error('[notify] TTS dispatch error:', err);
    }
  }

  // Store response if provided and response storage is enabled (include audio path and user prompt)
  let responseId: string | undefined;
  if (fullResponse && config?.responseStorage?.enabled) {
    responseId = addResponse(
      projectName,
      summary,
      fullResponse,
      metadata,
      audioPath,      // Store audio path with response for playback on page
      userPrompt      // Store user prompt for context on response page
    );
    if (DEBUG) {
      console.error(`[notify] Stored response: ${responseId} (audio: ${audioPath ? 'yes' : 'no'})`);
    }
  }

  // Dispatch to Discord (AC-004) with per-project webhook support (NOTIFY-003)
  if (channels.discord) {
    dispatchDiscord(projectName, summary, metadata, undefined, responseId, sessionName, discordWebhookUrl)
      .catch(err => {
        console.error('[notify] Discord dispatch error:', err);
      });
  }

  // Console is synchronous
  if (channels.console) {
    dispatchConsole(projectName, summary, metadata);
  }

  // Get queue position for TTS
  const queue = getAudioQueue();
  const queueStatus = queue.getStatus();

  // Build public URLs for response
  const publicUrl = config?.server?.publicUrl || `http://${config?.server?.host || '127.0.0.1'}:${config?.server?.port || 7777}`;

  const response: NotifyResponse = {
    success: true,
    queued: channels.tts,
    queuePosition: channels.tts ? queueStatus.queueLength : undefined,
    channels,
    audioUrl: audioPath ? `${publicUrl}/audio/${audioPath.split('/').pop()}` : undefined,
    responseUrl: responseId ? `${publicUrl}/response/${responseId}` : undefined,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
