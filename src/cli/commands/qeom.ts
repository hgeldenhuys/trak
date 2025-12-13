/**
 * QEOM CLI Command - Manage formal ontology metadata
 * Q = Qualia (experiences, pain points, solutions)
 * E = Epistemology (patterns, validations, concepts)
 * O = Ontology (entities, relations, constraints)
 * M = Mereology (components, compositions, parts)
 */

import { Command } from 'commander';
import { qeomRepository, storyRepository, taskRepository, featureRepository } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';
import { EntityType, QEOMDimension } from '../../types';

const VALID_DIMENSIONS = Object.values(QEOMDimension);
const DIMENSION_NAMES: Record<string, string> = {
  Q: 'Qualia',
  E: 'Epistemology',
  O: 'Ontology',
  M: 'Mereology',
};

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

function formatDimension(dim: QEOMDimension): string {
  const colors: Record<string, string> = {
    Q: '\x1b[35m',  // magenta
    E: '\x1b[36m',  // cyan
    O: '\x1b[33m',  // yellow
    M: '\x1b[32m',  // green
  };
  const reset = '\x1b[0m';
  return `${colors[dim] || ''}${dim}${reset}`;
}

function formatConfidence(conf: number): string {
  if (conf >= 0.8) return `\x1b[32m${(conf * 100).toFixed(0)}%\x1b[0m`;  // green
  if (conf >= 0.5) return `\x1b[33m${(conf * 100).toFixed(0)}%\x1b[0m`;  // yellow
  return `\x1b[31m${(conf * 100).toFixed(0)}%\x1b[0m`;  // red
}

/**
 * Resolve a QEOM annotation by full ID or short prefix
 */
function resolveQeom(ref: string) {
  // Try full ID first
  let qeom = qeomRepository.findById(ref);
  if (qeom) return qeom;

  // Try prefix match
  const all = qeomRepository.findAll();
  qeom = all.find(q => q.id.startsWith(ref)) || null;
  return qeom;
}

export function createQEOMCommand(): Command {
  const cmd = new Command('qeom')
    .description('Manage QEOM formal ontology metadata');

  /**
   * qeom add - Add a QEOM annotation
   */
  cmd
    .command('add')
    .description('Add a QEOM annotation to an entity')
    .option('-s, --story <code>', 'Story code or ID')
    .option('-t, --task <id>', 'Task ID')
    .option('-f, --feature <code>', 'Feature code or ID')
    .requiredOption('-d, --dimension <dim>', 'Dimension (Q, E, O, M)')
    .requiredOption('-c, --category <cat>', 'Category (e.g., painpoint, pattern, entity)')
    .requiredOption('--content <text>', 'The insight or classification')
    .option('--confidence <num>', 'Confidence level 0-1', '0.5')
    .option('--evidence <text>', 'Evidence or source')
    .action((options) => {
      const entity = resolveEntity(options);
      if (!entity) {
        error('Must specify --story, --task, or --feature');
        process.exit(1);
      }

      const dimension = options.dimension.toUpperCase() as QEOMDimension;
      if (!VALID_DIMENSIONS.includes(dimension)) {
        error(`Invalid dimension: ${options.dimension}. Valid: ${VALID_DIMENSIONS.join(', ')}`);
        process.exit(1);
      }

      const confidence = parseFloat(options.confidence);
      if (isNaN(confidence) || confidence < 0 || confidence > 1) {
        error('Confidence must be a number between 0 and 1');
        process.exit(1);
      }

      const metadata = qeomRepository.create({
        entityType: entity.entityType,
        entityId: entity.entityId,
        dimension,
        category: options.category,
        content: options.content,
        confidence,
        evidence: options.evidence,
      });

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(metadata, null, 2));
      } else {
        success(`QEOM annotation added: ${formatDimension(dimension)}:${options.category}`);
      }
    });

  /**
   * qeom list - List QEOM annotations
   */
  cmd
    .command('list')
    .description('List QEOM annotations')
    .option('-s, --story <code>', 'Story code or ID')
    .option('-t, --task <id>', 'Task ID')
    .option('-f, --feature <code>', 'Feature code or ID')
    .option('-d, --dimension <dim>', 'Filter by dimension (Q, E, O, M)')
    .option('-c, --category <cat>', 'Filter by category')
    .option('--high-confidence', 'Show only high confidence (>=80%)')
    .option('--all', 'List all QEOM annotations')
    .action((options) => {
      let metadata;

      if (options.all) {
        metadata = qeomRepository.findAll();
      } else if (options.highConfidence) {
        metadata = qeomRepository.findHighConfidence(0.8);
      } else if (options.category) {
        metadata = qeomRepository.findByCategory(options.category);
      } else if (options.dimension) {
        const dimension = options.dimension.toUpperCase() as QEOMDimension;
        if (!VALID_DIMENSIONS.includes(dimension)) {
          error(`Invalid dimension: ${options.dimension}. Valid: ${VALID_DIMENSIONS.join(', ')}`);
          process.exit(1);
        }

        const entity = resolveEntity(options);
        if (entity) {
          metadata = qeomRepository.findByEntityAndDimension(entity.entityType, entity.entityId, dimension);
        } else {
          metadata = qeomRepository.findByDimension(dimension);
        }
      } else {
        const entity = resolveEntity(options);
        if (!entity) {
          error('Must specify --story, --task, --feature, --dimension, --category, --high-confidence, or --all');
          process.exit(1);
        }
        metadata = qeomRepository.findByEntity(entity.entityType, entity.entityId);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(metadata, null, 2));
      } else if (metadata.length === 0) {
        output('No QEOM annotations found');
      } else {
        const rows = metadata.map(m => ({
          id: m.id.slice(0, 8),
          dim: formatDimension(m.dimension),
          category: m.category,
          conf: formatConfidence(m.confidence),
          content: m.content.slice(0, 40) + (m.content.length > 40 ? '...' : ''),
        }));
        output(formatTable(rows, ['id', 'dim', 'category', 'conf', 'content'], {
          headers: { id: 'ID', dim: 'DIM', category: 'CATEGORY', conf: 'CONF', content: 'CONTENT' }
        }));
      }
    });

  /**
   * qeom show - Show QEOM annotation details
   */
  cmd
    .command('show <ref>')
    .description('Show QEOM annotation details (accepts full ID or short prefix)')
    .action((ref) => {
      const metadata = resolveQeom(ref);
      if (!metadata) {
        error(`QEOM annotation not found: ${ref}`);
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(metadata, null, 2));
      } else {
        output(`ID: ${metadata.id}`);
        output(`Dimension: ${formatDimension(metadata.dimension)} (${DIMENSION_NAMES[metadata.dimension]})`);
        output(`Category: ${metadata.category}`);
        output(`Confidence: ${formatConfidence(metadata.confidence)}`);
        output(`Entity: ${metadata.entityType}:${metadata.entityId}`);
        output(`Created: ${metadata.createdAt}`);
        if (metadata.evidence) {
          output(`Evidence: ${metadata.evidence}`);
        }
        output(`\nContent:\n${metadata.content}`);
      }
    });

  /**
   * qeom summary - Show QEOM summary for an entity
   */
  cmd
    .command('summary')
    .description('Show QEOM dimension summary for an entity')
    .option('-s, --story <code>', 'Story code or ID')
    .option('-t, --task <id>', 'Task ID')
    .option('-f, --feature <code>', 'Feature code or ID')
    .action((options) => {
      const entity = resolveEntity(options);
      if (!entity) {
        error('Must specify --story, --task, or --feature');
        process.exit(1);
      }

      const summary = qeomRepository.getDimensionSummary(entity.entityType, entity.entityId);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(summary, null, 2));
      } else {
        output('QEOM Dimension Summary:');
        for (const [dim, count] of Object.entries(summary)) {
          const name = DIMENSION_NAMES[dim] || dim;
          output(`  ${formatDimension(dim as QEOMDimension)} ${name}: ${count} annotation${count !== 1 ? 's' : ''}`);
        }
      }
    });

  /**
   * qeom search - Search QEOM content
   */
  cmd
    .command('search <term>')
    .description('Search QEOM annotations by content or category')
    .action((term) => {
      const results = qeomRepository.searchContent(term);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(results, null, 2));
      } else if (results.length === 0) {
        output('No matches found');
      } else {
        const rows = results.map(m => ({
          id: m.id.slice(0, 8),
          dim: formatDimension(m.dimension),
          category: m.category,
          conf: formatConfidence(m.confidence),
          content: m.content.slice(0, 40) + (m.content.length > 40 ? '...' : ''),
        }));
        output(`Found ${results.length} match${results.length !== 1 ? 'es' : ''}:`);
        output(formatTable(rows, ['id', 'dim', 'category', 'conf', 'content'], {
          headers: { id: 'ID', dim: 'DIM', category: 'CATEGORY', conf: 'CONF', content: 'CONTENT' }
        }));
      }
    });

  /**
   * qeom update-confidence - Update confidence with evidence
   */
  cmd
    .command('update-confidence <ref>')
    .description('Update confidence with new evidence (accepts full ID or short prefix)')
    .requiredOption('--evidence <num>', 'New evidence value 0-1')
    .option('--weight <num>', 'Evidence weight', '1')
    .action((ref, options) => {
      const found = resolveQeom(ref);
      if (!found) {
        error(`QEOM annotation not found: ${ref}`);
        process.exit(1);
      }

      const evidence = parseFloat(options.evidence);
      if (isNaN(evidence) || evidence < 0 || evidence > 1) {
        error('Evidence must be a number between 0 and 1');
        process.exit(1);
      }

      const weight = parseFloat(options.weight);
      if (isNaN(weight) || weight <= 0) {
        error('Weight must be a positive number');
        process.exit(1);
      }

      try {
        const metadata = qeomRepository.updateConfidence(found.id, evidence, weight);
        success(`Confidence updated to ${(metadata.confidence * 100).toFixed(0)}%`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to update confidence');
        process.exit(1);
      }
    });

  /**
   * qeom delete - Delete a QEOM annotation
   */
  cmd
    .command('delete <ref>')
    .description('Delete a QEOM annotation (accepts full ID or short prefix)')
    .action((ref) => {
      try {
        const found = resolveQeom(ref);
        if (!found) {
          error(`QEOM annotation not found: ${ref}`);
          process.exit(1);
        }
        qeomRepository.delete(found.id);
        success(`QEOM annotation deleted: ${found.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete');
        process.exit(1);
      }
    });

  return cmd;
}
