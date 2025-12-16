/**
 * PRD CLI Command - Manage Product Requirements Documents
 *
 * Stores and retrieves Product Requirements Documents using the Note entity
 * with extensions.type = 'prd'.
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
 * Find the PRD note for a story
 * @returns The PRD note or null if not found
 */
function findPrdNote(storyId: string) {
  const notes = noteRepository.findByEntityAndType(EntityType.STORY, storyId, 'prd');
  return notes.length > 0 ? notes[0] : null;
}

export function createPrdCommand(): Command {
  const prdCommand = new Command('prd')
    .description('Manage Product Requirements Documents');

  /**
   * prd show - Display PRD content for a story
   */
  prdCommand
    .command('show <storyRef>')
    .description('Display the Product Requirements Document for a story')
    .action((storyRef) => {
      const story = resolveStory(storyRef);
      if (!story) {
        error(`Story not found: ${storyRef}`);
        process.exit(1);
      }

      const prdNote = findPrdNote(story.id);

      if (getOutputFormat() === 'json') {
        if (prdNote) {
          output(JSON.stringify({
            storyCode: story.code,
            storyTitle: story.title,
            prd: prdNote.content,
            updatedAt: prdNote.updatedAt,
          }, null, 2));
        } else {
          output(JSON.stringify({
            storyCode: story.code,
            storyTitle: story.title,
            prd: null,
          }, null, 2));
        }
      } else {
        if (!prdNote) {
          info(`No Product Requirements Document found for story ${story.code}`);
          info(`Use 'board prd set ${story.code} --file <path>' to add one`);
        } else {
          output(`Story: ${story.code} - ${story.title}\n`);
          output(`--- Product Requirements Document ---\n`);
          output(prdNote.content);
          output(`\n--- Updated: ${prdNote.updatedAt} ---`);
        }
      }
    });

  /**
   * prd set - Set PRD content for a story
   */
  prdCommand
    .command('set <storyRef>')
    .description('Set the Product Requirements Document for a story')
    .option('-f, --file <path>', 'Path to file containing PRD content')
    .option('-c, --content <content>', 'Inline PRD content')
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

      // Check for existing PRD note
      const existingPrd = findPrdNote(story.id);

      if (existingPrd) {
        // Update existing PRD
        noteRepository.update(existingPrd.id, {
          content,
          extensions: { type: 'prd' },
        });

        if (getOutputFormat() === 'json') {
          const updated = noteRepository.findById(existingPrd.id);
          output(JSON.stringify(updated, null, 2));
        } else {
          success(`Product Requirements Document updated for story ${story.code}`);
        }
      } else {
        // Create new PRD note
        const note = noteRepository.create({
          entityType: EntityType.STORY,
          entityId: story.id,
          content,
          author: options.author,
          pinned: false,
          extensions: { type: 'prd' },
        });

        if (getOutputFormat() === 'json') {
          output(JSON.stringify(note, null, 2));
        } else {
          success(`Product Requirements Document created for story ${story.code}`);
        }
      }
    });

  /**
   * prd clear - Remove PRD for a story
   */
  prdCommand
    .command('clear <storyRef>')
    .description('Remove the Product Requirements Document for a story')
    .action((storyRef) => {
      const story = resolveStory(storyRef);
      if (!story) {
        error(`Story not found: ${storyRef}`);
        process.exit(1);
      }

      const prdNote = findPrdNote(story.id);

      if (!prdNote) {
        if (getOutputFormat() === 'json') {
          output(JSON.stringify({ deleted: false, reason: 'No PRD found' }, null, 2));
        } else {
          info(`No Product Requirements Document found for story ${story.code}`);
        }
        return;
      }

      try {
        noteRepository.delete(prdNote.id);

        if (getOutputFormat() === 'json') {
          output(JSON.stringify({ deleted: true, noteId: prdNote.id }, null, 2));
        } else {
          success(`Product Requirements Document removed for story ${story.code}`);
        }
      } catch (err) {
        error(`Failed to delete PRD: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  return prdCommand;
}
