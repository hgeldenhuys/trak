#!/usr/bin/env bun
/**
 * Centralized Notification Service - HTTP Server
 *
 * Bun HTTP server that runs as a background daemon on configurable port.
 * Handles notification requests from multiple Claude Code sessions.
 *
 * Endpoints:
 *   POST /notify       - Accept notification payload
 *   GET /health        - Service health check
 *   GET /queue         - Audio queue status
 *   GET /response/:id  - Rendered response page
 */

import { initConfig, getConfig, getConfigSummary, validateConfig } from './config';
import { handleNotify } from './routes/notify';
import { handleHealth } from './routes/health';
import { handleQueueStatus } from './routes/queue';
import { handleResponse, handleProjectLatestResponse } from './routes/response';
import { handleAudio } from './routes/audio';
import { handleEvents } from './routes/events';
import { handleDebugSSE, handleDebugList } from './routes/debug';
import { handleDebugPage } from './routes/debug-page';
import { startTunnel, stopTunnel, getPublicUrl } from './ngrok';
import { initDatabase, closeDatabase } from './db';
import { optionalAuth, isAuthRequired } from './auth';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

// Store server state for external access
let serverPort: number | null = null;
let ngrokUrl: string | null = null;

/**
 * Main request router
 */
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  if (DEBUG) {
    console.error(`[server] ${method} ${path}`);
  }

  // ========================================
  // PUBLIC ENDPOINTS (no auth required)
  // ========================================

  // Health check - needed for load balancers
  if (method === 'GET' && path === '/health') {
    return handleHealth();
  }

  // Response pages - public short-lived URLs
  if (method === 'GET' && path.startsWith('/response/')) {
    const responseId = path.replace('/response/', '');
    if (responseId) {
      return handleResponse(responseId);
    }
  }

  // Audio files - public access (if exists)
  if (method === 'GET' && path.startsWith('/audio/')) {
    const responseId = path.replace('/audio/', '');
    if (responseId) {
      return handleAudio(responseId);
    }
  }

  // Project latest response - /project/:projectId/latest-response
  if (method === 'GET' && path.match(/^\/project\/[^/]+\/latest-response$/)) {
    const projectId = decodeURIComponent(path.split('/')[2]);
    return handleProjectLatestResponse(projectId);
  }

  // ========================================
  // PROTECTED ENDPOINTS (require SDK key when REQUIRE_AUTH=true)
  // ========================================

  // Queue status
  if (method === 'GET' && path === '/queue') {
    return optionalAuth(handleQueueStatus)(request);
  }

  // Direct notification endpoint
  if (method === 'POST' && path === '/notify') {
    return optionalAuth(handleNotify)(request);
  }

  // Event streaming endpoint (NOTIFY-012)
  if (method === 'POST' && path === '/events') {
    return optionalAuth(handleEvents)(request);
  }

  // Debug endpoints (NOTIFY-012)
  if (method === 'GET' && path === '/debug') {
    return optionalAuth(handleDebugList)(request);
  }

  // Debug UI page: /debug/:projectId/ui
  if (method === 'GET' && path.match(/^\/debug\/[^/]+\/ui$/)) {
    const projectId = path.split('/')[2];
    return optionalAuth((req: Request) => handleDebugPage(projectId))(request);
  }

  // Debug SSE stream: /debug/:projectId
  if (method === 'GET' && path.match(/^\/debug\/[^/]+$/)) {
    const projectId = path.split('/')[2];
    return optionalAuth((req: Request) => handleDebugSSE(req, projectId))(request);
  }

  // 404 for unknown routes
  return new Response(
    JSON.stringify({ error: 'Not found', path }),
    { status: 404, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * Start the HTTP server
 */
export async function startServer(): Promise<{ port: number; ngrokUrl: string | null }> {
  // Load configuration
  const config = await initConfig();
  const warnings = validateConfig(config);
  const summary = getConfigSummary(config);

  // Initialize SQLite database (NOTIFY-012)
  initDatabase();

  console.log('Notification Service Starting');
  console.log('=============================');
  console.log('');
  console.log('Configuration:', JSON.stringify(summary, null, 2));
  console.log(`  Auth: ${isAuthRequired() ? 'enabled (SDK key required)' : 'disabled'}`);
  console.log('');

  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
    console.log('');
  }

  // Start Bun HTTP server
  const server = Bun.serve({
    port: config.server.port,
    hostname: config.server.host,
    fetch: handleRequest,
  });

  serverPort = config.server.port;

  console.log(`Server running at http://${server.hostname}:${server.port}`);
  console.log('');

  // Start ngrok tunnel if enabled
  if (config.ngrok.enabled) {
    console.log('Starting ngrok tunnel...');
    ngrokUrl = await startTunnel(config.server.port);
    if (ngrokUrl) {
      console.log(`ngrok public URL: ${ngrokUrl}`);
    } else {
      console.log('ngrok tunnel failed to start (falling back to local-only)');
    }
    console.log('');
  }

  console.log('Endpoints:');
  console.log('  POST /notify                            - Send notification');
  console.log('  POST /events                            - Receive hook events (NOTIFY-012)');
  console.log('  GET  /debug                             - List available projects');
  console.log('  GET  /debug/:projectId                  - SSE event stream');
  console.log('  GET  /debug/:projectId/ui               - Debug dashboard');
  console.log('  GET  /health                            - Service health');
  console.log('  GET  /queue                             - Audio queue status');
  console.log('  GET  /response/:id                      - View response page');
  console.log('  GET  /project/:projectId/latest-response - Latest response for project');
  console.log('');
  console.log('Press Ctrl+C to stop');

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...');
    closeDatabase();
    await stopTunnel();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...');
    closeDatabase();
    await stopTunnel();
    process.exit(0);
  });

  return { port: config.server.port, ngrokUrl };
}

/**
 * Get server status (for CLI)
 */
export function getServerStatus(): {
  config: Record<string, unknown>;
  warnings: string[];
  ngrokUrl: string | null;
} {
  const config = getConfig();
  if (!config) {
    return {
      config: { error: 'Config not loaded' },
      warnings: ['Server not initialized'],
      ngrokUrl: null,
    };
  }

  return {
    config: getConfigSummary(config),
    warnings: validateConfig(config),
    ngrokUrl: getPublicUrl(),
  };
}

/**
 * Get the current ngrok public URL (if connected)
 */
export function getServerNgrokUrl(): string | null {
  return ngrokUrl;
}

/**
 * Get the server port
 */
export function getServerPort(): number | null {
  return serverPort;
}

// CLI entry point
if (import.meta.main) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
