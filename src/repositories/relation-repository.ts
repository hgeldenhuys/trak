/**
 * Relation Repository
 *
 * Provides database operations for Relation entities using bun:sqlite.
 * All mutations emit events via the event bus for reactive updates.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from '../db';
import { TABLES } from '../db/schema';
import { eventBus, createEventTimestamp } from '../events';
import type {
  Relation,
  CreateRelationInput,
  UpdateRelationInput,
} from '../types';
import { EntityType, RelationType } from '../types';

/**
 * Database row type for relations table (snake_case)
 */
interface RelationRow {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relation_type: string;
  description: string | null;
  extensions: string;
  created_at: string;
  updated_at: string;
}

/**
 * Generate a UUID for new entities
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get current ISO timestamp
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Convert database row to Relation entity
 */
function toRelation(row: RelationRow): Relation {
  return {
    id: row.id,
    sourceType: row.source_type as EntityType,
    sourceId: row.source_id,
    targetType: row.target_type as EntityType,
    targetId: row.target_id,
    relationType: row.relation_type as RelationType,
    description: row.description,
    extensions: JSON.parse(row.extensions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Get the inverse relation type
 */
function getInverseRelationType(type: RelationType): RelationType {
  switch (type) {
    case RelationType.BLOCKS:
      return RelationType.BLOCKED_BY;
    case RelationType.BLOCKED_BY:
      return RelationType.BLOCKS;
    case RelationType.PARENT_OF:
      return RelationType.CHILD_OF;
    case RelationType.CHILD_OF:
      return RelationType.PARENT_OF;
    case RelationType.RELATES_TO:
      return RelationType.RELATES_TO;
    case RelationType.DUPLICATES:
      return RelationType.DUPLICATES;
    default:
      return type;
  }
}

/**
 * Relation Repository Class
 */
export class RelationRepository {
  private readonly tableName = TABLES.RELATIONS;
  private dbOverride: Database | null = null;

  constructor(db?: Database) {
    this.dbOverride = db ?? null;
  }

  private get db(): Database {
    return this.dbOverride ?? getDb();
  }

  /**
   * Create a new relation
   */
  create(input: CreateRelationInput): Relation {
    const id = generateId();
    const now = getCurrentTimestamp();
    const extensions = JSON.stringify(input.extensions ?? {});

    this.db.run(`
      INSERT INTO ${this.tableName} (id, source_type, source_id, target_type, target_id, relation_type, description, extensions, created_at, updated_at)
      VALUES ($id, $sourceType, $sourceId, $targetType, $targetId, $relationType, $description, $extensions, $createdAt, $updatedAt)
    `, {
      $id: id,
      $sourceType: input.sourceType,
      $sourceId: input.sourceId,
      $targetType: input.targetType,
      $targetId: input.targetId,
      $relationType: input.relationType,
      $description: input.description ?? null,
      $extensions: extensions,
      $createdAt: now,
      $updatedAt: now,
    });

    const relation: Relation = {
      id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
      relationType: input.relationType,
      description: input.description ?? null,
      extensions: input.extensions ?? {},
      createdAt: now,
      updatedAt: now,
    };

    eventBus.emit('data', {
      table: this.tableName,
      type: 'created',
      id: relation.id,
      timestamp: createEventTimestamp(),
    });

    return relation;
  }

  /**
   * Create a bidirectional relation (creates inverse automatically)
   */
  createBidirectional(input: CreateRelationInput): { forward: Relation; inverse: Relation } {
    const forward = this.create(input);

    const inverse = this.create({
      sourceType: input.targetType,
      sourceId: input.targetId,
      targetType: input.sourceType,
      targetId: input.sourceId,
      relationType: getInverseRelationType(input.relationType),
      description: input.description,
      extensions: input.extensions,
    });

    return { forward, inverse };
  }

  /**
   * Find a relation by ID
   */
  findById(id: string): Relation | null {
    const row = this.db.query(`SELECT * FROM ${this.tableName} WHERE id = $id`).get({ $id: id }) as RelationRow | null;
    return row ? toRelation(row) : null;
  }

  /**
   * Find all relations from a source entity
   */
  findFromSource(sourceType: EntityType, sourceId: string): Relation[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE source_type = $sourceType AND source_id = $sourceId
      ORDER BY relation_type, created_at
    `).all({ $sourceType: sourceType, $sourceId: sourceId }) as RelationRow[];

    const result: Relation[] = [];
    for (const row of rows) {
      result.push(toRelation(row));
    }
    return result;
  }

  /**
   * Find all relations to a target entity
   */
  findToTarget(targetType: EntityType, targetId: string): Relation[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE target_type = $targetType AND target_id = $targetId
      ORDER BY relation_type, created_at
    `).all({ $targetType: targetType, $targetId: targetId }) as RelationRow[];

    const result: Relation[] = [];
    for (const row of rows) {
      result.push(toRelation(row));
    }
    return result;
  }

  /**
   * Find all relations involving an entity (source or target)
   */
  findForEntity(entityType: EntityType, entityId: string): Relation[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE (source_type = $entityType AND source_id = $entityId)
         OR (target_type = $entityType AND target_id = $entityId)
      ORDER BY relation_type, created_at
    `).all({ $entityType: entityType, $entityId: entityId }) as RelationRow[];

    const result: Relation[] = [];
    for (const row of rows) {
      result.push(toRelation(row));
    }
    return result;
  }

  /**
   * Find relations by type
   */
  findByType(relationType: RelationType): Relation[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE relation_type = $relationType
      ORDER BY created_at
    `).all({ $relationType: relationType }) as RelationRow[];

    const result: Relation[] = [];
    for (const row of rows) {
      result.push(toRelation(row));
    }
    return result;
  }

  /**
   * Find all blocking relations for an entity
   */
  findBlockers(entityType: EntityType, entityId: string): Relation[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE target_type = $entityType AND target_id = $entityId
        AND relation_type = 'blocks'
      ORDER BY created_at
    `).all({ $entityType: entityType, $entityId: entityId }) as RelationRow[];

    const result: Relation[] = [];
    for (const row of rows) {
      result.push(toRelation(row));
    }
    return result;
  }

  /**
   * Find all entities blocked by an entity
   */
  findBlocked(entityType: EntityType, entityId: string): Relation[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE source_type = $entityType AND source_id = $entityId
        AND relation_type = 'blocks'
      ORDER BY created_at
    `).all({ $entityType: entityType, $entityId: entityId }) as RelationRow[];

    const result: Relation[] = [];
    for (const row of rows) {
      result.push(toRelation(row));
    }
    return result;
  }

  /**
   * Find all relations
   */
  findAll(): Relation[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName} ORDER BY created_at DESC
    `).all() as RelationRow[];

    const result: Relation[] = [];
    for (const row of rows) {
      result.push(toRelation(row));
    }
    return result;
  }

  /**
   * Update a relation
   */
  update(id: string, input: UpdateRelationInput): Relation {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Relation not found: ${id}`);
    }

    const now = getCurrentTimestamp();
    const updates: string[] = ['updated_at = $updatedAt'];
    const params: Record<string, unknown> = { $id: id, $updatedAt: now };

    if (input.relationType !== undefined) {
      updates.push('relation_type = $relationType');
      params.$relationType = input.relationType;
    }

    if (input.description !== undefined) {
      updates.push('description = $description');
      params.$description = input.description;
    }

    if (input.extensions !== undefined) {
      updates.push('extensions = $extensions');
      params.$extensions = JSON.stringify(input.extensions);
    }

    this.db.run(`UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = $id`, params);

    const relation = this.findById(id)!;

    eventBus.emit('data', {
      table: this.tableName,
      type: 'updated',
      id: relation.id,
      timestamp: createEventTimestamp(),
    });

    return relation;
  }

  /**
   * Delete a relation
   */
  delete(id: string): void {
    const relation = this.findById(id);
    if (!relation) {
      throw new Error(`Relation not found: ${id}`);
    }

    this.db.run(`DELETE FROM ${this.tableName} WHERE id = $id`, { $id: id });

    eventBus.emit('data', {
      table: this.tableName,
      type: 'deleted',
      id: id,
      timestamp: createEventTimestamp(),
    });
  }

  /**
   * Delete all relations for an entity
   */
  deleteForEntity(entityType: EntityType, entityId: string): number {
    const result = this.db.run(`
      DELETE FROM ${this.tableName}
      WHERE (source_type = $entityType AND source_id = $entityId)
         OR (target_type = $entityType AND target_id = $entityId)
    `, { $entityType: entityType, $entityId: entityId });

    if (result.changes > 0) {
      eventBus.emit('data', {
        table: this.tableName,
        type: 'deleted',
        id: `${entityType}:${entityId}`,
        timestamp: createEventTimestamp(),
      });
    }

    return result.changes;
  }

  /**
   * Check if a specific relation exists
   */
  exists(sourceType: EntityType, sourceId: string, targetType: EntityType, targetId: string, relationType: RelationType): boolean {
    const row = this.db.query(`
      SELECT 1 FROM ${this.tableName}
      WHERE source_type = $sourceType AND source_id = $sourceId
        AND target_type = $targetType AND target_id = $targetId
        AND relation_type = $relationType
    `).get({
      $sourceType: sourceType,
      $sourceId: sourceId,
      $targetType: targetType,
      $targetId: targetId,
      $relationType: relationType,
    });

    return row !== null;
  }
}

/**
 * Singleton instance
 */
export const relationRepository = new RelationRepository();
