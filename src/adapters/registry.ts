/**
 * Known Adapters Registry
 *
 * Registry of known adapters and their default ports.
 * Used for adapter discovery and status checking.
 */

import type { KnownAdapter } from './types';

/**
 * List of known adapters that can be discovered.
 *
 * Each adapter runs on a specific port and provides /health and /status endpoints.
 * The discovery system will scan these ports to find running adapters.
 */
export const KNOWN_ADAPTERS: KnownAdapter[] = [
  {
    name: 'azure-devops',
    displayName: 'Azure DevOps',
    defaultPort: 9271,
  },
  {
    name: 'jira',
    displayName: 'Jira',
    defaultPort: 9272,
  },
  {
    name: 'github-projects',
    displayName: 'GitHub Projects',
    defaultPort: 9273,
  },
  {
    name: 'linear',
    displayName: 'Linear',
    defaultPort: 9274,
  },
];

/**
 * Get a known adapter by name
 *
 * @param name - Adapter name (e.g., 'azure-devops')
 * @returns The known adapter or undefined if not found
 */
export function getKnownAdapter(name: string): KnownAdapter | undefined {
  return KNOWN_ADAPTERS.find((adapter) => adapter.name === name);
}

/**
 * Get a known adapter by port
 *
 * @param port - Port number
 * @returns The known adapter or undefined if not found
 */
export function getKnownAdapterByPort(port: number): KnownAdapter | undefined {
  return KNOWN_ADAPTERS.find((adapter) => adapter.defaultPort === port);
}
