/**
 * QEOM Metadata Repository
 *
 * Provides database operations for QEOM Metadata entities using bun:sqlite.
 * QEOM = Qualia, Epistemology, Ontology, Mereology
 * All mutations emit events via the event bus for reactive updates.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from '../db';
import { TABLES } from '../db/schema';
import { eventBus, createEventTimestamp } from '../events';
import type {
  QEOMMetadata,
  CreateQEOMMetadataInput,
  UpdateQEOMMetadataInput,
} from '../types';
import { EntityType, QEOMDimension } from '../types';

/**
 * Database row type for qeom_metadata table (snake_case)
 */
interface QEOMMetadataRow {
  id: string;
  entity_type: string;
  entity_id: string;
  dimension: string;
  category: string;
  content: string;
  confidence: number;
  evidence: string | null;
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
 * Convert database row to QEOMMetadata entity
 */
function toQEOMMetadata(row: QEOMMetadataRow): QEOMMetadata {
  return {
    id: row.id,
    entityType: row.entity_type as EntityType,
    entityId: row.entity_id,
    dimension: row.dimension as QEOMDimension,
    category: row.category,
    content: row.content,
    confidence: row.confidence,
    evidence: row.evidence,
    extensions: JSON.parse(row.extensions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * QEOM Metadata Repository Class
 */
export class QEOMRepository {
  private readonly tableName = TABLES.QEOM_METADATA;
  private dbOverride: Database | null = null;

  constructor(db?: Database) {
    this.dbOverride = db ?? null;
  }

  private get db(): Database {
    return this.dbOverride ?? getDb();
  }

  /**
   * Create a new QEOM metadata entry
   */
  create(input: CreateQEOMMetadataInput): QEOMMetadata {
    const id = generateId();
    const now = getCurrentTimestamp();
    const extensions = JSON.stringify(input.extensions ?? {});

    this.db.run(`
      INSERT INTO ${this.tableName} (id, entity_type, entity_id, dimension, category, content, confidence, evidence, extensions, created_at, updated_at)
      VALUES ($id, $entityType, $entityId, $dimension, $category, $content, $confidence, $evidence, $extensions, $createdAt, $updatedAt)
    `, {
      $id: id,
      $entityType: input.entityType,
      $entityId: input.entityId,
      $dimension: input.dimension,
      $category: input.category,
      $content: input.content,
      $confidence: input.confidence ?? 0.5,
      $evidence: input.evidence ?? null,
      $extensions: extensions,
      $createdAt: now,
      $updatedAt: now,
    });

    const metadata: QEOMMetadata = {
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      dimension: input.dimension,
      category: input.category,
      content: input.content,
      confidence: input.confidence ?? 0.5,
      evidence: input.evidence ?? null,
      extensions: input.extensions ?? {},
      createdAt: now,
      updatedAt: now,
    };

    eventBus.emit('data', {
      table: this.tableName,
      type: 'created',
      id: metadata.id,
      timestamp: createEventTimestamp(),
    });

    return metadata;
  }

  /**
   * Find metadata by ID
   */
  findById(id: string): QEOMMetadata | null {
    const row = this.db.query(`SELECT * FROM ${this.tableName} WHERE id = $id`).get({ $id: id }) as QEOMMetadataRow | null;
    return row ? toQEOMMetadata(row) : null;
  }

  /**
   * Find all metadata for an entity
   */
  findByEntity(entityType: EntityType, entityId: string): QEOMMetadata[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE entity_type = $entityType AND entity_id = $entityId
      ORDER BY dimension, category, created_at
    `).all({ $entityType: entityType, $entityId: entityId }) as QEOMMetadataRow[];

    const result: QEOMMetadata[] = [];
    for (const row of rows) {
      result.push(toQEOMMetadata(row));
    }
    return result;
  }

  /**
   * Find all metadata for an entity by dimension
   */
  findByEntityAndDimension(entityType: EntityType, entityId: string, dimension: QEOMDimension): QEOMMetadata[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE entity_type = $entityType AND entity_id = $entityId AND dimension = $dimension
      ORDER BY category, confidence DESC, created_at
    `).all({ $entityType: entityType, $entityId: entityId, $dimension: dimension }) as QEOMMetadataRow[];

    const result: QEOMMetadata[] = [];
    for (const row of rows) {
      result.push(toQEOMMetadata(row));
    }
    return result;
  }

  /**
   * Find all metadata by dimension
   */
  findByDimension(dimension: QEOMDimension): QEOMMetadata[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE dimension = $dimension
      ORDER BY category, confidence DESC, created_at
    `).all({ $dimension: dimension }) as QEOMMetadataRow[];

    const result: QEOMMetadata[] = [];
    for (const row of rows) {
      result.push(toQEOMMetadata(row));
    }
    return result;
  }

  /**
   * Find all metadata by category
   */
  findByCategory(category: string): QEOMMetadata[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE category = $category
      ORDER BY dimension, confidence DESC, created_at
    `).all({ $category: category }) as QEOMMetadataRow[];

    const result: QEOMMetadata[] = [];
    for (const row of rows) {
      result.push(toQEOMMetadata(row));
    }
    return result;
  }

  /**
   * Find high-confidence metadata (confidence >= threshold)
   */
  findHighConfidence(threshold: number = 0.8): QEOMMetadata[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE confidence >= $threshold
      ORDER BY confidence DESC, dimension, created_at
    `).all({ $threshold: threshold }) as QEOMMetadataRow[];

    const result: QEOMMetadata[] = [];
    for (const row of rows) {
      result.push(toQEOMMetadata(row));
    }
    return result;
  }

  /**
   * Find all metadata
   */
  findAll(): QEOMMetadata[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName} ORDER BY dimension, category, created_at DESC
    `).all() as QEOMMetadataRow[];

    const result: QEOMMetadata[] = [];
    for (const row of rows) {
      result.push(toQEOMMetadata(row));
    }
    return result;
  }

  /**
   * Update metadata
   */
  update(id: string, input: UpdateQEOMMetadataInput): QEOMMetadata {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`QEOM metadata not found: ${id}`);
    }

    const now = getCurrentTimestamp();
    const updates: string[] = ['updated_at = $updatedAt'];
    const params: Record<string, unknown> = { $id: id, $updatedAt: now };

    if (input.category !== undefined) {
      updates.push('category = $category');
      params.$category = input.category;
    }

    if (input.content !== undefined) {
      updates.push('content = $content');
      params.$content = input.content;
    }

    if (input.confidence !== undefined) {
      updates.push('confidence = $confidence');
      params.$confidence = input.confidence;
    }

    if (input.evidence !== undefined) {
      updates.push('evidence = $evidence');
      params.$evidence = input.evidence;
    }

    if (input.extensions !== undefined) {
      updates.push('extensions = $extensions');
      params.$extensions = JSON.stringify(input.extensions);
    }

    this.db.run(`UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = $id`, params);

    const metadata = this.findById(id)!;

    eventBus.emit('data', {
      table: this.tableName,
      type: 'updated',
      id: metadata.id,
      timestamp: createEventTimestamp(),
    });

    return metadata;
  }

  /**
   * Update confidence with Bayesian update
   * new_confidence = (prior * confidence + evidence_weight) / (prior + 1)
   */
  updateConfidence(id: string, newEvidence: number, evidenceWeight: number = 1): QEOMMetadata {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`QEOM metadata not found: ${id}`);
    }

    // Simple Bayesian update
    const prior = existing.confidence;
    const newConfidence = (prior * evidenceWeight + newEvidence) / (evidenceWeight + 1);

    return this.update(id, { confidence: Math.max(0, Math.min(1, newConfidence)) });
  }

  /**
   * Delete metadata
   */
  delete(id: string): void {
    const metadata = this.findById(id);
    if (!metadata) {
      throw new Error(`QEOM metadata not found: ${id}`);
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
   * Delete all metadata for an entity
   */
  deleteForEntity(entityType: EntityType, entityId: string): number {
    const result = this.db.run(`
      DELETE FROM ${this.tableName}
      WHERE entity_type = $entityType AND entity_id = $entityId
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
   * Get dimension summary for an entity
   */
  getDimensionSummary(entityType: EntityType, entityId: string): Record<QEOMDimension, number> {
    const summary: Record<QEOMDimension, number> = {
      [QEOMDimension.QUALIA]: 0,
      [QEOMDimension.EPISTEMOLOGY]: 0,
      [QEOMDimension.ONTOLOGY]: 0,
      [QEOMDimension.MEREOLOGY]: 0,
    };

    const rows = this.db.query(`
      SELECT dimension, COUNT(*) as count FROM ${this.tableName}
      WHERE entity_type = $entityType AND entity_id = $entityId
      GROUP BY dimension
    `).all({ $entityType: entityType, $entityId: entityId }) as Array<{ dimension: string; count: number }>;

    for (const row of rows) {
      summary[row.dimension as QEOMDimension] = row.count;
    }

    return summary;
  }

  /**
   * Search content across all metadata
   */
  searchContent(searchTerm: string): QEOMMetadata[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE content LIKE $search OR category LIKE $search
      ORDER BY confidence DESC, dimension, created_at
    `).all({ $search: `%${searchTerm}%` }) as QEOMMetadataRow[];

    const result: QEOMMetadata[] = [];
    for (const row of rows) {
      result.push(toQEOMMetadata(row));
    }
    return result;
  }
}

/**
 * Singleton instance
 */
export const qeomRepository = new QEOMRepository();
