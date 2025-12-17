/**
 * StoryCard Component - Individual story card for Kanban board
 *
 * Displays story information in a compact card format including:
 * - Story code
 * - Story title (truncated if too long)
 * - Priority with color coding
 * - Assignee
 * - Relative timestamp
 * - Task progress indicator
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 */

import React from 'react';
import type { Story, Priority } from '../../types';
import { formatRelativeTime } from '../utils';

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
 * Props for StoryCard component
 */
export interface StoryCardProps {
  /** The story to display */
  story: Story;
  /** Whether this card is currently focused */
  isFocused: boolean;
  /** Callback when story is selected */
  onSelect?: () => void;
  /** Number of completed tasks */
  completedTasks?: number;
  /** Total number of tasks */
  totalTasks?: number;
}

/**
 * StoryCard component for displaying individual stories in the Kanban board
 *
 * @param props - Component props
 * @returns StoryCard JSX
 *
 * @example
 * ```tsx
 * <StoryCard
 *   story={story}
 *   isFocused={true}
 *   onSelect={() => handleSelectStory(story.id)}
 *   completedTasks={3}
 *   totalTasks={5}
 * />
 * ```
 */
export function StoryCard({
  story,
  isFocused,
  onSelect,
  completedTasks = 0,
  totalTasks = 0,
}: StoryCardProps) {
  const priorityColor = PRIORITY_COLORS[story.priority as Priority] || 'white';

  // Truncate title if too long (max 25 chars)
  const title = story.title.length > 25 ? story.title.slice(0, 22) + '...' : story.title;

  // Get assignee or default to 'Unassigned'
  const assignee = story.assignedTo || 'Unassigned';

  // Get relative timestamp
  const relativeTime = formatRelativeTime(story.updatedAt);

  // Build task progress string
  const taskProgress = totalTasks > 0 ? `${completedTasks}/${totalTasks}` : '';

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
      {/* Story code and timestamp as header line */}
      <box flexDirection="row" justifyContent="space-between">
        <text fg={isFocused ? 'white' : 'magenta'}>{story.code}</text>
        <text fg={isFocused ? 'white' : 'gray'}>{relativeTime}</text>
      </box>

      {/* Story title */}
      <text fg={isFocused ? 'white' : 'cyan'}>{title}</text>

      {/* Metadata line - priority, assignee, task progress */}
      <box flexDirection="row">
        <text fg={priorityColor}>{story.priority}</text>
        <text fg="gray">{' | '}</text>
        <text fg={isFocused ? 'white' : 'gray'}>{assignee}</text>
        {taskProgress && (
          <>
            <text fg="gray">{' | '}</text>
            <text fg={isFocused ? 'white' : 'green'}>{taskProgress}</text>
          </>
        )}
      </box>
    </box>
  );
}
