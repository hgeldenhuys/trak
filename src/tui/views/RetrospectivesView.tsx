/**
 * RetrospectivesView - View for completed/archived stories with learnings
 *
 * Shows completed and archived stories along with any notes
 * attached to them that serve as learnings/retrospectives.
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
import { useStories } from '../hooks';
import { StoryStatus, EntityType, type Story, type Note } from '../../types';
import { noteRepository } from '../../repositories';
import { formatRelativeTime } from '../utils';

/**
 * Props for RetrospectivesView component
 */
export interface RetrospectivesViewProps {
  /** Callback when a story is selected */
  onSelectStory?: (storyId: string) => void;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

/**
 * Story with notes for display
 */
interface StoryWithNotes {
  story: Story;
  notes: Note[];
}

/**
 * RetrospectivesView component
 *
 * Displays completed/archived stories with their learnings.
 *
 * @param props - Component props
 * @returns RetrospectivesView JSX
 *
 * @example
 * ```tsx
 * <RetrospectivesView
 *   onSelectStory={(storyId) => handleSelectStory(storyId)}
 *   onEscape={() => setView('board')}
 * />
 * ```
 */
export function RetrospectivesView({
  onSelectStory,
  onEscape,
}: RetrospectivesViewProps) {
  // Fetch completed and archived stories
  const { data: allStories, isLoading } = useStories({ excludeArchived: false });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);

  // Filter for completed/archived stories
  const retroStories: StoryWithNotes[] = [];
  for (const story of allStories) {
    if (story.status === StoryStatus.COMPLETED || story.status === StoryStatus.ARCHIVED) {
      // Get notes for this story
      const notes = noteRepository.findByEntity(EntityType.STORY, story.id);
      retroStories.push({ story, notes });
    }
  }

  // Sort by updatedAt descending (most recent first)
  retroStories.sort((a, b) => {
    return new Date(b.story.updatedAt).getTime() - new Date(a.story.updatedAt).getTime();
  });

  // Keyboard handler
  useKeyboard((event: KeyEvent) => {
    // Navigate up
    if (event.name === 'up' || event.name === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    // Navigate down
    if (event.name === 'down' || event.name === 'j') {
      setSelectedIndex((i) => Math.min(retroStories.length - 1, i + 1));
      return;
    }

    // Toggle expand with Enter or select story
    if (event.name === 'return') {
      const item = retroStories[selectedIndex];
      if (item) {
        if (expandedStoryId === item.story.id) {
          // If already expanded, select story
          if (onSelectStory) {
            onSelectStory(item.story.id);
          }
        } else {
          // Expand to show notes
          setExpandedStoryId(item.story.id);
        }
      }
      return;
    }

    // Collapse with space
    if (event.name === 'space') {
      setExpandedStoryId(null);
      return;
    }

    // Go back with Escape
    if (event.name === 'escape') {
      if (expandedStoryId) {
        setExpandedStoryId(null);
      } else if (onEscape) {
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
      setSelectedIndex(Math.max(0, retroStories.length - 1));
      return;
    }
  });

  // Loading state
  if (isLoading) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        alignItems="center"
        justifyContent="center"
      >
        <text fg="yellow">Loading retrospectives...</text>
      </box>
    );
  }

  // Empty state
  if (retroStories.length === 0) {
    return (
      <box flexDirection="column" width="100%" padding={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Retrospectives
        </text>
        <box marginTop={1}>
          <text fg="gray">No completed or archived stories yet</text>
        </box>
        <box marginTop={1}>
          <text fg="gray">
            Complete stories to see them here with their learnings.
          </text>
        </box>
        <box marginTop={2}>
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
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Retrospectives
        </text>
        <text fg="gray">{` (${retroStories.length} stories)`}</text>
      </box>

      {/* Scrollable list */}
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {retroStories.map((item, index) => {
            const isFocused = index === selectedIndex;
            const isExpanded = expandedStoryId === item.story.id;
            const statusColor = item.story.status === 'completed' ? 'green' : 'gray';

            // Truncate title if too long
            const maxTitleLen = 50;
            const title =
              item.story.title.length > maxTitleLen
                ? item.story.title.slice(0, maxTitleLen - 2) + '..'
                : item.story.title;

            return (
              <box key={item.story.id} flexDirection="column" marginBottom={1}>
                {/* Story row */}
                <box
                  flexDirection="row"
                  backgroundColor={isFocused ? 'blue' : undefined}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <box width={12}>
                    <text fg={isFocused ? 'white' : 'cyan'}>{item.story.code}</text>
                  </box>
                  <box width={52}>
                    <text fg={isFocused ? 'white' : 'white'}>{title}</text>
                  </box>
                  <box width={12}>
                    <text fg={isFocused ? 'white' : statusColor}>
                      {item.story.status}
                    </text>
                  </box>
                  <box width={10}>
                    <text fg={isFocused ? 'white' : 'gray'}>
                      {formatRelativeTime(item.story.updatedAt)}
                    </text>
                  </box>
                  <box>
                    <text fg={isFocused ? 'white' : 'magenta'}>
                      {item.notes.length > 0 ? `[${item.notes.length} notes]` : ''}
                    </text>
                  </box>
                </box>

                {/* Expanded notes section */}
                {isExpanded && item.notes.length > 0 && (
                  <box
                    flexDirection="column"
                    marginLeft={2}
                    marginTop={1}
                    marginBottom={1}
                    border={true}
                    borderStyle="single"
                    borderColor="gray"
                    padding={1}
                  >
                    <text fg="magenta" attributes={TextAttributes.BOLD}>
                      Learnings:
                    </text>
                    {item.notes.map((note, noteIndex) => (
                      <box key={note.id} marginTop={noteIndex === 0 ? 1 : 1} flexDirection="column">
                        <box flexDirection="row">
                          <text fg="gray">{`- `}</text>
                          <text fg="white">{note.content}</text>
                        </box>
                        <text fg="gray">{`  (${note.author}, ${formatRelativeTime(note.createdAt)})`}</text>
                      </box>
                    ))}
                  </box>
                )}

                {/* Expanded but no notes */}
                {isExpanded && item.notes.length === 0 && (
                  <box marginLeft={2} marginTop={1} marginBottom={1}>
                    <text fg="gray">No notes/learnings recorded for this story</text>
                  </box>
                )}
              </box>
            );
          })}
        </box>
      </scrollbox>

      {/* Footer with navigation hint */}
      <box marginTop={1}>
        <text fg="gray">
          j/k: navigate  Enter: expand/view  Space: collapse  g/G: top/bottom  ESC: back
        </text>
      </box>
    </box>
  );
}
