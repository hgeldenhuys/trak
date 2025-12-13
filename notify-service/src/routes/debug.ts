/**
 * Debug SSE Endpoint (NOTIFY-012)
 *
 * GET /debug/:projectId - Stream events for a project via Server-Sent Events
 * GET /debug/:projectId?limit=10 - Control how many historical events to show
 *
 * This endpoint provides real-time event streaming for debugging:
 * 1. Sends historical events from SQLite (respecting limit)
 * 2. Subscribes to TransactionTracker for new events
 * 3. Streams events as they arrive
 * 4. Sends heartbeats to keep connection alive
 */

import { getRecentEventsByName, getEventsSinceIdByName, getProjectNames } from '../db';
import { getTransactionTracker } from '../transaction-tracker';
import type { StoredEvent } from '../types';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';
const HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds
const POLL_INTERVAL_MS = 1000; // Poll for new events every second

/**
 * Format an event for SSE transmission
 */
function formatSSEMessage(event: string, data: unknown, id?: string): string {
  let message = '';
  if (id) {
    message += `id: ${id}\n`;
  }
  message += `event: ${event}\n`;
  message += `data: ${JSON.stringify(data)}\n\n`;
  return message;
}

/**
 * Handle GET /debug/:projectId SSE endpoint
 */
export async function handleDebugSSE(request: Request, projectId: string): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  if (DEBUG) {
    console.error(`[debug] SSE connection opened for project: ${projectId}, limit: ${limit}`);
  }

  // Create a readable stream for SSE
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let lastEventId = 0;
  let eventListener: ((event: StoredEvent) => void) | null = null;
  const tracker = getTransactionTracker();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Helper to send SSE message
      const send = (event: string, data: unknown, id?: string) => {
        try {
          controller.enqueue(encoder.encode(formatSSEMessage(event, data, id)));
        } catch (err) {
          // Stream might be closed
          if (DEBUG) {
            console.error('[debug] Failed to send SSE message:', err);
          }
        }
      };

      // Send initial connection message
      send('connected', {
        projectId,
        limit,
        timestamp: new Date().toISOString(),
        message: `Connected to event stream for ${projectId}`,
      });

      // Send historical events
      try {
        const historicalEvents = getRecentEventsByName(projectId, limit);

        if (historicalEvents.length > 0) {
          send('history', {
            count: historicalEvents.length,
            message: `Sending ${historicalEvents.length} historical events`,
          });

          for (const event of historicalEvents) {
            send('event', event, String(event.id));
            lastEventId = Math.max(lastEventId, event.id);
          }
        } else {
          send('history', {
            count: 0,
            message: 'No historical events found for this project',
          });
        }
      } catch (err) {
        console.error('[debug] Failed to load historical events:', err);
        send('error', { message: 'Failed to load historical events' });
      }

      // Listen for new events from tracker
      eventListener = (event: StoredEvent) => {
        if (event.projectName === projectId) {
          send('event', event, String(event.id));
          lastEventId = Math.max(lastEventId, event.id);
        }
      };
      tracker.on('event:received', eventListener);

      // Also poll SQLite for events (in case they come from other sources)
      pollInterval = setInterval(() => {
        try {
          const newEvents = getEventsSinceIdByName(projectId, lastEventId);
          for (const event of newEvents) {
            send('event', event, String(event.id));
            lastEventId = Math.max(lastEventId, event.id);
          }
        } catch (err) {
          // Ignore poll errors silently
        }
      }, POLL_INTERVAL_MS);

      // Send heartbeats to keep connection alive
      heartbeatInterval = setInterval(() => {
        send('heartbeat', {
          timestamp: new Date().toISOString(),
          lastEventId,
        });
      }, HEARTBEAT_INTERVAL_MS);
    },

    cancel() {
      if (DEBUG) {
        console.error(`[debug] SSE connection closed for project: ${projectId}`);
      }

      // Cleanup
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (eventListener) {
        tracker.off('event:received', eventListener);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Handle GET /debug - List available projects
 */
export async function handleDebugList(): Promise<Response> {
  try {
    const projects = getProjectNames();

    return new Response(JSON.stringify({
      projects,
      usage: 'GET /debug/:projectId?limit=50 for SSE stream',
      uiUsage: 'GET /debug/:projectId/ui for HTML dashboard',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[debug] Failed to list projects:', err);
    return new Response(JSON.stringify({ error: 'Failed to list projects' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
