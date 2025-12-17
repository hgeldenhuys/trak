/**
 * TaskCard Component - Individual task card for Kanban board
 *
 * Displays task information in a compact card format including:
 * - Story code in border label
 * - Task title (truncated if too long)
 * - Priority with color coding
 * - Assignee
 * - Relative timestamp
 * - Description preview
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 */

import React from 'react';
import { useTerminalDimensions } from '@opentui/react';
import type { Task, Priority } from '../../types';
import { formatRelativeTime } from '../utils';

/** Number of columns in the Kanban board */
const KANBAN_COLUMNS = 5;

/**
 * Priority color mapping
 * P0 = Critical (red)
 * P1 = High (yellow)
 * P2 = Medium (blue)
 * P3 = Low (gray)
 */
const PRIORITY_COLORS: Record<Priority, string> = {
  P0: 'red',
  P1: 'yellow',
  P2: 'blue',
  P3: 'gray',
};

/**
 * Props for TaskCard component
 */
export interface TaskCardProps {
  /** The task to display */
  task: Task;
  /** Story code for context (e.g., 'BOARD-001') */
  storyCode: string;
  /** Whether this card is currently focused */
  isFocused: boolean;
  /** Callback when task is selected */
  onSelect?: () => void;
}

/**
 * TaskCard component for displaying individual tasks in the Kanban board
 *
 * @param props - Component props
 * @returns TaskCard JSX
 *
 * @example
 * ```tsx
 * <TaskCard
 *   task={task}
 *   storyCode="BOARD-001"
 *   isFocused={true}
 *   onSelect={() => handleSelectTask(task.id)}
 * />
 * ```
 */
export function TaskCard({ task, storyCode, isFocused, onSelect }: TaskCardProps) {
  const { width: termWidth } = useTerminalDimensions();
  const priorityColor = PRIORITY_COLORS[task.priority as Priority] || 'white';

  // Calculate available text width dynamically based on terminal width
  // Layout: 5 columns with gap=1 (4 gaps), each column has border (2), card has padding (2) + border (2)
  const columnWidth = Math.floor((termWidth - 4) / KANBAN_COLUMNS);
  const textWidth = Math.max(15, columnWidth - 6); // 6 = column border (2) + card padding (2) + card border (2)

  // Truncate title if too long (dynamic based on available width)
  const title = task.title.length > textWidth ? task.title.slice(0, textWidth - 3) + '...' : task.title;

  // Get assignee or default to 'Unassigned'
  const assignee = task.assignedTo || 'Unassigned';

  // Get relative timestamp
  const relativeTime = formatRelativeTime(task.updatedAt);

  // Get description preview (dynamic based on available width)
  const descriptionPreview = task.description
    ? (task.description.length > textWidth
        ? task.description.slice(0, textWidth - 3) + '...'
        : task.description)
    : '';

  return (
    <box
      flexDirection="column"
      border={true}
      borderStyle={isFocused ? 'double' : 'single'}
      borderColor={isFocused ? 'cyan' : 'gray'}
      backgroundColor={isFocused ? 'blue' : undefined}
      marginBottom={1}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Story code as header line */}
      <box flexDirection="row" justifyContent="space-between">
        <text fg={isFocused ? 'white' : 'magenta'}>{storyCode}</text>
        <text fg={isFocused ? 'white' : 'gray'}>{relativeTime}</text>
      </box>

      {/* Task title */}
      <text fg={isFocused ? 'white' : 'cyan'}>{title}</text>

      {/* Description preview if available */}
      {descriptionPreview && (
        <text fg={isFocused ? 'white' : 'gray'}>{descriptionPreview}</text>
      )}

      {/* Metadata line - priority, assignee */}
      <box flexDirection="row">
        <text fg={priorityColor}>{task.priority}</text>
        <text fg="gray">{' | '}</text>
        <text fg={isFocused ? 'white' : 'gray'}>{assignee}</text>
      </box>
    </box>
  );
}
