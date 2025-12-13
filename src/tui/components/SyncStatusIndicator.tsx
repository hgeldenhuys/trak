/**
 * SyncStatusIndicator Component - Shows ADO sync status for stories
 *
 * Displays the synchronization status between local stories and Azure DevOps:
 * - Synced: Story is in sync with ADO (green)
 * - Pending: Story has local changes not yet synced (yellow)
 * - Not Connected: Story has no ADO connection (gray)
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - `<text>` cannot have nested JSX - build complete strings
 */

import React from 'react';
import type { Story } from '../../types';

/**
 * Sync status types
 */
export type SyncStatus = 'synced' | 'pending' | 'not-connected';

/**
 * Configuration for each sync status
 */
interface SyncStatusConfig {
  icon: string;
  color: string;
  text: string;
}

/**
 * Status configurations
 */
const SYNC_STATUS_CONFIG: Record<SyncStatus, SyncStatusConfig> = {
  synced: {
    icon: '[v]',
    color: 'green',
    text: 'Synced',
  },
  pending: {
    icon: '[~]',
    color: 'yellow',
    text: 'Sync pending',
  },
  'not-connected': {
    icon: '[-]',
    color: 'gray',
    text: 'Local only',
  },
};

/**
 * Props for SyncStatusIndicator component
 */
export interface SyncStatusIndicatorProps {
  /** Story to check sync status for */
  story: Story;
  /** Whether to show full text or just icon (default: false) */
  compact?: boolean;
}

/**
 * Determine the sync status of a story
 *
 * Logic:
 * 1. If no adoWorkItemId in extensions -> 'not-connected'
 * 2. If no lastPushedAt in extensions -> 'pending'
 * 3. If lastPushedAt >= updatedAt -> 'synced'
 * 4. Otherwise -> 'pending'
 *
 * @param story - The story to check
 * @returns The sync status
 */
export function getSyncStatus(story: Story): SyncStatus {
  // Check if story has ADO connection
  const adoWorkItemId = story.extensions?.adoWorkItemId;
  if (!adoWorkItemId) {
    return 'not-connected';
  }

  // Check if synced (compare timestamps)
  const lastPushedAt = story.extensions?.lastPushedAt as string | undefined;
  if (!lastPushedAt) {
    return 'pending';
  }

  // Compare timestamps
  const pushedTime = new Date(lastPushedAt).getTime();
  const updatedTime = new Date(story.updatedAt).getTime();

  return pushedTime >= updatedTime ? 'synced' : 'pending';
}

/**
 * SyncStatusIndicator component for displaying ADO sync status
 *
 * Shows the synchronization status of a story with Azure DevOps.
 * Can display in compact mode (icon only) or full mode (icon + text).
 *
 * @param props - Component props
 * @returns SyncStatusIndicator JSX
 *
 * @example
 * ```tsx
 * // Compact mode - icon only
 * <SyncStatusIndicator story={story} compact />
 *
 * // Full mode - icon + text
 * <SyncStatusIndicator story={story} />
 * ```
 */
export function SyncStatusIndicator({ story, compact = false }: SyncStatusIndicatorProps) {
  const status = getSyncStatus(story);
  const config = SYNC_STATUS_CONFIG[status];

  if (compact) {
    // Compact mode - icon only
    return <text fg={config.color}>{config.icon}</text>;
  }

  // Full mode - icon + text
  return (
    <box flexDirection="row">
      <text fg={config.color}>{config.icon}</text>
      <text fg={config.color}>{` ${config.text}`}</text>
    </box>
  );
}
