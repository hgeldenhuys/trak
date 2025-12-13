/**
 * Label CLI Command - Manage labels and tags
 */

import { Command } from 'commander';
import { labelRepository, storyRepository, taskRepository, featureRepository } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';
import { EntityType } from '../../types';

function resolveEntity(options: { story?: string; task?: string; feature?: string }): { entityType: EntityType; entityId: string } | null {
  if (options.story) {
    const story = storyRepository.findByCode(options.story) || storyRepository.findById(options.story);
    if (!story) return null;
    return { entityType: EntityType.STORY, entityId: story.id };
  }
  if (options.task) {
    const task = taskRepository.findById(options.task);
    if (!task) return null;
    return { entityType: EntityType.TASK, entityId: task.id };
  }
  if (options.feature) {
    const feature = featureRepository.findByCode(options.feature) || featureRepository.findById(options.feature);
    if (!feature) return null;
    return { entityType: EntityType.FEATURE, entityId: feature.id };
  }
  return null;
}

export function createLabelCommand(): Command {
  const cmd = new Command('label')
    .alias('tag')
    .description('Manage labels and tags');

  /**
   * label create - Create a new label
   */
  cmd
    .command('create')
    .description('Create a new label')
    .requiredOption('-n, --name <name>', 'Label name')
    .option('-c, --color <color>', 'Hex color code', '#808080')
    .option('-d, --description <desc>', 'Label description')
    .action((options) => {
      try {
        const label = labelRepository.create({
          name: options.name,
          color: options.color,
          description: options.description,
        });

        if (getOutputFormat() === 'json') {
          output(JSON.stringify(label, null, 2));
        } else {
          success(`Label created: ${label.name} (${label.color})`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE')) {
          error(`Label "${options.name}" already exists`);
        } else {
          error(err instanceof Error ? err.message : 'Failed to create label');
        }
        process.exit(1);
      }
    });

  /**
   * label list - List all labels
   */
  cmd
    .command('list')
    .description('List all labels')
    .action(() => {
      const labels = labelRepository.findAll();

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(labels, null, 2));
      } else if (labels.length === 0) {
        output('No labels found');
      } else {
        const rows = labels.map(l => ({
          id: l.id.slice(0, 8),
          name: l.name,
          color: l.color,
          description: l.description.slice(0, 40) || '-',
        }));
        output(formatTable(rows, ['id', 'name', 'color', 'description'], {
          headers: { id: 'ID', name: 'NAME', color: 'COLOR', description: 'DESCRIPTION' }
        }));
      }
    });

  /**
   * label apply - Apply a label to an entity
   */
  cmd
    .command('apply')
    .description('Apply a label to a story, task, or feature')
    .requiredOption('-l, --label <name>', 'Label name')
    .option('-s, --story <code>', 'Story code or ID')
    .option('-t, --task <id>', 'Task ID')
    .option('-f, --feature <code>', 'Feature code or ID')
    .option('--actor <actor>', 'Who is applying the label', 'cli')
    .action((options) => {
      const entity = resolveEntity(options);
      if (!entity) {
        error('Must specify --story, --task, or --feature');
        process.exit(1);
      }

      const label = labelRepository.findByName(options.label);
      if (!label) {
        error(`Label not found: ${options.label}`);
        process.exit(1);
      }

      try {
        labelRepository.applyLabel(entity.entityType, entity.entityId, label.id, options.actor);
        success(`Label "${options.label}" applied`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to apply label');
        process.exit(1);
      }
    });

  /**
   * label remove - Remove a label from an entity
   */
  cmd
    .command('remove')
    .description('Remove a label from an entity')
    .requiredOption('-l, --label <name>', 'Label name')
    .option('-s, --story <code>', 'Story code or ID')
    .option('-t, --task <id>', 'Task ID')
    .option('-f, --feature <code>', 'Feature code or ID')
    .action((options) => {
      const entity = resolveEntity(options);
      if (!entity) {
        error('Must specify --story, --task, or --feature');
        process.exit(1);
      }

      const label = labelRepository.findByName(options.label);
      if (!label) {
        error(`Label not found: ${options.label}`);
        process.exit(1);
      }

      labelRepository.removeLabel(entity.entityType, entity.entityId, label.id);
      success(`Label "${options.label}" removed`);
    });

  /**
   * label show - Show labels for an entity
   */
  cmd
    .command('show')
    .description('Show labels for an entity')
    .option('-s, --story <code>', 'Story code or ID')
    .option('-t, --task <id>', 'Task ID')
    .option('-f, --feature <code>', 'Feature code or ID')
    .action((options) => {
      const entity = resolveEntity(options);
      if (!entity) {
        error('Must specify --story, --task, or --feature');
        process.exit(1);
      }

      const labels = labelRepository.getLabelsForEntity(entity.entityType, entity.entityId);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(labels, null, 2));
      } else if (labels.length === 0) {
        output('No labels applied');
      } else {
        const rows = labels.map(l => ({
          name: l.name,
          color: l.color,
          description: l.description || '-',
        }));
        output(formatTable(rows, ['name', 'color', 'description'], {
          headers: { name: 'NAME', color: 'COLOR', description: 'DESCRIPTION' }
        }));
      }
    });

  /**
   * label delete - Delete a label
   */
  cmd
    .command('delete <name>')
    .description('Delete a label (removes from all entities)')
    .action((name) => {
      const label = labelRepository.findByName(name);
      if (!label) {
        error(`Label not found: ${name}`);
        process.exit(1);
      }

      try {
        labelRepository.delete(label.id);
        success(`Label deleted: ${name}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete label');
        process.exit(1);
      }
    });

  return cmd;
}
