/**
 * Column Component - Kanban column for status grouping
 *
 * Displays a column of tasks grouped by status. Includes:
 * - Column header with status name and task count
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
import { TaskCard } from './TaskCard';
import type { Task, Story } from '../../types';

/** Height of each task card in rows (title + border) */
const TASK_CARD_HEIGHT = 3;

/**
 * Props for Column component
 */
export interface ColumnProps {
  /** Column title (e.g., 'To Do', 'In Progress') */
  title: string;
  /** Color for the column header */
  color: string;
  /** Tasks in this column */
  tasks: Task[];
  /** Stories for looking up story codes */
  stories: Story[];
  /** Whether this column is currently focused */
  isFocused: boolean;
  /** Currently focused row index (-1 if none) */
  focusedRow: number;
  /** Callback when a task is selected */
  onSelectTask?: (taskId: string) => void;
}

/**
 * Column component for Kanban board
 *
 * @param props - Component props
 * @returns Column JSX
 *
 * @example
 * ```tsx
 * <Column
 *   title="In Progress"
 *   color="yellow"
 *   tasks={inProgressTasks}
 *   stories={stories}
 *   isFocused={true}
 *   focusedRow={0}
 *   onSelectTask={(id) => handleSelectTask(id)}
 * />
 * ```
 */
export function Column({
  title,
  color,
  tasks,
  stories,
  isFocused,
  focusedRow,
  onSelectTask,
}: ColumnProps) {
  const { height: termHeight } = useTerminalDimensions();
  const [scrollOffset, setScrollOffset] = useState(0);

  // Calculate visible area (terminal height minus header, footer, borders)
  // Rough estimate: header(2) + footer(2) + column header(1) + borders(2) = 7
  const visibleHeight = Math.max(5, termHeight - 7);
  const visibleItems = Math.floor(visibleHeight / TASK_CARD_HEIGHT);

  // Keep focused item visible with padding (don't scroll until near edges)
  useEffect(() => {
    if (focusedRow < 0 || tasks.length === 0) return;

    const padding = Math.floor(visibleItems / 3); // Keep 1/3 padding above/below
    const minVisible = scrollOffset + padding;
    const maxVisible = scrollOffset + visibleItems - padding - 1;

    if (focusedRow < minVisible) {
      // Focused item is above visible area - scroll up
      setScrollOffset(Math.max(0, focusedRow - padding));
    } else if (focusedRow > maxVisible) {
      // Focused item is below visible area - scroll down
      setScrollOffset(Math.min(
        tasks.length - visibleItems,
        focusedRow - visibleItems + padding + 1
      ));
    }
  }, [focusedRow, tasks.length, visibleItems, scrollOffset]);

  /**
   * Get story code for a given story ID
   */
  const getStoryCode = (storyId: string): string => {
    for (let i = 0; i < stories.length; i++) {
      if (stories[i].id === storyId) {
        return stories[i].code;
      }
    }
    return 'Unknown';
  };

  // Build header text with count
  const headerText = `${title} (${tasks.length})`;

  // Calculate which tasks to show (virtual scrolling)
  const startIndex = Math.max(0, scrollOffset);
  const endIndex = Math.min(tasks.length, startIndex + visibleItems + 1);
  const visibleTasks = tasks.slice(startIndex, endIndex);

  // Show scroll indicators
  const canScrollUp = scrollOffset > 0;
  const canScrollDown = endIndex < tasks.length;

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
        <text fg="gray">  ↑ {scrollOffset} more</text>
      )}

      {/* Task list - virtual scrolling */}
      <box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleTasks.length > 0 ? (
          <>
            {visibleTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                storyCode={getStoryCode(task.storyId)}
                isFocused={focusedRow === startIndex + index}
                onSelect={() => onSelectTask?.(task.id)}
              />
            ))}
            {/* Bottom padding to ensure last item is fully visible */}
            <box height={2}><text> </text></box>
          </>
        ) : tasks.length === 0 ? (
          <text fg="gray">No tasks</text>
        ) : null}
      </box>

      {/* Scroll down indicator */}
      {canScrollDown && (
        <text fg="gray">  ↓ {tasks.length - endIndex} more</text>
      )}
    </box>
  );
}
