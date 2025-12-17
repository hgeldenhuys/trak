/**
 * Task CLI Command - Board CLI/TUI System
 *
 * Provides subcommands for managing tasks:
 * - create: Create a new task within a story
 * - list: List tasks with optional filters
 * - show: Show details of a specific task
 * - update: Update task fields (title, description, status, priority, assignee)
 * - status: Quick status update shortcut
 * - delete: Delete a task (with confirmation)
 */

import { Command } from 'commander';
import { taskRepository, storyRepository, noteRepository, agentDefinitionRepository } from '../../repositories';
import {
  output,
  success,
  error,
  verbose,
  warn,
  info,
  formatStatus,
  formatPriority,
  getOutputFormat,
  isVerbose,
} from '../utils/output';
import { TaskStatus, Priority } from '../../types';
import type { Task, Story, UpdateTaskInput } from '../../types';
import {
  validateVersionedAssignee,
  ValidationError,
  formatValidationError,
} from '../../validation';

/**
 * Valid task status values for CLI validation
 */
const VALID_STATUSES = Object.values(TaskStatus);

/**
 * Valid priority values for CLI validation
 */
const VALID_PRIORITIES = Object.values(Priority);

/**
 * Format a task for table display
 * Converts task to a flattened object with formatted values
 */
function formatTaskForTable(task: Task, story?: Story | null): Record<string, unknown> {
  return {
    id: task.id.slice(0, 8),
    title: task.title,
    status: formatStatus(task.status),
    priority: formatPriority(task.priority),
    assignedTo: task.assignedTo || '-',
    storyCode: story?.code || task.storyId.slice(0, 8),
  };
}

/**
 * Format a task for detailed single-item display
 */
function formatTaskDetails(task: Task, story?: Story | null): Record<string, unknown> {
  return {
    ID: task.id,
    Title: task.title,
    Description: task.description || '(none)',
    Status: task.status,
    Priority: task.priority,
    'Assigned To': task.assignedTo || '(unassigned)',
    Order: task.order,
    'Story Code': story?.code || '(unknown)',
    'Story ID': task.storyId,
    Dependencies: task.dependencies.length > 0 ? task.dependencies.join(', ') : '(none)',
    'AC Coverage': task.acCoverage.length > 0 ? task.acCoverage.join(', ') : '(none)',
    'Est. Complexity': task.estimatedComplexity,
    'Created At': task.createdAt,
    'Updated At': task.updatedAt,
  };
}

/**
 * Find a task by full or partial ID
 * Returns the task if found uniquely, throws if not found or multiple matches
 */
function findTaskByPartialId(partialId: string): Task {
  // First try exact match
  const exactMatch = taskRepository.findById(partialId);
  if (exactMatch) {
    return exactMatch;
  }

  // Try partial match
  const allTasks = taskRepository.findAll();
  const matches: Task[] = [];

  for (const task of allTasks) {
    if (task.id.startsWith(partialId) || task.id.toLowerCase().startsWith(partialId.toLowerCase())) {
      matches.push(task);
    }
  }

  if (matches.length === 0) {
    throw new Error(`Task not found: ${partialId}`);
  }

  if (matches.length > 1) {
    const matchList = matches.map((t) => `  - ${t.id.slice(0, 8)} (${t.title})`).join('\n');
    throw new Error(`Multiple tasks match '${partialId}':\n${matchList}\nPlease use a more specific ID.`);
  }

  return matches[0];
}

/**
 * Validate and normalize status value
 */
function validateStatus(status: string): TaskStatus {
  // Allow dash-separated format (e.g., in-progress -> in_progress)
  const normalized = status.toLowerCase().replace(/-/g, '_');
  if (!VALID_STATUSES.includes(normalized as TaskStatus)) {
    throw new Error(`Invalid status: ${status}. Valid values: ${VALID_STATUSES.join(', ')}`);
  }
  return normalized as TaskStatus;
}

/**
 * Validate and normalize priority value
 */
function validatePriority(priority: string): Priority {
  const normalized = priority.toUpperCase();
  if (!VALID_PRIORITIES.includes(normalized as Priority)) {
    throw new Error(`Invalid priority: ${priority}. Valid values: ${VALID_PRIORITIES.join(', ')}`);
  }
  return normalized as Priority;
}

/**
 * Format a task diff for verbose output (before/after comparison)
 */
function formatTaskDiff(before: Task, after: Task): string {
  const lines: string[] = ['Changes:'];

  if (before.title !== after.title) {
    lines.push(`  title: "${before.title}" -> "${after.title}"`);
  }
  if (before.description !== after.description) {
    const beforeDesc = before.description.length > 30 ? before.description.slice(0, 30) + '...' : before.description;
    const afterDesc = after.description.length > 30 ? after.description.slice(0, 30) + '...' : after.description;
    lines.push(`  description: "${beforeDesc}" -> "${afterDesc}"`);
  }
  if (before.status !== after.status) {
    lines.push(`  status: ${before.status} -> ${after.status}`);
  }
  if (before.priority !== after.priority) {
    lines.push(`  priority: ${before.priority} -> ${after.priority}`);
  }
  if (before.assignedTo !== after.assignedTo) {
    lines.push(`  assignedTo: ${before.assignedTo || '(none)'} -> ${after.assignedTo || '(none)'}`);
  }

  return lines.length > 1 ? lines.join('\n') : '  (no changes)';
}

/**
 * Main task command with subcommands
 */
export const taskCommand = new Command('task')
  .description('Manage tasks');

/**
 * Create task subcommand
 *
 * Creates a new task within a story.
 * The story is looked up by its code (e.g., NOTIFY-001).
 *
 * @emits task:created event via TaskRepository
 */
taskCommand
  .command('create')
  .description('Create a new task')
  .requiredOption('-s, --story <code>', 'Story code (e.g., NOTIFY-001)')
  .requiredOption('-t, --title <title>', 'Task title')
  .option('-d, --description <desc>', 'Task description', '')
  .option('--status <status>', 'Initial status (pending, in_progress, blocked, completed, cancelled)', 'pending')
  .option('-a, --assigned-to <actor>', 'Assign to actor (e.g., backend-dev, frontend-dev)')
  .option('-p, --priority <priority>', 'Priority (P0, P1, P2, P3)', 'P2')
  .option('-c, --complexity <complexity>', 'Estimated complexity (low, medium, high)', 'medium')
  .option('--depends-on <task-ids>', 'Comma-separated task IDs this task depends on')
  .option('--covers <ac-codes>', 'Comma-separated AC codes this task covers (e.g., AC-001,AC-002)')
  .action(async (options) => {
    verbose(`Creating task for story: ${options.story}`);

    // Validate status
    if (!VALID_STATUSES.includes(options.status as TaskStatus)) {
      error(`Invalid status: ${options.status}. Valid values: ${VALID_STATUSES.join(', ')}`);
      process.exit(1);
    }

    // Validate priority
    if (!VALID_PRIORITIES.includes(options.priority as Priority)) {
      error(`Invalid priority: ${options.priority}. Valid values: ${VALID_PRIORITIES.join(', ')}`);
      process.exit(1);
    }

    // Validate complexity
    const validComplexities = ['low', 'medium', 'high'];
    if (!validComplexities.includes(options.complexity)) {
      error(`Invalid complexity: ${options.complexity}. Valid values: ${validComplexities.join(', ')}`);
      process.exit(1);
    }

    // Look up story by code
    const story = storyRepository.findByCode(options.story);
    if (!story) {
      error(`Story not found: ${options.story}`);
      process.exit(1);
    }

    verbose(`Found story: ${story.id} (${story.title})`);

    // Parse dependencies if provided
    const dependencies = options.dependsOn
      ? options.dependsOn.split(',').map((id: string) => id.trim()).filter(Boolean)
      : [];

    // Parse AC coverage if provided
    const acCoverage = options.covers
      ? options.covers.split(',').map((code: string) => code.trim()).filter(Boolean)
      : [];

    // Validate assignee against agent definitions (if story uses managed agents)
    // Stories with agent definitions enforce versioned agent assignments
    // Stories without agent definitions allow free-form assignees
    if (options.assignedTo) {
      const storyAgents = agentDefinitionRepository.findByStory(story.code);
      if (storyAgents.length > 0) {
        // Story uses managed agents - enforce versioned agent validation
        try {
          validateVersionedAssignee(options.assignedTo, options.story);
        } catch (err) {
          if (err instanceof ValidationError) {
            error(formatValidationError(err));
            process.exit(1);
          }
          throw err;
        }
      }
      // else: Story has no agent definitions - allow any assignee
    }

    try {
      const task = taskRepository.create({
        storyId: story.id,
        title: options.title,
        description: options.description,
        status: options.status as TaskStatus,
        priority: options.priority as Priority,
        assignedTo: options.assignedTo || null,
        estimatedComplexity: options.complexity as 'low' | 'medium' | 'high',
        dependencies,
        acCoverage,
      });

      if (getOutputFormat() === 'json') {
        output(task);
      } else {
        success(`Task created: ${task.id.slice(0, 8)}`);
        output(formatTaskDetails(task, story));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(`Failed to create task: ${message}`);
      process.exit(1);
    }
  });

/**
 * List tasks subcommand
 *
 * Lists tasks with optional filters for story, status, and assignee.
 * Displays tasks in a table format with key information.
 */
taskCommand
  .command('list')
  .description('List tasks')
  .option('-s, --story <code>', 'Filter by story code (e.g., NOTIFY-001)')
  .option('--status <status>', 'Filter by status (pending, in_progress, blocked, completed, cancelled)')
  .option('-a, --assigned-to <actor>', 'Filter by assignee')
  .action(async (options) => {
    verbose('Listing tasks');

    // Build filters
    let storyId: string | undefined;
    let storyMap: Map<string, Story> = new Map();

    // If filtering by story code, look it up
    if (options.story) {
      const story = storyRepository.findByCode(options.story);
      if (!story) {
        error(`Story not found: ${options.story}`);
        process.exit(1);
      }
      storyId = story.id;
      storyMap.set(story.id, story);
      verbose(`Filtering by story: ${story.id}`);
    }

    // Validate status if provided
    if (options.status && !VALID_STATUSES.includes(options.status as TaskStatus)) {
      error(`Invalid status: ${options.status}. Valid values: ${VALID_STATUSES.join(', ')}`);
      process.exit(1);
    }

    try {
      const tasks = taskRepository.findAll({
        storyId,
        status: options.status as TaskStatus | undefined,
        assignedTo: options.assignedTo,
      });

      // Build story map for tasks we don't already have
      const missingStoryIds = new Set<string>();
      for (const task of tasks) {
        if (!storyMap.has(task.storyId)) {
          missingStoryIds.add(task.storyId);
        }
      }

      for (const sid of missingStoryIds) {
        const story = storyRepository.findById(sid);
        if (story) {
          storyMap.set(sid, story);
        }
      }

      if (getOutputFormat() === 'json') {
        output(tasks);
      } else {
        if (tasks.length === 0) {
          output('No tasks found');
          return;
        }

        const formatted: Record<string, unknown>[] = [];
        for (const task of tasks) {
          formatted.push(formatTaskForTable(task, storyMap.get(task.storyId)));
        }

        output(
          formatted,
          ['id', 'title', 'status', 'priority', 'assignedTo', 'storyCode'],
          {
            headers: {
              id: 'ID',
              title: 'TITLE',
              status: 'STATUS',
              priority: 'PRIORITY',
              assignedTo: 'ASSIGNED TO',
              storyCode: 'STORY',
            },
          }
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(`Failed to list tasks: ${message}`);
      process.exit(1);
    }
  });

/**
 * Show task subcommand
 *
 * Displays detailed information about a specific task.
 * Task can be identified by its full ID or partial ID (first 8 chars).
 */
taskCommand
  .command('show <id>')
  .description('Show task details (accepts full ID or short prefix)')
  .action(async (id: string) => {
    verbose(`Showing task: ${id}`);

    try {
      const task = findTaskByPartialId(id);
      const story = storyRepository.findById(task.storyId);

      if (getOutputFormat() === 'json') {
        output(task);
      } else {
        output(formatTaskDetails(task, story));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(`Failed to show task: ${message}`);
      process.exit(1);
    }
  });

/**
 * Update task subcommand
 *
 * Updates task fields. Supports partial updates (any combination of fields).
 * If status is changing, emits task:status-changed event.
 *
 * @emits task:updated - When non-status fields change
 * @emits task:status-changed - When status changes
 */
taskCommand
  .command('update <id>')
  .description('Update a task')
  .option('-t, --title <title>', 'Update title')
  .option('-d, --description <desc>', 'Update description')
  .option('-s, --status <status>', 'Update status')
  .option('-a, --assigned-to <actor>', 'Update assignee (use empty string to clear)')
  .option('-p, --priority <priority>', 'Update priority (P0-P3)')
  .action(async (id: string, options) => {
    verbose(`Updating task: ${id}`);

    try {
      // Find task by partial ID
      const beforeTask = findTaskByPartialId(id);
      const taskId = beforeTask.id;

      verbose(`Found task: ${taskId} (${beforeTask.title})`);

      // Build update input from options
      const updateInput: UpdateTaskInput = {};
      let hasUpdates = false;

      if (options.title !== undefined) {
        updateInput.title = options.title;
        hasUpdates = true;
      }

      if (options.description !== undefined) {
        updateInput.description = options.description;
        hasUpdates = true;
      }

      if (options.priority !== undefined) {
        updateInput.priority = validatePriority(options.priority);
        hasUpdates = true;
      }

      if (options.assignedTo !== undefined) {
        // Allow empty string to clear assignee
        updateInput.assignedTo = options.assignedTo || null;
        hasUpdates = true;
      }

      if (!hasUpdates && options.status === undefined) {
        warn('No update options provided. Use --help to see available options.');
        return;
      }

      let updatedTask: Task;

      // If status is changing, use updateStatus() for specific event
      if (options.status !== undefined) {
        const newStatus = validateStatus(options.status);

        // If there are other updates, do them first
        if (hasUpdates) {
          taskRepository.update(taskId, updateInput);
        }

        // Then update status (emits task:status-changed event)
        updatedTask = taskRepository.updateStatus(taskId, newStatus);
      } else {
        // Just regular update
        updatedTask = taskRepository.update(taskId, updateInput);
      }

      if (getOutputFormat() === 'json') {
        output({
          before: beforeTask,
          after: updatedTask,
        });
      } else {
        success(`Task updated: ${taskId.slice(0, 8)}`);

        if (isVerbose()) {
          console.log(formatTaskDiff(beforeTask, updatedTask));
        }

        // Get story for context
        const story = storyRepository.findById(updatedTask.storyId);
        output(formatTaskDetails(updatedTask, story));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(`Failed to update task: ${message}`);
      process.exit(1);
    }
  });

/**
 * Status shortcut command
 *
 * Quick status update: `board task status abc123 completed`
 * Uses updateStatus() method which emits task:status-changed event.
 *
 * AC Coverage: AC-003 (LOOM-003) - Soft validation for mini-retrospectives
 *
 * @emits task:status-changed
 */
taskCommand
  .command('status <id> <status>')
  .description('Quick status update (shortcut for update --status)')
  .action(async (id: string, status: string) => {
    verbose(`Updating status for task: ${id} to ${status}`);

    try {
      const beforeTask = findTaskByPartialId(id);
      const taskId = beforeTask.id;
      const newStatus = validateStatus(status);

      verbose(`Found task: ${taskId} (${beforeTask.title})`);

      // AC-003 (LOOM-003): Soft validation for mini-retrospectives when completing tasks
      if (newStatus === TaskStatus.COMPLETED && beforeTask.status !== TaskStatus.COMPLETED) {
        const taskNotes = noteRepository.findByEntity('task', taskId);
        const hasRetroNote = taskNotes.some(note =>
          note.content.toLowerCase().includes('retrospective') ||
          note.content.toLowerCase().includes('retro') ||
          note.content.toLowerCase().includes('learnings') ||
          note.content.toLowerCase().includes('what went well') ||
          note.content.toLowerCase().includes('improvement')
        );

        if (!hasRetroNote) {
          warn('');
          warn('⚠️  Mini-Retrospective Missing');
          warn('   This task has no retrospective notes. Consider adding learnings:');
          warn(`   board note add -t task -i ${taskId.slice(0, 8)} -c "Retrospective: ..."`);
          warn('');
        }
      }

      const updatedTask = taskRepository.updateStatus(taskId, newStatus);

      if (getOutputFormat() === 'json') {
        output({
          before: { id: beforeTask.id, status: beforeTask.status },
          after: { id: updatedTask.id, status: updatedTask.status },
        });
      } else {
        if (beforeTask.status === updatedTask.status) {
          info(`Task ${taskId.slice(0, 8)} status unchanged (already ${updatedTask.status})`);
        } else {
          success(`Task ${taskId.slice(0, 8)} status: ${beforeTask.status} -> ${updatedTask.status}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(`Failed to update task status: ${message}`);
      process.exit(1);
    }
  });

/**
 * Delete task subcommand
 *
 * Deletes a task. Requires --force flag for confirmation.
 * Shows task details before deletion for verification.
 *
 * @emits task:deleted
 */
taskCommand
  .command('delete <id>')
  .description('Delete a task')
  .option('-f, --force', 'Skip confirmation', false)
  .action(async (id: string, options) => {
    verbose(`Deleting task: ${id}`);

    try {
      const task = findTaskByPartialId(id);
      const taskId = task.id;

      verbose(`Found task: ${taskId} (${task.title})`);

      // Show task details before deletion
      if (!options.force) {
        console.log('About to delete task:');
        console.log(`  ID: ${taskId}`);
        console.log(`  Title: ${task.title}`);
        console.log(`  Status: ${task.status}`);
        console.log(`  Story: ${task.storyId.slice(0, 8)}`);
        console.log('');
        warn('Use --force to confirm deletion.');
        return;
      }

      taskRepository.delete(taskId);

      if (getOutputFormat() === 'json') {
        output({ deleted: true, id: taskId, title: task.title });
      } else {
        success(`Task deleted: ${taskId.slice(0, 8)} (${task.title})`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(`Failed to delete task: ${message}`);
      process.exit(1);
    }
  });

/**
 * Add file to task
 * Tracks which files were modified as part of this task
 */
taskCommand
  .command('add-file <id> <path>')
  .description('Add a file to the task')
  .action((id: string, path: string) => {
    try {
      const task = findTaskByPartialId(id);
      const updated = taskRepository.addFile(task.id, path);

      if (getOutputFormat() === 'json') {
        output(updated);
      } else {
        success(`File added to task ${task.id.slice(0, 8)}: ${path}`);
        output(`  Files: ${updated.files.length}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(message);
      process.exit(1);
    }
  });

/**
 * Remove file from task
 */
taskCommand
  .command('remove-file <id> <path>')
  .description('Remove a file from the task')
  .action((id: string, path: string) => {
    try {
      const task = findTaskByPartialId(id);
      const updated = taskRepository.removeFile(task.id, path);

      if (getOutputFormat() === 'json') {
        output(updated);
      } else {
        success(`File removed from task ${task.id.slice(0, 8)}: ${path}`);
        output(`  Files: ${updated.files.length}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(message);
      process.exit(1);
    }
  });

/**
 * List files for a task
 */
taskCommand
  .command('files <id>')
  .description('List files for a task')
  .action((id: string) => {
    try {
      const task = findTaskByPartialId(id);

      if (getOutputFormat() === 'json') {
        output({ taskId: task.id, files: task.files });
      } else if (task.files.length === 0) {
        output(`No files tracked for task ${task.id.slice(0, 8)}`);
      } else {
        output(`Files for task ${task.id.slice(0, 8)} (${task.files.length}):`);
        for (const file of task.files) {
          output(`  ${file}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(message);
      process.exit(1);
    }
  });

/**
 * Capture git-modified files for a task
 * Automatically adds all staged and modified files from git status
 */
taskCommand
  .command('capture-files <id>')
  .description('Capture modified files from git status')
  .action((id: string) => {
    try {
      const task = findTaskByPartialId(id);
      const before = task.files.length;
      const updated = taskRepository.captureGitFiles(task.id);
      const added = updated.files.length - before;

      if (getOutputFormat() === 'json') {
        output(updated);
      } else {
        success(`Captured ${added} new file(s) for task ${task.id.slice(0, 8)}`);
        output(`  Total files: ${updated.files.length}`);
        if (added > 0) {
          output(`  New files:`);
          const newFiles = updated.files.slice(before);
          for (const file of newFiles) {
            output(`    ${file}`);
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(message);
      process.exit(1);
    }
  });

/**
 * Set reference link for a task
 * Links to prior art, patterns, documentation, etc.
 */
taskCommand
  .command('set-ref <id> [url]')
  .description('Set a reference link for the task (omit url to clear)')
  .action((id: string, url?: string) => {
    try {
      const task = findTaskByPartialId(id);
      const updated = taskRepository.setReference(task.id, url || null);

      if (getOutputFormat() === 'json') {
        output(updated);
      } else if (url) {
        success(`Reference set for task ${task.id.slice(0, 8)}`);
        output(`  ${url}`);
      } else {
        success(`Reference cleared for task ${task.id.slice(0, 8)}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(message);
      process.exit(1);
    }
  });

/**
 * Bulk status update command
 *
 * Update multiple tasks at once: `board task bulk-status completed abc123 def456 ghi789`
 * Useful for marking multiple tasks complete after a batch of work.
 *
 * @emits task:status-changed for each task
 */
taskCommand
  .command('bulk-status <status> <ids...>')
  .description('Update status for multiple tasks at once')
  .action(async (status: string, ids: string[]) => {
    verbose(`Bulk updating ${ids.length} tasks to status: ${status}`);

    const newStatus = validateStatus(status);
    const results: { id: string; title: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        const task = findTaskByPartialId(id);
        taskRepository.updateStatus(task.id, newStatus);
        results.push({ id: task.id.slice(0, 8), title: task.title, success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ id, title: '(unknown)', success: false, error: message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    if (getOutputFormat() === 'json') {
      output({ status: newStatus, results, successCount, failCount });
    } else {
      if (successCount > 0) {
        success(`Updated ${successCount} task(s) to ${newStatus}:`);
        for (const r of results.filter((r) => r.success)) {
          output(`  ✓ ${r.id} - ${r.title}`);
        }
      }

      if (failCount > 0) {
        warn(`Failed to update ${failCount} task(s):`);
        for (const r of results.filter((r) => !r.success)) {
          output(`  ✗ ${r.id}: ${r.error}`);
        }
      }
    }

    if (failCount > 0) {
      process.exit(1);
    }
  });

/**
 * Effort report subcommand
 * Shows estimation accuracy metrics for completed tasks
 */
taskCommand
  .command('effort-report')
  .description('Show effort estimation accuracy metrics for completed tasks')
  .option('-s, --story <code>', 'Filter by story code')
  .action((options) => {
    verbose('Generating effort report');

    try {
      // Get story ID if filtering by story code
      let storyId: string | undefined;
      if (options.story) {
        const story = storyRepository.findByCode(options.story);
        if (!story) {
          error(`Story not found: ${options.story}`);
          process.exit(1);
        }
        storyId = story.id;
      }

      // Get all completed tasks (with optional story filter)
      const allTasks = taskRepository.findAll({
        status: TaskStatus.COMPLETED,
        storyId,
      });

      // Filter to tasks with both estimated and actual effort
      const tasksWithEffort = allTasks.filter(
        (t) => t.estimatedEffort !== null && t.actualEffort !== null
      );

      if (tasksWithEffort.length === 0) {
        if (getOutputFormat() === 'json') {
          output({
            count: 0,
            message: 'No completed tasks with effort data found',
            tasks: [],
          });
        } else {
          output('No completed tasks with effort data found.');
          output('Tasks need both estimatedEffort and actualEffort to appear in this report.');
        }
        return;
      }

      // Calculate metrics
      const ratios: number[] = [];
      const taskData: Array<{
        id: string;
        title: string;
        estimated: number;
        actual: number;
        ratio: number;
        unit: string;
      }> = [];

      for (const task of tasksWithEffort) {
        const ratio = task.actualEffort! / task.estimatedEffort!;
        ratios.push(ratio);
        taskData.push({
          id: task.id.slice(0, 8),
          title: task.title.length > 40 ? task.title.slice(0, 37) + '...' : task.title,
          estimated: task.estimatedEffort!,
          actual: task.actualEffort!,
          ratio: Math.round(ratio * 100) / 100, // 2 decimal places
          unit: task.effortUnit || 'hours',
        });
      }

      const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      const minRatio = Math.min(...ratios);
      const maxRatio = Math.max(...ratios);

      if (getOutputFormat() === 'json') {
        output({
          count: tasksWithEffort.length,
          averageRatio: Math.round(avgRatio * 100) / 100,
          minRatio: Math.round(minRatio * 100) / 100,
          maxRatio: Math.round(maxRatio * 100) / 100,
          calibrationFactor: Math.round(avgRatio * 100) / 100,
          interpretation: avgRatio > 1
            ? `Estimates are ${Math.round((avgRatio - 1) * 100)}% optimistic on average`
            : `Estimates are ${Math.round((1 - avgRatio) * 100)}% pessimistic on average`,
          tasks: taskData,
        });
      } else {
        output('\n=== Effort Calibration Report ===\n');
        output(`Tasks analyzed: ${tasksWithEffort.length}`);
        output(`Average ratio (actual/estimated): ${avgRatio.toFixed(2)}x`);
        output(`Range: ${minRatio.toFixed(2)}x - ${maxRatio.toFixed(2)}x`);
        output('');

        if (avgRatio > 1) {
          info(`Interpretation: Estimates are ${Math.round((avgRatio - 1) * 100)}% optimistic on average`);
          info(`When Claude estimates 1 hour, expect ~${avgRatio.toFixed(1)} hours`);
        } else {
          info(`Interpretation: Estimates are ${Math.round((1 - avgRatio) * 100)}% pessimistic on average`);
          info(`When Claude estimates 1 hour, expect ~${avgRatio.toFixed(1)} hours`);
        }

        output('\n--- Task Details ---\n');
        output(
          taskData,
          ['id', 'title', 'estimated', 'actual', 'ratio', 'unit'],
          {
            headers: {
              id: 'ID',
              title: 'TITLE',
              estimated: 'EST',
              actual: 'ACT',
              ratio: 'RATIO',
              unit: 'UNIT',
            },
          }
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error(`Failed to generate effort report: ${message}`);
      process.exit(1);
    }
  });
