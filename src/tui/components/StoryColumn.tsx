/**
 * StoryColumn Component - Kanban column for story status grouping
 *
 * Displays a column of stories grouped by status. Includes:
 * - Column header with status name and story count
 * - Virtual scrolling that keeps focused item visible
 * - Focus highlighting for active column
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - Manual scroll offset to keep focused item in view
 */

import React, { useState, useEffect } from 'react';
import { TextAttributes } from '@opentui/core';
import { useTerminalDimensions } from '@opentui/react';
import { StoryCard } from './StoryCard';
import type { Story, Task } from '../../types';

/** Height of each story card in rows (title + border) */
const STORY_CARD_HEIGHT = 4;

/**
 * Props for StoryColumn component
 */
export interface StoryColumnProps {
  /** Column title (e.g., 'Draft', 'In Progress') */
  title: string;
  /** Color for the column header */
  color: string;
  /** Stories in this column */
  stories: Story[];
  /** Tasks for calculating story progress */
  tasks: Task[];
  /** Whether this column is currently focused */
  isFocused: boolean;
  /** Currently focused row index (-1 if none) */
  focusedRow: number;
  /** Callback when a story is selected */
  onSelectStory?: (storyId: string) => void;
}

/**
 * StoryColumn component for Kanban board
 *
 * @param props - Component props
 * @returns StoryColumn JSX
 *
 * @example
 * ```tsx
 * <StoryColumn
 *   title="In Progress"
 *   color="yellow"
 *   stories={inProgressStories}
 *   tasks={allTasks}
 *   isFocused={true}
 *   focusedRow={0}
 *   onSelectStory={(id) => handleSelectStory(id)}
 * />
 * ```
 */
export function StoryColumn({
  title,
  color,
  stories,
  tasks,
  isFocused,
  focusedRow,
  onSelectStory,
}: StoryColumnProps) {
  const { height: termHeight } = useTerminalDimensions();
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate visible area (terminal height minus header, footer, borders)
  // Rough estimate: header(2) + footer(2) + column header(1) + borders(2) = 7
  const visibleHeight = Math.max(5, termHeight - 7);
  const visibleItems = Math.floor(visibleHeight / STORY_CARD_HEIGHT);

  // Keep focused item visible with padding (don't scroll until near edges)
  useEffect(() => {
    if (focusedRow < 0 || stories.length === 0) return;

    const padding = Math.floor(visibleItems / 3); // Keep 1/3 padding above/below
    const minVisible = scrollOffset + padding;
    const maxVisible = scrollOffset + visibleItems - padding - 1;

    if (focusedRow < minVisible) {
      // Focused item is above visible area - scroll up
      setScrollOffset(Math.max(0, focusedRow - padding));
    } else if (focusedRow > maxVisible) {
      // Focused item is below visible area - scroll down
      setScrollOffset(Math.min(
        stories.length - visibleItems,
        focusedRow - visibleItems + padding + 1
      ));
    }
  }, [focusedRow, stories.length, visibleItems, scrollOffset]);

  /**
   * Get task counts for a given story
   */
  const getTaskCounts = (storyId: string): { completed: number; total: number } => {
    let completed = 0;
    let total = 0;
    for (const task of tasks) {
      if (task.storyId === storyId) {
        total++;
        if (task.status === 'completed') {
          completed++;
        }
      }
    }
    return { completed, total };
  };

  // Build header text with count
  const headerText = `${title} (${stories.length})`;

  // Calculate which stories to show (virtual scrolling)
  const startIndex = Math.max(0, scrollOffset);
  const endIndex = Math.min(stories.length, startIndex + visibleItems + 1);
  const visibleStories = stories.slice(startIndex, endIndex);

  // Show scroll indicators
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = endIndex < stories.length;

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      minWidth={14}
      border={true}
      borderStyle="single"
      borderColor={isFocused ? 'cyan' : 'gray'}
    >
      {/* Column header */}
      <text fg={color} attributes={TextAttributes.BOLD}>
        {headerText}
      </text>

      {/* Scroll up indicator */}
      {canScrollUp && (
        <text fg="gray">  ^ {scrollOffset} more</text>
      )}

      {/* Story list - virtual scrolling */}
      <box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleStories.length > 0 ? (
          <>
            {visibleStories.map((story, index) => {
              const taskCounts = getTaskCounts(story.id);
              return (
                <StoryCard
                  key={story.id}
                  story={story}
                  isFocused={focusedRow === startIndex + index}
                  onSelect={() => onSelectStory?.(story.id)}
                  completedTasks={taskCounts.completed}
                  totalTasks={taskCounts.total}
                />
              );
            })}
            {/* Bottom padding to ensure last item is fully visible */}
            <box height={2}><text> </text></box>
          </>
        ) : stories.length === 0 ? (
          <text fg="gray">No stories</text>
        ) : null}
      </box>

      {/* Scroll down indicator */}
      {canScrollDown && (
        <text fg="gray">  v {stories.length - endIndex} more</text>
      )}
    </box>
  );
}
