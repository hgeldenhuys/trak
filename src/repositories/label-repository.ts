/**
 * Label Repository
 *
 * Provides database operations for Label and EntityLabel entities using bun:sqlite.
 * All mutations emit events via the event bus for reactive updates.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from '../db';
import { TABLES } from '../db/schema';
import { eventBus, createEventTimestamp } from '../events';
import type {
  Label,
  EntityLabel,
  CreateLabelInput,
  UpdateLabelInput,
} from '../types';
import { EntityType } from '../types';

/**
 * Database row types
 */
interface LabelRow {
  id: string;
  name: string;
  color: string;
  description: string;
  extensions: string;
  created_at: string;
  updated_at: string;
}

interface EntityLabelRow {
  entity_type: string;
  entity_id: string;
  label_id: string;
  applied_at: string;
  applied_by: string;
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
 * Convert database row to Label entity
 */
function toLabel(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
    extensions: JSON.parse(row.extensions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert database row to EntityLabel
 */
function toEntityLabel(row: EntityLabelRow): EntityLabel {
  return {
    entityType: row.entity_type as EntityType,
    entityId: row.entity_id,
    labelId: row.label_id,
    appliedAt: row.applied_at,
    appliedBy: row.applied_by,
  };
}

/**
 * Label Repository Class
 */
export class LabelRepository {
  private readonly tableName = TABLES.LABELS;
  private readonly entityLabelsTable = TABLES.ENTITY_LABELS;
  private dbOverride: Database | null = null;

  constructor(db?: Database) {
    this.dbOverride = db ?? null;
  }

  private get db(): Database {
    return this.dbOverride ?? getDb();
  }

  /**
   * Create a new label
   */
  create(input: CreateLabelInput): Label {
    const id = generateId();
    const now = getCurrentTimestamp();
    const extensions = JSON.stringify(input.extensions ?? {});

    this.db.run(`
      INSERT INTO ${this.tableName} (id, name, color, description, extensions, created_at, updated_at)
      VALUES ($id, $name, $color, $description, $extensions, $createdAt, $updatedAt)
    `, {
      $id: id,
      $name: input.name,
      $color: input.color,
      $description: input.description ?? '',
      $extensions: extensions,
      $createdAt: now,
      $updatedAt: now,
    });

    const label: Label = {
      id,
      name: input.name,
      color: input.color,
      description: input.description ?? '',
      extensions: input.extensions ?? {},
      createdAt: now,
      updatedAt: now,
    };

    eventBus.emit('data', {
      table: this.tableName,
      type: 'created',
      id: label.id,
      timestamp: createEventTimestamp(),
    });

    return label;
  }

  /**
   * Find a label by ID
   */
  findById(id: string): Label | null {
    const row = this.db.query(`SELECT * FROM ${this.tableName} WHERE id = $id`).get({ $id: id }) as LabelRow | null;
    return row ? toLabel(row) : null;
  }

  /**
   * Find a label by name
   */
  findByName(name: string): Label | null {
    const row = this.db.query(`SELECT * FROM ${this.tableName} WHERE name = $name`).get({ $name: name }) as LabelRow | null;
    return row ? toLabel(row) : null;
  }

  /**
   * Find all labels
   */
  findAll(): Label[] {
    const rows = this.db.query(`SELECT * FROM ${this.tableName} ORDER BY name ASC`).all() as LabelRow[];

    const result: Label[] = [];
    for (const row of rows) {
      result.push(toLabel(row));
    }
    return result;
  }

  /**
   * Update a label
   */
  update(id: string, input: UpdateLabelInput): Label {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Label not found: ${id}`);
    }

    const now = getCurrentTimestamp();
    const updates: string[] = ['updated_at = $updatedAt'];
    const params: Record<string, unknown> = { $id: id, $updatedAt: now };

    if (input.name !== undefined) {
      updates.push('name = $name');
      params.$name = input.name;
    }

    if (input.color !== undefined) {
      updates.push('color = $color');
      params.$color = input.color;
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

    const label = this.findById(id)!;

    eventBus.emit('data', {
      table: this.tableName,
      type: 'updated',
      id: label.id,
      timestamp: createEventTimestamp(),
    });

    return label;
  }

  /**
   * Delete a label (cascades to entity_labels)
   */
  delete(id: string): void {
    const label = this.findById(id);
    if (!label) {
      throw new Error(`Label not found: ${id}`);
    }

    this.db.run(`DELETE FROM ${this.tableName} WHERE id = $id`, { $id: id });

    eventBus.emit('data', {
      table: this.tableName,
      type: 'deleted',
      id: id,
      timestamp: createEventTimestamp(),
    });
  }

  // ===== EntityLabel operations =====

  /**
   * Apply a label to an entity
   */
  applyLabel(entityType: EntityType, entityId: string, labelId: string, appliedBy: string): EntityLabel {
    const now = getCurrentTimestamp();

    // Check if label exists
    const label = this.findById(labelId);
    if (!label) {
      throw new Error(`Label not found: ${labelId}`);
    }

    // Insert or ignore (if already applied)
    this.db.run(`
      INSERT OR IGNORE INTO ${this.entityLabelsTable} (entity_type, entity_id, label_id, applied_at, applied_by)
      VALUES ($entityType, $entityId, $labelId, $appliedAt, $appliedBy)
    `, {
      $entityType: entityType,
      $entityId: entityId,
      $labelId: labelId,
      $appliedAt: now,
      $appliedBy: appliedBy,
    });

    const entityLabel: EntityLabel = {
      entityType,
      entityId,
      labelId,
      appliedAt: now,
      appliedBy,
    };

    eventBus.emit('data', {
      table: this.entityLabelsTable,
      type: 'created',
      id: `${entityType}:${entityId}:${labelId}`,
      timestamp: createEventTimestamp(),
    });

    return entityLabel;
  }

  /**
   * Remove a label from an entity
   */
  removeLabel(entityType: EntityType, entityId: string, labelId: string): void {
    this.db.run(`
      DELETE FROM ${this.entityLabelsTable}
      WHERE entity_type = $entityType AND entity_id = $entityId AND label_id = $labelId
    `, {
      $entityType: entityType,
      $entityId: entityId,
      $labelId: labelId,
    });

    eventBus.emit('data', {
      table: this.entityLabelsTable,
      type: 'deleted',
      id: `${entityType}:${entityId}:${labelId}`,
      timestamp: createEventTimestamp(),
    });
  }

  /**
   * Get all labels for an entity
   */
  getLabelsForEntity(entityType: EntityType, entityId: string): Label[] {
    const rows = this.db.query(`
      SELECT l.* FROM ${this.tableName} l
      JOIN ${this.entityLabelsTable} el ON l.id = el.label_id
      WHERE el.entity_type = $entityType AND el.entity_id = $entityId
      ORDER BY l.name ASC
    `).all({ $entityType: entityType, $entityId: entityId }) as LabelRow[];

    const result: Label[] = [];
    for (const row of rows) {
      result.push(toLabel(row));
    }
    return result;
  }

  /**
   * Get all entities with a specific label
   */
  getEntitiesWithLabel(labelId: string): EntityLabel[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.entityLabelsTable} WHERE label_id = $labelId
    `).all({ $labelId: labelId }) as EntityLabelRow[];

    const result: EntityLabel[] = [];
    for (const row of rows) {
      result.push(toEntityLabel(row));
    }
    return result;
  }

  /**
   * Check if an entity has a specific label
   */
  hasLabel(entityType: EntityType, entityId: string, labelId: string): boolean {
    const row = this.db.query(`
      SELECT 1 FROM ${this.entityLabelsTable}
      WHERE entity_type = $entityType AND entity_id = $entityId AND label_id = $labelId
    `).get({ $entityType: entityType, $entityId: entityId, $labelId: labelId });

    return row !== null;
  }

  /**
   * Apply a label by name (creates label if it doesn't exist)
   */
  applyLabelByName(entityType: EntityType, entityId: string, labelName: string, color: string, appliedBy: string): EntityLabel {
    let label = this.findByName(labelName);
    if (!label) {
      label = this.create({ name: labelName, color });
    }
    return this.applyLabel(entityType, entityId, label.id, appliedBy);
  }
}

/**
 * Singleton instance
 */
export const labelRepository = new LabelRepository();
