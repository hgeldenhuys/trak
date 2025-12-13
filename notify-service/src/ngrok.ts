/**
 * ngrok Tunnel Manager
 *
 * Manages ngrok tunnel lifecycle for exposing the notification server publicly.
 * Provides graceful fallback when auth token is missing or connection fails.
 */

import { getConfig } from './config';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

// Tunnel state
let tunnelUrl: string | null = null;
let tunnelSession: unknown = null;
let isConnecting = false;
let connectionError: string | null = null;

/**
 * Start ngrok tunnel
 * @param port The local port to tunnel
 * @returns The public URL or null if failed/not configured
 */
export async function startTunnel(port: number): Promise<string | null> {
  const config = getConfig();

  if (!config?.ngrok.enabled) {
    if (DEBUG) {
      console.error('[ngrok] Tunnel disabled in config');
    }
    return null;
  }

  if (!config.ngrok.authToken) {
    connectionError = 'No auth token configured';
    if (DEBUG) {
      console.error('[ngrok] No auth token configured - public URLs not available');
    }
    return null;
  }

  if (isConnecting) {
    if (DEBUG) {
      console.error('[ngrok] Already connecting...');
    }
    return tunnelUrl;
  }

  if (tunnelUrl) {
    if (DEBUG) {
      console.error('[ngrok] Tunnel already active:', tunnelUrl);
    }
    return tunnelUrl;
  }

  isConnecting = true;
  connectionError = null;

  try {
    // Dynamic import to avoid errors when ngrok is not installed
    const ngrok = await import('@ngrok/ngrok');

    if (DEBUG) {
      console.error('[ngrok] Starting tunnel for port', port);
    }

    // Configure ngrok
    const options: Record<string, unknown> = {
      addr: port,
      authtoken: config.ngrok.authToken,
    };

    // Add subdomain if configured (requires paid plan)
    if (config.ngrok.subdomain) {
      options.subdomain = config.ngrok.subdomain;
    }

    // Start the tunnel
    const listener = await ngrok.forward(options);
    tunnelUrl = listener.url() || null;
    tunnelSession = listener;

    if (DEBUG) {
      console.error('[ngrok] Tunnel established:', tunnelUrl);
    }

    return tunnelUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    connectionError = errorMessage;

    // Check for common errors
    if (errorMessage.includes('NGROK_AUTHTOKEN')) {
      console.error('[ngrok] Invalid or missing auth token');
    } else if (errorMessage.includes('Cannot find package')) {
      console.error('[ngrok] @ngrok/ngrok package not installed. Run: bun add @ngrok/ngrok');
    } else {
      console.error('[ngrok] Failed to start tunnel:', errorMessage);
    }

    return null;
  } finally {
    isConnecting = false;
  }
}

/**
 * Stop the ngrok tunnel
 */
export async function stopTunnel(): Promise<void> {
  if (!tunnelSession) {
    return;
  }

  try {
    const ngrok = await import('@ngrok/ngrok');

    // Disconnect all tunnels
    await ngrok.disconnect();

    if (DEBUG) {
      console.error('[ngrok] Tunnel stopped');
    }
  } catch (error) {
    if (DEBUG) {
      console.error('[ngrok] Error stopping tunnel:', error);
    }
  } finally {
    tunnelUrl = null;
    tunnelSession = null;
    connectionError = null;
  }
}

/**
 * Get the current public URL
 * @returns The public URL or null if not connected
 */
export function getPublicUrl(): string | null {
  return tunnelUrl;
}

/**
 * Get ngrok status
 */
export function getNgrokStatus(): {
  status: 'connected' | 'disconnected' | 'not_configured';
  publicUrl?: string;
  error?: string;
} {
  const config = getConfig();

  if (!config?.ngrok.enabled || !config.ngrok.authToken) {
    return { status: 'not_configured' };
  }

  if (tunnelUrl) {
    return {
      status: 'connected',
      publicUrl: tunnelUrl,
    };
  }

  return {
    status: 'disconnected',
    error: connectionError || undefined,
  };
}

/**
 * Check if ngrok is configured and ready
 */
export function isNgrokConfigured(): boolean {
  const config = getConfig();
  return !!(config?.ngrok.enabled && config.ngrok.authToken);
}

/**
 * Get the best URL for the response page (public if ngrok connected, local otherwise)
 */
export function getResponsePageUrl(responseId: string, localPort: number): string {
  if (tunnelUrl) {
    return `${tunnelUrl}/response/${responseId}`;
  }
  return `http://127.0.0.1:${localPort}/response/${responseId}`;
}
