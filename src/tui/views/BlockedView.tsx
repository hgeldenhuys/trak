/**
 * BlockedView - Dedicated view for blocked tasks
 *
 * Shows all tasks with status='blocked' across all stories,
 * including task title, story code, assignee, and impediment notes.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `backgroundColor` for box background colors
 * - Use `attributes={TextAttributes.BOLD}` for bold, not `bold`
 */

import React, { useState, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';
import { useTasks, useStories } from '../hooks';
import { TaskStatus, type Task, type Story } from '../../types';
import { impedimentRepository } from '../../repositories';
import { formatRelativeTime } from '../utils';

/**
 * Props for BlockedView component
 */
export interface BlockedViewProps {
  /** Callback when a task is selected */
  onSelectTask?: (taskId: string) => void;
  /** Callback when a story is selected */
  onSelectStory?: (storyId: string) => void;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

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
 * BlockedView component
 *
 * Displays all blocked tasks with impediment information.
 *
 * @param props - Component props
 * @returns BlockedView JSX
 *
 * @example
 * ```tsx
 * <BlockedView
 *   onSelectTask={(taskId) => handleSelectTask(taskId)}
 *   onSelectStory={(storyId) => handleSelectStory(storyId)}
 *   onEscape={() => setView('board')}
 * />
 * ```
 */
export function BlockedView({
  onSelectTask,
  onSelectStory,
  onEscape,
}: BlockedViewProps) {
  // Fetch all tasks and filter for blocked
  const { data: allTasks, isLoading: tasksLoading } = useTasks({ status: TaskStatus.BLOCKED });
  const { data: stories, isLoading: storiesLoading } = useStories({ excludeArchived: false });

  const [selectedIndex, setSelectedIndex] = useState(0);

  // Build a lookup map for stories
  const storyMap = new Map<string, Story>();
  for (const story of stories) {
    storyMap.set(story.id, story);
  }

  // Get story code for a task
  const getStoryCode = useCallback(
    (storyId: string): string => {
      const story = storyMap.get(storyId);
      return story?.code || '???';
    },
    [storyMap]
  );

  // Get impediment notes for a task
  const getImpedimentNotes = useCallback(
    (taskId: string): string => {
      const impediments = impedimentRepository.findByEntity('task' as any, taskId);
      const openImpediments = impediments.filter(imp => imp.status === 'open' || imp.status === 'in_progress');
      if (openImpediments.length === 0) {
        return 'No impediment recorded';
      }
      return openImpediments.map(imp => imp.title).join('; ');
    },
    []
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
      setSelectedIndex((i) => Math.min(allTasks.length - 1, i + 1));
      return;
    }

    // Select with Enter
    if (event.name === 'return') {
      const task = allTasks[selectedIndex];
      if (task) {
        if (onSelectStory) {
          onSelectStory(task.storyId);
        }
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
      setSelectedIndex(Math.max(0, allTasks.length - 1));
      return;
    }
  });

  // Loading state
  if (tasksLoading || storiesLoading) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        alignItems="center"
        justifyContent="center"
      >
        <text fg="yellow">Loading blocked tasks...</text>
      </box>
    );
  }

  // Empty state
  if (allTasks.length === 0) {
    return (
      <box flexDirection="column" width="100%" padding={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Blocked Tasks
        </text>
        <box marginTop={1}>
          <text fg="green">No blocked tasks - great job!</text>
        </box>
        <box marginTop={1}>
          <text fg="gray">
            ESC: back to board
          </text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" width="100%" height="100%" padding={1}>
      {/* Header */}
      <box flexDirection="row" marginBottom={1}>
        <text fg="red" attributes={TextAttributes.BOLD}>
          Blocked Tasks
        </text>
        <text fg="gray">{` (${allTasks.length} blocked)`}</text>
      </box>

      {/* Column headers */}
      <box flexDirection="row" marginBottom={1}>
        <box width={12}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Story
          </text>
        </box>
        <box width={30}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Task
          </text>
        </box>
        <box width={12}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Assignee
          </text>
        </box>
        <box width={8}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Updated
          </text>
        </box>
        <box flexGrow={1}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Impediment
          </text>
        </box>
      </box>

      {/* Task list */}
      <box flexDirection="column" flexGrow={1}>
        {allTasks.map((task, index) => {
          const isFocused = index === selectedIndex;
          const storyCode = getStoryCode(task.storyId);
          const priorityColor = PRIORITY_COLORS[task.priority] || 'white';
          const impedimentNotes = getImpedimentNotes(task.id);

          // Truncate title if too long
          const maxTitleLen = 28;
          const title =
            task.title.length > maxTitleLen
              ? task.title.slice(0, maxTitleLen - 2) + '..'
              : task.title;

          // Truncate impediment if too long
          const maxImpedimentLen = 40;
          const impediment =
            impedimentNotes.length > maxImpedimentLen
              ? impedimentNotes.slice(0, maxImpedimentLen - 2) + '..'
              : impedimentNotes;

          return (
            <box
              key={task.id}
              flexDirection="row"
              backgroundColor={isFocused ? 'blue' : undefined}
              paddingLeft={1}
              paddingRight={1}
            >
              <box width={12}>
                <text fg={isFocused ? 'white' : 'cyan'}>{storyCode}</text>
              </box>
              <box width={30}>
                <text fg={isFocused ? 'white' : 'white'}>{title}</text>
              </box>
              <box width={12}>
                <text fg={isFocused ? 'white' : 'gray'}>
                  {task.assignedTo || '-'}
                </text>
              </box>
              <box width={8}>
                <text fg={isFocused ? 'white' : 'gray'}>
                  {formatRelativeTime(task.updatedAt)}
                </text>
              </box>
              <box flexGrow={1}>
                <text fg={isFocused ? 'white' : 'yellow'}>
                  {impediment}
                </text>
              </box>
            </box>
          );
        })}
      </box>

      {/* Footer with navigation hint */}
      <box marginTop={1}>
        <text fg="gray">
          j/k: navigate  Enter: view story  g/G: top/bottom  ESC: back
        </text>
      </box>
    </box>
  );
}
