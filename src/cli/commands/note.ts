/**
 * Note CLI Command - Manage notes attached to entities
 */

import { Command } from 'commander';
import { noteRepository, storyRepository, taskRepository, featureRepository } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';
import { EntityType } from '../../types';

/**
 * Resolve entity type and ID from user input
 */
function resolveEntity(options: { story?: string; task?: string; feature?: string }): { entityType: EntityType; entityId: string } | null {
  if (options.story) {
    const story = storyRepository.findByCode(options.story) || storyRepository.findById(options.story);
    if (!story) {
      error(`Story not found: ${options.story}`);
      return null;
    }
    return { entityType: EntityType.STORY, entityId: story.id };
  }
  if (options.task) {
    const task = taskRepository.findById(options.task);
    if (!task) {
      error(`Task not found: ${options.task}`);
      return null;
    }
    return { entityType: EntityType.TASK, entityId: task.id };
  }
  if (options.feature) {
    const feature = featureRepository.findByCode(options.feature) || featureRepository.findById(options.feature);
    if (!feature) {
      error(`Feature not found: ${options.feature}`);
      return null;
    }
    return { entityType: EntityType.FEATURE, entityId: feature.id };
  }
  return null;
}

/**
 * Resolve a note by full ID or short prefix
 */
function resolveNote(ref: string) {
  // Try full ID first
  let note = noteRepository.findById(ref);
  if (note) return note;

  // Try prefix match
  const all = noteRepository.findAll();
  note = all.find(n => n.id.startsWith(ref)) || null;
  return note;
}

export function createNoteCommand(): Command {
  const noteCommand = new Command('note')
    .description('Manage notes on entities');

  /**
   * note add - Add a note to an entity
   */
  noteCommand
    .command('add')
    .description('Add a note to a story, task, or feature')
    .option('-s, --story <code>', 'Story code or ID')
    .option('-t, --task <id>', 'Task ID')
    .option('-f, --feature <code>', 'Feature code or ID')
    .requiredOption('-c, --content <content>', 'Note content')
    .option('-a, --author <author>', 'Author name', 'cli')
    .option('-p, --pin', 'Pin the note')
    .action((options) => {
      const entity = resolveEntity(options);
      if (!entity) {
        error('Must specify --story, --task, or --feature');
        process.exit(1);
      }

      const note = noteRepository.create({
        entityType: entity.entityType,
        entityId: entity.entityId,
        content: options.content,
        author: options.author,
        pinned: options.pin || false,
      });

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(note, null, 2));
      } else {
        success(`Note added: ${note.id.slice(0, 8)}`);
      }
    });

  /**
   * note list - List notes for an entity
   */
  noteCommand
    .command('list')
    .description('List notes for an entity')
    .option('-s, --story <code>', 'Story code or ID')
    .option('-t, --task <id>', 'Task ID')
    .option('-f, --feature <code>', 'Feature code or ID')
    .option('--all', 'List all notes')
    .option('--pinned', 'List only pinned notes')
    .action((options) => {
      let notes;

      if (options.all) {
        notes = noteRepository.findAll();
      } else if (options.pinned) {
        notes = noteRepository.findPinned();
      } else {
        const entity = resolveEntity(options);
        if (!entity) {
          error('Must specify --story, --task, --feature, --all, or --pinned');
          process.exit(1);
        }
        notes = noteRepository.findByEntity(entity.entityType, entity.entityId);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(notes, null, 2));
      } else if (notes.length === 0) {
        output('No notes found');
      } else {
        const rows = notes.map(n => ({
          id: n.id.slice(0, 8),
          pin: n.pinned ? '*' : '',
          author: n.author,
          content: n.content.slice(0, 50) + (n.content.length > 50 ? '...' : ''),
          date: n.createdAt.slice(0, 10),
        }));
        output(formatTable(rows, ['id', 'pin', 'author', 'content', 'date'], {
          headers: { id: 'ID', pin: 'PIN', author: 'AUTHOR', content: 'CONTENT', date: 'DATE' }
        }));
      }
    });

  /**
   * note show - Show a specific note
   */
  noteCommand
    .command('show <ref>')
    .description('Show note details (accepts full ID or short prefix)')
    .action((ref) => {
      const note = resolveNote(ref);
      if (!note) {
        error(`Note not found: ${ref}`);
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(note, null, 2));
      } else {
        output(`ID: ${note.id}`);
        output(`Entity: ${note.entityType}:${note.entityId}`);
        output(`Author: ${note.author}`);
        output(`Pinned: ${note.pinned ? 'Yes' : 'No'}`);
        output(`Created: ${note.createdAt}`);
        output(`\n${note.content}`);
      }
    });

  /**
   * note pin - Toggle pin status
   */
  noteCommand
    .command('pin <ref>')
    .description('Toggle pin status of a note (accepts full ID or short prefix)')
    .action((ref) => {
      try {
        const found = resolveNote(ref);
        if (!found) {
          error(`Note not found: ${ref}`);
          process.exit(1);
        }
        const note = noteRepository.togglePin(found.id);
        success(`Note ${note.pinned ? 'pinned' : 'unpinned'}: ${note.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to toggle pin');
        process.exit(1);
      }
    });

  /**
   * note delete - Delete a note
   */
  noteCommand
    .command('delete <ref>')
    .description('Delete a note (accepts full ID or short prefix)')
    .action((ref) => {
      try {
        const found = resolveNote(ref);
        if (!found) {
          error(`Note not found: ${ref}`);
          process.exit(1);
        }
        noteRepository.delete(found.id);
        success(`Note deleted: ${found.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete note');
        process.exit(1);
      }
    });

  return noteCommand;
}
