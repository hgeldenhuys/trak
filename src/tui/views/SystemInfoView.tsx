/**
 * SystemInfoView - System information display
 *
 * Shows database path, schema version, project configuration,
 * and other system details for debugging and information purposes.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `backgroundColor` for box background colors
 * - Use `attributes={TextAttributes.BOLD}` for bold, not `bold`
 */

import React, { useState, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';
import { getDbPath, getSchemaVersion, getDb, isDbInitialized } from '../../db';
import { discoverAdapters, AdapterInfo } from '../../adapters';

/**
 * TUI Version - increment this when making changes to verify deployment
 */
const TUI_VERSION = '2.4.0';

/**
 * Props for SystemInfoView component
 */
export interface SystemInfoViewProps {
  /** Callback when Escape is pressed */
  onEscape?: () => void;
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
 * Get config location info
 */
function getConfigLocation(): string {
  const dbPath = getDbPath();
  if (dbPath) {
    // Extract directory from db path
    const parts = dbPath.split('/');
    parts.pop(); // Remove filename
    return parts.join('/') || '.';
  }
  return 'not initialized';
}

/**
 * Format a timestamp for display
 */
function formatLastSync(isoTimestamp: string | undefined): string {
  if (!isoTimestamp) return 'never';
  try {
    const date = new Date(isoTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return 'unknown';
  }
}

/**
 * Get status color for adapter
 */
function getStatusColor(status: 'online' | 'offline' | 'error'): string {
  switch (status) {
    case 'online':
      return 'green';
    case 'offline':
      return 'red';
    case 'error':
      return 'yellow';
    default:
      return 'gray';
  }
}

/**
 * SystemInfoView component
 *
 * Displays system information including database details,
 * schema version, and project configuration.
 *
 * @param props - Component props
 * @returns SystemInfoView JSX
 *
 * @example
 * ```tsx
 * <SystemInfoView
 *   onEscape={() => setView('board')}
 * />
 * ```
 */
export function SystemInfoView({
  onEscape,
}: SystemInfoViewProps) {
  // State for adapters
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [adaptersLoading, setAdaptersLoading] = useState(true);

  // Keyboard handler
  useKeyboard((event: KeyEvent) => {
    if (event.name === 'escape') {
      if (onEscape) {
        onEscape();
      }
    }
  });

  // Fetch adapters on mount
  useEffect(() => {
    discoverAdapters()
      .then(setAdapters)
      .finally(() => setAdaptersLoading(false));
  }, []);

  // Get system info
  const dbPath = getDbPath() || 'not initialized';
  const dbInitialized = isDbInitialized();
  let schemaVersion = 0;

  if (dbInitialized) {
    try {
      const db = getDb();
      schemaVersion = getSchemaVersion(db);
    } catch {
      // Database not accessible
    }
  }

  const projectName = getProjectName();
  const configLocation = getConfigLocation();
  const nodeVersion = process.version;
  const platform = process.platform;
  const arch = process.arch;

  // Info items to display
  const infoItems = [
    { label: 'TUI Version', value: TUI_VERSION, color: 'magenta' },
    { label: 'Project Name', value: projectName, color: 'cyan' },
    { label: 'Database Path', value: dbPath, color: 'white' },
    { label: 'Schema Version', value: String(schemaVersion), color: 'yellow' },
    { label: 'Config Location', value: configLocation, color: 'white' },
    { label: 'DB Initialized', value: dbInitialized ? 'Yes' : 'No', color: dbInitialized ? 'green' : 'red' },
    { label: 'Node Version', value: nodeVersion, color: 'gray' },
    { label: 'Platform', value: `${platform} (${arch})`, color: 'gray' },
    { label: 'Working Directory', value: process.cwd(), color: 'gray' },
  ];

  return (
    <box flexDirection="column" width="100%" height="100%" padding={1}>
      {/* Header */}
      <box marginBottom={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          System Information
        </text>
      </box>

      {/* Info section */}
      <box
        flexDirection="column"
        border={true}
        borderStyle="single"
        padding={1}
      >
        {infoItems.map((item, index) => (
          <box key={index} flexDirection="row" marginBottom={index < infoItems.length - 1 ? 1 : 0}>
            <box width={20}>
              <text fg="gray" attributes={TextAttributes.BOLD}>
                {`${item.label}:`}
              </text>
            </box>
            <box flexGrow={1}>
              <text fg={item.color}>
                {item.value}
              </text>
            </box>
          </box>
        ))}
      </box>

      {/* Connected Adapters section */}
      <box marginTop={1} marginBottom={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Connected Adapters
        </text>
      </box>

      <box
        flexDirection="column"
        border={true}
        borderStyle="single"
        padding={1}
        flexGrow={1}
      >
        {adaptersLoading ? (
          <box>
            <text fg="gray">Discovering adapters...</text>
          </box>
        ) : adapters.length === 0 ? (
          <box>
            <text fg="gray">No adapters detected</text>
          </box>
        ) : (
          adapters.map((adapter, index) => (
            <box key={adapter.name} flexDirection="column" marginBottom={index < adapters.length - 1 ? 1 : 0}>
              {/* Adapter name and status */}
              <box flexDirection="row">
                <box width={20}>
                  <text fg="white" attributes={TextAttributes.BOLD}>
                    {adapter.displayName}
                  </text>
                </box>
                <box width={12}>
                  <text fg={getStatusColor(adapter.status)}>
                    {adapter.status}
                  </text>
                </box>
                {adapter.status === 'online' && adapter.version && (
                  <box>
                    <text fg="gray">
                      {`v${adapter.version}`}
                    </text>
                  </box>
                )}
              </box>
              {/* Sync info (only if online) */}
              {adapter.status === 'online' && adapter.sync && (
                <box flexDirection="row" marginLeft={2}>
                  <text fg="gray">
                    {`Last sync: ${formatLastSync(adapter.sync.lastInboundSync || adapter.sync.lastOutboundSync)} | In: ${adapter.sync.inboundCount ?? 0} | Out: ${adapter.sync.outboundCount ?? 0}`}
                  </text>
                </box>
              )}
            </box>
          ))
        )}
      </box>

      {/* Footer with help */}
      <box marginTop={1}>
        <text fg="gray">
          ESC: back to board
        </text>
      </box>
    </box>
  );
}
