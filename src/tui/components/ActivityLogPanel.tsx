/**
 * ActivityLogPanel Component - Displays recent activity logs with real-time updates
 *
 * Shows activity logs from external agents, adapters, and integrations.
 * Subscribes to event bus 'data' events for real-time updates.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TextAttributes } from '@opentui/core';
import { activityLogRepository } from '../../repositories/activity-log-repository';
import { eventBus } from '../../events';
import { formatRelativeTime } from '../utils';
import type { ActivityLog, ActivityLogLevel } from '../../types';

/**
 * Level color mapping
 * info = gray (normal events)
 * warn = yellow (warnings)
 * error = red (errors)
 */
const LEVEL_COLORS: Record<ActivityLogLevel, string> = {
  info: 'gray',
  warn: 'yellow',
  error: 'red',
};

/**
 * Props for ActivityLogPanel component
 */
export interface ActivityLogPanelProps {
  /** Optional story ID to filter logs for a specific story */
  storyId?: string;
  /** Number of log entries to display (default: 5) */
  height?: number;
}

/**
 * Truncate text to a maximum length with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '~';
}

/**
 * Format log level with fixed width (5 chars)
 */
function formatLevel(level: ActivityLogLevel): string {
  const levelText = level.toUpperCase();
  return levelText.padEnd(5);
}

/**
 * ActivityLogPanel component for displaying recent activity logs
 *
 * @param props - Component props
 * @returns ActivityLogPanel JSX
 *
 * @example
 * ```tsx
 * <ActivityLogPanel storyId="story-123" height={5} />
 * ```
 */
export function ActivityLogPanel({ storyId, height = 5 }: ActivityLogPanelProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  // Fetch logs from repository
  const fetchLogs = useCallback(() => {
    const recentLogs = activityLogRepository.findRecent(height, storyId);
    setLogs(recentLogs);
  }, [height, storyId]);

  // Initial fetch
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Subscribe to event bus for real-time updates
  useEffect(() => {
    const handleDataEvent = (event: { table: string; type: string }) => {
      // Refresh when activity_logs table changes
      if (event.table === 'activity_logs') {
        fetchLogs();
      }
    };

    eventBus.on('data', handleDataEvent);

    return () => {
      eventBus.off('data', handleDataEvent);
    };
  }, [fetchLogs]);

  // Build header text
  const headerText = storyId ? 'Activity Log (filtered)' : 'Activity Log';

  return (
    <box
      flexDirection="column"
      border={true}
      borderStyle="single"
      borderColor="gray"
      marginTop={1}
    >
      {/* Header */}
      <box paddingLeft={1} paddingRight={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          {headerText}
        </text>
      </box>

      {/* Log entries */}
      <scrollbox
        height={height}
        paddingLeft={1}
        paddingRight={1}
      >
        {logs.length === 0 ? (
          <text fg="gray">No activity logs</text>
        ) : (
          logs.map((log) => {
            const relativeTime = formatRelativeTime(log.timestamp);
            const source = truncate(log.source, 12).padEnd(12);
            const level = formatLevel(log.level);
            const levelColor = LEVEL_COLORS[log.level];

            // Build the complete line as a single string
            // Format: timestamp (8 chars) | source (12 chars) | level (5 chars) | message
            const timeStr = relativeTime.padEnd(8);
            const linePrefix = `${timeStr} ${source} `;
            const lineSuffix = ` ${log.message}`;

            return (
              <box key={log.id} flexDirection="row">
                <text fg="gray">{linePrefix}</text>
                <text fg={levelColor}>{level}</text>
                <text fg="white">{lineSuffix}</text>
              </box>
            );
          })
        )}
      </scrollbox>
    </box>
  );
}
