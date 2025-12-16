/**
 * Spec CLI Command - Manage story specifications
 *
 * Stores and retrieves story specifications using the Note entity
 * with extensions.type = 'spec'.
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
 * Find the spec note for a story
 * @returns The spec note or null if not found
 */
function findSpecNote(storyId: string) {
  const notes = noteRepository.findByEntityAndType(EntityType.STORY, storyId, 'spec');
  return notes.length > 0 ? notes[0] : null;
}

export function createSpecCommand(): Command {
  const specCommand = new Command('spec')
    .description('Manage story specifications');

  /**
   * spec show - Display spec content for a story
   */
  specCommand
    .command('show <storyRef>')
    .description('Display the specification for a story')
    .action((storyRef) => {
      const story = resolveStory(storyRef);
      if (!story) {
        error(`Story not found: ${storyRef}`);
        process.exit(1);
      }

      const specNote = findSpecNote(story.id);

      if (getOutputFormat() === 'json') {
        if (specNote) {
          output(JSON.stringify({
            storyCode: story.code,
            storyTitle: story.title,
            spec: specNote.content,
            updatedAt: specNote.updatedAt,
          }, null, 2));
        } else {
          output(JSON.stringify({
            storyCode: story.code,
            storyTitle: story.title,
            spec: null,
          }, null, 2));
        }
      } else {
        if (!specNote) {
          info(`No specification found for story ${story.code}`);
          info(`Use 'board spec set ${story.code} --file <path>' to add one`);
        } else {
          output(`Story: ${story.code} - ${story.title}\n`);
          output(`--- Specification ---\n`);
          output(specNote.content);
          output(`\n--- Updated: ${specNote.updatedAt} ---`);
        }
      }
    });

  /**
   * spec set - Set spec content for a story
   */
  specCommand
    .command('set <storyRef>')
    .description('Set the specification for a story')
    .option('-f, --file <path>', 'Path to file containing spec content')
    .option('-c, --content <content>', 'Inline spec content')
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

      // Check for existing spec note
      const existingSpec = findSpecNote(story.id);

      if (existingSpec) {
        // Update existing spec
        noteRepository.update(existingSpec.id, {
          content,
          extensions: { type: 'spec' },
        });

        if (getOutputFormat() === 'json') {
          const updated = noteRepository.findById(existingSpec.id);
          output(JSON.stringify(updated, null, 2));
        } else {
          success(`Specification updated for story ${story.code}`);
        }
      } else {
        // Create new spec note
        const note = noteRepository.create({
          entityType: EntityType.STORY,
          entityId: story.id,
          content,
          author: options.author,
          pinned: false,
          extensions: { type: 'spec' },
        });

        if (getOutputFormat() === 'json') {
          output(JSON.stringify(note, null, 2));
        } else {
          success(`Specification created for story ${story.code}`);
        }
      }
    });

  /**
   * spec clear - Remove spec for a story
   */
  specCommand
    .command('clear <storyRef>')
    .description('Remove the specification for a story')
    .action((storyRef) => {
      const story = resolveStory(storyRef);
      if (!story) {
        error(`Story not found: ${storyRef}`);
        process.exit(1);
      }

      const specNote = findSpecNote(story.id);

      if (!specNote) {
        if (getOutputFormat() === 'json') {
          output(JSON.stringify({ deleted: false, reason: 'No spec found' }, null, 2));
        } else {
          info(`No specification found for story ${story.code}`);
        }
        return;
      }

      try {
        noteRepository.delete(specNote.id);

        if (getOutputFormat() === 'json') {
          output(JSON.stringify({ deleted: true, noteId: specNote.id }, null, 2));
        } else {
          success(`Specification removed for story ${story.code}`);
        }
      } catch (err) {
        error(`Failed to delete spec: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  return specCommand;
}
