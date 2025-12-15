/**
 * KanbanBoard View - Main Kanban board for task management
 *
 * Displays tasks organized in columns by status:
 * - To Do (pending)
 * - In Progress (in_progress)
 * - Blocked (blocked)
 * - Done (completed)
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
import { Column } from '../components/Column';
import { TaskStatus, type Task } from '../../types';

/**
 * Column configuration for the Kanban board
 * Maps task status to display properties
 * Note: Blocked tasks are shown in dedicated BlockedView (Tab 4)
 */
const COLUMNS: { status: TaskStatus; title: string; color: string }[] = [
  { status: TaskStatus.PENDING, title: 'To Do', color: 'gray' },
  { status: TaskStatus.IN_PROGRESS, title: 'In Progress', color: 'yellow' },
  { status: TaskStatus.COMPLETED, title: 'Done', color: 'green' },
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
 * Displays all tasks in a Kanban-style board with status columns.
 * Supports filtering by feature or story, and keyboard navigation.
 *
 * @param props - Component props
 * @returns KanbanBoard JSX
 *
 * @example
 * ```tsx
 * // Show all tasks
 * <KanbanBoard
 *   onSelectTask={(taskId) => handleSelectTask(taskId)}
 * />
 *
 * // Show tasks for a specific story
 * <KanbanBoard
 *   storyId="story-123"
 *   onSelectTask={(taskId) => handleSelectTask(taskId)}
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

  // Fetch tasks with optional story filter
  const { data: tasks, isLoading: tasksLoading } = useTasks(
    storyId ? { storyId } : {}
  );

  // Fetch stories with optional feature filter (respecting showArchived)
  const { data: stories, isLoading: storiesLoading } = useStories(
    featureId
      ? { featureId, excludeArchived: !showArchived }
      : { excludeArchived: !showArchived }
  );

  // Group tasks by status using for-loop (per project preference)
  const tasksByStatus: Record<TaskStatus, Task[]> = {
    [TaskStatus.PENDING]: [],
    [TaskStatus.IN_PROGRESS]: [],
    [TaskStatus.BLOCKED]: [],
    [TaskStatus.COMPLETED]: [],
    [TaskStatus.CANCELLED]: [],
  };

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (tasksByStatus[task.status]) {
      tasksByStatus[task.status].push(task);
    }
  }

  // Setup keyboard navigation
  const { state, isColumnFocused } = useNavigation({
    maxColumns: COLUMNS.length,
    getRowCount: (col) => tasksByStatus[COLUMNS[col].status]?.length || 0,
    onSelect: (col, row) => {
      const task = tasksByStatus[COLUMNS[col].status]?.[row];
      if (task && onSelectTask) {
        onSelectTask(task.id);
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
          <Column
            key={column.status}
            title={column.title}
            color={column.color}
            tasks={tasksByStatus[column.status] || []}
            stories={stories}
            isFocused={isColumnFocused(colIndex)}
            focusedRow={state.focusedColumn === colIndex ? state.focusedRow : -1}
            onSelectTask={onSelectTask}
          />
        ))}
      </box>

      {/* Footer help bar */}
      <box paddingLeft={1} marginTop={1}>
        <text fg="gray">
          hjkl: navigate  Enter: select  a: toggle archived  ESC: back
        </text>
      </box>
    </box>
  );
}
