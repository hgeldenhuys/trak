/**
 * Adapter Discovery Module
 *
 * Functions for discovering and checking status of running adapters.
 * Scans known adapter ports and aggregates health/status information.
 */

import type {
  AdapterInfo,
  AdapterHealthResponse,
  AdapterStatusResponse,
} from './types';
import { KNOWN_ADAPTERS, getKnownAdapterByPort } from './registry';

/**
 * Default timeout for adapter requests (2 seconds)
 */
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Fetch with timeout support
 *
 * @param url - URL to fetch
 * @param timeoutMs - Timeout in milliseconds
 * @returns Fetch response or null on timeout/error
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    return response;
  } catch {
    // Network error, timeout, or aborted
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get the status of an adapter running on a specific port
 *
 * Fetches /health and /status endpoints from the adapter and
 * combines the information into an AdapterInfo object.
 *
 * @param port - Port number to check
 * @param timeoutMs - Request timeout in milliseconds (default: 2000)
 * @returns AdapterInfo with status 'online', 'offline', or 'error'
 *
 * @example
 * ```typescript
 * const status = await getAdapterStatus(9271);
 * if (status.status === 'online') {
 *   console.log(`${status.displayName} is running`);
 * }
 * ```
 */
export async function getAdapterStatus(
  port: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<AdapterInfo> {
  // Look up adapter info from registry
  const knownAdapter = getKnownAdapterByPort(port);

  // Base adapter info (used if adapter is offline)
  const baseInfo: AdapterInfo = {
    name: knownAdapter?.name ?? `unknown-${port}`,
    displayName: knownAdapter?.displayName ?? `Unknown Adapter (port ${port})`,
    port,
    version: 'unknown',
    status: 'offline',
  };

  const baseUrl = `http://127.0.0.1:${port}`;

  // Fetch health endpoint
  const healthResponse = await fetchWithTimeout(
    `${baseUrl}/health`,
    timeoutMs
  );

  if (!healthResponse) {
    // Adapter is not responding - offline
    return baseInfo;
  }

  if (!healthResponse.ok) {
    // Adapter responded but with error
    return {
      ...baseInfo,
      status: 'error',
    };
  }

  // Parse health response
  let healthData: AdapterHealthResponse;
  try {
    healthData = await healthResponse.json();
  } catch {
    return {
      ...baseInfo,
      status: 'error',
    };
  }

  // Adapter is online, now fetch status for more details
  const statusResponse = await fetchWithTimeout(
    `${baseUrl}/status`,
    timeoutMs
  );

  let statusData: AdapterStatusResponse | null = null;
  if (statusResponse && statusResponse.ok) {
    try {
      statusData = await statusResponse.json();
    } catch {
      // Status endpoint failed, but health is ok - continue with partial info
    }
  }

  // Build full adapter info
  const adapterInfo: AdapterInfo = {
    ...baseInfo,
    status: healthData.ok ? 'online' : 'error',
    version: 'unknown', // Version would come from a /version endpoint if available
    health: {
      uptime: healthData.uptime,
      adoConnected: statusData?.connected,
      trakConnected: healthData.ok,
    },
  };

  // Add sync info if available
  if (statusData) {
    adapterInfo.sync = {
      lastInboundSync: statusData.inbound?.lastRun ?? undefined,
      lastOutboundSync: statusData.outbound?.lastRun ?? undefined,
      inboundCount: statusData.inbound?.itemsSynced,
      outboundCount: statusData.outbound?.itemsSynced,
      errorCount:
        (statusData.inbound?.errors ?? 0) + (statusData.outbound?.errors ?? 0),
    };

    adapterInfo.config = {
      org: statusData.config?.org,
      project: statusData.config?.project,
    };
  }

  return adapterInfo;
}

/**
 * Discover all running adapters
 *
 * Scans all known adapter ports in parallel and returns
 * information about each adapter (running or not).
 *
 * @param timeoutMs - Request timeout per adapter in milliseconds (default: 2000)
 * @returns Array of AdapterInfo for all known adapters
 *
 * @example
 * ```typescript
 * const adapters = await discoverAdapters();
 * const onlineAdapters = adapters.filter(a => a.status === 'online');
 * console.log(`Found ${onlineAdapters.length} running adapters`);
 * ```
 */
export async function discoverAdapters(
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<AdapterInfo[]> {
  // Check all known adapter ports in parallel
  const statusPromises = KNOWN_ADAPTERS.map((adapter) =>
    getAdapterStatus(adapter.defaultPort, timeoutMs)
  );

  const results = await Promise.all(statusPromises);

  return results;
}

/**
 * Discover only online adapters
 *
 * Convenience function that filters to only running adapters.
 *
 * @param timeoutMs - Request timeout per adapter in milliseconds (default: 2000)
 * @returns Array of AdapterInfo for online adapters only
 */
export async function discoverOnlineAdapters(
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<AdapterInfo[]> {
  const all = await discoverAdapters(timeoutMs);
  return all.filter((adapter) => adapter.status === 'online');
}
