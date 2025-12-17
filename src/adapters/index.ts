/**
 * Adapter Discovery Module
 *
 * Provides functionality for discovering and monitoring external adapters.
 *
 * @example
 * ```typescript
 * import { discoverAdapters, getAdapterStatus, KNOWN_ADAPTERS } from './adapters';
 *
 * // Discover all adapters
 * const adapters = await discoverAdapters();
 * console.log(`Found ${adapters.filter(a => a.status === 'online').length} online adapters`);
 *
 * // Check specific adapter
 * const adoStatus = await getAdapterStatus(9271);
 * if (adoStatus.status === 'online') {
 *   console.log('Azure DevOps adapter is running');
 * }
 * ```
 *
 * @module adapters
 */

// Types
export type {
  AdapterInfo,
  AdapterHealth,
  AdapterSync,
  AdapterConfig,
  KnownAdapter,
  AdapterHealthResponse,
  AdapterStatusResponse,
} from './types';

// Registry
export {
  KNOWN_ADAPTERS,
  getKnownAdapter,
  getKnownAdapterByPort,
} from './registry';

// Discovery functions
export {
  getAdapterStatus,
  discoverAdapters,
  discoverOnlineAdapters,
} from './discovery';
