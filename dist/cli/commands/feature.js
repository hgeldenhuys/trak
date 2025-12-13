/**
 * Feature CLI Commands
 *
 * Provides CRUD operations for Feature entities via the CLI.
 * Features are containers for stories.
 */
import { Command } from 'commander';
import { featureRepository, storyRepository } from '../../repositories';
import { output, success, error, info, formatTable, formatStatus, getOutputFormat, } from '../utils/output';
import * as readline from 'readline';
/**
 * Prompt user for confirmation
 * @param message - The confirmation message
 * @returns Promise resolving to true if user confirms
 */
async function confirm(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(`${message} (y/N): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}
/**
 * Feature command group
 */
export const featureCommand = new Command('feature')
    .description('Manage features');
/**
 * CREATE - Create a new feature
 */
featureCommand
    .command('create')
    .description('Create a new feature')
    .requiredOption('-c, --code <code>', 'Feature code (e.g., NOTIFY)')
    .requiredOption('-n, --name <name>', 'Feature name')
    .option('-d, --description <desc>', 'Feature description', '')
    .action(async (options) => {
    try {
        // Validate code format (uppercase alphanumeric)
        const code = options.code.toUpperCase();
        if (!/^[A-Z][A-Z0-9_-]*$/.test(code)) {
            error('Feature code must start with a letter and contain only uppercase letters, numbers, underscores, or hyphens');
            process.exit(1);
        }
        // Check if feature already exists
        const existing = featureRepository.findByCode(code);
        if (existing) {
            error(`Feature with code '${code}' already exists`);
            process.exit(1);
        }
        const feature = featureRepository.create({
            code: code,
            name: options.name,
            description: options.description,
        });
        if (getOutputFormat() === 'json') {
            output(feature);
        }
        else {
            success(`Created feature: ${feature.code}`);
            output({
                Code: feature.code,
                Name: feature.name,
                Description: feature.description || '(none)',
                'Story Count': feature.storyCounter,
                Created: feature.createdAt,
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
 * LIST - List all features
 */
featureCommand
    .command('list')
    .description('List all features')
    .action(async () => {
    try {
        const features = featureRepository.findAll();
        if (features.length === 0) {
            info('No features found. Create one with: board feature create -c CODE -n "Name"');
            return;
        }
        // Add story count to output
        const featuresWithCounts = [];
        for (const feature of features) {
            const stories = storyRepository.findByFeatureId(feature.id);
            featuresWithCounts.push({
                code: feature.code,
                name: feature.name,
                storyCount: stories.length,
                description: feature.description || '',
            });
        }
        output(featuresWithCounts, ['code', 'name', 'storyCount', 'description'], {
            headers: {
                code: 'CODE',
                name: 'NAME',
                storyCount: 'STORIES',
                description: 'DESCRIPTION',
            },
            maxWidth: 50,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
    }
});
/**
 * SHOW - Show feature details with stories
 */
featureCommand
    .command('show <code>')
    .description('Show feature details with stories')
    .action(async (code) => {
    try {
        const feature = featureRepository.findByCode(code.toUpperCase());
        if (!feature) {
            error(`Feature not found: ${code}`);
            process.exit(1);
        }
        // Get stories for this feature
        const stories = storyRepository.findByFeatureId(feature.id);
        if (getOutputFormat() === 'json') {
            output({
                ...feature,
                stories,
            });
            return;
        }
        // Display feature info
        console.log('');
        info(`Feature: ${feature.code}`);
        console.log(`Name: ${feature.name}`);
        console.log(`Description: ${feature.description || '(none)'}`);
        console.log(`Stories: ${stories.length}`);
        console.log(`Created: ${feature.createdAt}`);
        console.log(`Updated: ${feature.updatedAt}`);
        // Display stories table if any exist
        if (stories.length > 0) {
            console.log('');
            info('Stories:');
            const storyRows = [];
            for (const story of stories) {
                storyRows.push({
                    code: story.code,
                    title: story.title,
                    status: formatStatus(story.status),
                });
            }
            console.log(formatTable(storyRows, ['code', 'title', 'status'], {
                headers: {
                    code: 'Code',
                    title: 'Title',
                    status: 'Status',
                },
                maxWidth: 40,
            }));
        }
        else {
            console.log('');
            info('No stories yet. Create one with: board story create --feature ' + feature.code + ' -t "Title"');
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
    }
});
/**
 * UPDATE - Update a feature
 */
featureCommand
    .command('update <code>')
    .description('Update a feature')
    .option('-n, --name <name>', 'New feature name')
    .option('-d, --description <desc>', 'New feature description')
    .action(async (code, options) => {
    try {
        const feature = featureRepository.findByCode(code.toUpperCase());
        if (!feature) {
            error(`Feature not found: ${code}`);
            process.exit(1);
        }
        // Check if any updates provided
        if (!options.name && options.description === undefined) {
            error('No updates provided. Use -n for name or -d for description.');
            process.exit(1);
        }
        const updateInput = {};
        if (options.name)
            updateInput.name = options.name;
        if (options.description !== undefined)
            updateInput.description = options.description;
        const updated = featureRepository.update(feature.id, updateInput);
        if (getOutputFormat() === 'json') {
            output(updated);
        }
        else {
            success(`Updated feature: ${updated.code}`);
            output({
                Code: updated.code,
                Name: updated.name,
                Description: updated.description || '(none)',
                Updated: updated.updatedAt,
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
 * DELETE - Delete a feature
 */
featureCommand
    .command('delete <code>')
    .description('Delete a feature (cascades to stories and tasks)')
    .option('-f, --force', 'Skip confirmation')
    .action(async (code, options) => {
    try {
        const feature = featureRepository.findByCode(code.toUpperCase());
        if (!feature) {
            error(`Feature not found: ${code}`);
            process.exit(1);
        }
        // Get story count for warning
        const stories = storyRepository.findByFeatureId(feature.id);
        const storyCount = stories.length;
        // Confirm deletion unless --force
        if (!options.force) {
            const warningMsg = storyCount > 0
                ? `Delete feature '${feature.code}' and its ${storyCount} stories? This cannot be undone.`
                : `Delete feature '${feature.code}'? This cannot be undone.`;
            const confirmed = await confirm(warningMsg);
            if (!confirmed) {
                info('Deletion cancelled.');
                return;
            }
        }
        featureRepository.delete(feature.id);
        if (getOutputFormat() === 'json') {
            output({ deleted: true, code: feature.code, storiesDeleted: storyCount });
        }
        else {
            success(`Deleted feature: ${feature.code}`);
            if (storyCount > 0) {
                info(`Also deleted ${storyCount} stories and their tasks.`);
            }
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
    }
});
