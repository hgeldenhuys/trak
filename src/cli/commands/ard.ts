/**
 * ARD CLI Command - Manage Architecture Decision Records
 *
 * Stores and retrieves Architecture Decision Records using the Note entity
 * with extensions.type = 'ard'.
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { noteRepository, storyRepository } from '../../repositories';
import { output, success, error, info, getOutputFormat } from '../utils/output';
import { EntityType } from '../../types';

/**
 * Resolve a story by code or ID
 * @returns The story entity or null if not found
 */
function resolveStory(ref: string) {
  const story = storyRepository.findByCode(ref) || storyRepository.findById(ref);
  return story;
}

/**
 * Find the ARD note for a story
 * @returns The ARD note or null if not found
 */
function findArdNote(storyId: string) {
  const notes = noteRepository.findByEntityAndType(EntityType.STORY, storyId, 'ard');
  return notes.length > 0 ? notes[0] : null;
}

export function createArdCommand(): Command {
  const ardCommand = new Command('ard')
    .description('Manage Architecture Decision Records');

  /**
   * ard show - Display ARD content for a story
   */
  ardCommand
    .command('show <storyRef>')
    .description('Display the Architecture Decision Record for a story')
    .action((storyRef) => {
      const story = resolveStory(storyRef);
      if (!story) {
        error(`Story not found: ${storyRef}`);
        process.exit(1);
      }

      const ardNote = findArdNote(story.id);

      if (getOutputFormat() === 'json') {
        if (ardNote) {
          output(JSON.stringify({
            storyCode: story.code,
            storyTitle: story.title,
            ard: ardNote.content,
            updatedAt: ardNote.updatedAt,
          }, null, 2));
        } else {
          output(JSON.stringify({
            storyCode: story.code,
            storyTitle: story.title,
            ard: null,
          }, null, 2));
        }
      } else {
        if (!ardNote) {
          info(`No Architecture Decision Record found for story ${story.code}`);
          info(`Use 'board ard set ${story.code} --file <path>' to add one`);
        } else {
          output(`Story: ${story.code} - ${story.title}\n`);
          output(`--- Architecture Decision Record ---\n`);
          output(ardNote.content);
          output(`\n--- Updated: ${ardNote.updatedAt} ---`);
        }
      }
    });

  /**
   * ard set - Set ARD content for a story
   */
  ardCommand
    .command('set <storyRef>')
    .description('Set the Architecture Decision Record for a story')
    .option('-f, --file <path>', 'Path to file containing ARD content')
    .option('-c, --content <content>', 'Inline ARD content')
    .option('-a, --author <author>', 'Author name', 'cli')
    .action((storyRef, options) => {
      const story = resolveStory(storyRef);
      if (!story) {
        error(`Story not found: ${storyRef}`);
        process.exit(1);
      }

      // Validate that either --file or --content is provided
      if (!options.file && !options.content) {
        error('Must specify either --file or --content');
        process.exit(1);
      }

      // Get content from file or inline option
      let content: string;
      if (options.file) {
        if (!existsSync(options.file)) {
          error(`File not found: ${options.file}`);
          process.exit(1);
        }
        try {
          content = readFileSync(options.file, 'utf-8');
        } catch (err) {
          error(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
      } else {
        content = options.content;
      }

      // Check for existing ARD note
      const existingArd = findArdNote(story.id);

      if (existingArd) {
        // Update existing ARD
        noteRepository.update(existingArd.id, {
          content,
          extensions: { type: 'ard' },
        });

        if (getOutputFormat() === 'json') {
          const updated = noteRepository.findById(existingArd.id);
          output(JSON.stringify(updated, null, 2));
        } else {
          success(`Architecture Decision Record updated for story ${story.code}`);
        }
      } else {
        // Create new ARD note
        const note = noteRepository.create({
          entityType: EntityType.STORY,
          entityId: story.id,
          content,
          author: options.author,
          pinned: false,
          extensions: { type: 'ard' },
        });

        if (getOutputFormat() === 'json') {
          output(JSON.stringify(note, null, 2));
        } else {
          success(`Architecture Decision Record created for story ${story.code}`);
        }
      }
    });

  /**
   * ard clear - Remove ARD for a story
   */
  ardCommand
    .command('clear <storyRef>')
    .description('Remove the Architecture Decision Record for a story')
    .action((storyRef) => {
      const story = resolveStory(storyRef);
      if (!story) {
        error(`Story not found: ${storyRef}`);
        process.exit(1);
      }

      const ardNote = findArdNote(story.id);

      if (!ardNote) {
        if (getOutputFormat() === 'json') {
          output(JSON.stringify({ deleted: false, reason: 'No ARD found' }, null, 2));
        } else {
          info(`No Architecture Decision Record found for story ${story.code}`);
        }
        return;
      }

      try {
        noteRepository.delete(ardNote.id);

        if (getOutputFormat() === 'json') {
          output(JSON.stringify({ deleted: true, noteId: ardNote.id }, null, 2));
        } else {
          success(`Architecture Decision Record removed for story ${story.code}`);
        }
      } catch (err) {
        error(`Failed to delete ARD: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  return ardCommand;
}
