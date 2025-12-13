/**
 * Relation CLI Command - Manage relationships between entities
 */

import { Command } from 'commander';
import { relationRepository, storyRepository, taskRepository, featureRepository } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';
import { EntityType, RelationType } from '../../types';

const VALID_RELATION_TYPES = Object.values(RelationType);

function resolveEntity(ref: string): { entityType: EntityType; entityId: string; display: string } | null {
  // Try story by code
  const story = storyRepository.findByCode(ref);
  if (story) return { entityType: EntityType.STORY, entityId: story.id, display: story.code };

  // Try task by ID (short or full)
  const task = taskRepository.findById(ref);
  if (task) return { entityType: EntityType.TASK, entityId: task.id, display: `task:${task.id.slice(0, 8)}` };

  // Try feature by code
  const feature = featureRepository.findByCode(ref);
  if (feature) return { entityType: EntityType.FEATURE, entityId: feature.id, display: feature.code };

  // Try by full UUID
  const storyById = storyRepository.findById(ref);
  if (storyById) return { entityType: EntityType.STORY, entityId: storyById.id, display: storyById.code };

  const featureById = featureRepository.findById(ref);
  if (featureById) return { entityType: EntityType.FEATURE, entityId: featureById.id, display: featureById.code };

  return null;
}

/**
 * Resolve a relation by full ID or short prefix
 */
function resolveRelation(ref: string) {
  // Try full ID first
  let relation = relationRepository.findById(ref);
  if (relation) return relation;

  // Try prefix match
  const all = relationRepository.findAll();
  relation = all.find(r => r.id.startsWith(ref)) || null;
  return relation;
}

export function createRelationCommand(): Command {
  const cmd = new Command('relation')
    .alias('relate')
    .description('Manage relationships between entities');

  /**
   * relation create - Create a relationship
   */
  cmd
    .command('create')
    .description('Create a relationship between two entities')
    .requiredOption('--from <ref>', 'Source entity (story code, task ID, or feature code)')
    .requiredOption('--to <ref>', 'Target entity (story code, task ID, or feature code)')
    .requiredOption('-t, --type <type>', `Relation type: ${VALID_RELATION_TYPES.join(', ')}`)
    .option('-d, --description <desc>', 'Description of the relationship')
    .option('--bidirectional', 'Create inverse relation as well')
    .action((options) => {
      const source = resolveEntity(options.from);
      if (!source) {
        error(`Source entity not found: ${options.from}`);
        process.exit(1);
      }

      const target = resolveEntity(options.to);
      if (!target) {
        error(`Target entity not found: ${options.to}`);
        process.exit(1);
      }

      const relationType = options.type.toLowerCase() as RelationType;
      if (!VALID_RELATION_TYPES.includes(relationType)) {
        error(`Invalid relation type: ${options.type}. Valid: ${VALID_RELATION_TYPES.join(', ')}`);
        process.exit(1);
      }

      try {
        if (options.bidirectional) {
          const { forward, inverse } = relationRepository.createBidirectional({
            sourceType: source.entityType,
            sourceId: source.entityId,
            targetType: target.entityType,
            targetId: target.entityId,
            relationType,
            description: options.description,
          });
          success(`Relations created: ${source.display} <-> ${target.display}`);
          if (getOutputFormat() === 'json') {
            output(JSON.stringify({ forward, inverse }, null, 2));
          }
        } else {
          const relation = relationRepository.create({
            sourceType: source.entityType,
            sourceId: source.entityId,
            targetType: target.entityType,
            targetId: target.entityId,
            relationType,
            description: options.description,
          });
          success(`Relation created: ${source.display} ${relationType} ${target.display}`);
          if (getOutputFormat() === 'json') {
            output(JSON.stringify(relation, null, 2));
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE')) {
          error('This relation already exists');
        } else {
          error(err instanceof Error ? err.message : 'Failed to create relation');
        }
        process.exit(1);
      }
    });

  /**
   * relation list - List relations for an entity
   */
  cmd
    .command('list')
    .description('List relations for an entity')
    .option('--from <ref>', 'Source entity')
    .option('--to <ref>', 'Target entity')
    .option('-e, --entity <ref>', 'Entity (shows both inbound and outbound)')
    .option('-t, --type <type>', 'Filter by relation type')
    .option('--all', 'List all relations')
    .action((options) => {
      let relations;

      if (options.all) {
        relations = relationRepository.findAll();
      } else if (options.type && !options.from && !options.to && !options.entity) {
        const relationType = options.type.toLowerCase() as RelationType;
        if (!VALID_RELATION_TYPES.includes(relationType)) {
          error(`Invalid relation type: ${options.type}. Valid: ${VALID_RELATION_TYPES.join(', ')}`);
          process.exit(1);
        }
        relations = relationRepository.findByType(relationType);
      } else if (options.entity) {
        const entity = resolveEntity(options.entity);
        if (!entity) {
          error(`Entity not found: ${options.entity}`);
          process.exit(1);
        }
        relations = relationRepository.findForEntity(entity.entityType, entity.entityId);
      } else if (options.from) {
        const source = resolveEntity(options.from);
        if (!source) {
          error(`Source entity not found: ${options.from}`);
          process.exit(1);
        }
        relations = relationRepository.findFromSource(source.entityType, source.entityId);
      } else if (options.to) {
        const target = resolveEntity(options.to);
        if (!target) {
          error(`Target entity not found: ${options.to}`);
          process.exit(1);
        }
        relations = relationRepository.findToTarget(target.entityType, target.entityId);
      } else {
        error('Must specify --from, --to, --entity, --type, or --all');
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(relations, null, 2));
      } else if (relations.length === 0) {
        output('No relations found');
      } else {
        const rows = relations.map(r => {
          const sourceRef = resolveEntityDisplay(r.sourceType, r.sourceId);
          const targetRef = resolveEntityDisplay(r.targetType, r.targetId);
          return {
            id: r.id.slice(0, 8),
            source: sourceRef,
            type: r.relationType.toUpperCase(),
            target: targetRef,
            description: r.description?.slice(0, 30) || '-',
          };
        });
        output(formatTable(rows, ['id', 'source', 'type', 'target', 'description'], {
          headers: { id: 'ID', source: 'SOURCE', type: 'TYPE', target: 'TARGET', description: 'DESCRIPTION' }
        }));
      }
    });

  /**
   * relation blockers - Show blockers for an entity
   */
  cmd
    .command('blockers <ref>')
    .description('Show what blocks an entity')
    .action((ref) => {
      const entity = resolveEntity(ref);
      if (!entity) {
        error(`Entity not found: ${ref}`);
        process.exit(1);
      }

      const blockers = relationRepository.findBlockers(entity.entityType, entity.entityId);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(blockers, null, 2));
      } else if (blockers.length === 0) {
        output('No blockers found');
      } else {
        const rows = blockers.map(r => {
          const sourceRef = resolveEntityDisplay(r.sourceType, r.sourceId);
          return {
            blockedBy: sourceRef,
            reason: r.description || '-',
          };
        });
        output(formatTable(rows, ['blockedBy', 'reason'], {
          headers: { blockedBy: 'BLOCKED BY', reason: 'REASON' }
        }));
      }
    });

  /**
   * relation delete - Delete a relation
   */
  cmd
    .command('delete <ref>')
    .description('Delete a relation (accepts full ID or short prefix)')
    .action((ref) => {
      try {
        const found = resolveRelation(ref);
        if (!found) {
          error(`Relation not found: ${ref}`);
          process.exit(1);
        }
        relationRepository.delete(found.id);
        success(`Relation deleted: ${found.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete relation');
        process.exit(1);
      }
    });

  return cmd;
}

function resolveEntityDisplay(entityType: EntityType, entityId: string): string {
  switch (entityType) {
    case EntityType.STORY: {
      const story = storyRepository.findById(entityId);
      return story ? story.code : `story:${entityId.slice(0, 8)}`;
    }
    case EntityType.TASK:
      return `task:${entityId.slice(0, 8)}`;
    case EntityType.FEATURE: {
      const feature = featureRepository.findById(entityId);
      return feature ? feature.code : `feature:${entityId.slice(0, 8)}`;
    }
    default:
      return `${entityType}:${entityId.slice(0, 8)}`;
  }
}
