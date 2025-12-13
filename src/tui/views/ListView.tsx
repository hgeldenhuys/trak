/**
 * ListView - Simple list view of stories with navigation
 *
 * Displays stories in a vertical list with:
 * - Story code and title
 * - Current status with color coding
 * - Keyboard navigation (j/k or arrows)
 * - Selection with Enter
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `backgroundColor` for box background colors
 * - Use `attributes={TextAttributes.BOLD}` for bold, not `bold`
 */

import React, { useState, useCallback } from 'react';
import { useStories, useFeatures } from '../hooks';
import { useKeyboard } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';
import type { Story, Feature } from '../../types';

/**
 * Props for ListView component
 */
export interface ListViewProps {
  /** Optional feature ID to filter stories */
  featureId?: string;
  /** Callback when a story is selected */
  onSelectStory?: (storyId: string) => void;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

/**
 * Map story status to display color
 */
const STATUS_COLORS: Record<string, string> = {
  draft: 'gray',
  planned: 'blue',
  in_progress: 'yellow',
  review: 'magenta',
  completed: 'green',
  cancelled: 'red',
  archived: 'gray',
};

/**
 * Map priority to display color
 */
const PRIORITY_COLORS: Record<string, string> = {
  P0: 'red',
  P1: 'yellow',
  P2: 'blue',
  P3: 'gray',
};

/**
 * ListView component
 *
 * Displays a navigable list of stories with status indicators.
 * Supports filtering by feature and keyboard navigation.
 *
 * @param props - Component props
 * @returns ListView JSX
 *
 * @example
 * ```tsx
 * // Show all stories
 * <ListView
 *   onSelectStory={(storyId) => handleSelectStory(storyId)}
 * />
 *
 * // Show stories for a specific feature
 * <ListView
 *   featureId="feature-123"
 *   onSelectStory={(storyId) => handleSelectStory(storyId)}
 * />
 * ```
 */
export function ListView({
  featureId,
  onSelectStory,
  onEscape,
}: ListViewProps) {
  const [showArchived, setShowArchived] = useState(false);
  const { data: stories, isLoading: storiesLoading } = useStories(
    featureId
      ? { featureId, excludeArchived: !showArchived }
      : { excludeArchived: !showArchived }
  );
  const { data: features, isLoading: featuresLoading } = useFeatures();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Build a lookup map for features
  const featureMap = new Map<string, Feature>();
  for (const feature of features) {
    featureMap.set(feature.id, feature);
  }

  // Get feature code for a story
  const getFeatureCode = useCallback(
    (fid: string): string => {
      const feature = featureMap.get(fid);
      return feature?.code || '???';
    },
    [featureMap]
  );

  // Keyboard handler
  useKeyboard((event: KeyEvent) => {
    // Navigate up
    if (event.name === 'up' || event.name === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    // Navigate down
    if (event.name === 'down' || event.name === 'j') {
      setSelectedIndex((i) => Math.min(stories.length - 1, i + 1));
      return;
    }

    // Select with Enter
    if (event.name === 'return') {
      const story = stories[selectedIndex];
      if (story && onSelectStory) {
        onSelectStory(story.id);
      }
      return;
    }

    // Go back with Escape
    if (event.name === 'escape') {
      if (onEscape) {
        onEscape();
      }
      return;
    }

    // Jump to top with g
    if (event.name === 'g') {
      setSelectedIndex(0);
      return;
    }

    // Jump to bottom with G (shift+g)
    if (event.name === 'G') {
      setSelectedIndex(Math.max(0, stories.length - 1));
      return;
    }

    // Toggle show archived with 'a'
    if (event.name === 'a') {
      setShowArchived((prev) => !prev);
      setSelectedIndex(0); // Reset selection when toggling
      return;
    }
  });

  // Loading state
  if (storiesLoading || featuresLoading) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        alignItems="center"
        justifyContent="center"
      >
        <text fg="yellow">Loading stories...</text>
      </box>
    );
  }

  // Empty state
  if (stories.length === 0) {
    return (
      <box flexDirection="column" width="100%" padding={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Stories
        </text>
        <box marginTop={1}>
          <text fg="gray">No stories found</text>
        </box>
        {featureId && (
          <text fg="gray">
            Filtering by feature. Press ESC to clear filter.
          </text>
        )}
      </box>
    );
  }

  return (
    <box flexDirection="column" width="100%" padding={1}>
      {/* Header */}
      <box flexDirection="row" marginBottom={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Stories
        </text>
        <text fg="gray">{` (${stories.length} total)`}</text>
        {featureId && (
          <text fg="gray">{` - filtered by feature`}</text>
        )}
        {showArchived && (
          <text fg="gray">{` [showing archived]`}</text>
        )}
      </box>

      {/* Column headers */}
      <box flexDirection="row" marginBottom={1}>
        <box width={14}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Code
          </text>
        </box>
        <box width={40}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Title
          </text>
        </box>
        <box width={14}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Status
          </text>
        </box>
        <box width={6}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Pri
          </text>
        </box>
        <box flexGrow={1}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Assignee
          </text>
        </box>
      </box>

      {/* Story list */}
      <box flexDirection="column">
        {stories.map((story, index) => {
          const isFocused = index === selectedIndex;
          const statusColor = STATUS_COLORS[story.status] || 'white';
          const priorityColor = PRIORITY_COLORS[story.priority] || 'white';

          // Truncate title if too long
          const maxTitleLen = 38;
          const title =
            story.title.length > maxTitleLen
              ? story.title.slice(0, maxTitleLen - 2) + '..'
              : story.title;

          return (
            <box
              key={story.id}
              flexDirection="row"
              backgroundColor={isFocused ? 'blue' : undefined}
              paddingLeft={1}
              paddingRight={1}
            >
              <box width={14}>
                <text fg={isFocused ? 'white' : 'cyan'}>{story.code}</text>
              </box>
              <box width={40}>
                <text fg={isFocused ? 'white' : 'white'}>{title}</text>
              </box>
              <box width={14}>
                <text fg={isFocused ? 'white' : statusColor}>
                  {story.status}
                </text>
              </box>
              <box width={6}>
                <text fg={isFocused ? 'white' : priorityColor}>
                  {story.priority}
                </text>
              </box>
              <box flexGrow={1}>
                <text fg={isFocused ? 'white' : 'gray'}>
                  {story.assignedTo || '-'}
                </text>
              </box>
            </box>
          );
        })}
      </box>

      {/* Footer with navigation hint */}
      <box marginTop={2}>
        <text fg="gray">
          j/k: navigate  Enter: view story  g/G: top/bottom  a: toggle archived  ESC: back
        </text>
      </box>
    </box>
  );
}
