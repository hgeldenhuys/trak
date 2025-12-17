/**
 * Agent Learning Repository - CRUD operations for agent learnings
 */

import { randomUUID } from 'crypto';
import { getDb, TABLES, COLUMN_MAPPINGS } from '../db';
import { eventBus, createEventTimestamp } from '../events';
import type {
  AgentLearning,
  CreateAgentLearningInput,
} from '../types';

/**
 * Row type from SQLite
 */
interface AgentLearningRow {
  id: string;
  role: string;
  specialization: string | null;
  story_id: string | null;
  task_id: string | null;
  learning: string;
  category: string;
  confidence: number;
  created_at: string;
}

/**
 * Transform database row to entity
 */
function rowToEntity(row: AgentLearningRow): AgentLearning {
  return {
    id: row.id,
    role: row.role,
    specialization: row.specialization,
    storyId: row.story_id,
    taskId: row.task_id,
    learning: row.learning,
    category: row.category as AgentLearning['category'],
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

/**
 * AgentLearningRepository - Manages agent learning persistence
 */
export class AgentLearningRepository {
  /**
   * Create a new agent learning
   */
  create(input: CreateAgentLearningInput): AgentLearning {
    const db = getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    const cm = COLUMN_MAPPINGS.agentLearnings;

    const stmt = db.prepare(`
      INSERT INTO ${TABLES.AGENT_LEARNINGS} (
        ${cm.id}, ${cm.role}, ${cm.specialization}, ${cm.storyId}, ${cm.taskId},
        ${cm.learning}, ${cm.category}, ${cm.confidence}, ${cm.createdAt}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.role,
      input.specialization ?? null,
      input.storyId ?? null,
      input.taskId ?? null,
      input.learning,
      input.category ?? 'pattern',
      input.confidence ?? 0.5,
      now
    );

    const entity = this.findById(id);
    if (!entity) throw new Error('Failed to create agent learning');

    eventBus.emit('data', {
      table: TABLES.AGENT_LEARNINGS,
      type: 'insert',
      id,
      timestamp: createEventTimestamp(),
    });

    return entity;
  }

  /**
   * Find agent learning by ID
   */
  findById(id: string): AgentLearning | null {
    const db = getDb();
    const row = db
      .query(`SELECT * FROM ${TABLES.AGENT_LEARNINGS} WHERE id = ?`)
      .get(id) as AgentLearningRow | null;

    return row ? rowToEntity(row) : null;
  }

  /**
   * Find all learnings for a role (exact match)
   */
  findByRole(role: string): AgentLearning[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.AGENT_LEARNINGS} WHERE role = ? ORDER BY created_at DESC`)
      .all(role) as AgentLearningRow[];

    const entities: AgentLearning[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Find learnings by role and specialization (exact match on both)
   */
  findByRoleAndSpecialization(role: string, specialization: string): AgentLearning[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.AGENT_LEARNINGS} WHERE role = ? AND specialization = ? ORDER BY created_at DESC`)
      .all(role, specialization) as AgentLearningRow[];

    const entities: AgentLearning[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Find learnings for a role with inheritance
   *
   * This is the key method for learning inheritance:
   * - Matches role exactly
   * - For specialization, includes learnings where:
   *   - specialization is NULL (applies to all variants of the role)
   *   - specialization matches exactly
   *   - the requested specialization starts with the learning's specialization (hierarchical)
   *
   * Example: If requesting "backend-dev" with specialization "typescript-sse",
   * this will match learnings for:
   * - role="backend-dev", specialization=NULL
   * - role="backend-dev", specialization="typescript"
   * - role="backend-dev", specialization="typescript-sse"
   */
  findLearningsForRole(role: string, specialization?: string): AgentLearning[] {
    const db = getDb();

    if (!specialization) {
      // No specialization requested - only return learnings without specialization
      const rows = db
        .query(`
          SELECT * FROM ${TABLES.AGENT_LEARNINGS}
          WHERE role = ? AND specialization IS NULL
          ORDER BY confidence DESC, created_at DESC
        `)
        .all(role) as AgentLearningRow[];

      const entities: AgentLearning[] = [];
      for (const row of rows) {
        entities.push(rowToEntity(row));
      }
      return entities;
    }

    // With specialization - implement inheritance
    // Include learnings where:
    // 1. specialization is NULL (base role learnings)
    // 2. specialization matches exactly
    // 3. the requested specialization starts with the learning's specialization
    const rows = db
      .query(`
        SELECT * FROM ${TABLES.AGENT_LEARNINGS}
        WHERE role = ? AND (
          specialization IS NULL
          OR specialization = ?
          OR ? LIKE (specialization || '%')
        )
        ORDER BY
          CASE WHEN specialization IS NULL THEN 0 ELSE 1 END,
          confidence DESC,
          created_at DESC
      `)
      .all(role, specialization, specialization) as AgentLearningRow[];

    const entities: AgentLearning[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Find all learnings for a story
   */
  findByStory(storyId: string): AgentLearning[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.AGENT_LEARNINGS} WHERE story_id = ? ORDER BY created_at DESC`)
      .all(storyId) as AgentLearningRow[];

    const entities: AgentLearning[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Find learnings by category
   */
  findByCategory(category: AgentLearning['category']): AgentLearning[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.AGENT_LEARNINGS} WHERE category = ? ORDER BY created_at DESC`)
      .all(category) as AgentLearningRow[];

    const entities: AgentLearning[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Find all learnings
   */
  findAll(): AgentLearning[] {
    const db = getDb();
    const rows = db
      .query(`SELECT * FROM ${TABLES.AGENT_LEARNINGS} ORDER BY created_at DESC`)
      .all() as AgentLearningRow[];

    const entities: AgentLearning[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Delete an agent learning
   */
  delete(id: string): void {
    const db = getDb();
    const entity = this.findById(id);
    if (!entity) throw new Error(`Agent learning not found: ${id}`);

    db.run(`DELETE FROM ${TABLES.AGENT_LEARNINGS} WHERE id = ?`, [id]);

    eventBus.emit('data', {
      table: TABLES.AGENT_LEARNINGS,
      type: 'delete',
      id,
      timestamp: createEventTimestamp(),
    });
  }

  /**
   * Search learnings by content
   */
  search(term: string): AgentLearning[] {
    const db = getDb();
    const pattern = `%${term}%`;
    const rows = db
      .query(`
        SELECT * FROM ${TABLES.AGENT_LEARNINGS}
        WHERE learning LIKE ?
        ORDER BY confidence DESC, created_at DESC
      `)
      .all(pattern) as AgentLearningRow[];

    const entities: AgentLearning[] = [];
    for (const row of rows) {
      entities.push(rowToEntity(row));
    }
    return entities;
  }

  /**
   * Get learning count by role
   */
  countByRole(role: string): number {
    const db = getDb();
    const row = db
      .query(`SELECT COUNT(*) as count FROM ${TABLES.AGENT_LEARNINGS} WHERE role = ?`)
      .get(role) as { count: number };
    return row.count;
  }
}

/**
 * Singleton instance
 */
export const agentLearningRepository = new AgentLearningRepository();
