/**
 * Events Endpoint (NOTIFY-012)
 *
 * POST /events - Receives hook events and stores them in SQLite
 *
 * This is the main entry point for all hook events. The endpoint:
 * 1. Validates the EventPayload
 * 2. Stores the event in SQLite
 * 3. Updates transaction state in the tracker
 * 4. Triggers notifications on Stop events that exceed threshold
 * 5. Emits events for SSE streaming
 */

import type { EventPayload, EventsResponse } from '../types';
import { isEventPayload } from '../types';
import { insertEvent, markNotificationSent } from '../db';
import { getTransactionTracker, type CompletedTransaction } from '../transaction-tracker';
import { handleNotify } from './notify';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

/**
 * Validate an incoming event payload
 */
function validateEvent(body: unknown): { valid: true; event: EventPayload } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  if (!isEventPayload(body)) {
    return { valid: false, error: 'Invalid EventPayload: missing required fields (eventType, sessionId, projectId, projectName, timestamp)' };
  }

  return { valid: true, event: body };
}

/**
 * Generate a summary using LLM from available transaction data
 * Used when transcript file is not accessible (remote deployment)
 */
async function generateRemoteSummary(completed: CompletedTransaction): Promise<string> {
  const config = await import('../config').then(m => m.getConfig());

  // Get unique file basenames (deduplicated)
  const uniqueFileNames = [...new Set(
    completed.filesModified.map(f => f.split('/').pop() || f)
  )];

  // If no LLM configured, use simple fallback
  if (!config?.summarization?.apiKey) {
    return generateSimpleFallback(completed, uniqueFileNames);
  }

  try {
    const apiUrl = config.summarization.apiUrl || 'https://api.anthropic.com';
    const model = config.summarization.model || 'claude-3-haiku-20240307';
    const isOpenRouter = apiUrl.includes('openrouter.ai');

    // Build context from what we know
    const contextParts: string[] = [];
    if (completed.promptText) {
      contextParts.push(`User asked: "${completed.promptText.substring(0, 200)}"`);
    }
    if (uniqueFileNames.length > 0) {
      contextParts.push(`Files edited: ${uniqueFileNames.slice(0, 5).join(', ')}`);
    }
    if (completed.toolsUsed.length > 0) {
      contextParts.push(`Tools used: ${completed.toolsUsed.join(', ')}`);
    }

    const systemPrompt = `You are summarizing a coding task for a spoken notification. Output ONLY the summary sentence.

RULES:
1. First person, past tense, ONE sentence only
2. Max 15 words - this will be spoken aloud
3. ONLY describe what you can VERIFY from the provided information
4. If files were edited, mention WHAT was changed in those specific files
5. If NO files edited, say what tools were used (deployed, ran commands, researched)
6. NEVER invent details not in the input - no "login code", "database", etc. unless mentioned
7. NO markdown, NO code, NO file paths, NO lists
8. When in doubt, be VAGUE rather than SPECIFIC

EXAMPLES with files edited:
- "I updated the event tracking in events.ts"
- "I fixed the summary generation logic"

EXAMPLES without files (based on tools):
- "I deployed code to the server" (if Bash with ssh/rsync)
- "I ran commands and checked the results" (if Bash)
- "I researched the codebase" (if Read/Grep/Glob)
- "I completed the task" (fallback)`;

    const userMessage = contextParts.join('\n\n') + '\n\nSUMMARIZE (one natural sentence):';

    // Build request
    const endpoint = isOpenRouter
      ? `${apiUrl}/chat/completions`
      : `${apiUrl}/v1/messages`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isOpenRouter) {
      headers['Authorization'] = `Bearer ${config.summarization.apiKey}`;
    } else {
      headers['x-api-key'] = config.summarization.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const body = isOpenRouter
      ? {
          model,
          max_tokens: 100,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }
      : {
          model,
          max_tokens: 100,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    let summary: string;

    if (isOpenRouter) {
      const choices = data.choices as Array<{ message?: { content?: string } }>;
      summary = choices?.[0]?.message?.content || '';
    } else {
      const content = data.content as Array<{ text?: string }>;
      summary = content?.[0]?.text || '';
    }

    // Clean up the summary
    summary = summary.trim().replace(/^["']|["']$/g, '');

    if (DEBUG) {
      console.error('[events] LLM summary generated:', summary);
    }

    return summary || generateSimpleFallback(completed, uniqueFileNames);
  } catch (err) {
    if (DEBUG) {
      console.error('[events] LLM summary failed, using fallback:', err);
    }
    return generateSimpleFallback(completed, uniqueFileNames);
  }
}

/**
 * Simple fallback when LLM is unavailable
 */
function generateSimpleFallback(completed: CompletedTransaction, uniqueFileNames: string[]): string {
  const fileCount = uniqueFileNames.length;

  if (fileCount > 0) {
    if (fileCount === 1) {
      return `I edited ${uniqueFileNames[0]}`;
    } else if (fileCount === 2) {
      return `I edited ${uniqueFileNames.join(' and ')}`;
    } else {
      return `I edited ${uniqueFileNames.slice(0, 2).join(', ')} and ${fileCount - 2} other file${fileCount - 2 > 1 ? 's' : ''}`;
    }
  }

  const hasSearch = completed.toolsUsed.some(t => ['Grep', 'Glob', 'Read'].includes(t));
  const hasBash = completed.toolsUsed.includes('Bash');

  if (hasBash) return 'I ran commands';
  if (hasSearch) return 'I researched the codebase';
  return 'I completed the task';
}

/**
 * Generate a summary from the actual AI response text
 * Uses LLM to create a TTS-friendly summary from the real response
 */
async function generateSummaryFromResponse(aiResponse: string, userPrompt?: string | null): Promise<string> {
  const config = await import('../config').then(m => m.getConfig());

  // If no LLM configured, use simple fallback
  if (!config?.summarization?.apiKey) {
    // Extract first sentence as fallback
    const firstSentence = aiResponse.split(/[.!?]/)[0]?.trim();
    if (firstSentence && firstSentence.length < 100) {
      return `I ${firstSentence.toLowerCase().replace(/^i\s+/i, '')}`;
    }
    return 'I completed the task';
  }

  try {
    const apiUrl = config.summarization.apiUrl || 'https://api.anthropic.com';
    const model = config.summarization.model || 'claude-3-haiku-20240307';
    const isOpenRouter = apiUrl.includes('openrouter.ai');

    // Truncate response if too long (keep first 2000 chars)
    const truncatedResponse = aiResponse.length > 2000
      ? aiResponse.substring(0, 2000) + '...'
      : aiResponse;

    const systemPrompt = `You are summarizing a coding task for a spoken notification. Output ONLY the summary sentence.

RULES:
1. First person, past tense, ONE sentence only
2. Max 15 words - this will be spoken aloud
3. Summarize what the AI actually DID based on the response
4. Focus on the main action: edited files, deployed code, fixed bug, researched, etc.
5. NO markdown, NO code, NO file paths, NO lists, NO tables
6. Be specific but concise

EXAMPLES:
- "I fixed the authentication bug in the login handler"
- "I deployed the updated code to the server"
- "I added the new API endpoint for user preferences"
- "I researched the codebase and found the issue"
- "I updated the configuration and restarted the service"`;

    let userMessage = `AI Response:\n${truncatedResponse}`;
    if (userPrompt) {
      userMessage = `User asked: "${userPrompt.substring(0, 200)}"\n\n${userMessage}`;
    }
    userMessage += '\n\nSUMMARIZE what the AI did (one natural sentence, first person, past tense):';

    // Build request
    const endpoint = isOpenRouter
      ? `${apiUrl}/chat/completions`
      : `${apiUrl}/v1/messages`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isOpenRouter) {
      headers['Authorization'] = `Bearer ${config.summarization.apiKey}`;
    } else {
      headers['x-api-key'] = config.summarization.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const body = isOpenRouter
      ? {
          model,
          max_tokens: 100,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }
      : {
          model,
          max_tokens: 100,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    let summary: string;

    if (isOpenRouter) {
      const choices = data.choices as Array<{ message?: { content?: string } }>;
      summary = choices?.[0]?.message?.content || '';
    } else {
      const content = data.content as Array<{ text?: string }>;
      summary = content?.[0]?.text || '';
    }

    // Clean up the summary
    summary = summary.trim().replace(/^[\"']|[\"']$/g, '');

    if (DEBUG) {
      console.error('[events] LLM response summary generated:', summary);
    }

    return summary || 'I completed the task';
  } catch (err) {
    if (DEBUG) {
      console.error('[events] LLM response summary failed:', err);
    }
    return 'I completed the task';
  }
}

/**
 * Trigger notification for a completed transaction
 * Supports two modes:
 * 1. RawEventPayload with transcriptPath (for local deployments)
 * 2. NotificationPayload with generated summary (for remote deployments)
 */
async function triggerNotification(completed: CompletedTransaction, eventId: number): Promise<string | null> {
  try {
    let notifyPayload: Record<string, unknown>;

    // Check if transcript is accessible (local deployment)
    const transcriptAccessible = completed.transcriptPath &&
      (completed.transcriptPath.startsWith('/home/') ||
       completed.transcriptPath.startsWith('/tmp') ||
       completed.transcriptPath.startsWith('/var/tmp'));

    if (transcriptAccessible) {
      // Local deployment - use RawEventPayload with transcript
      notifyPayload = {
        project: completed.projectName,
        transcriptPath: completed.transcriptPath,
        durationMs: completed.durationMs,
        filesModified: completed.filesModified,
        toolsUsed: completed.toolsUsed,
        usage: completed.usage ? {
          input_tokens: completed.usage.inputTokens,
          output_tokens: completed.usage.outputTokens,
          cache_read_input_tokens: completed.usage.cacheRead,
          cache_creation_input_tokens: completed.usage.cacheWrite,
        } : undefined,
        model: completed.model,
        sessionName: completed.sessionName,
        promptText: completed.promptText,
        // Per-project channel overrides (NOTIFY-003, NOTIFY-004)
        discordWebhookUrl: completed.discordWebhookUrl,
        voiceId: completed.voiceId,
      };

      if (DEBUG) {
        console.error('[events] Using RawEventPayload (local transcript)');
      }
    } else {
      // Use raw transcript data sent by hook
      // Hook reads transcript and sends: aiResponse, userPrompt, toolCalls
      const hasRawData = completed.aiResponse && completed.aiResponse.length > 0;

      if (DEBUG) {
        console.error('[events] Raw data available:', {
          hasAiResponse: !!completed.aiResponse,
          responseLength: completed.aiResponse?.length || 0,
          hasUserPrompt: !!completed.userPrompt,
          toolCallsCount: completed.toolCalls?.length || 0,
        });
      }

      // Generate summary from AI response using LLM
      let summary: string;
      if (hasRawData) {
        summary = await generateSummaryFromResponse(completed.aiResponse!, completed.promptText);
      } else {
        summary = await generateRemoteSummary(completed);
      }

      if (DEBUG) {
        console.error('[events] Generated summary:', summary);
      }

      // Build files modified from toolCalls (Edit/Write operations)
      const editWriteTools = (completed.toolCalls || [])
        .filter(tc => ['Edit', 'Write', 'NotebookEdit'].includes(tc.tool));

      if (DEBUG) {
        console.error('[events] Edit/Write tools found:', editWriteTools.length);
        if (editWriteTools.length > 0) {
          console.error('[events] Sample tool call:', JSON.stringify(editWriteTools[0]));
        }
      }

      const filesFromToolCalls = editWriteTools
        .map(tc => (tc.input.file_path || tc.input.notebook_path) as string)
        .filter(Boolean);

      if (DEBUG) {
        console.error('[events] Files from toolCalls:', filesFromToolCalls.length, filesFromToolCalls.slice(0, 5));
      }

      // Deduplicate files
      const uniqueFiles = [...new Set(filesFromToolCalls)];

      notifyPayload = {
        project: completed.projectName,
        summary,
        fullResponse: completed.aiResponse || undefined,  // Actual AI response for response page
        sessionName: completed.sessionName,
        promptText: completed.userPrompt || completed.promptText,  // User's prompt
        metadata: {
          durationMs: completed.durationMs,
          filesModified: uniqueFiles.length || completed.filesModified.length,
          toolsUsed: completed.toolsUsed,
          // Include file paths for the response page table
          filesList: uniqueFiles.length > 0 ? uniqueFiles : completed.filesModified,
        },
        // Per-project channel overrides (NOTIFY-003, NOTIFY-004)
        discordWebhookUrl: completed.discordWebhookUrl,
        voiceId: completed.voiceId,
      };
    }

    // Create a mock request to reuse handleNotify logic
    const mockRequest = new Request('http://localhost/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notifyPayload),
    });

    const response = await handleNotify(mockRequest);
    const result = await response.json() as { success: boolean; error?: string };

    if (result.success) {
      // Generate notification ID
      const notificationId = `notif_${Date.now()}_${eventId}`;
      markNotificationSent(eventId, notificationId);

      if (DEBUG) {
        console.error(`[events] Notification triggered: ${notificationId}`);
      }

      return notificationId;
    } else {
      console.error('[events] Notification failed:', result.error);
      return null;
    }
  } catch (err) {
    console.error('[events] Error triggering notification:', err);
    return null;
  }
}

/**
 * Handle POST /events request
 */
export async function handleEvents(request: Request): Promise<Response> {
  // Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' } satisfies EventsResponse),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate event
  const validation = validateEvent(body);
  if (!validation.valid) {
    return new Response(
      JSON.stringify({ success: false, error: validation.error } satisfies EventsResponse),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const event = validation.event;

  if (DEBUG) {
    console.error(`[events] Received: ${event.eventType} from ${event.projectName}/${event.sessionId.slice(0, 8)}`);
  }

  // Store event in SQLite
  let eventId: number;
  try {
    eventId = insertEvent(event);
  } catch (err) {
    console.error('[events] Failed to store event:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to store event' } satisfies EventsResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Process event through transaction tracker
  const tracker = getTransactionTracker();
  const completed = tracker.processEvent(event);

  // Emit event for SSE streaming (with the stored event ID)
  tracker.emit('event:received', { ...event, id: eventId, receivedAt: new Date().toISOString() });

  // If transaction completed, trigger notification
  if (completed && event.eventType === 'Stop') {
    if (DEBUG) {
      console.error(`[events] Will notify: duration=${completed.durationMs}ms`);
    }
    // Fire and forget - don't block the response
    triggerNotification(completed, eventId).catch(err => {
      console.error('[events] Background notification error:', err);
    });
  }

  const response: EventsResponse = {
    success: true,
    eventId: String(eventId),
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
