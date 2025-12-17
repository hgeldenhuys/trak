/**
 * ListView - Simple list view of stories with navigation
 *
 * Displays stories in a vertical list with:
 * - Story code and title
 * - Current status with color coding
 * - Keyboard navigation (j/k or arrows)
 * - Selection with Enter
 * - Dynamic column widths based on terminal size
 * - Relative timestamps for creation date
 * - AC and Task progress counts
 * - Archived section with divider
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `backgroundColor` for box background colors
 * - Use `attributes={TextAttributes.BOLD}` for bold, not `bold`
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useStories, useFeatures } from '../hooks';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';
import type { Story, Feature } from '../../types';
import { StoryStatus, Priority } from '../../types';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { acceptanceCriteriaRepository, taskRepository, storyRepository } from '../../repositories';

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
 * Fixed column widths
 */
const FIXED_COLUMNS = {
  code: 14,
  status: 14,
  priority: 6,
  created: 12,
  acCount: 8,
  taskCount: 10,
};

/**
 * Minimum title width
 */
const MIN_TITLE_WIDTH = 40;

/**
 * Calculate dynamic title width based on terminal width
 */
function calculateTitleWidth(terminalWidth: number): number {
  // Total fixed width: code(14) + status(14) + pri(6) + created(12) + ac(8) + tasks(10) + padding(4)
  const fixedWidth = FIXED_COLUMNS.code + FIXED_COLUMNS.status + FIXED_COLUMNS.priority +
    FIXED_COLUMNS.created + FIXED_COLUMNS.acCount + FIXED_COLUMNS.taskCount + 4;
  const available = terminalWidth - fixedWidth;
  return Math.max(MIN_TITLE_WIDTH, available);
}

/**
 * Get AC counts for a story (verified/total)
 */
function getACCounts(storyId: string): { verified: number; total: number } {
  const counts = acceptanceCriteriaRepository.countByStatus(storyId);
  return {
    verified: counts.verified,
    total: counts.pending + counts.verified + counts.failed,
  };
}

/**
 * Get Task counts for a story (completed/total)
 */
function getTaskCounts(storyId: string): { completed: number; total: number } {
  const counts = taskRepository.getStatusCounts(storyId);
  const completed = counts['completed'] || 0;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { completed, total };
}

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
  const { width: terminalWidth } = useTerminalDimensions();
  const [showArchived, setShowArchived] = useState(false);

  // Fetch all stories (including archived when showArchived is true)
  const { data: allStories, isLoading: storiesLoading } = useStories(
    featureId
      ? { featureId, excludeArchived: false }
      : { excludeArchived: false }
  );
  const { data: features, isLoading: featuresLoading } = useFeatures();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Calculate dynamic title width
  const titleWidth = useMemo(() => calculateTitleWidth(terminalWidth), [terminalWidth]);

  // Separate and sort stories
  const { activeStories, archivedStories } = useMemo(() => {
    const active: Story[] = [];
    const archived: Story[] = [];

    for (const story of allStories) {
      if (story.status === 'archived') {
        archived.push(story);
      } else {
        active.push(story);
      }
    }

    // Sort by createdAt descending (newest first)
    const sortByCreatedAt = (a: Story, b: Story) => {
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return bDate - aDate;
    };

    active.sort(sortByCreatedAt);
    archived.sort(sortByCreatedAt);

    return { activeStories: active, archivedStories: archived };
  }, [allStories]);

  // Combine stories for navigation (active first, then archived if shown)
  const displayStories = useMemo(() => {
    if (showArchived) {
      return [...activeStories, ...archivedStories];
    }
    return activeStories;
  }, [activeStories, archivedStories, showArchived]);

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
      setSelectedIndex((i) => Math.min(displayStories.length - 1, i + 1));
      return;
    }

    // Select with Enter
    if (event.name === 'return') {
      const story = displayStories[selectedIndex];
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
      setSelectedIndex(Math.max(0, displayStories.length - 1));
      return;
    }

    // Toggle show archived with 'a'
    if (event.name === 'a') {
      setShowArchived((prev) => !prev);
      setSelectedIndex(0); // Reset selection when toggling
      return;
    }

    // Archive selected story with 'A' (shift+a) or 'x'
    if (event.name === 'A' || event.name === 'x') {
      const story = displayStories[selectedIndex];
      if (story && story.status !== 'archived') {
        try {
          storyRepository.update(story.id, { status: StoryStatus.ARCHIVED });
          // Keep selection in bounds after archiving
          if (selectedIndex >= displayStories.length - 1) {
            setSelectedIndex(Math.max(0, displayStories.length - 2));
          }
        } catch {
          // Failed to archive story
        }
      }
      return;
    }

    // Create new story with 'c'
    if (event.name === 'c') {
      // Get the first feature to create a story under
      if (features.length > 0) {
        const targetFeatureId = featureId || features[0].id;
        try {
          const newStory = storyRepository.create({
            featureId: targetFeatureId,
            title: 'New Story',
            description: '',
            why: '',
            status: StoryStatus.DRAFT,
            priority: Priority.P2,
          });
          // Select the newly created story
          if (onSelectStory) {
            onSelectStory(newStory.id);
          }
        } catch (err) {
          // Failed to create story - feature might not exist
        }
      }
      return;
    }

    // Duplicate selected story with 'd'
    if (event.name === 'd') {
      const story = displayStories[selectedIndex];
      if (story && features.length > 0) {
        try {
          const newStory = storyRepository.create({
            featureId: story.featureId,
            title: `${story.title} (copy)`,
            description: story.description,
            why: story.why,
            status: StoryStatus.DRAFT,
            priority: story.priority,
          });
          // Select the duplicated story
          if (onSelectStory) {
            onSelectStory(newStory.id);
          }
        } catch (err) {
          // Failed to duplicate story
        }
      }
      return;
    }

    // Edit selected story with 'e' (navigate to story detail view)
    if (event.name === 'e') {
      const story = displayStories[selectedIndex];
      if (story && onSelectStory) {
        onSelectStory(story.id);
      }
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
  if (displayStories.length === 0) {
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

  // Calculate archive divider index
  const archiveDividerIndex = showArchived ? activeStories.length : -1;

  return (
    <box flexDirection="column" width="100%" padding={1}>
      {/* Header */}
      <box flexDirection="row" marginBottom={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Stories
        </text>
        <text fg="gray">{` (${activeStories.length} active${showArchived ? `, ${archivedStories.length} archived` : ''})`}</text>
        {featureId && (
          <text fg="gray">{` - filtered by feature`}</text>
        )}
        {showArchived && (
          <text fg="gray">{` [showing archived]`}</text>
        )}
      </box>

      {/* Column headers */}
      <box flexDirection="row" marginBottom={1}>
        <box width={FIXED_COLUMNS.code}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Code
          </text>
        </box>
        <box width={titleWidth}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Title
          </text>
        </box>
        <box width={FIXED_COLUMNS.status}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Status
          </text>
        </box>
        <box width={FIXED_COLUMNS.priority}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Pri
          </text>
        </box>
        <box width={FIXED_COLUMNS.created}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Created
          </text>
        </box>
        <box width={FIXED_COLUMNS.acCount}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            ACs
          </text>
        </box>
        <box width={FIXED_COLUMNS.taskCount}>
          <text fg="gray" attributes={TextAttributes.BOLD}>
            Tasks
          </text>
        </box>
      </box>

      {/* Story list */}
      <box flexDirection="column">
        {displayStories.map((story, index) => {
          const isFocused = index === selectedIndex;
          const isArchived = story.status === 'archived';
          const statusColor = STATUS_COLORS[story.status] || 'white';
          const priorityColor = PRIORITY_COLORS[story.priority] || 'white';

          // Truncate title if too long
          const maxTitleLen = titleWidth - 2;
          const title =
            story.title.length > maxTitleLen
              ? story.title.slice(0, maxTitleLen - 2) + '..'
              : story.title;

          // Get AC and Task counts
          const acCounts = getACCounts(story.id);
          const taskCounts = getTaskCounts(story.id);

          // Format counts
          const acText = acCounts.total > 0 ? `${acCounts.verified}/${acCounts.total}` : '-';
          const taskText = taskCounts.total > 0 ? `${taskCounts.completed}/${taskCounts.total}` : '-';

          // Format relative time
          const createdText = formatRelativeTime(story.createdAt);

          // Show divider before archived section
          const showDivider = index === archiveDividerIndex && archivedStories.length > 0;

          return (
            <React.Fragment key={story.id}>
              {showDivider && (
                <box flexDirection="column" marginTop={1} marginBottom={1}>
                  <text fg="red">{'════════════════════════════════════════════════════════════════════════════════'}</text>
                  <text fg="red" attributes={TextAttributes.BOLD}>{'  ARCHIVED STORIES'}</text>
                  <text fg="red">{'════════════════════════════════════════════════════════════════════════════════'}</text>
                </box>
              )}
              <box
                flexDirection="row"
                backgroundColor={isFocused ? 'blue' : undefined}
                paddingLeft={1}
                paddingRight={1}
              >
                <box width={FIXED_COLUMNS.code}>
                  <text fg={isFocused ? 'white' : (isArchived ? 'red' : 'cyan')}>{story.code}</text>
                </box>
                <box width={titleWidth}>
                  <text fg={isFocused ? 'white' : (isArchived ? 'red' : 'white')}>{isArchived ? `[ARCHIVED] ${title}` : title}</text>
                </box>
                <box width={FIXED_COLUMNS.status}>
                  <text fg={isFocused ? 'white' : (isArchived ? 'red' : statusColor)}>
                    {story.status}
                  </text>
                </box>
                <box width={FIXED_COLUMNS.priority}>
                  <text fg={isFocused ? 'white' : (isArchived ? 'red' : priorityColor)}>
                    {story.priority}
                  </text>
                </box>
                <box width={FIXED_COLUMNS.created}>
                  <text fg={isFocused ? 'white' : (isArchived ? 'red' : 'gray')}>
                    {createdText}
                  </text>
                </box>
                <box width={FIXED_COLUMNS.acCount}>
                  <text fg={isFocused ? 'white' : (isArchived ? 'red' : (acCounts.verified === acCounts.total && acCounts.total > 0 ? 'green' : 'yellow'))}>
                    {acText}
                  </text>
                </box>
                <box width={FIXED_COLUMNS.taskCount}>
                  <text fg={isFocused ? 'white' : (isArchived ? 'red' : (taskCounts.completed === taskCounts.total && taskCounts.total > 0 ? 'green' : 'yellow'))}>
                    {taskText}
                  </text>
                </box>
              </box>
            </React.Fragment>
          );
        })}
      </box>

      {/* Footer with navigation hint */}
      <box marginTop={2}>
        <text fg="gray">
          j/k: navigate  Enter/e: edit  c: create  d: duplicate  x/A: archive  a: toggle archived  g/G: top/bottom  ESC: back
        </text>
      </box>
    </box>
  );
}
