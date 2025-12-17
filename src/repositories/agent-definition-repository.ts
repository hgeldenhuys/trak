/**
 * Agent Definition Repository - CRUD operations for agent definitions
 */

import { randomUUID } from 'crypto';
import { getDb, TABLES, COLUMN_MAPPINGS } from '../db';
import { eventBus, createEventTimestamp } from '../events';
import type {
  AgentDefinition,
  CreateAgentDefinitionInput,
  UpdateAgentDefinitionInput,
} from '../types';

/**
 * Row type from SQLite
 */
interface AgentDefinitionRow {
  id: string;
  name: string;
  version: number;
  role: string;
  specialization: string | null;
  persona: string;
  objective: string;
  priming: string;
  constraints: string;
  derived_from: string | null;
  success_count: number;
  failure_count: number;
  created_for_story: string | null;
  created_at: string;
}

/**
 * Transform database row to entity
 */
function rowToEntity(row: AgentDefinitionRow): AgentDefinition {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    role: row.role,
    specialization: row.specialization,
    persona: row.persona,
    objective: row.objective,
    priming: JSON.parse(row.priming),
    constraints: JSON.parse(row.constraints),
    derivedFrom: row.derived_from,
    successCount: row.success_count,
    failureCount: row.failure_count,
    createdForStory: row.created_for_story,
    createdAt: row.created_at,
  };
}

/**
 * AgentDefinitionRepository - Manages agent definition persistence
 */
export class AgentDefinitionRepository {
  /**
   * Create a new agent definition
   */
  create(input: CreateAgentDefinitionInput): AgentDefinition {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    const cm = COLUMN_MAPPINGS.agentDefinitions;

    // Get next version for this name
    const version = input.version ?? this.getNextVersion(input.name);

    const stmt = db.prepare(`
      INSERT INTO ${TABLES.AGENT_DEFINITIONS} (
        ${cm.id}, ${cm.name}, ${cm.version}, ${cm.role}, ${cm.specialization},
        ${cm.persona}, ${cm.objective}, ${cm.priming}, ${cm.constraints},
        ${cm.derivedFrom}, ${cm.successCount}, ${cm.failureCount},
        ${cm.createdForStory}, ${cm.createdAt}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.name,
      version,
      input.role,
      input.specialization ?? null,
      input.persona ?? '',
      input.objective ?? '',
      JSON.stringify(input.priming ?? {}),
      JSON.stringify(input.constraints ?? {}),
      input.derivedFrom ?? null,
      0,
      0,
      input.createdForStory ?? null,
      now
    );

    const entity = this.findById(id);
    if (!entity) throw new Error('Failed to create agent definition');

    eventBus.emit('data', {
      table: TABLES.AGENT_DEFINITIONS,
      type: 'insert',
      id,
      timestamp: createEventTimestamp(),
    });

    return entity;
  }

  /**
   * Get the next version number for an agent name
   */
  private getNextVersion(name: string): number {
    const db = getDb();
    const row = db
      .query(`SELECT MAX(version) as max_version FROM ${TABLES.AGENT_DEFINITIONS} WHERE name = ?`)
      .get(name) as { max_version: number | null } | null;

    return (row?.max_version ?? 0) + 1;
  }

  /**
   * Find agent definition by ID
   */
  findById(id: string): AgentDefinition | null {
    const db = getDb();
    const row = db
      .query(`SELECT * FROM ${TABLES.AGENT_DEFINITIONS} WHERE id = ?`)
      .get(id) as AgentDefinitionRow | null;

    return row ? rowToEntity(row) : null;
  }

  /**
   * Find all versions of an agent by name
   */
  findByName(name: string): AgentDefinition[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.AGENT_DEFINITIONS} WHERE name = ? ORDER BY version DESC`)
      .all(name) as AgentDefinitionRow[];

    const entities: AgentDefinition[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Find a specific version of an agent by name
   */
  findByNameAndVersion(name: string, version: number): AgentDefinition | null {
    const db = getDb();
    const row = db
      .query(`SELECT * FROM ${TABLES.AGENT_DEFINITIONS} WHERE name = ? AND version = ?`)
      .get(name, version) as AgentDefinitionRow | null;

    return row ? rowToEntity(row) : null;
  }

  /**
   * Find the latest version of an agent by name
   */
  findLatestByName(name: string): AgentDefinition | null {
    const db = getDb();
    const row = db
      .query(`SELECT * FROM ${TABLES.AGENT_DEFINITIONS} WHERE name = ? ORDER BY version DESC LIMIT 1`)
      .get(name) as AgentDefinitionRow | null;

    return row ? rowToEntity(row) : null;
  }

  /**
   * Find all agent definitions by role
   */
  findByRole(role: string): AgentDefinition[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.AGENT_DEFINITIONS} WHERE role = ? ORDER BY name, version DESC`)
      .all(role) as AgentDefinitionRow[];

    const entities: AgentDefinition[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Find all agent definitions
   */
  findAll(): AgentDefinition[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.AGENT_DEFINITIONS} ORDER BY name, version DESC`)
      .all() as AgentDefinitionRow[];

    const entities: AgentDefinition[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Update an agent definition
   */
  update(id: string, input: UpdateAgentDefinitionInput): AgentDefinition {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) throw new Error(`Agent definition not found: ${id}`);

    const updates: string[] = [];
    const values: (string | number | null)[] = [];
    const cm = COLUMN_MAPPINGS.agentDefinitions;

    if (input.persona !== undefined) {
      updates.push(`${cm.persona} = ?`);
      values.push(input.persona);
    }

    if (input.objective !== undefined) {
      updates.push(`${cm.objective} = ?`);
      values.push(input.objective);
    }

    if (input.priming !== undefined) {
      updates.push(`${cm.priming} = ?`);
      values.push(JSON.stringify(input.priming));
    }

    if (input.constraints !== undefined) {
      updates.push(`${cm.constraints} = ?`);
      values.push(JSON.stringify(input.constraints));
    }

    if (input.successCount !== undefined) {
      updates.push(`${cm.successCount} = ?`);
      values.push(input.successCount);
    }

    if (input.failureCount !== undefined) {
      updates.push(`${cm.failureCount} = ?`);
      values.push(input.failureCount);
    }

    if (updates.length === 0) return existing;

    values.push(id);

    db.run(
      `UPDATE ${TABLES.AGENT_DEFINITIONS} SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const entity = this.findById(id);
    if (!entity) throw new Error('Failed to update agent definition');

    eventBus.emit('data', {
      table: TABLES.AGENT_DEFINITIONS,
      type: 'update',
      id,
      timestamp: createEventTimestamp(),
    });

    return entity;
  }

  /**
   * Increment success count for an agent definition
   */
  incrementSuccess(id: string): AgentDefinition {
    const existing = this.findById(id);
    if (!existing) throw new Error(`Agent definition not found: ${id}`);

    return this.update(id, { successCount: existing.successCount + 1 });
  }

  /**
   * Increment failure count for an agent definition
   */
  incrementFailure(id: string): AgentDefinition {
    const existing = this.findById(id);
    if (!existing) throw new Error(`Agent definition not found: ${id}`);

    return this.update(id, { failureCount: existing.failureCount + 1 });
  }

  /**
   * Delete an agent definition
   */
  delete(id: string): void {
    const db = getDb();
    const entity = this.findById(id);
    if (!entity) throw new Error(`Agent definition not found: ${id}`);

    db.run(`DELETE FROM ${TABLES.AGENT_DEFINITIONS} WHERE id = ?`, [id]);

    eventBus.emit('data', {
      table: TABLES.AGENT_DEFINITIONS,
      type: 'delete',
      id,
      timestamp: createEventTimestamp(),
    });
  }

  /**
   * Parse a name-version string like "backend-dev-typescript-v2" into name and version
   */
  parseNameVersion(ref: string): { name: string; version: number } | null {
    const match = ref.match(/^(.+)-v(\d+)$/);
    if (match) {
      return { name: match[1], version: parseInt(match[2], 10) };
    }
    return null;
  }

  /**
   * Resolve an agent definition by full ID, name-version, or just name (returns latest)
   */
  resolve(ref: string): AgentDefinition | null {
    // Try full ID first
    let definition = this.findById(ref);
    if (definition) return definition;

    // Try name-version format
    const parsed = this.parseNameVersion(ref);
    if (parsed) {
      definition = this.findByNameAndVersion(parsed.name, parsed.version);
      if (definition) return definition;
    }

    // Try as just a name (return latest version)
    definition = this.findLatestByName(ref);
    if (definition) return definition;

    // Try prefix match on ID
    const all = this.findAll();
    definition = all.find(d => d.id.startsWith(ref)) || null;
    return definition;
  }
}

/**
 * Singleton instance
 */
export const agentDefinitionRepository = new AgentDefinitionRepository();
