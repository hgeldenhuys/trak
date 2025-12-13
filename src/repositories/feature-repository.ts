/**
 * Feature Repository
 *
 * Provides database operations for Feature entities using bun:sqlite.
 * All mutations emit events via the event bus for reactive updates.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from '../db';
import { TABLES } from '../db/schema';
import { getEventBus, createEventTimestamp } from '../events';
import type {
  Feature,
  CreateFeatureInput,
  UpdateFeatureInput,
} from '../types';

/**
 * Database row type for features table (snake_case)
 */
interface FeatureRow {
  id: string;
  code: string;
  name: string;
  description: string;
  story_counter: number;
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
 * Convert database row (snake_case) to Feature entity (camelCase)
 */
function toFeature(row: FeatureRow): Feature {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    storyCounter: row.story_counter,
    extensions: JSON.parse(row.extensions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Feature Repository Class
 *
 * Wraps bun:sqlite operations for Feature entities.
 * Uses prepared statements for performance.
 * Emits events after successful mutations.
 */
export class FeatureRepository {
  private readonly tableName = TABLES.FEATURES;

  /**
   * Optional database instance override for testing.
   * When provided, this is used instead of getDb().
   */
  private dbOverride: Database | null = null;

  // Prepared statement cache
  private _insertStmt: ReturnType<Database['query']> | null = null;
  private _findByIdStmt: ReturnType<Database['query']> | null = null;
  private _findByCodeStmt: ReturnType<Database['query']> | null = null;
  private _findAllStmt: ReturnType<Database['query']> | null = null;
  private _updateStmt: ReturnType<Database['query']> | null = null;
  private _deleteStmt: ReturnType<Database['query']> | null = null;
  private _incrementCounterStmt: ReturnType<Database['query']> | null = null;

  /**
   * Create a new FeatureRepository
   *
   * @param db - Optional database instance override for testing
   */
  constructor(db?: Database) {
    this.dbOverride = db ?? null;
  }

  /**
   * Get the database instance (uses override if provided, otherwise getDb())
   */
  private get db(): Database {
    return this.dbOverride ?? getDb();
  }

  /**
   * Get prepared insert statement (lazy initialization)
   */
  private get insertStmt() {
    if (!this._insertStmt) {
      this._insertStmt = this.db.query(`
        INSERT INTO ${this.tableName} (id, code, name, description, story_counter, extensions, created_at, updated_at)
        VALUES ($id, $code, $name, $description, $storyCounter, $extensions, $createdAt, $updatedAt)
      `);
    }
    return this._insertStmt;
  }

  /**
   * Get prepared findById statement (lazy initialization)
   */
  private get findByIdStmt() {
    if (!this._findByIdStmt) {
      this._findByIdStmt = this.db.query(`
        SELECT * FROM ${this.tableName} WHERE id = $id
      `);
    }
    return this._findByIdStmt;
  }

  /**
   * Get prepared findByCode statement (lazy initialization)
   */
  private get findByCodeStmt() {
    if (!this._findByCodeStmt) {
      this._findByCodeStmt = this.db.query(`
        SELECT * FROM ${this.tableName} WHERE code = $code
      `);
    }
    return this._findByCodeStmt;
  }

  /**
   * Get prepared findAll statement (lazy initialization)
   */
  private get findAllStmt() {
    if (!this._findAllStmt) {
      this._findAllStmt = this.db.query(`
        SELECT * FROM ${this.tableName} ORDER BY created_at ASC
      `);
    }
    return this._findAllStmt;
  }

  /**
   * Get prepared delete statement (lazy initialization)
   */
  private get deleteStmt() {
    if (!this._deleteStmt) {
      this._deleteStmt = this.db.query(`
        DELETE FROM ${this.tableName} WHERE id = $id
      `);
    }
    return this._deleteStmt;
  }

  /**
   * Get prepared increment counter statement (lazy initialization)
   */
  private get incrementCounterStmt() {
    if (!this._incrementCounterStmt) {
      this._incrementCounterStmt = this.db.query(`
        UPDATE ${this.tableName}
        SET story_counter = story_counter + 1, updated_at = $updatedAt
        WHERE id = $id
        RETURNING story_counter
      `);
    }
    return this._incrementCounterStmt;
  }

  /**
   * Create a new feature
   *
   * @param input - Feature creation input (code, name, description)
   * @returns The created Feature entity
   * @emits feature:created
   */
  create(input: CreateFeatureInput): Feature {
    const id = generateId();
    const now = getCurrentTimestamp();
    const extensions = JSON.stringify(input.extensions ?? {});

    this.insertStmt.run({
      $id: id,
      $code: input.code.toUpperCase(),
      $name: input.name,
      $description: input.description,
      $storyCounter: 0,
      $extensions: extensions,
      $createdAt: now,
      $updatedAt: now,
    });

    const feature: Feature = {
      id,
      code: input.code.toUpperCase(),
      name: input.name,
      description: input.description,
      storyCounter: 0,
      extensions: input.extensions ?? {},
      createdAt: now,
      updatedAt: now,
    };

    // Emit creation event
    getEventBus().emit('feature:created', {
      entityId: feature.id,
      entity: feature,
      timestamp: createEventTimestamp(),
    });

    return feature;
  }

  /**
   * Find a feature by its ID
   *
   * @param id - The feature's UUID
   * @returns The Feature entity or null if not found
   */
  findById(id: string): Feature | null {
    const row = this.findByIdStmt.get({ $id: id }) as FeatureRow | null;
    return row ? toFeature(row) : null;
  }

  /**
   * Find a feature by its code
   *
   * @param code - The feature's code (e.g., 'NOTIFY', 'AUTH')
   * @returns The Feature entity or null if not found
   */
  findByCode(code: string): Feature | null {
    const row = this.findByCodeStmt.get({ $code: code.toUpperCase() }) as FeatureRow | null;
    return row ? toFeature(row) : null;
  }

  /**
   * Find all features
   *
   * @returns Array of all Feature entities, ordered by creation date
   */
  findAll(): Feature[] {
    const rows = this.findAllStmt.all() as FeatureRow[];
    const result: Feature[] = [];
    for (const row of rows) {
      result.push(toFeature(row));
    }
    return result;
  }

  /**
   * Update a feature
   *
   * @param id - The feature's UUID
   * @param input - Fields to update (name, description, extensions)
   * @returns The updated Feature entity
   * @throws Error if feature not found
   * @emits feature:updated
   */
  update(id: string, input: UpdateFeatureInput): Feature {
    // Get current state for event
    const previousState = this.findById(id);
    if (!previousState) {
      throw new Error(`Feature not found: ${id}`);
    }

    const now = getCurrentTimestamp();
    const changedFields: (keyof Feature)[] = [];

    // Build dynamic update query based on provided fields
    const updates: string[] = ['updated_at = $updatedAt'];
    const params: Record<string, unknown> = {
      $id: id,
      $updatedAt: now,
    };

    if (input.name !== undefined) {
      updates.push('name = $name');
      params.$name = input.name;
      if (input.name !== previousState.name) {
        changedFields.push('name');
      }
    }

    if (input.description !== undefined) {
      updates.push('description = $description');
      params.$description = input.description;
      if (input.description !== previousState.description) {
        changedFields.push('description');
      }
    }

    if (input.extensions !== undefined) {
      updates.push('extensions = $extensions');
      params.$extensions = JSON.stringify(input.extensions);
      if (JSON.stringify(input.extensions) !== JSON.stringify(previousState.extensions)) {
        changedFields.push('extensions');
      }
    }

    // Execute update
    const updateQuery = `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = $id`;
    this.db.run(updateQuery, params);

    // Get updated feature
    const feature = this.findById(id)!;

    // Emit update event
    getEventBus().emit('feature:updated', {
      entityId: feature.id,
      entity: feature,
      previousState,
      changedFields,
      timestamp: createEventTimestamp(),
    });

    return feature;
  }

  /**
   * Delete a feature
   *
   * @param id - The feature's UUID
   * @throws Error if feature not found
   * @emits feature:deleted
   */
  delete(id: string): void {
    // Get current state for event
    const feature = this.findById(id);
    if (!feature) {
      throw new Error(`Feature not found: ${id}`);
    }

    this.deleteStmt.run({ $id: id });

    // Emit deletion event
    getEventBus().emit('feature:deleted', {
      entityId: feature.id,
      entity: feature,
      timestamp: createEventTimestamp(),
    });
  }

  /**
   * Increment the story counter for a feature
   *
   * Used when creating a new story to get the next story number.
   *
   * @param id - The feature's UUID
   * @returns The new story counter value
   * @throws Error if feature not found
   */
  incrementStoryCounter(id: string): number {
    const now = getCurrentTimestamp();

    const result = this.incrementCounterStmt.get({
      $id: id,
      $updatedAt: now,
    }) as { story_counter: number } | null;

    if (!result) {
      throw new Error(`Feature not found: ${id}`);
    }

    return result.story_counter;
  }

  /**
   * Clear prepared statement cache
   * Call this if the database connection changes
   */
  clearCache(): void {
    this._insertStmt = null;
    this._findByIdStmt = null;
    this._findByCodeStmt = null;
    this._findAllStmt = null;
    this._updateStmt = null;
    this._deleteStmt = null;
    this._incrementCounterStmt = null;
  }
}

/**
 * Singleton instance of FeatureRepository
 */
export const featureRepository = new FeatureRepository();
