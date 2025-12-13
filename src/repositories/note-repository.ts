/**
 * Note Repository
 *
 * Provides database operations for Note entities using bun:sqlite.
 * All mutations emit events via the event bus for reactive updates.
 */

import type { Database } from 'bun:sqlite';
import { getDb } from '../db';
import { TABLES } from '../db/schema';
import { eventBus, createEventTimestamp } from '../events';
import type {
  Note,
  CreateNoteInput,
  UpdateNoteInput,
} from '../types';
import { EntityType } from '../types';

/**
 * Database row type for notes table (snake_case)
 */
interface NoteRow {
  id: string;
  entity_type: string;
  entity_id: string;
  content: string;
  author: string;
  pinned: number;
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
 * Convert database row (snake_case) to Note entity (camelCase)
 */
function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    entityType: row.entity_type as EntityType,
    entityId: row.entity_id,
    content: row.content,
    author: row.author,
    pinned: row.pinned === 1,
    extensions: JSON.parse(row.extensions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Note Repository Class
 */
export class NoteRepository {
  private readonly tableName = TABLES.NOTES;
  private dbOverride: Database | null = null;

  constructor(db?: Database) {
    this.dbOverride = db ?? null;
  }

  private get db(): Database {
    return this.dbOverride ?? getDb();
  }

  /**
   * Create a new note
   */
  create(input: CreateNoteInput): Note {
    const id = generateId();
    const now = getCurrentTimestamp();
    const extensions = JSON.stringify(input.extensions ?? {});

    this.db.run(`
      INSERT INTO ${this.tableName} (id, entity_type, entity_id, content, author, pinned, extensions, created_at, updated_at)
      VALUES ($id, $entityType, $entityId, $content, $author, $pinned, $extensions, $createdAt, $updatedAt)
    `, {
      $id: id,
      $entityType: input.entityType,
      $entityId: input.entityId,
      $content: input.content,
      $author: input.author,
      $pinned: input.pinned ? 1 : 0,
      $extensions: extensions,
      $createdAt: now,
      $updatedAt: now,
    });

    const note: Note = {
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      content: input.content,
      author: input.author,
      pinned: input.pinned ?? false,
      extensions: input.extensions ?? {},
      createdAt: now,
      updatedAt: now,
    };

    eventBus.emit('data', {
      table: this.tableName,
      type: 'created',
      id: note.id,
      timestamp: createEventTimestamp(),
    });

    return note;
  }

  /**
   * Find a note by ID
   */
  findById(id: string): Note | null {
    const row = this.db.query(`SELECT * FROM ${this.tableName} WHERE id = $id`).get({ $id: id }) as NoteRow | null;
    return row ? toNote(row) : null;
  }

  /**
   * Find all notes for an entity
   */
  findByEntity(entityType: EntityType, entityId: string): Note[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName}
      WHERE entity_type = $entityType AND entity_id = $entityId
      ORDER BY pinned DESC, created_at DESC
    `).all({ $entityType: entityType, $entityId: entityId }) as NoteRow[];

    const result: Note[] = [];
    for (const row of rows) {
      result.push(toNote(row));
    }
    return result;
  }

  /**
   * Find all pinned notes
   */
  findPinned(): Note[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName} WHERE pinned = 1 ORDER BY created_at DESC
    `).all() as NoteRow[];

    const result: Note[] = [];
    for (const row of rows) {
      result.push(toNote(row));
    }
    return result;
  }

  /**
   * Find all notes
   */
  findAll(): Note[] {
    const rows = this.db.query(`
      SELECT * FROM ${this.tableName} ORDER BY created_at DESC
    `).all() as NoteRow[];

    const result: Note[] = [];
    for (const row of rows) {
      result.push(toNote(row));
    }
    return result;
  }

  /**
   * Update a note
   */
  update(id: string, input: UpdateNoteInput): Note {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Note not found: ${id}`);
    }

    const now = getCurrentTimestamp();
    const updates: string[] = ['updated_at = $updatedAt'];
    const params: Record<string, unknown> = { $id: id, $updatedAt: now };

    if (input.content !== undefined) {
      updates.push('content = $content');
      params.$content = input.content;
    }

    if (input.pinned !== undefined) {
      updates.push('pinned = $pinned');
      params.$pinned = input.pinned ? 1 : 0;
    }

    if (input.extensions !== undefined) {
      updates.push('extensions = $extensions');
      params.$extensions = JSON.stringify(input.extensions);
    }

    this.db.run(`UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = $id`, params);

    const note = this.findById(id)!;

    eventBus.emit('data', {
      table: this.tableName,
      type: 'updated',
      id: note.id,
      timestamp: createEventTimestamp(),
    });

    return note;
  }

  /**
   * Delete a note
   */
  delete(id: string): void {
    const note = this.findById(id);
    if (!note) {
      throw new Error(`Note not found: ${id}`);
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
   * Toggle pin status
   */
  togglePin(id: string): Note {
    const note = this.findById(id);
    if (!note) {
      throw new Error(`Note not found: ${id}`);
    }
    return this.update(id, { pinned: !note.pinned });
  }
}

/**
 * Singleton instance
 */
export const noteRepository = new NoteRepository();
