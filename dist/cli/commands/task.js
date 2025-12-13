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
import { taskRepository, storyRepository } from '../../repositories';
import { output, success, error, verbose, warn, info, formatStatus, formatPriority, getOutputFormat, isVerbose, } from '../utils/output';
import { TaskStatus, Priority } from '../../types';
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
function formatTaskForTable(task, story) {
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
function formatTaskDetails(task, story) {
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
function findTaskByPartialId(partialId) {
    // First try exact match
    const exactMatch = taskRepository.findById(partialId);
    if (exactMatch) {
        return exactMatch;
    }
    // Try partial match
    const allTasks = taskRepository.findAll();
    const matches = [];
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
function validateStatus(status) {
    // Allow dash-separated format (e.g., in-progress -> in_progress)
    const normalized = status.toLowerCase().replace(/-/g, '_');
    if (!VALID_STATUSES.includes(normalized)) {
        throw new Error(`Invalid status: ${status}. Valid values: ${VALID_STATUSES.join(', ')}`);
    }
    return normalized;
}
/**
 * Validate and normalize priority value
 */
function validatePriority(priority) {
    const normalized = priority.toUpperCase();
    if (!VALID_PRIORITIES.includes(normalized)) {
        throw new Error(`Invalid priority: ${priority}. Valid values: ${VALID_PRIORITIES.join(', ')}`);
    }
    return normalized;
}
/**
 * Format a task diff for verbose output (before/after comparison)
 */
function formatTaskDiff(before, after) {
    const lines = ['Changes:'];
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
    .action(async (options) => {
    verbose(`Creating task for story: ${options.story}`);
    // Validate status
    if (!VALID_STATUSES.includes(options.status)) {
        error(`Invalid status: ${options.status}. Valid values: ${VALID_STATUSES.join(', ')}`);
        process.exit(1);
    }
    // Validate priority
    if (!VALID_PRIORITIES.includes(options.priority)) {
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
    try {
        const task = taskRepository.create({
            storyId: story.id,
            title: options.title,
            description: options.description,
            status: options.status,
            priority: options.priority,
            assignedTo: options.assignedTo || null,
            estimatedComplexity: options.complexity,
        });
        if (getOutputFormat() === 'json') {
            output(task);
        }
        else {
            success(`Task created: ${task.id.slice(0, 8)}`);
            output(formatTaskDetails(task, story));
        }
    }
    catch (err) {
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
    let storyId;
    let storyMap = new Map();
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
    if (options.status && !VALID_STATUSES.includes(options.status)) {
        error(`Invalid status: ${options.status}. Valid values: ${VALID_STATUSES.join(', ')}`);
        process.exit(1);
    }
    try {
        const tasks = taskRepository.findAll({
            storyId,
            status: options.status,
            assignedTo: options.assignedTo,
        });
        // Build story map for tasks we don't already have
        const missingStoryIds = new Set();
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
        }
        else {
            if (tasks.length === 0) {
                output('No tasks found');
                return;
            }
            const formatted = [];
            for (const task of tasks) {
                formatted.push(formatTaskForTable(task, storyMap.get(task.storyId)));
            }
            output(formatted, ['id', 'title', 'status', 'priority', 'assignedTo', 'storyCode'], {
                headers: {
                    id: 'ID',
                    title: 'TITLE',
                    status: 'STATUS',
                    priority: 'PRIORITY',
                    assignedTo: 'ASSIGNED TO',
                    storyCode: 'STORY',
                },
            });
        }
    }
    catch (err) {
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
    .description('Show task details')
    .action(async (id) => {
    verbose(`Showing task: ${id}`);
    try {
        // Try to find by exact ID first
        let task = taskRepository.findById(id);
        // If not found and id is short, search through all tasks
        if (!task && id.length < 36) {
            const allTasks = taskRepository.findAll();
            for (const t of allTasks) {
                if (t.id.startsWith(id)) {
                    task = t;
                    break;
                }
            }
        }
        if (!task) {
            error(`Task not found: ${id}`);
            process.exit(1);
        }
        // Get the story for context
        const story = storyRepository.findById(task.storyId);
        if (getOutputFormat() === 'json') {
            output(task);
        }
        else {
            output(formatTaskDetails(task, story));
        }
    }
    catch (err) {
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
    .action(async (id, options) => {
    verbose(`Updating task: ${id}`);
    try {
        // Find task by partial ID
        const beforeTask = findTaskByPartialId(id);
        const taskId = beforeTask.id;
        verbose(`Found task: ${taskId} (${beforeTask.title})`);
        // Build update input from options
        const updateInput = {};
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
        let updatedTask;
        // If status is changing, use updateStatus() for specific event
        if (options.status !== undefined) {
            const newStatus = validateStatus(options.status);
            // If there are other updates, do them first
            if (hasUpdates) {
                taskRepository.update(taskId, updateInput);
            }
            // Then update status (emits task:status-changed event)
            updatedTask = taskRepository.updateStatus(taskId, newStatus);
        }
        else {
            // Just regular update
            updatedTask = taskRepository.update(taskId, updateInput);
        }
        if (getOutputFormat() === 'json') {
            output({
                before: beforeTask,
                after: updatedTask,
            });
        }
        else {
            success(`Task updated: ${taskId.slice(0, 8)}`);
            if (isVerbose()) {
                console.log(formatTaskDiff(beforeTask, updatedTask));
            }
            // Get story for context
            const story = storyRepository.findById(updatedTask.storyId);
            output(formatTaskDetails(updatedTask, story));
        }
    }
    catch (err) {
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
 * @emits task:status-changed
 */
taskCommand
    .command('status <id> <status>')
    .description('Quick status update (shortcut for update --status)')
    .action(async (id, status) => {
    verbose(`Updating status for task: ${id} to ${status}`);
    try {
        const beforeTask = findTaskByPartialId(id);
        const taskId = beforeTask.id;
        const newStatus = validateStatus(status);
        verbose(`Found task: ${taskId} (${beforeTask.title})`);
        const updatedTask = taskRepository.updateStatus(taskId, newStatus);
        if (getOutputFormat() === 'json') {
            output({
                before: { id: beforeTask.id, status: beforeTask.status },
                after: { id: updatedTask.id, status: updatedTask.status },
            });
        }
        else {
            if (beforeTask.status === updatedTask.status) {
                info(`Task ${taskId.slice(0, 8)} status unchanged (already ${updatedTask.status})`);
            }
            else {
                success(`Task ${taskId.slice(0, 8)} status: ${beforeTask.status} -> ${updatedTask.status}`);
            }
        }
    }
    catch (err) {
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
    .action(async (id, options) => {
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
        }
        else {
            success(`Task deleted: ${taskId.slice(0, 8)} (${task.title})`);
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Failed to delete task: ${message}`);
        process.exit(1);
    }
});
