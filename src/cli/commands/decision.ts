/**
 * Decision CLI Command - Track architectural and design decisions
 */

import { Command } from 'commander';
import { decisionRepository, storyRepository, featureRepository, taskRepository } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';
import { EntityType } from '../../types';

function formatStatus(status: string): string {
  const colors: Record<string, string> = {
    proposed: '\x1b[33m',    // yellow
    accepted: '\x1b[32m',    // green
    deprecated: '\x1b[90m',  // gray
    superseded: '\x1b[35m',  // magenta
  };
  const reset = '\x1b[0m';
  return `${colors[status] || ''}${status.toUpperCase()}${reset}`;
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

/**
 * Resolve a decision by full ID or short prefix
 */
function resolveDecision(ref: string) {
  // Try full ID first
  let decision = decisionRepository.findById(ref);
  if (decision) return decision;

  // Try prefix match
  const all = decisionRepository.findAll();
  decision = all.find(d => d.id.startsWith(ref)) || null;
  return decision;
}

export function createDecisionCommand(): Command {
  const cmd = new Command('decision')
    .alias('decide')
    .description('Track architectural and design decisions');

  /**
   * decision add - Record a decision
   */
  cmd
    .command('add')
    .description('Record a decision')
    .requiredOption('-s, --story <code>', 'Story, feature, or task code/ID')
    .requiredOption('-q, --question <question>', 'The question or problem being decided')
    .requiredOption('-c, --choice <choice>', 'The chosen solution/approach')
    .requiredOption('-r, --rationale <why>', 'Why this choice was made')
    .option('-a, --alternatives <alts...>', 'Alternative options that were considered')
    .option('--by <actor>', 'Who made this decision', 'architect')
    .option('--status <status>', 'Status: proposed, accepted, deprecated, superseded', 'accepted')
    .action((options) => {
      const entity = resolveEntity(options.story);
      if (!entity) {
        error(`Entity not found: ${options.story}`);
        process.exit(1);
      }

      const decision = decisionRepository.create({
        entityType: entity.type,
        entityId: entity.id,
        question: options.question,
        choice: options.choice,
        rationale: options.rationale,
        alternatives: options.alternatives || [],
        decidedBy: options.by,
        status: options.status,
      });

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(decision, null, 2));
      } else {
        success(`Decision recorded: ${decision.id.slice(0, 8)}`);
        output(`  Question: ${decision.question}`);
        output(`  Choice: ${decision.choice}`);
        if (decision.alternatives.length > 0) {
          output(`  Alternatives: ${decision.alternatives.join(', ')}`);
        }
      }
    });

  /**
   * decision list - List decisions
   */
  cmd
    .command('list')
    .description('List decisions')
    .option('-s, --story <code>', 'Filter by story/feature/task')
    .option('--status <status>', 'Filter by status')
    .option('--by <actor>', 'Filter by decider')
    .action((options) => {
      let decisions;

      if (options.story) {
        const entity = resolveEntity(options.story);
        if (!entity) {
          error(`Entity not found: ${options.story}`);
          process.exit(1);
        }
        decisions = decisionRepository.findByEntity(entity.type, entity.id);
      } else if (options.status) {
        decisions = decisionRepository.findByStatus(options.status);
      } else if (options.by) {
        decisions = decisionRepository.findByDecider(options.by);
      } else {
        decisions = decisionRepository.findAll();
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(decisions, null, 2));
      } else if (decisions.length === 0) {
        output('No decisions found');
      } else {
        const rows = decisions.map(d => ({
          id: d.id.slice(0, 8),
          status: formatStatus(d.status),
          question: d.question.slice(0, 40) + (d.question.length > 40 ? '...' : ''),
          choice: d.choice.slice(0, 30) + (d.choice.length > 30 ? '...' : ''),
          by: d.decidedBy,
        }));
        output(formatTable(rows, ['id', 'status', 'question', 'choice', 'by'], {
          headers: { id: 'ID', status: 'STATUS', question: 'QUESTION', choice: 'CHOICE', by: 'BY' }
        }));
      }
    });

  /**
   * decision show - Show decision details
   */
  cmd
    .command('show <ref>')
    .description('Show decision details (accepts full ID or short prefix)')
    .action((ref) => {
      const decision = resolveDecision(ref);
      if (!decision) {
        error(`Decision not found: ${ref}`);
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(decision, null, 2));
      } else {
        output(`ID: ${decision.id}`);
        output(`Status: ${formatStatus(decision.status)}`);
        output(`Entity: ${decision.entityType}:${decision.entityId.slice(0, 8)}`);
        output(`\nQuestion: ${decision.question}`);
        output(`\nChoice: ${decision.choice}`);
        if (decision.alternatives.length > 0) {
          output(`\nAlternatives considered:`);
          for (const alt of decision.alternatives) {
            output(`  - ${alt}`);
          }
        }
        output(`\nRationale: ${decision.rationale}`);
        output(`\nDecided by: ${decision.decidedBy}`);
        output(`Decided at: ${decision.decidedAt}`);
        if (decision.supersededBy) {
          output(`Superseded by: ${decision.supersededBy.slice(0, 8)}`);
        }
      }
    });

  /**
   * decision supersede - Replace a decision with a new one
   */
  cmd
    .command('supersede <ref>')
    .description('Supersede a decision with a new one (accepts full ID or short prefix)')
    .requiredOption('-c, --choice <choice>', 'The new choice')
    .requiredOption('-r, --rationale <why>', 'Why this supersedes the old decision')
    .option('-a, --alternatives <alts...>', 'New alternatives considered')
    .option('--by <actor>', 'Who made this decision', 'architect')
    .action((ref, options) => {
      const old = resolveDecision(ref);
      if (!old) {
        error(`Decision not found: ${ref}`);
        process.exit(1);
      }

      try {
        const newDecision = decisionRepository.supersede(old.id, {
          entityType: old.entityType,
          entityId: old.entityId,
          question: old.question,
          choice: options.choice,
          rationale: options.rationale,
          alternatives: options.alternatives || [],
          decidedBy: options.by,
        });

        success(`Decision superseded`);
        output(`  Old: ${old.id.slice(0, 8)} -> SUPERSEDED`);
        output(`  New: ${newDecision.id.slice(0, 8)}`);
        output(`  Choice: ${newDecision.choice}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to supersede');
        process.exit(1);
      }
    });

  /**
   * decision deprecate - Mark a decision as deprecated
   */
  cmd
    .command('deprecate <ref>')
    .description('Mark a decision as deprecated (accepts full ID or short prefix)')
    .action((ref) => {
      const decision = resolveDecision(ref);
      if (!decision) {
        error(`Decision not found: ${ref}`);
        process.exit(1);
      }

      try {
        decisionRepository.deprecate(decision.id);
        success(`Decision deprecated: ${decision.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to deprecate');
        process.exit(1);
      }
    });

  /**
   * decision search - Search decisions
   */
  cmd
    .command('search <term>')
    .description('Search decisions by question, choice, or rationale')
    .action((term) => {
      const decisions = decisionRepository.search(term);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(decisions, null, 2));
      } else if (decisions.length === 0) {
        output(`No decisions matching "${term}"`);
      } else {
        output(`Found ${decisions.length} decision(s):\n`);
        const rows = decisions.map(d => ({
          id: d.id.slice(0, 8),
          status: formatStatus(d.status),
          question: d.question.slice(0, 40) + (d.question.length > 40 ? '...' : ''),
          choice: d.choice.slice(0, 30) + (d.choice.length > 30 ? '...' : ''),
        }));
        output(formatTable(rows, ['id', 'status', 'question', 'choice'], {
          headers: { id: 'ID', status: 'STATUS', question: 'QUESTION', choice: 'CHOICE' }
        }));
      }
    });

  /**
   * decision delete - Delete a decision
   */
  cmd
    .command('delete <ref>')
    .description('Delete a decision (accepts full ID or short prefix)')
    .action((ref) => {
      const decision = resolveDecision(ref);
      if (!decision) {
        error(`Decision not found: ${ref}`);
        process.exit(1);
      }

      try {
        decisionRepository.delete(decision.id);
        success(`Decision deleted: ${decision.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete');
        process.exit(1);
      }
    });

  return cmd;
}
