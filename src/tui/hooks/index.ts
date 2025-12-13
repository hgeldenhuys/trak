/**
 * TUI Hooks - Reactive data management for the TUI
 *
 * This module exports all hooks for reactive data fetching
 * in the terminal user interface.
 */

// =============================================================================
// Core Query Hook
// =============================================================================

export { useQuery } from './useQuery';
export type {
  UseQueryOptions,
  UseQueryResult,
  TableName,
} from './useQuery';

// =============================================================================
// Multi-Table Query Hook
// =============================================================================

export { useMultiTableQuery } from './useMultiTableQuery';
export type {
  MultiTableQueryResult,
  TableName as MultiTableName,
} from './useMultiTableQuery';

// =============================================================================
// Navigation Hook
// =============================================================================

export { useNavigation } from './useNavigation';
export type {
  NavigationState,
  NavigationActions,
  UseNavigationOptions,
  UseNavigationResult,
} from './useNavigation';

// =============================================================================
// Edit Mode Hook
// =============================================================================

export { useEditMode } from './useEditMode';
export type {
  EditModeState,
  EditModeActions,
  UseEditModeOptions,
  UseEditModeResult,
} from './useEditMode';

// =============================================================================
// Task Hooks
// =============================================================================

export {
  useTasks,
  useTasksByStory,
  useTasksByStatus,
  useTask,
  useTaskStatusCounts,
} from './useTasks';
export type { UseTasksOptions } from './useTasks';

// =============================================================================
// Story Hooks
// =============================================================================

export {
  useStories,
  useStoriesByFeature,
  useStory,
  useStoryByCode,
  useStoriesByStatus,
} from './useStories';
export type { UseStoriesOptions } from './useStories';

// =============================================================================
// Feature Hooks
// =============================================================================

export {
  useFeatures,
  useFeature,
  useFeatureByCode,
} from './useFeatures';
