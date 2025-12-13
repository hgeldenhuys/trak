/**
 * Impediment CLI Command - Manage blockers and obstacles
 */

import { Command } from 'commander';
import { impedimentRepository, storyRepository, taskRepository, featureRepository } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';
import { EntityType, ImpedimentStatus, ImpedimentSeverity } from '../../types';

const VALID_STATUSES = Object.values(ImpedimentStatus);
const VALID_SEVERITIES = Object.values(ImpedimentSeverity);

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

function formatSeverity(severity: ImpedimentSeverity): string {
  const colors: Record<string, string> = {
    critical: '\x1b[31m',  // red
    high: '\x1b[33m',      // yellow
    medium: '\x1b[36m',    // cyan
    low: '\x1b[32m',       // green
  };
  const reset = '\x1b[0m';
  return `${colors[severity] || ''}${severity.toUpperCase()}${reset}`;
}

function formatImpedimentStatus(status: ImpedimentStatus): string {
  const colors: Record<string, string> = {
    open: '\x1b[33m',        // yellow
    in_progress: '\x1b[36m', // cyan
    resolved: '\x1b[32m',    // green
    escalated: '\x1b[31m',   // red
  };
  const reset = '\x1b[0m';
  return `${colors[status] || ''}${status.toUpperCase()}${reset}`;
}

/**
 * Resolve an impediment by full ID or short prefix
 */
function resolveImpediment(ref: string) {
  // Try full ID first
  let imp = impedimentRepository.findById(ref);
  if (imp) return imp;

  // Try prefix match
  const all = impedimentRepository.findAll();
  imp = all.find(i => i.id.startsWith(ref)) || null;
  return imp;
}

export function createImpedimentCommand(): Command {
  const cmd = new Command('impediment')
    .alias('blocker')
    .description('Manage impediments and blockers');

  /**
   * impediment raise - Raise a new impediment
   */
  cmd
    .command('raise')
    .alias('create')
    .description('Raise a new impediment')
    .option('-s, --story <code>', 'Story code or ID')
    .option('-t, --task <id>', 'Task ID')
    .option('-f, --feature <code>', 'Feature code or ID')
    .requiredOption('--title <title>', 'Impediment title')
    .option('-d, --description <desc>', 'Detailed description', '')
    .option('--severity <severity>', 'Severity level (low, medium, high, critical)', 'medium')
    .option('--raised-by <actor>', 'Who raised this', 'cli')
    .option('--assign <actor>', 'Assign to someone')
    .action((options) => {
      const entity = resolveEntity(options);
      if (!entity) {
        error('Must specify --story, --task, or --feature');
        process.exit(1);
      }

      const severity = options.severity.toLowerCase() as ImpedimentSeverity;
      if (!VALID_SEVERITIES.includes(severity)) {
        error(`Invalid severity: ${options.severity}. Valid: ${VALID_SEVERITIES.join(', ')}`);
        process.exit(1);
      }

      const impediment = impedimentRepository.create({
        entityType: entity.entityType,
        entityId: entity.entityId,
        title: options.title,
        description: options.description,
        severity,
        raisedBy: options.raisedBy,
        assignedTo: options.assign || null,
      });

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(impediment, null, 2));
      } else {
        success(`Impediment raised: ${impediment.id.slice(0, 8)} - ${impediment.title}`);
      }
    });

  /**
   * impediment list - List impediments
   */
  cmd
    .command('list')
    .description('List impediments')
    .option('-s, --story <code>', 'Story code or ID')
    .option('-t, --task <id>', 'Task ID')
    .option('-f, --feature <code>', 'Feature code or ID')
    .option('--all', 'List all impediments')
    .option('--open', 'List only open/active impediments')
    .option('--status <status>', 'Filter by status')
    .action((options) => {
      let impediments;

      if (options.all) {
        impediments = impedimentRepository.findAll();
      } else if (options.open) {
        impediments = impedimentRepository.findOpen();
      } else if (options.status) {
        const status = options.status.toLowerCase() as ImpedimentStatus;
        if (!VALID_STATUSES.includes(status)) {
          error(`Invalid status: ${options.status}. Valid: ${VALID_STATUSES.join(', ')}`);
          process.exit(1);
        }
        impediments = impedimentRepository.findByStatus(status);
      } else {
        const entity = resolveEntity(options);
        if (!entity) {
          error('Must specify --story, --task, --feature, --all, or --open');
          process.exit(1);
        }
        impediments = impedimentRepository.findByEntity(entity.entityType, entity.entityId);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(impediments, null, 2));
      } else if (impediments.length === 0) {
        output('No impediments found');
      } else {
        const rows = impediments.map(i => ({
          id: i.id.slice(0, 8),
          status: formatImpedimentStatus(i.status),
          severity: formatSeverity(i.severity),
          title: i.title.slice(0, 40) + (i.title.length > 40 ? '...' : ''),
          assigned: i.assignedTo || '-',
        }));
        output(formatTable(rows, ['id', 'status', 'severity', 'title', 'assigned'], {
          headers: { id: 'ID', status: 'STATUS', severity: 'SEVERITY', title: 'TITLE', assigned: 'ASSIGNED' }
        }));
      }
    });

  /**
   * impediment show - Show impediment details
   */
  cmd
    .command('show <ref>')
    .description('Show impediment details (accepts full ID or short prefix)')
    .action((ref) => {
      const impediment = resolveImpediment(ref);
      if (!impediment) {
        error(`Impediment not found: ${ref}`);
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(impediment, null, 2));
      } else {
        output(`ID: ${impediment.id}`);
        output(`Title: ${impediment.title}`);
        output(`Status: ${formatImpedimentStatus(impediment.status)}`);
        output(`Severity: ${formatSeverity(impediment.severity)}`);
        output(`Entity: ${impediment.entityType}:${impediment.entityId}`);
        output(`Raised by: ${impediment.raisedBy}`);
        output(`Assigned to: ${impediment.assignedTo || 'Unassigned'}`);
        output(`Created: ${impediment.createdAt}`);
        if (impediment.resolvedAt) {
          output(`Resolved: ${impediment.resolvedAt}`);
          output(`Resolution: ${impediment.resolution}`);
        }
        if (impediment.description) {
          output(`\nDescription:\n${impediment.description}`);
        }
      }
    });

  /**
   * impediment resolve - Resolve an impediment
   */
  cmd
    .command('resolve <ref>')
    .description('Resolve an impediment (accepts full ID or short prefix)')
    .requiredOption('-r, --resolution <text>', 'Resolution description')
    .action((ref, options) => {
      try {
        const found = resolveImpediment(ref);
        if (!found) {
          error(`Impediment not found: ${ref}`);
          process.exit(1);
        }
        const impediment = impedimentRepository.resolve(found.id, options.resolution);
        success(`Impediment resolved: ${impediment.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to resolve');
        process.exit(1);
      }
    });

  /**
   * impediment escalate - Escalate an impediment
   */
  cmd
    .command('escalate <ref>')
    .description('Escalate an impediment (accepts full ID or short prefix)')
    .action((ref) => {
      try {
        const found = resolveImpediment(ref);
        if (!found) {
          error(`Impediment not found: ${ref}`);
          process.exit(1);
        }
        const impediment = impedimentRepository.escalate(found.id);
        success(`Impediment escalated: ${impediment.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to escalate');
        process.exit(1);
      }
    });

  /**
   * impediment assign - Assign an impediment
   */
  cmd
    .command('assign <ref> <actor>')
    .description('Assign an impediment to someone (accepts full ID or short prefix)')
    .action((ref, actor) => {
      try {
        const found = resolveImpediment(ref);
        if (!found) {
          error(`Impediment not found: ${ref}`);
          process.exit(1);
        }
        const impediment = impedimentRepository.update(found.id, { assignedTo: actor });
        success(`Impediment assigned to ${actor}: ${impediment.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to assign');
        process.exit(1);
      }
    });

  /**
   * impediment delete - Delete an impediment
   */
  cmd
    .command('delete <ref>')
    .description('Delete an impediment (accepts full ID or short prefix)')
    .action((ref) => {
      try {
        const found = resolveImpediment(ref);
        if (!found) {
          error(`Impediment not found: ${ref}`);
          process.exit(1);
        }
        impedimentRepository.delete(found.id);
        success(`Impediment deleted: ${found.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete');
        process.exit(1);
      }
    });

  return cmd;
}
