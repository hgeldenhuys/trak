/**
 * Impediment Repository
 *
 * Provides database operations for Impediment entities using bun:sqlite.
 * All mutations emit events via the event bus for reactive updates.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from '../db';
import { TABLES } from '../db/schema';
import { eventBus, createEventTimestamp } from '../events';
import type {
  Impediment,
  CreateImpedimentInput,
  UpdateImpedimentInput,
} from '../types';
import { EntityType, ImpedimentStatus, ImpedimentSeverity } from '../types';

/**
 * Database row type for impediments table (snake_case)
 */
interface ImpedimentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  raised_by: string;
  assigned_to: string | null;
  resolved_at: string | null;
  resolution: string | null;
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
 * Convert database row (snake_case) to Impediment entity (camelCase)
 */
function toImpediment(row: ImpedimentRow): Impediment {
  return {
    id: row.id,
    entityType: row.entity_type as EntityType,
    entityId: row.entity_id,
    title: row.title,
    description: row.description,
    status: row.status as ImpedimentStatus,
    severity: row.severity as ImpedimentSeverity,
    raisedBy: row.raised_by,
    assignedTo: row.assigned_to,
    resolvedAt: row.resolved_at,
    resolution: row.resolution,
    extensions: JSON.parse(row.extensions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Impediment Repository Class
 */
export class ImpedimentRepository {
  private readonly tableName = TABLES.IMPEDIMENTS;
  private dbOverride: Database | null = null;

  constructor(db?: Database) {
    this.dbOverride = db ?? null;
  }

  private get db(): Database {
    return this.dbOverride ?? getDb();
  }

  /**
   * Create a new impediment
   */
  create(input: CreateImpedimentInput): Impediment {
    const id = generateId();
    const now = getCurrentTimestamp();
    const extensions = JSON.stringify(input.extensions ?? {});

    this.db.run(`
      INSERT INTO ${this.tableName} (id, entity_type, entity_id, title, description, status, severity, raised_by, assigned_to, extensions, created_at, updated_at)
      VALUES ($id, $entityType, $entityId, $title, $description, $status, $severity, $raisedBy, $assignedTo, $extensions, $createdAt, $updatedAt)
    `, {
      $id: id,
      $entityType: input.entityType,
      $entityId: input.entityId,
      $title: input.title,
      $description: input.description,
      $status: input.status ?? ImpedimentStatus.OPEN,
      $severity: input.severity ?? ImpedimentSeverity.MEDIUM,
      $raisedBy: input.raisedBy,
      $assignedTo: input.assignedTo ?? null,
      $extensions: extensions,
      $createdAt: now,
      $updatedAt: now,
    });

    const impediment: Impediment = {
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      description: input.description,
      status: input.status ?? ImpedimentStatus.OPEN,
      severity: input.severity ?? ImpedimentSeverity.MEDIUM,
      raisedBy: input.raisedBy,
      assignedTo: input.assignedTo ?? null,
      resolvedAt: null,
      resolution: null,
      extensions: input.extensions ?? {},
      createdAt: now,
      updatedAt: now,
    };

    eventBus.emit('data', {
      table: this.tableName,
      type: 'created',
      id: impediment.id,
      timestamp: createEventTimestamp(),
    });

    return impediment;
  }

  /**
   * Find an impediment by ID
   */
  findById(id: string): Impediment | null {
    const row = this.db.query(`SELECT * FROM ${this.tableName} WHERE id = $id`).get({ $id: id }) as ImpedimentRow | null;
    return row ? toImpediment(row) : null;
  }

  /**
   * Find all impediments for an entity
   */
  findByEntity(entityType: EntityType, entityId: string): Impediment[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE entity_type = $entityType AND entity_id = $entityId
      ORDER BY severity DESC, created_at DESC
    `).all({ $entityType: entityType, $entityId: entityId }) as ImpedimentRow[];

    const result: Impediment[] = [];
    for (const row of rows) {
      result.push(toImpediment(row));
    }
    return result;
  }

  /**
   * Find all open impediments
   */
  findOpen(): Impediment[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE status IN ('open', 'in_progress', 'escalated')
      ORDER BY severity DESC, created_at DESC
    `).all() as ImpedimentRow[];

    const result: Impediment[] = [];
    for (const row of rows) {
      result.push(toImpediment(row));
    }
    return result;
  }

  /**
   * Find impediments by status
   */
  findByStatus(status: ImpedimentStatus): Impediment[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE status = $status
      ORDER BY severity DESC, created_at DESC
    `).all({ $status: status }) as ImpedimentRow[];

    const result: Impediment[] = [];
    for (const row of rows) {
      result.push(toImpediment(row));
    }
    return result;
  }

  /**
   * Find all impediments
   */
  findAll(): Impediment[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName} ORDER BY status, severity DESC, created_at DESC
    `).all() as ImpedimentRow[];

    const result: Impediment[] = [];
    for (const row of rows) {
      result.push(toImpediment(row));
    }
    return result;
  }

  /**
   * Update an impediment
   */
  update(id: string, input: UpdateImpedimentInput): Impediment {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Impediment not found: ${id}`);
    }

    const now = getCurrentTimestamp();
    const updates: string[] = ['updated_at = $updatedAt'];
    const params: Record<string, unknown> = { $id: id, $updatedAt: now };

    if (input.title !== undefined) {
      updates.push('title = $title');
      params.$title = input.title;
    }

    if (input.description !== undefined) {
      updates.push('description = $description');
      params.$description = input.description;
    }

    if (input.status !== undefined) {
      updates.push('status = $status');
      params.$status = input.status;
    }

    if (input.severity !== undefined) {
      updates.push('severity = $severity');
      params.$severity = input.severity;
    }

    if (input.assignedTo !== undefined) {
      updates.push('assigned_to = $assignedTo');
      params.$assignedTo = input.assignedTo;
    }

    if (input.resolution !== undefined) {
      updates.push('resolution = $resolution');
      params.$resolution = input.resolution;
    }

    if (input.extensions !== undefined) {
      updates.push('extensions = $extensions');
      params.$extensions = JSON.stringify(input.extensions);
    }

    this.db.run(`UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = $id`, params);

    const impediment = this.findById(id)!;

    eventBus.emit('data', {
      table: this.tableName,
      type: 'updated',
      id: impediment.id,
      timestamp: createEventTimestamp(),
    });

    return impediment;
  }

  /**
   * Resolve an impediment
   */
  resolve(id: string, resolution: string): Impediment {
    const now = getCurrentTimestamp();
    this.db.run(`
      UPDATE ${this.tableName}
      SET status = $status, resolution = $resolution, resolved_at = $resolvedAt, updated_at = $updatedAt
      WHERE id = $id
    `, {
      $id: id,
      $status: ImpedimentStatus.RESOLVED,
      $resolution: resolution,
      $resolvedAt: now,
      $updatedAt: now,
    });

    const impediment = this.findById(id);
    if (!impediment) {
      throw new Error(`Impediment not found: ${id}`);
    }

    eventBus.emit('data', {
      table: this.tableName,
      type: 'updated',
      id: impediment.id,
      timestamp: createEventTimestamp(),
    });

    return impediment;
  }

  /**
   * Escalate an impediment
   */
  escalate(id: string): Impediment {
    return this.update(id, { status: ImpedimentStatus.ESCALATED });
  }

  /**
   * Delete an impediment
   */
  delete(id: string): void {
    const impediment = this.findById(id);
    if (!impediment) {
      throw new Error(`Impediment not found: ${id}`);
    }

    this.db.run(`DELETE FROM ${this.tableName} WHERE id = $id`, { $id: id });

    eventBus.emit('data', {
      table: this.tableName,
      type: 'deleted',
      id: id,
      timestamp: createEventTimestamp(),
    });
  }
}

/**
 * Singleton instance
 */
export const impedimentRepository = new ImpedimentRepository();
