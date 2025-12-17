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

import React from 'react';
import { useKeyboard } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';
import { getDbPath, getSchemaVersion, getDb, isDbInitialized } from '../../db';

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
  // Keyboard handler
  useKeyboard((event: KeyEvent) => {
    if (event.name === 'escape') {
      if (onEscape) {
        onEscape();
      }
    }
  });

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
        flexGrow={1}
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

      {/* Footer with help */}
      <box marginTop={1}>
        <text fg="gray">
          ESC: back to board
        </text>
      </box>
    </box>
  );
}
