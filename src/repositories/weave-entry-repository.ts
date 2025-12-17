/**
 * Weave Entry Repository - CRUD operations for Weave knowledge entries
 *
 * Manages knowledge entries across the 11 Weave dimensions:
 * Q, E, O, M, C, A, T, H, Pi, Mu, Delta
 */

import { randomUUID } from 'crypto';
import { getDb, TABLES, COLUMN_MAPPINGS } from '../db';
import { eventBus, createEventTimestamp } from '../events';
import type {
  WeaveEntry,
  WeaveReference,
  WeaveDimension,
  CreateWeaveEntryInput,
  UpdateWeaveEntryInput,
  CreateWeaveReferenceInput,
} from '../types';

/**
 * Row type from SQLite for weave_entries
 */
interface WeaveEntryRow {
  id: string;
  dimension: string;
  type: string;
  concept: string;
  description: string;
  confidence: number;
  evidence: string;
  discovered_in: string | null;
  discovered_at: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

/**
 * Row type from SQLite for weave_references
 */
interface WeaveReferenceRow {
  id: string;
  from_entry_id: string;
  to_entry_id: string;
  relation_type: string;
  created_at: string;
}

/**
 * Transform database row to WeaveEntry entity
 */
function rowToEntry(row: WeaveEntryRow): WeaveEntry {
  return {
    id: row.id,
    dimension: row.dimension as WeaveDimension,
    type: row.type,
    concept: row.concept,
    description: row.description,
    confidence: row.confidence,
    evidence: JSON.parse(row.evidence) as string[],
    discoveredIn: row.discovered_in,
    discoveredAt: row.discovered_at,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Transform database row to WeaveReference entity
 */
function rowToReference(row: WeaveReferenceRow): WeaveReference {
  return {
    id: row.id,
    fromEntryId: row.from_entry_id,
    toEntryId: row.to_entry_id,
    relationType: row.relation_type,
    createdAt: row.created_at,
  };
}

/**
 * Valid Weave dimensions
 */
export const VALID_DIMENSIONS: WeaveDimension[] = [
  'Q', 'E', 'O', 'M', 'C', 'A', 'T', 'H', 'Pi', 'Mu', 'Delta'
];

/**
 * WeaveEntryRepository - Manages Weave knowledge entry persistence
 */
export class WeaveEntryRepository {
  /**
   * Create a new Weave entry
   */
  create(input: CreateWeaveEntryInput): WeaveEntry {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    const cm = COLUMN_MAPPINGS.weaveEntries;

    const stmt = db.prepare(`
      INSERT INTO ${TABLES.WEAVE_ENTRIES} (
        ${cm.id}, ${cm.dimension}, ${cm.type}, ${cm.concept}, ${cm.description},
        ${cm.confidence}, ${cm.evidence}, ${cm.discoveredIn}, ${cm.discoveredAt},
        ${cm.metadata}, ${cm.createdAt}, ${cm.updatedAt}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.dimension,
      input.type,
      input.concept,
      input.description,
      input.confidence ?? 0.5,
      JSON.stringify(input.evidence ?? []),
      input.discoveredIn ?? null,
      input.discoveredAt ?? null,
      JSON.stringify(input.metadata ?? {}),
      now,
      now
    );

    const entity = this.findById(id);
    if (!entity) throw new Error('Failed to create weave entry');

    eventBus.emit('data', {
      table: TABLES.WEAVE_ENTRIES,
      type: 'insert',
      id,
      timestamp: createEventTimestamp(),
    });

    return entity;
  }

  /**
   * Find Weave entry by ID
   */
  findById(id: string): WeaveEntry | null {
    const db = getDb();
    const row = db
      .query(`SELECT * FROM ${TABLES.WEAVE_ENTRIES} WHERE id = ?`)
      .get(id) as WeaveEntryRow | null;

    return row ? rowToEntry(row) : null;
  }

  /**
   * Find all entries in a dimension
   */
  findByDimension(dimension: WeaveDimension): WeaveEntry[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.WEAVE_ENTRIES} WHERE dimension = ? ORDER BY confidence DESC, created_at DESC`)
      .all(dimension) as WeaveEntryRow[];

    return rows.map(rowToEntry);
  }

  /**
   * Find entries by dimension and type
   */
  findByDimensionAndType(dimension: WeaveDimension, type: string): WeaveEntry[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.WEAVE_ENTRIES} WHERE dimension = ? AND type = ? ORDER BY confidence DESC, created_at DESC`)
      .all(dimension, type) as WeaveEntryRow[];

    return rows.map(rowToEntry);
  }

  /**
   * Find entries discovered in a specific story
   */
  findByDiscoveredIn(storyId: string): WeaveEntry[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.WEAVE_ENTRIES} WHERE discovered_in = ? ORDER BY created_at DESC`)
      .all(storyId) as WeaveEntryRow[];

    return rows.map(rowToEntry);
  }

  /**
   * Find entries with minimum confidence threshold
   */
  findWithMinConfidence(minConfidence: number): WeaveEntry[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.WEAVE_ENTRIES} WHERE confidence >= ? ORDER BY confidence DESC, created_at DESC`)
      .all(minConfidence) as WeaveEntryRow[];

    return rows.map(rowToEntry);
  }

  /**
   * Find all entries
   */
  findAll(): WeaveEntry[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.WEAVE_ENTRIES} ORDER BY dimension, type, confidence DESC`)
      .all() as WeaveEntryRow[];

    return rows.map(rowToEntry);
  }

  /**
   * Update an existing Weave entry
   */
  update(id: string, updates: UpdateWeaveEntryInput): WeaveEntry {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) throw new Error(`Weave entry not found: ${id}`);

    const now = new Date().toISOString();
    const cm = COLUMN_MAPPINGS.weaveEntries;

    const setClauses: string[] = [`${cm.updatedAt} = ?`];
    const values: unknown[] = [now];

    if (updates.concept !== undefined) {
      setClauses.push(`${cm.concept} = ?`);
      values.push(updates.concept);
    }
    if (updates.description !== undefined) {
      setClauses.push(`${cm.description} = ?`);
      values.push(updates.description);
    }
    if (updates.confidence !== undefined) {
      setClauses.push(`${cm.confidence} = ?`);
      values.push(updates.confidence);
    }
    if (updates.evidence !== undefined) {
      setClauses.push(`${cm.evidence} = ?`);
      values.push(JSON.stringify(updates.evidence));
    }
    if (updates.metadata !== undefined) {
      setClauses.push(`${cm.metadata} = ?`);
      values.push(JSON.stringify(updates.metadata));
    }

    values.push(id);

    db.run(
      `UPDATE ${TABLES.WEAVE_ENTRIES} SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );

    const entity = this.findById(id);
    if (!entity) throw new Error('Failed to update weave entry');

    eventBus.emit('data', {
      table: TABLES.WEAVE_ENTRIES,
      type: 'update',
      id,
      timestamp: createEventTimestamp(),
    });

    return entity;
  }

  /**
   * Delete a Weave entry
   */
  delete(id: string): void {
    const db = getDb();
    const entity = this.findById(id);
    if (!entity) throw new Error(`Weave entry not found: ${id}`);

    db.run(`DELETE FROM ${TABLES.WEAVE_ENTRIES} WHERE id = ?`, [id]);

    eventBus.emit('data', {
      table: TABLES.WEAVE_ENTRIES,
      type: 'delete',
      id,
      timestamp: createEventTimestamp(),
    });
  }

  /**
   * Search entries across concept, description, and evidence
   */
  search(query: string, options?: { dimension?: WeaveDimension; type?: string }): WeaveEntry[] {
    const db = getDb();
    const pattern = `%${query}%`;

    // Build the query based on options
    if (options?.dimension && options?.type) {
      const rows = db
        .query(`
          SELECT * FROM ${TABLES.WEAVE_ENTRIES}
          WHERE (concept LIKE ? OR description LIKE ? OR evidence LIKE ?)
            AND dimension = ? AND type = ?
          ORDER BY confidence DESC, created_at DESC
        `)
        .all(pattern, pattern, pattern, options.dimension, options.type) as WeaveEntryRow[];
      return rows.map(rowToEntry);
    } else if (options?.dimension) {
      const rows = db
        .query(`
          SELECT * FROM ${TABLES.WEAVE_ENTRIES}
          WHERE (concept LIKE ? OR description LIKE ? OR evidence LIKE ?)
            AND dimension = ?
          ORDER BY confidence DESC, created_at DESC
        `)
        .all(pattern, pattern, pattern, options.dimension) as WeaveEntryRow[];
      return rows.map(rowToEntry);
    } else if (options?.type) {
      const rows = db
        .query(`
          SELECT * FROM ${TABLES.WEAVE_ENTRIES}
          WHERE (concept LIKE ? OR description LIKE ? OR evidence LIKE ?)
            AND type = ?
          ORDER BY confidence DESC, created_at DESC
        `)
        .all(pattern, pattern, pattern, options.type) as WeaveEntryRow[];
      return rows.map(rowToEntry);
    } else {
      const rows = db
        .query(`
          SELECT * FROM ${TABLES.WEAVE_ENTRIES}
          WHERE (concept LIKE ? OR description LIKE ? OR evidence LIKE ?)
          ORDER BY confidence DESC, created_at DESC
        `)
        .all(pattern, pattern, pattern) as WeaveEntryRow[];
      return rows.map(rowToEntry);
    }
  }

  // ==========================================================================
  // Reference Management
  // ==========================================================================

  /**
   * Create a reference between two entries
   */
  createReference(input: CreateWeaveReferenceInput): WeaveReference {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    const cm = COLUMN_MAPPINGS.weaveReferences;

    // Verify both entries exist
    const fromEntry = this.findById(input.fromEntryId);
    const toEntry = this.findById(input.toEntryId);
    if (!fromEntry) throw new Error(`From entry not found: ${input.fromEntryId}`);
    if (!toEntry) throw new Error(`To entry not found: ${input.toEntryId}`);

    const stmt = db.prepare(`
      INSERT INTO ${TABLES.WEAVE_REFERENCES} (
        ${cm.id}, ${cm.fromEntryId}, ${cm.toEntryId}, ${cm.relationType}, ${cm.createdAt}
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, input.fromEntryId, input.toEntryId, input.relationType, now);

    return {
      id,
      fromEntryId: input.fromEntryId,
      toEntryId: input.toEntryId,
      relationType: input.relationType,
      createdAt: now,
    };
  }

  /**
   * Find references from an entry
   */
  findReferencesFrom(entryId: string): WeaveReference[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.WEAVE_REFERENCES} WHERE from_entry_id = ?`)
      .all(entryId) as WeaveReferenceRow[];

    return rows.map(rowToReference);
  }

  /**
   * Find references to an entry
   */
  findReferencesTo(entryId: string): WeaveReference[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.WEAVE_REFERENCES} WHERE to_entry_id = ?`)
      .all(entryId) as WeaveReferenceRow[];

    return rows.map(rowToReference);
  }

  /**
   * Delete a reference
   */
  deleteReference(id: string): void {
    const db = getDb();
    db.run(`DELETE FROM ${TABLES.WEAVE_REFERENCES} WHERE id = ?`, [id]);
  }

  // ==========================================================================
  // Statistics and Summary
  // ==========================================================================

  /**
   * Get count by dimension
   */
  countByDimension(): Record<string, number> {
    const db = getDb();
    const rows = db
      .query(`SELECT dimension, COUNT(*) as count FROM ${TABLES.WEAVE_ENTRIES} GROUP BY dimension`)
      .all() as { dimension: string; count: number }[];

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.dimension] = row.count;
    }
    return result;
  }

  /**
   * Get count by dimension and type
   */
  countByDimensionAndType(): Record<string, Record<string, number>> {
    const db = getDb();
    const rows = db
      .query(`SELECT dimension, type, COUNT(*) as count FROM ${TABLES.WEAVE_ENTRIES} GROUP BY dimension, type`)
      .all() as { dimension: string; type: string; count: number }[];

    const result: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      if (!result[row.dimension]) {
        result[row.dimension] = {};
      }
      result[row.dimension][row.type] = row.count;
    }
    return result;
  }
}

/**
 * Singleton instance
 */
export const weaveEntryRepository = new WeaveEntryRepository();
