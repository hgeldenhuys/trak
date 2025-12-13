/**
 * useStories Hook - Reactive story data fetching for TUI
 *
 * Provides reactive access to stories with automatic updates
 * when story, task, or acceptance criteria data changes.
 */

import { useMultiTableQuery, type MultiTableQueryResult } from './useMultiTableQuery';
import { storyRepository } from '../../repositories';
import type { Story, StoryStatus } from '../../types';

/**
 * Options for filtering stories
 */
export interface UseStoriesOptions {
  /** Filter by feature ID */
  featureId?: string;
  /** Filter by story status */
  status?: StoryStatus;
  /** Exclude archived stories (defaults to true) */
  excludeArchived?: boolean;
}

/**
 * Hook to get all stories with optional filtering
 *
 * @param options - Optional filters for featureId, status
 * @returns Reactive query result with stories array
 *
 * @example
 * ```typescript
 * // Get all stories
 * const { data: stories, isLoading } = useStories();
 *
 * // Get stories for a specific feature
 * const { data: featureStories } = useStories({ featureId: 'feature-123' });
 *
 * // Get in-progress stories
 * const { data: activeStories } = useStories({ status: StoryStatus.IN_PROGRESS });
 *
 * // Include archived stories
 * const { data: allStories } = useStories({ excludeArchived: false });
 * ```
 */
export function useStories(options: UseStoriesOptions = {}): MultiTableQueryResult<Story[]> {
  // Default to excluding archived stories
  const excludeArchived = options.excludeArchived ?? true;

  return useMultiTableQuery(
    () => {
      const stories = storyRepository.findAll({
        featureId: options.featureId,
        status: options.status,
      });

      // Filter out archived stories if excludeArchived is true
      if (excludeArchived) {
        const filtered: Story[] = [];
        for (const story of stories) {
          if (story.status !== 'archived') {
            filtered.push(story);
          }
        }
        return filtered;
      }

      return stories;
    },
    ['story']
  );
}

/**
 * Hook to get stories for a specific feature
 *
 * @param featureId - The feature ID to get stories for
 * @returns Reactive query result with stories array
 *
 * @example
 * ```typescript
 * const { data: stories, isLoading } = useStoriesByFeature('feature-123');
 * ```
 */
export function useStoriesByFeature(featureId: string): MultiTableQueryResult<Story[]> {
  return useMultiTableQuery(
    () => storyRepository.findByFeatureId(featureId),
    ['story']
  );
}

/**
 * Hook to get a single story by ID
 * Also subscribes to task and ac changes since story views often show related data.
 *
 * @param storyId - The story ID to fetch
 * @returns Reactive query result with story or null
 *
 * @example
 * ```typescript
 * const { data: story, isLoading, lastUpdated } = useStory('story-123');
 * if (story) {
 *   console.log(`${story.code}: ${story.title}`);
 * }
 * ```
 */
export function useStory(storyId: string): MultiTableQueryResult<Story | null> {
  return useMultiTableQuery(
    () => storyRepository.findById(storyId),
    ['story', 'task', 'ac']  // Also update when tasks/ACs change
  );
}

/**
 * Hook to get a story by its code
 *
 * @param code - The story code (e.g., 'NOTIFY-001')
 * @returns Reactive query result with story or null
 *
 * @example
 * ```typescript
 * const { data: story } = useStoryByCode('NOTIFY-001');
 * ```
 */
export function useStoryByCode(code: string): MultiTableQueryResult<Story | null> {
  return useMultiTableQuery(
    () => storyRepository.findByCode(code),
    ['story', 'task', 'ac']  // Also update when tasks/ACs change
  );
}

/**
 * Hook to get stories by status
 *
 * @param status - The status to filter by
 * @returns Reactive query result with stories array
 *
 * @example
 * ```typescript
 * const { data: reviewStories } = useStoriesByStatus(StoryStatus.REVIEW);
 * ```
 */
export function useStoriesByStatus(status: StoryStatus): MultiTableQueryResult<Story[]> {
  return useMultiTableQuery(
    () => storyRepository.findAll({ status }),
    ['story']
  );
}
