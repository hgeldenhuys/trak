/**
 * Decision Repository - CRUD operations for architectural decisions
 */

import { randomUUID } from 'crypto';
import { getDb, TABLES, COLUMN_MAPPINGS } from '../db';
import { eventBus, createEventTimestamp } from '../events';
import type {
  Decision,
  CreateDecisionInput,
  UpdateDecisionInput,
} from '../types';
import { EntityType } from '../types';

/**
 * Row type from SQLite
 */
interface DecisionRow {
  id: string;
  entity_type: string;
  entity_id: string;
  question: string;
  choice: string;
  alternatives: string;
  rationale: string;
  decided_by: string;
  decided_at: string;
  status: string;
  superseded_by: string | null;
  extensions: string;
  created_at: string;
  updated_at: string;
}

/**
 * Transform database row to entity
 */
function rowToEntity(row: DecisionRow): Decision {
  return {
    id: row.id,
    entityType: row.entity_type as EntityType,
    entityId: row.entity_id,
    question: row.question,
    choice: row.choice,
    alternatives: JSON.parse(row.alternatives),
    rationale: row.rationale,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    status: row.status as Decision['status'],
    supersededBy: row.superseded_by,
    extensions: JSON.parse(row.extensions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * DecisionRepository - Manages decision persistence
 */
export class DecisionRepository {
  /**
   * Create a new decision
   */
  create(input: CreateDecisionInput): Decision {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    const cm = COLUMN_MAPPINGS.decisions;

    const stmt = db.prepare(`
      INSERT INTO ${TABLES.DECISIONS} (
        ${cm.id}, ${cm.entityType}, ${cm.entityId}, ${cm.question}, ${cm.choice},
        ${cm.alternatives}, ${cm.rationale}, ${cm.decidedBy}, ${cm.decidedAt},
        ${cm.status}, ${cm.extensions}, ${cm.createdAt}, ${cm.updatedAt}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.entityType,
      input.entityId,
      input.question,
      input.choice,
      JSON.stringify(input.alternatives || []),
      input.rationale,
      input.decidedBy,
      now,
      input.status || 'accepted',
      JSON.stringify(input.extensions || {}),
      now,
      now
    );

    const entity = this.findById(id);
    if (!entity) throw new Error('Failed to create decision');

    eventBus.emit('data', {
      table: TABLES.DECISIONS,
      type: 'insert',
      id,
      timestamp: createEventTimestamp(),
    });

    return entity;
  }

  /**
   * Find decision by ID
   */
  findById(id: string): Decision | null {
    const db = getDb();
    const row = db
      .query(`SELECT * FROM ${TABLES.DECISIONS} WHERE id = ?`)
      .get(id) as DecisionRow | null;

    return row ? rowToEntity(row) : null;
  }

  /**
   * Find all decisions for an entity
   */
  findByEntity(entityType: EntityType, entityId: string): Decision[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.DECISIONS} WHERE entity_type = ? AND entity_id = ? ORDER BY decided_at DESC`)
      .all(entityType, entityId) as DecisionRow[];

    const entities: Decision[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Find all decisions
   */
  findAll(): Decision[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.DECISIONS} ORDER BY decided_at DESC`)
      .all() as DecisionRow[];

    const entities: Decision[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Find decisions by status
   */
  findByStatus(status: Decision['status']): Decision[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.DECISIONS} WHERE status = ? ORDER BY decided_at DESC`)
      .all(status) as DecisionRow[];

    const entities: Decision[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Find decisions by decider
   */
  findByDecider(decidedBy: string): Decision[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.DECISIONS} WHERE decided_by = ? ORDER BY decided_at DESC`)
      .all(decidedBy) as DecisionRow[];

    const entities: Decision[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Update a decision
   */
  update(id: string, input: UpdateDecisionInput): Decision {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) throw new Error(`Decision not found: ${id}`);

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    const cm = COLUMN_MAPPINGS.decisions;

    if (input.choice !== undefined) {
      updates.push(`${cm.choice} = ?`);
      values.push(input.choice);
    }

    if (input.alternatives !== undefined) {
      updates.push(`${cm.alternatives} = ?`);
      values.push(JSON.stringify(input.alternatives));
    }

    if (input.rationale !== undefined) {
      updates.push(`${cm.rationale} = ?`);
      values.push(input.rationale);
    }

    if (input.status !== undefined) {
      updates.push(`${cm.status} = ?`);
      values.push(input.status);
    }

    if (input.supersededBy !== undefined) {
      updates.push(`${cm.supersededBy} = ?`);
      values.push(input.supersededBy);
    }

    if (input.extensions !== undefined) {
      updates.push(`${cm.extensions} = ?`);
      values.push(JSON.stringify(input.extensions));
    }

    if (updates.length === 0) return existing;

    updates.push(`${cm.updatedAt} = ?`);
    values.push(now);
    values.push(id);

    db.run(
      `UPDATE ${TABLES.DECISIONS} SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const entity = this.findById(id);
    if (!entity) throw new Error('Failed to update decision');

    eventBus.emit('data', {
      table: TABLES.DECISIONS,
      type: 'update',
      id,
      timestamp: createEventTimestamp(),
    });

    return entity;
  }

  /**
   * Supersede a decision with a new one
   */
  supersede(oldId: string, newInput: CreateDecisionInput): Decision {
    const old = this.findById(oldId);
    if (!old) throw new Error(`Decision not found: ${oldId}`);

    // Create the new decision
    const newDecision = this.create(newInput);

    // Mark old as superseded
    this.update(oldId, {
      status: 'superseded',
      supersededBy: newDecision.id,
    });

    return newDecision;
  }

  /**
   * Deprecate a decision
   */
  deprecate(id: string): Decision {
    return this.update(id, { status: 'deprecated' });
  }

  /**
   * Delete a decision
   */
  delete(id: string): void {
    const db = getDb();
    const entity = this.findById(id);
    if (!entity) throw new Error(`Decision not found: ${id}`);

    db.run(`DELETE FROM ${TABLES.DECISIONS} WHERE id = ?`, [id]);

    eventBus.emit('data', {
      table: TABLES.DECISIONS,
      type: 'delete',
      id,
      timestamp: createEventTimestamp(),
    });
  }

  /**
   * Search decisions by question or choice content
   */
  search(term: string): Decision[] {
    const db = getDb();
    const pattern = `%${term}%`;
    const rows = db
      .query(`
        SELECT * FROM ${TABLES.DECISIONS}
        WHERE question LIKE ? OR choice LIKE ? OR rationale LIKE ?
        ORDER BY decided_at DESC
      `)
      .all(pattern, pattern, pattern) as DecisionRow[];

    const entities: Decision[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }
}

/**
 * Singleton instance
 */
export const decisionRepository = new DecisionRepository();
