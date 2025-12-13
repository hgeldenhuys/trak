/**
 * Story CLI Command - Manage stories in the board system
 *
 * Provides subcommands for creating, viewing, listing, and managing stories.
 * Stories are units of work that belong to features and contain tasks.
 */
import { Command } from 'commander';
import { storyRepository, featureRepository, taskRepository, acceptanceCriteriaRepository, } from '../../repositories';
import { output, success, error, formatStatus, formatPriority, formatTable, getOutputFormat, } from '../utils/output';
import { StoryStatus, Priority } from '../../types';
/**
 * Valid story status values for validation
 */
const VALID_STATUSES = [
    StoryStatus.DRAFT,
    StoryStatus.PLANNED,
    StoryStatus.IN_PROGRESS,
    StoryStatus.REVIEW,
    StoryStatus.COMPLETED,
    StoryStatus.CANCELLED,
];
/**
 * Valid priority values for validation
 */
const VALID_PRIORITIES = [
    Priority.P0,
    Priority.P1,
    Priority.P2,
    Priority.P3,
];
/**
 * Create story command group - manages story entities
 * Returns a new Command instance each time to support multiple program instances
 */
export function createStoryCommand() {
    const storyCommand = new Command('story')
        .description('Manage stories');
    /**
     * board story create - Create a new story
     *
     * Required options:
     * - --feature, -f: Feature code (e.g., NOTIFY)
     * - --title, -t: Story title
     *
     * Optional options:
     * - --description, -d: Story description
     * - --why, -w: Why this story is needed
     * - --status, -s: Initial status (default: draft)
     * - --priority, -p: Priority level (default: P1)
     */
    storyCommand
        .command('create')
        .description('Create a new story')
        .requiredOption('-f, --feature <code>', 'Feature code (e.g., NOTIFY)')
        .requiredOption('-t, --title <title>', 'Story title')
        .option('-d, --description <desc>', 'Story description', '')
        .option('-w, --why <why>', 'Why this story is needed', '')
        .option('-s, --status <status>', 'Initial status', 'draft')
        .option('-p, --priority <priority>', 'Priority (P0-P3)', 'P1')
        .action(async (options) => {
        try {
            // 1. Look up feature by code
            const feature = featureRepository.findByCode(options.feature);
            if (!feature) {
                error(`Feature not found: ${options.feature}`);
                process.exit(1);
            }
            // 2. Validate status
            const status = options.status.toLowerCase().replace(/-/g, '_');
            if (!VALID_STATUSES.includes(status)) {
                error(`Invalid status: ${options.status}. Valid values: ${VALID_STATUSES.join(', ')}`);
                process.exit(1);
            }
            // 3. Validate priority
            const priority = options.priority.toUpperCase();
            if (!VALID_PRIORITIES.includes(priority)) {
                error(`Invalid priority: ${options.priority}. Valid values: ${VALID_PRIORITIES.join(', ')}`);
                process.exit(1);
            }
            // 4. Create story (repository auto-generates code)
            const story = storyRepository.create({
                featureId: feature.id,
                title: options.title,
                description: options.description,
                why: options.why,
                status,
                priority,
            });
            // 5. Output result
            if (getOutputFormat() === 'json') {
                output(story);
            }
            else {
                success(`Story created: ${story.code}`);
                output({
                    Code: story.code,
                    Title: story.title,
                    Feature: feature.code,
                    Status: story.status,
                    Priority: story.priority,
                    Description: story.description || '(none)',
                    Why: story.why || '(none)',
                });
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            error(message);
            process.exit(1);
        }
    });
    /**
     * board story show <code> - Display full story details
     *
     * Shows complete story information including:
     * - Basic info (code, title, status, priority)
     * - Description and why
     * - Acceptance criteria
     * - Tasks
     */
    storyCommand
        .command('show <code>')
        .description('Show full story details including ACs and tasks')
        .action(async (code) => {
        try {
            // Find story by code
            const story = storyRepository.findByCode(code.toUpperCase());
            if (!story) {
                error(`Story not found: ${code}`);
                process.exit(1);
            }
            // Get feature for display
            const feature = featureRepository.findById(story.featureId);
            // Get acceptance criteria
            const criteria = acceptanceCriteriaRepository.findByStoryId(story.id);
            // Get tasks
            const tasks = taskRepository.findByStoryId(story.id);
            if (getOutputFormat() === 'json') {
                output({
                    ...story,
                    feature: feature ? { code: feature.code, name: feature.name } : null,
                    acceptanceCriteria: criteria,
                    tasks,
                });
            }
            else {
                // Display story header
                console.log('');
                console.log(`\x1b[1m${story.code}: ${story.title}\x1b[0m`);
                console.log(`${'='.repeat(60)}`);
                console.log('');
                // Basic info
                console.log(`\x1b[1mFeature:\x1b[0m    ${feature?.code ?? 'Unknown'} - ${feature?.name ?? ''}`);
                console.log(`\x1b[1mStatus:\x1b[0m     ${formatStatus(story.status)}`);
                console.log(`\x1b[1mPriority:\x1b[0m   ${formatPriority(story.priority)}`);
                if (story.assignedTo) {
                    console.log(`\x1b[1mAssigned:\x1b[0m   ${story.assignedTo}`);
                }
                console.log('');
                // Description
                if (story.description) {
                    console.log(`\x1b[1mDescription:\x1b[0m`);
                    console.log(`  ${story.description}`);
                    console.log('');
                }
                // Why
                if (story.why) {
                    console.log(`\x1b[1mWhy:\x1b[0m`);
                    console.log(`  ${story.why}`);
                    console.log('');
                }
                // Acceptance Criteria
                console.log(`\x1b[1mAcceptance Criteria:\x1b[0m (${criteria.length})`);
                if (criteria.length === 0) {
                    console.log('  (none defined)');
                }
                else {
                    for (const ac of criteria) {
                        const statusIcon = ac.status === 'verified' ? '\x1b[32m[x]\x1b[0m' :
                            ac.status === 'failed' ? '\x1b[31m[-]\x1b[0m' :
                                '\x1b[90m[ ]\x1b[0m';
                        console.log(`  ${statusIcon} ${ac.code}: ${ac.description}`);
                    }
                }
                console.log('');
                // Tasks
                console.log(`\x1b[1mTasks:\x1b[0m (${tasks.length})`);
                if (tasks.length === 0) {
                    console.log('  (none defined)');
                }
                else {
                    const taskRows = tasks.map((t) => ({
                        order: t.order,
                        status: t.status,
                        priority: t.priority,
                        title: t.title,
                        assignedTo: t.assignedTo || '-',
                    }));
                    console.log(formatTable(taskRows, ['order', 'status', 'priority', 'title', 'assignedTo'], {
                        headers: {
                            order: '#',
                            status: 'STATUS',
                            priority: 'PRI',
                            title: 'TITLE',
                            assignedTo: 'ASSIGNED',
                        },
                        maxWidth: 30,
                    }));
                }
                console.log('');
                // Timestamps
                console.log(`\x1b[90mCreated: ${story.createdAt}\x1b[0m`);
                console.log(`\x1b[90mUpdated: ${story.updatedAt}\x1b[0m`);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            error(message);
            process.exit(1);
        }
    });
    /**
     * board story list - List stories with optional filters
     */
    storyCommand
        .command('list')
        .description('List stories')
        .option('-f, --feature <code>', 'Filter by feature code')
        .option('-s, --status <status>', 'Filter by status')
        .action(async (options) => {
        try {
            // Build filters
            const filters = {};
            if (options.feature) {
                const feature = featureRepository.findByCode(options.feature);
                if (!feature) {
                    error(`Feature not found: ${options.feature}`);
                    process.exit(1);
                }
                filters.featureId = feature.id;
            }
            if (options.status) {
                const status = options.status.toLowerCase().replace(/-/g, '_');
                if (!VALID_STATUSES.includes(status)) {
                    error(`Invalid status: ${options.status}. Valid values: ${VALID_STATUSES.join(', ')}`);
                    process.exit(1);
                }
                filters.status = status;
            }
            // Fetch stories
            const stories = storyRepository.findAll(filters);
            if (getOutputFormat() === 'json') {
                output(stories);
            }
            else {
                if (stories.length === 0) {
                    console.log('No stories found.');
                    return;
                }
                // Get feature codes for display
                const featureMap = new Map();
                const features = featureRepository.findAll();
                for (const f of features) {
                    featureMap.set(f.id, f.code);
                }
                const rows = stories.map((s) => ({
                    code: s.code,
                    title: s.title,
                    status: s.status,
                    priority: s.priority,
                    feature: featureMap.get(s.featureId) || '-',
                }));
                output(rows, ['code', 'title', 'status', 'priority', 'feature'], {
                    headers: {
                        code: 'CODE',
                        title: 'TITLE',
                        status: 'STATUS',
                        priority: 'PRI',
                        feature: 'FEATURE',
                    },
                    maxWidth: 40,
                });
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            error(message);
            process.exit(1);
        }
    });
    /**
     * board story update <code> - Update a story
     */
    storyCommand
        .command('update <code>')
        .description('Update a story')
        .option('-t, --title <title>', 'New title')
        .option('-d, --description <desc>', 'New description')
        .option('-w, --why <why>', 'New why')
        .option('-s, --status <status>', 'New status')
        .option('-p, --priority <priority>', 'New priority')
        .option('-a, --assigned-to <actor>', 'Assign to actor')
        .action(async (code, options) => {
        try {
            // Find story
            const story = storyRepository.findByCode(code.toUpperCase());
            if (!story) {
                error(`Story not found: ${code}`);
                process.exit(1);
            }
            // Build update input
            const input = {};
            if (options.title !== undefined) {
                input.title = options.title;
            }
            if (options.description !== undefined) {
                input.description = options.description;
            }
            if (options.why !== undefined) {
                input.why = options.why;
            }
            if (options.status !== undefined) {
                const status = options.status.toLowerCase().replace(/-/g, '_');
                if (!VALID_STATUSES.includes(status)) {
                    error(`Invalid status: ${options.status}. Valid values: ${VALID_STATUSES.join(', ')}`);
                    process.exit(1);
                }
                input.status = status;
            }
            if (options.priority !== undefined) {
                const priority = options.priority.toUpperCase();
                if (!VALID_PRIORITIES.includes(priority)) {
                    error(`Invalid priority: ${options.priority}. Valid values: ${VALID_PRIORITIES.join(', ')}`);
                    process.exit(1);
                }
                input.priority = priority;
            }
            if (options.assignedTo !== undefined) {
                input.assignedTo = options.assignedTo || null;
            }
            // Check if there are any updates
            if (Object.keys(input).length === 0) {
                error('No update options provided');
                process.exit(1);
            }
            // Update story
            const updated = storyRepository.update(story.id, input);
            if (getOutputFormat() === 'json') {
                output(updated);
            }
            else {
                success(`Story updated: ${updated.code}`);
                output({
                    Code: updated.code,
                    Title: updated.title,
                    Status: updated.status,
                    Priority: updated.priority,
                });
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            error(message);
            process.exit(1);
        }
    });
    /**
     * board story delete <code> - Delete a story
     */
    storyCommand
        .command('delete <code>')
        .description('Delete a story')
        .option('--force', 'Skip confirmation')
        .action(async (code, options) => {
        try {
            // Find story
            const story = storyRepository.findByCode(code.toUpperCase());
            if (!story) {
                error(`Story not found: ${code}`);
                process.exit(1);
            }
            // Delete story
            storyRepository.delete(story.id);
            if (getOutputFormat() === 'json') {
                output({ deleted: true, code: story.code, id: story.id });
            }
            else {
                success(`Story deleted: ${story.code}`);
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            error(message);
            process.exit(1);
        }
    });
    return storyCommand;
}
