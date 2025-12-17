/**
 * KanbanBoard View - Main Kanban board for story management
 *
 * Displays stories organized in columns by status:
 * - Draft (draft)
 * - Planned (planned)
 * - In Progress (in_progress)
 * - Review (review)
 * - Completed (completed)
 *
 * Supports keyboard navigation with hjkl/arrows and selection with Enter.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - Use `backgroundColor` for box background colors
 */

import React, { useState } from 'react';
import { useTasks, useStories } from '../hooks';
import { useNavigation } from '../hooks/useNavigation';
import { useKeyboard } from '@opentui/react';
import { type KeyEvent } from '@opentui/core';
import { StoryColumn } from '../components/StoryColumn';
import { StoryStatus, type Story } from '../../types';

/**
 * Column configuration for the Kanban board
 * Maps story status to display properties
 * Note: Blocked tasks are shown in dedicated BlockedView (Tab 4)
 */
const COLUMNS: { status: StoryStatus; title: string; color: string }[] = [
  { status: StoryStatus.DRAFT, title: 'Draft', color: 'gray' },
  { status: StoryStatus.PLANNED, title: 'Planned', color: 'blue' },
  { status: StoryStatus.IN_PROGRESS, title: 'In Progress', color: 'yellow' },
  { status: StoryStatus.REVIEW, title: 'Review', color: 'magenta' },
  { status: StoryStatus.COMPLETED, title: 'Completed', color: 'green' },
];

/**
 * Props for KanbanBoard component
 */
export interface KanbanBoardProps {
  /** Optional feature ID to filter stories */
  featureId?: string;
  /** Optional story ID to filter tasks */
  storyId?: string;
  /** Callback when a task is selected */
  onSelectTask?: (taskId: string) => void;
  /** Callback when a story is selected */
  onSelectStory?: (storyId: string) => void;
  /** Callback when Escape is pressed (go back) */
  onEscape?: () => void;
}

/**
 * KanbanBoard view component
 *
 * Displays all stories in a Kanban-style board with status columns.
 * Supports filtering by feature, and keyboard navigation.
 *
 * @param props - Component props
 * @returns KanbanBoard JSX
 *
 * @example
 * ```tsx
 * // Show all stories
 * <KanbanBoard
 *   onSelectStory={(storyId) => handleSelectStory(storyId)}
 * />
 *
 * // Show stories for a specific feature
 * <KanbanBoard
 *   featureId="feature-123"
 *   onSelectStory={(storyId) => handleSelectStory(storyId)}
 * />
 * ```
 */
export function KanbanBoard({
  featureId,
  storyId,
  onSelectTask,
  onSelectStory,
  onEscape,
}: KanbanBoardProps) {
  const [showArchived, setShowArchived] = useState(false);

  // Fetch tasks for progress indicators
  const { data: tasks, isLoading: tasksLoading } = useTasks({});

  // Fetch stories with optional feature filter (respecting showArchived)
  const { data: stories, isLoading: storiesLoading } = useStories(
    featureId
      ? { featureId, excludeArchived: !showArchived }
      : { excludeArchived: !showArchived }
  );

  // Group stories by status using for-loop (per project preference)
  const storiesByStatus: Record<StoryStatus, Story[]> = {
    [StoryStatus.DRAFT]: [],
    [StoryStatus.PLANNED]: [],
    [StoryStatus.IN_PROGRESS]: [],
    [StoryStatus.REVIEW]: [],
    [StoryStatus.COMPLETED]: [],
    [StoryStatus.CANCELLED]: [],
    [StoryStatus.ARCHIVED]: [],
  };

  for (const story of stories) {
    if (storiesByStatus[story.status]) {
      storiesByStatus[story.status].push(story);
    }
  }

  // Setup keyboard navigation
  const { state, isColumnFocused } = useNavigation({
    maxColumns: COLUMNS.length,
    getRowCount: (col) => storiesByStatus[COLUMNS[col].status]?.length || 0,
    onSelect: (col, row) => {
      const story = storiesByStatus[COLUMNS[col].status]?.[row];
      if (story && onSelectStory) {
        onSelectStory(story.id);
      }
    },
    onEscape,
  });

  // Additional keyboard handler for 'a' to toggle archived
  useKeyboard((event: KeyEvent) => {
    if (event.name === 'a') {
      setShowArchived((prev) => !prev);
    }
  });

  // Show loading state
  if (tasksLoading || storiesLoading) {
    return (
      <box flexDirection="column" width="100%" height="100%" alignItems="center" justifyContent="center">
        <text fg="yellow">Loading board...</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header with archived indicator */}
      {showArchived && (
        <box paddingLeft={1} marginBottom={1}>
          <text fg="gray">[showing archived stories]</text>
        </box>
      )}

      {/* Kanban columns */}
      <box flexDirection="row" flexGrow={1} gap={1}>
        {COLUMNS.map((column, colIndex) => (
          <StoryColumn
            key={column.status}
            title={column.title}
            color={column.color}
            stories={storiesByStatus[column.status] || []}
            tasks={tasks}
            isFocused={isColumnFocused(colIndex)}
            focusedRow={state.focusedColumn === colIndex ? state.focusedRow : -1}
            onSelectStory={onSelectStory}
          />
        ))}
      </box>

      {/* Footer help bar */}
      <box paddingLeft={1} marginTop={1}>
        <text fg="gray">
          hjkl: navigate  Enter: view story  a: toggle archived  ESC: back
        </text>
      </box>
    </box>
  );
}
