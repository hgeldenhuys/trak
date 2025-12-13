/**
 * History CLI Command - View audit log of changes
 *
 * Provides visibility into what changed, when, and by whom.
 * Useful for:
 * - Debugging (what happened to this story?)
 * - Auditing (who made changes?)
 * - Understanding activity patterns
 */

import { Command } from 'commander';
import { historyRepository, storyRepository, featureRepository, taskRepository } from '../../repositories';
import { output, formatTable, getOutputFormat, error } from '../utils/output';
import { EntityType, HistoryAction } from '../../types';

function formatAction(action: string): string {
  const colors: Record<string, string> = {
    created: '\x1b[32m',     // green
    updated: '\x1b[33m',     // yellow
    deleted: '\x1b[31m',     // red
    status_changed: '\x1b[36m', // cyan
    verified: '\x1b[32m',    // green
    assigned: '\x1b[35m',    // magenta
    commented: '\x1b[90m',   // gray
  };
  const reset = '\x1b[0m';
  return `${colors[action] || ''}${action}${reset}`;
}

function resolveEntity(ref: string): { type: EntityType; id: string; code: string } | null {
  // Try story first (most common)
  const story = storyRepository.findByCode(ref) || storyRepository.findById(ref);
  if (story) return { type: EntityType.STORY, id: story.id, code: story.code };

  // Try feature
  const feature = featureRepository.findByCode(ref) || featureRepository.findById(ref);
  if (feature) return { type: EntityType.FEATURE, id: feature.id, code: feature.code };

  // Try task
  const task = taskRepository.findById(ref);
  if (task) return { type: EntityType.TASK, id: task.id, code: task.id.slice(0, 8) };

  return null;
}

export function createHistoryCommand(): Command {
  const cmd = new Command('history')
    .alias('log')
    .description('View change history and audit log');

  /**
   * history list - List recent history entries
   */
  cmd
    .command('list')
    .description('List recent history entries')
    .option('-n, --limit <n>', 'Number of entries', '20')
    .option('--actor <name>', 'Filter by actor')
    .option('--action <action>', 'Filter by action (created, updated, deleted, status_changed, verified)')
    .option('--type <type>', 'Filter by entity type (feature, story, task, acceptance_criteria)')
    .action((options) => {
      let entries;
      const limit = parseInt(options.limit, 10);

      if (options.actor) {
        entries = historyRepository.findByActor(options.actor);
      } else if (options.action) {
        entries = historyRepository.findByAction(options.action as HistoryAction, limit);
      } else if (options.type) {
        entries = historyRepository.findByEntityType(options.type as EntityType, limit);
      } else {
        entries = historyRepository.findRecent(limit);
      }

      // Apply limit if not already applied
      if (entries.length > limit) {
        entries = entries.slice(0, limit);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(entries, null, 2));
      } else if (entries.length === 0) {
        output('No history entries found');
      } else {
        const rows = entries.map(e => ({
          time: e.createdAt.slice(0, 19).replace('T', ' '),
          action: formatAction(e.action),
          actor: e.actor,
          summary: e.summary.slice(0, 50) + (e.summary.length > 50 ? '...' : ''),
        }));
        output(formatTable(rows, ['time', 'action', 'actor', 'summary'], {
          headers: { time: 'TIME', action: 'ACTION', actor: 'ACTOR', summary: 'SUMMARY' }
        }));
      }
    });

  /**
   * history entity - Show history for a specific entity
   */
  cmd
    .command('entity <ref>')
    .description('Show history for a story, feature, or task')
    .action((ref) => {
      const entity = resolveEntity(ref);
      if (!entity) {
        error(`Entity not found: ${ref}`);
        process.exit(1);
      }

      const entries = historyRepository.findByEntity(entity.type, entity.id);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(entries, null, 2));
      } else if (entries.length === 0) {
        output(`No history for ${entity.code}`);
      } else {
        output(`History for ${entity.code} (${entries.length} entries)\n`);
        for (const entry of entries) {
          const time = entry.createdAt.slice(0, 19).replace('T', ' ');
          output(`${time} ${formatAction(entry.action)} by ${entry.actor}`);
          output(`  ${entry.summary}`);

          // Show changes if available
          const changes = entry.changes as Record<string, unknown>;
          if (changes && Object.keys(changes).length > 0) {
            for (const [field, value] of Object.entries(changes)) {
              if (typeof value === 'object' && value !== null && 'from' in value && 'to' in value) {
                const change = value as { from: unknown; to: unknown };
                output(`    ${field}: ${change.from} → ${change.to}`);
              } else {
                output(`    ${field}: ${JSON.stringify(value)}`);
              }
            }
          }
          output('');
        }
      }
    });

  /**
   * history show - Show details of a specific history entry
   */
  cmd
    .command('show <id>')
    .description('Show details of a history entry')
    .action((id) => {
      const entry = historyRepository.findById(id);
      if (!entry) {
        error(`History entry not found: ${id}`);
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(entry, null, 2));
      } else {
        output(`ID: ${entry.id}`);
        output(`Entity: ${entry.entityType}:${entry.entityId.slice(0, 8)}`);
        output(`Action: ${formatAction(entry.action)}`);
        output(`Actor: ${entry.actor}`);
        output(`Summary: ${entry.summary}`);
        output(`Time: ${entry.createdAt}`);

        // Show changes
        const changes = entry.changes as Record<string, unknown>;
        if (changes && Object.keys(changes).length > 0) {
          output(`\nChanges:`);
          for (const [field, value] of Object.entries(changes)) {
            if (typeof value === 'object' && value !== null && 'from' in value && 'to' in value) {
              const change = value as { from: unknown; to: unknown };
              output(`  ${field}: ${change.from} → ${change.to}`);
            } else {
              output(`  ${field}: ${JSON.stringify(value)}`);
            }
          }
        }

        // Show previous state if available
        if (entry.previousState) {
          output(`\nPrevious state:`);
          output(JSON.stringify(entry.previousState, null, 2));
        }

        // Show session if available
        const ext = entry.extensions as Record<string, unknown>;
        if (ext.sessionId) {
          output(`\nSession: ${ext.sessionId}`);
        }
      }
    });

  /**
   * history stats - Show activity statistics
   */
  cmd
    .command('stats')
    .description('Show activity statistics')
    .option('--actor <name>', 'Stats for specific actor')
    .action((options) => {
      if (options.actor) {
        const stats = historyRepository.getActorStats(options.actor);

        if (getOutputFormat() === 'json') {
          output(JSON.stringify({ actor: options.actor, stats }, null, 2));
        } else {
          output(`Activity stats for ${options.actor}:\n`);
          let total = 0;
          for (const [action, count] of Object.entries(stats)) {
            output(`  ${formatAction(action)}: ${count}`);
            total += count as number;
          }
          output(`\n  Total: ${total}`);
        }
      } else {
        // Overall stats
        const recent = historyRepository.findRecent(1000);
        const byActor: Record<string, number> = {};
        const byAction: Record<string, number> = {};
        const byType: Record<string, number> = {};

        for (const entry of recent) {
          byActor[entry.actor] = (byActor[entry.actor] || 0) + 1;
          byAction[entry.action] = (byAction[entry.action] || 0) + 1;
          byType[entry.entityType] = (byType[entry.entityType] || 0) + 1;
        }

        if (getOutputFormat() === 'json') {
          output(JSON.stringify({ total: recent.length, byActor, byAction, byType }, null, 2));
        } else {
          output(`Total actions: ${recent.length}\n`);

          output('By actor:');
          for (const [actor, count] of Object.entries(byActor).sort((a, b) => b[1] - a[1])) {
            output(`  ${actor}: ${count}`);
          }

          output('\nBy action:');
          for (const [action, count] of Object.entries(byAction).sort((a, b) => b[1] - a[1])) {
            output(`  ${formatAction(action)}: ${count}`);
          }

          output('\nBy entity type:');
          for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
            output(`  ${type}: ${count}`);
          }
        }
      }
    });

  /**
   * history today - Show today's activity
   */
  cmd
    .command('today')
    .description("Show today's activity")
    .action(() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startTime = today.toISOString();

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endTime = tomorrow.toISOString();

      const entries = historyRepository.findByTimeRange(startTime, endTime);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(entries, null, 2));
      } else if (entries.length === 0) {
        output('No activity today');
      } else {
        output(`Today's activity (${entries.length} actions)\n`);
        for (const entry of entries) {
          const time = entry.createdAt.slice(11, 19);
          output(`${time} ${formatAction(entry.action)} by ${entry.actor}`);
          output(`  ${entry.summary}`);
        }
      }
    });

  return cmd;
}
