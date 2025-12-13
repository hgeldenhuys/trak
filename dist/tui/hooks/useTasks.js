/**
 * useTasks Hook - Reactive task data fetching for TUI
 *
 * Provides reactive access to tasks with automatic updates
 * when task data changes in the database.
 */
import { useMultiTableQuery } from './useMultiTableQuery';
import { taskRepository } from '../../repositories';
/**
 * Hook to get all tasks with optional filtering
 *
 * @param options - Optional filters for storyId, status, assignedTo
 * @returns Reactive query result with tasks array
 *
 * @example
 * ```typescript
 * // Get all tasks
 * const { data: tasks, isLoading } = useTasks();
 *
 * // Get tasks for a specific story
 * const { data: storyTasks } = useTasks({ storyId: 'story-123' });
 *
 * // Get in-progress tasks assigned to backend-dev
 * const { data: myTasks } = useTasks({
 *   status: TaskStatus.IN_PROGRESS,
 *   assignedTo: 'backend-dev'
 * });
 * ```
 */
export function useTasks(options = {}) {
    return useMultiTableQuery(() => taskRepository.findAll(options), ['task']);
}
/**
 * Hook to get tasks for a specific story
 *
 * @param storyId - The story ID to get tasks for
 * @returns Reactive query result with tasks array ordered by task order
 *
 * @example
 * ```typescript
 * const { data: tasks, isLoading, lastUpdated } = useTasksByStory('story-123');
 * ```
 */
export function useTasksByStory(storyId) {
    return useMultiTableQuery(() => taskRepository.findByStoryId(storyId), ['task']);
}
/**
 * Hook to get tasks by status
 *
 * @param status - The status to filter by
 * @returns Reactive query result with tasks array
 *
 * @example
 * ```typescript
 * const { data: inProgressTasks } = useTasksByStatus(TaskStatus.IN_PROGRESS);
 * ```
 */
export function useTasksByStatus(status) {
    return useMultiTableQuery(() => taskRepository.findByStatus(status), ['task']);
}
/**
 * Hook to get a single task by ID
 *
 * @param taskId - The task ID to fetch
 * @returns Reactive query result with task or null
 *
 * @example
 * ```typescript
 * const { data: task, isLoading } = useTask('task-123');
 * if (task) {
 *   console.log(task.title);
 * }
 * ```
 */
export function useTask(taskId) {
    return useMultiTableQuery(() => taskRepository.findById(taskId), ['task']);
}
/**
 * Hook to get task status counts for a story
 *
 * @param storyId - The story ID to get status counts for
 * @returns Reactive query result with status counts object
 *
 * @example
 * ```typescript
 * const { data: counts } = useTaskStatusCounts('story-123');
 * console.log(`Completed: ${counts.completed || 0}`);
 * ```
 */
export function useTaskStatusCounts(storyId) {
    return useMultiTableQuery(() => taskRepository.getStatusCounts(storyId), ['task']);
}
