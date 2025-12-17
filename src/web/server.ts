/**
 * Bun HTTP Server for Board CLI Web Interface
 *
 * Provides a web interface for viewing board data with:
 * - Home page with dashboard
 * - Kanban board view
 * - Story detail view
 * - List view of all stories
 * - Blocked tasks view
 * - Retrospectives view
 * - System info view
 * - SSE endpoint for live updates
 *
 * Uses pure Bun APIs - no external frameworks.
 */

import {
  renderHome,
  renderBoard,
  renderStoryDetail,
  renderStoryNotFound,
  renderList,
  renderBlocked,
  renderRetros,
  renderSystemInfo,
  renderAgents,
} from './views';
import {
  featureRepository,
  storyRepository,
  taskRepository,
  acceptanceCriteriaRepository,
  noteRepository,
  impedimentRepository,
  agentDefinitionRepository,
  agentLearningRepository,
} from '../repositories';
import { getEventBus } from '../events/event-bus';
import { initDb, getDbPath, isDbInitialized, getSchemaVersion, getDb, resolveDbPath } from '../db';
import type { BoardEventName } from '../events/types';

/**
 * Default port (can be overridden with WEB_PORT env)
 */
const DEFAULT_PORT = 3345;

/**
 * Get the server port from environment or default
 */
function getPort(): number {
  const envPort = process.env.WEB_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  return DEFAULT_PORT;
}

/**
 * Initialize database if not already initialized
 */
function ensureDbInitialized(): void {
  if (!isDbInitialized()) {
    const dbPath = resolveDbPath();
    initDb({ dbPath });
  }
}

/**
 * Get project name from current working directory
 */
function getProjectName(): string {
  const cwd = process.cwd();
  const parts = cwd.split('/');
  return parts[parts.length - 1] || 'unknown';
}

/**
 * Get config location from database path
 */
function getConfigLocation(): string {
  const dbPath = getDbPath();
  if (dbPath) {
    const parts = dbPath.split('/');
    parts.pop(); // Remove filename
    return parts.join('/') || '.';
  }
  return 'not initialized';
}

/**
 * Route handlers
 */

function handleHome(): Response {
  ensureDbInitialized();

  const features = featureRepository.findAll();
  const stories = storyRepository.findAll();
  const tasks = taskRepository.findAll();

  const html = renderHome({ features, stories, tasks });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function handleBoard(): Response {
  ensureDbInitialized();

  const stories = storyRepository.findAll();
  const tasks = taskRepository.findAll();

  const html = renderBoard({ tasks, stories });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function handleStoryDetail(storyId: string): Response {
  ensureDbInitialized();

  const story = storyRepository.findById(storyId);

  if (!story) {
    const html = renderStoryNotFound(storyId);
    return new Response(html, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const tasks = taskRepository.findByStoryId(storyId);
  const acceptanceCriteria = acceptanceCriteriaRepository.findByStoryId(storyId);

  const html = renderStoryDetail({ story, tasks, acceptanceCriteria });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function handleList(): Response {
  ensureDbInitialized();

  const stories = storyRepository.findAll();
  const features = featureRepository.findAll();

  const html = renderList({ stories, features });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function handleBlocked(): Response {
  ensureDbInitialized();

  const stories = storyRepository.findAll();
  const tasks = taskRepository.findAll();
  const impediments = impedimentRepository.findAll();

  const html = renderBlocked({ tasks, stories, impediments });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function handleRetros(): Response {
  ensureDbInitialized();

  const stories = storyRepository.findAll();
  const notes = noteRepository.findAll();

  const html = renderRetros({ stories, notes });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function handleSystemInfo(): Response {
  ensureDbInitialized();

  let schemaVersion = 0;
  const dbInitialized = isDbInitialized();

  if (dbInitialized) {
    try {
      const db = getDb();
      schemaVersion = getSchemaVersion(db);
    } catch {
      // Database not accessible
    }
  }

  const html = renderSystemInfo({
    dbPath: getDbPath(),
    dbInitialized,
    schemaVersion,
    projectName: getProjectName(),
    configLocation: getConfigLocation(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
  });

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function handleAgents(): Response {
  ensureDbInitialized();

  const definitions = agentDefinitionRepository.findAll();
  const learnings = agentLearningRepository.findAll();

  const html = renderAgents({ definitions, learnings });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * SSE endpoint handler
 *
 * Creates a Server-Sent Events stream that emits events
 * whenever entities change (feature, story, task, ac).
 */
function handleSSE(): Response {
  const eventBus = getEventBus();

  // Track active connections for cleanup
  const eventNames: BoardEventName[] = [
    'feature:created',
    'feature:updated',
    'feature:deleted',
    'story:created',
    'story:updated',
    'story:deleted',
    'story:status-changed',
    'task:created',
    'task:updated',
    'task:deleted',
    'task:status-changed',
    'ac:created',
    'ac:updated',
    'ac:deleted',
    'ac:verified',
  ];

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const connectMsg = JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() });
      controller.enqueue(`data: ${connectMsg}\n\n`);

      // Create handlers for each event type
      const handlers = new Map<BoardEventName, (payload: unknown) => void>();

      for (const eventName of eventNames) {
        const handler = (payload: unknown) => {
          try {
            const data = JSON.stringify({
              type: eventName,
              payload,
              timestamp: new Date().toISOString(),
            });
            controller.enqueue(`data: ${data}\n\n`);
          } catch (err) {
            console.error(`Error sending SSE event ${eventName}:`, err);
          }
        };

        handlers.set(eventName, handler);
        eventBus.on(eventName, handler);
      }

      // Heartbeat to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat\n\n`);
        } catch {
          // Connection closed
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Cleanup on cancel
      return () => {
        clearInterval(heartbeatInterval);
        for (const [eventName, handler] of handlers) {
          eventBus.off(eventName, handler);
        }
      };
    },

    cancel() {
      // Cleanup handled in start's return function
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
 * 404 handler
 */
function handleNotFound(): Response {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>404 - Not Found</title>
      <style>
        body {
          font-family: monospace;
          background: #1a1b26;
          color: #c0caf5;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container { text-align: center; }
        h1 { color: #f7768e; }
        a { color: #7dcfff; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>404 - Not Found</h1>
        <p>The requested page does not exist.</p>
        <p><a href="/">Go to Home</a></p>
      </div>
    </body>
    </html>
  `;

  return new Response(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * Main router
 */
function handleRequest(req: Request): Response {
  const url = new URL(req.url);
  const path = url.pathname;

  // Route matching
  if (path === '/' || path === '/index.html') {
    return handleHome();
  }

  if (path === '/board') {
    return handleBoard();
  }

  if (path.startsWith('/story/')) {
    const storyId = path.slice(7); // Remove '/story/' prefix
    if (storyId) {
      return handleStoryDetail(storyId);
    }
  }

  if (path === '/list') {
    return handleList();
  }

  if (path === '/blocked') {
    return handleBlocked();
  }

  if (path === '/retros') {
    return handleRetros();
  }

  if (path === '/system') {
    return handleSystemInfo();
  }

  if (path === '/agents') {
    return handleAgents();
  }

  if (path === '/api/events') {
    return handleSSE();
  }

  return handleNotFound();
}

/**
 * Create and start the HTTP server
 */
export function createServer(port?: number) {
  const serverPort = port ?? getPort();

  const server = Bun.serve({
    port: serverPort,
    fetch: handleRequest,
  });

  console.log(`Board Web Server running at http://localhost:${server.port}`);

  return server;
}

/**
 * Export port getter for external use
 */
export { getPort };
