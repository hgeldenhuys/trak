/**
 * Data Export/Import Commands
 *
 * Provides manual export and import functionality for board data.
 * Enables story history to travel with git repositories without
 * committing binary SQLite files.
 *
 * Usage:
 *   trak export [file]              Export all data to JSON
 *   trak export -o board.json       Export to specific file
 *   trak import board.json          Import from JSON file
 *   trak import board.json --replace  Replace existing records (vs merge)
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { featureRepository } from '../../repositories/feature-repository';
import { storyRepository } from '../../repositories/story-repository';
import { taskRepository } from '../../repositories/task-repository';
import { acceptanceCriteriaRepository } from '../../repositories/criteria-repository';
import { success, error, info, warn } from '../utils/output';
import type { Feature, Story, Task, AcceptanceCriteria } from '../../types';

/**
 * Export data structure
 */
interface BoardExport {
  version: string;
  exportedAt: string;
  source: {
    cwd: string;
    dbPath?: string;
  };
  data: {
    features: Feature[];
    stories: Story[];
    tasks: Task[];
    acceptanceCriteria: AcceptanceCriteria[];
  };
  counts: {
    features: number;
    stories: number;
    tasks: number;
    acceptanceCriteria: number;
  };
}

/**
 * Default export file path
 */
const DEFAULT_EXPORT_PATH = '.board/export.json';

/**
 * Create the data command with export/import subcommands
 */
export function createDataCommand(): Command {
  const dataCmd = new Command('data')
    .description('Export and import board data');

  // Export command
  dataCmd
    .command('export')
    .description('Export all board data to JSON file')
    .argument('[file]', 'Output file path', DEFAULT_EXPORT_PATH)
    .option('-o, --output <file>', 'Output file path (alternative to argument)')
    .option('--pretty', 'Pretty-print JSON output', true)
    .option('--compact', 'Compact JSON output (no pretty-print)')
    .action(async (file: string, options: { output?: string; pretty?: boolean; compact?: boolean }) => {
      const outputPath = resolve(options.output || file);

      try {
        // Ensure output directory exists
        const dir = dirname(outputPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        // Fetch all data
        info('Exporting board data...');

        const features = featureRepository.findAll();
        const stories = storyRepository.findAll();
        const tasks = taskRepository.findAll();
        const acceptanceCriteria: AcceptanceCriteria[] = [];

        // Fetch ACs for each story
        for (const story of stories) {
          const storyAcs = acceptanceCriteriaRepository.findByStoryId(story.id);
          acceptanceCriteria.push(...storyAcs);
        }

        // Build export object
        const exportData: BoardExport = {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          source: {
            cwd: process.cwd(),
            dbPath: process.env.BOARD_DB_PATH,
          },
          data: {
            features,
            stories,
            tasks,
            acceptanceCriteria,
          },
          counts: {
            features: features.length,
            stories: stories.length,
            tasks: tasks.length,
            acceptanceCriteria: acceptanceCriteria.length,
          },
        };

        // Write to file
        const indent = options.compact ? undefined : 2;
        writeFileSync(outputPath, JSON.stringify(exportData, null, indent));

        // Report success
        success(`Exported to: ${outputPath}`);
        info(`  Features: ${features.length}`);
        info(`  Stories: ${stories.length}`);
        info(`  Tasks: ${tasks.length}`);
        info(`  Acceptance Criteria: ${acceptanceCriteria.length}`);
        info(`  Total records: ${features.length + stories.length + tasks.length + acceptanceCriteria.length}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Export failed: ${message}`);
        process.exit(1);
      }
    });

  // Import command
  dataCmd
    .command('import')
    .description('Import board data from JSON file')
    .argument('<file>', 'Input file path')
    .option('--replace', 'Replace existing records (default: merge/upsert)', false)
    .option('--dry-run', 'Show what would be imported without making changes', false)
    .action(async (file: string, options: { replace?: boolean; dryRun?: boolean }) => {
      const inputPath = resolve(file);

      try {
        // Check file exists
        if (!existsSync(inputPath)) {
          error(`File not found: ${inputPath}`);
          process.exit(1);
        }

        // Read and parse file
        info(`Importing from: ${inputPath}`);
        const content = readFileSync(inputPath, 'utf-8');
        const importData: BoardExport = JSON.parse(content);

        // Validate structure
        if (!importData.version || !importData.data) {
          error('Invalid export file format');
          process.exit(1);
        }

        info(`Export version: ${importData.version}`);
        info(`Exported at: ${importData.exportedAt}`);
        info(`Source: ${importData.source.cwd}`);

        if (options.dryRun) {
          warn('DRY RUN - No changes will be made');
        }

        // Track counts
        const counts = {
          features: { created: 0, updated: 0, skipped: 0 },
          stories: { created: 0, updated: 0, skipped: 0 },
          tasks: { created: 0, updated: 0, skipped: 0 },
          acceptanceCriteria: { created: 0, updated: 0, skipped: 0 },
        };

        // Import features first (stories depend on them)
        info('\nImporting features...');
        for (const feature of importData.data.features) {
          const existing = featureRepository.findByCode(feature.code);

          if (existing) {
            if (options.replace) {
              if (!options.dryRun) {
                featureRepository.update(existing.id, {
                  name: feature.name,
                  description: feature.description,
                });
              }
              counts.features.updated++;
            } else {
              counts.features.skipped++;
            }
          } else {
            if (!options.dryRun) {
              featureRepository.create({
                code: feature.code,
                name: feature.name,
                description: feature.description,
              });
            }
            counts.features.created++;
          }
        }

        // Import stories
        info('Importing stories...');
        for (const story of importData.data.stories) {
          const existing = storyRepository.findByCode(story.code);

          if (existing) {
            if (options.replace) {
              if (!options.dryRun) {
                storyRepository.update(existing.id, {
                  title: story.title,
                  description: story.description,
                  why: story.why,
                  status: story.status,
                  priority: story.priority,
                  assignedTo: story.assignedTo,
                  estimatedComplexity: story.estimatedComplexity,
                });
              }
              counts.stories.updated++;
            } else {
              counts.stories.skipped++;
            }
          } else {
            // Find feature by code from the story's feature
            const featureForStory = importData.data.features.find(f => f.id === story.featureId);
            if (featureForStory) {
              const localFeature = featureRepository.findByCode(featureForStory.code);
              if (localFeature && !options.dryRun) {
                storyRepository.create({
                  featureId: localFeature.id,
                  title: story.title,
                  description: story.description,
                  why: story.why,
                  status: story.status,
                  priority: story.priority,
                  assignedTo: story.assignedTo,
                  estimatedComplexity: story.estimatedComplexity,
                  extensions: story.extensions,
                });
              }
            }
            counts.stories.created++;
          }
        }

        // Import tasks
        info('Importing tasks...');
        for (const task of importData.data.tasks) {
          // Find story by looking up in import data then finding local equivalent
          const storyForTask = importData.data.stories.find(s => s.id === task.storyId);
          if (!storyForTask) {
            counts.tasks.skipped++;
            continue;
          }

          const localStory = storyRepository.findByCode(storyForTask.code);
          if (!localStory) {
            counts.tasks.skipped++;
            continue;
          }

          // Check if task already exists (by title + storyId)
          const existingTasks = taskRepository.findByStoryId(localStory.id);
          const existing = existingTasks.find(t => t.title === task.title);

          if (existing) {
            if (options.replace) {
              if (!options.dryRun) {
                taskRepository.update(existing.id, {
                  description: task.description,
                  status: task.status,
                  priority: task.priority,
                  assignedTo: task.assignedTo,
                  order: task.order,
                  dependencies: task.dependencies,
                  acCoverage: task.acCoverage,
                  estimatedComplexity: task.estimatedComplexity,
                  files: task.files,
                  reference: task.reference,
                  estimatedEffort: task.estimatedEffort,
                  actualEffort: task.actualEffort,
                  effortUnit: task.effortUnit,
                  extensions: task.extensions,
                });
              }
              counts.tasks.updated++;
            } else {
              counts.tasks.skipped++;
            }
          } else {
            if (!options.dryRun) {
              taskRepository.create({
                storyId: localStory.id,
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                assignedTo: task.assignedTo,
                order: task.order,
                dependencies: task.dependencies,
                acCoverage: task.acCoverage,
                estimatedComplexity: task.estimatedComplexity,
                files: task.files,
                reference: task.reference,
                estimatedEffort: task.estimatedEffort,
                actualEffort: task.actualEffort,
                effortUnit: task.effortUnit,
                extensions: task.extensions,
              });
            }
            counts.tasks.created++;
          }
        }

        // Import acceptance criteria
        info('Importing acceptance criteria...');
        for (const ac of importData.data.acceptanceCriteria) {
          // Find story by looking up in import data
          const storyForAc = importData.data.stories.find(s => s.id === ac.storyId);
          if (!storyForAc) {
            counts.acceptanceCriteria.skipped++;
            continue;
          }

          const localStory = storyRepository.findByCode(storyForAc.code);
          if (!localStory) {
            counts.acceptanceCriteria.skipped++;
            continue;
          }

          // Check if AC already exists (by code + storyId)
          const existingAcs = acceptanceCriteriaRepository.findByStoryId(localStory.id);
          const existing = existingAcs.find(a => a.code === ac.code);

          if (existing) {
            if (options.replace) {
              if (!options.dryRun) {
                acceptanceCriteriaRepository.update(existing.id, {
                  description: ac.description,
                  status: ac.status,
                  verificationNotes: ac.verificationNotes,
                });
              }
              counts.acceptanceCriteria.updated++;
            } else {
              counts.acceptanceCriteria.skipped++;
            }
          } else {
            if (!options.dryRun) {
              acceptanceCriteriaRepository.create({
                storyId: localStory.id,
                code: ac.code,
                description: ac.description,
                status: ac.status,
                extensions: ac.extensions,
              });
            }
            counts.acceptanceCriteria.created++;
          }
        }

        // Report summary
        success('\nImport complete!');
        info('Features:');
        info(`  Created: ${counts.features.created}`);
        info(`  Updated: ${counts.features.updated}`);
        info(`  Skipped: ${counts.features.skipped}`);

        info('Stories:');
        info(`  Created: ${counts.stories.created}`);
        info(`  Updated: ${counts.stories.updated}`);
        info(`  Skipped: ${counts.stories.skipped}`);

        info('Tasks:');
        info(`  Created: ${counts.tasks.created}`);
        info(`  Updated: ${counts.tasks.updated}`);
        info(`  Skipped: ${counts.tasks.skipped}`);

        info('Acceptance Criteria:');
        info(`  Created: ${counts.acceptanceCriteria.created}`);
        info(`  Updated: ${counts.acceptanceCriteria.updated}`);
        info(`  Skipped: ${counts.acceptanceCriteria.skipped}`);

        if (options.dryRun) {
          warn('\nDRY RUN - No changes were made');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        error(`Import failed: ${message}`);
        process.exit(1);
      }
    });

  return dataCmd;
}
