/**
 * Acceptance Criteria CLI Command - Manage ACs for stories
 */

import { Command } from 'commander';
import { acceptanceCriteriaRepository, storyRepository } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';

function formatStatus(status: string): string {
  const colors: Record<string, string> = {
    pending: '\x1b[33m',   // yellow
    verified: '\x1b[32m',  // green
    failed: '\x1b[31m',    // red
  };
  const reset = '\x1b[0m';
  return `${colors[status] || ''}${status.toUpperCase()}${reset}`;
}

function resolveStory(ref: string): { id: string; code: string } | null {
  const story = storyRepository.findByCode(ref) || storyRepository.findById(ref);
  if (!story) return null;
  return { id: story.id, code: story.code };
}

/**
 * Resolve an AC by ID, code (AC-001), or short ID prefix
 * Optionally scoped to a specific story
 */
function resolveAc(ref: string, storyId?: string): ReturnType<typeof acceptanceCriteriaRepository.findById> {
  // Try full UUID first
  let ac = acceptanceCriteriaRepository.findById(ref);
  if (ac) return ac;

  // Try by code (AC-001) within story or all stories
  if (storyId) {
    const acs = acceptanceCriteriaRepository.findByStoryId(storyId);
    ac = acs.find(a => a.code.toUpperCase() === ref.toUpperCase());
    if (ac) return ac;
  } else {
    // Search all stories for this code
    const stories = storyRepository.findAll();
    for (const story of stories) {
      const acs = acceptanceCriteriaRepository.findByStoryId(story.id);
      ac = acs.find(a => a.code.toUpperCase() === ref.toUpperCase());
      if (ac) return ac;
    }
  }

  // Try short ID prefix match
  const stories = storyId ? [{ id: storyId }] : storyRepository.findAll();
  for (const story of stories) {
    const acs = acceptanceCriteriaRepository.findByStoryId(story.id);
    ac = acs.find(a => a.id.startsWith(ref));
    if (ac) return ac;
  }

  return null;
}

export function createAcCommand(): Command {
  const cmd = new Command('ac')
    .alias('criteria')
    .description('Manage acceptance criteria for stories');

  /**
   * ac add - Add acceptance criteria to a story
   */
  cmd
    .command('add')
    .description('Add acceptance criteria to a story')
    .requiredOption('-s, --story <code>', 'Story code or ID')
    .requiredOption('-d, --description <desc>', 'AC description (what must be true)')
    .option('-c, --code <code>', 'AC code (e.g., AC-001, auto-generated if not provided)')
    .option('--testable <how>', 'How to test this criterion (stored in extensions)')
    .action((options) => {
      const story = resolveStory(options.story);
      if (!story) {
        error(`Story not found: ${options.story}`);
        process.exit(1);
      }

      // Auto-generate code if not provided
      let code = options.code;
      if (!code) {
        const existing = acceptanceCriteriaRepository.findByStoryId(story.id);
        const nextNum = existing.length + 1;
        code = `AC-${String(nextNum).padStart(3, '0')}`;
      }

      const extensions: Record<string, unknown> = {};
      if (options.testable) {
        extensions.testable = options.testable;
      }

      const ac = acceptanceCriteriaRepository.create({
        storyId: story.id,
        code,
        description: options.description,
        extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
      });

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(ac, null, 2));
      } else {
        success(`AC added: ${ac.code}`);
        output(`  ${ac.description}`);
        if (options.testable) {
          output(`  Testable: ${options.testable}`);
        }
      }
    });

  /**
   * ac list - List acceptance criteria for a story
   */
  cmd
    .command('list')
    .description('List acceptance criteria for a story')
    .requiredOption('-s, --story <code>', 'Story code or ID')
    .action((options) => {
      const story = resolveStory(options.story);
      if (!story) {
        error(`Story not found: ${options.story}`);
        process.exit(1);
      }

      const acs = acceptanceCriteriaRepository.findByStoryId(story.id);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(acs, null, 2));
      } else if (acs.length === 0) {
        output(`No acceptance criteria for ${story.code}`);
      } else {
        const counts = acceptanceCriteriaRepository.countByStatus(story.id);
        output(`Acceptance Criteria for ${story.code} (${counts.verified}/${acs.length} verified)\n`);

        const rows = acs.map(ac => ({
          code: ac.code,
          status: formatStatus(ac.status),
          description: ac.description.slice(0, 60) + (ac.description.length > 60 ? '...' : ''),
        }));
        output(formatTable(rows, ['code', 'status', 'description'], {
          headers: { code: 'CODE', status: 'STATUS', description: 'DESCRIPTION' }
        }));
      }
    });

  /**
   * ac show - Show AC details
   */
  cmd
    .command('show <ref>')
    .description('Show acceptance criteria details (accepts ID, code like AC-001, or short prefix)')
    .option('-s, --story <code>', 'Story to search within (for disambiguating AC codes)')
    .action((ref, options) => {
      const storyId = options.story ? resolveStory(options.story)?.id : undefined;
      const ac = resolveAc(ref, storyId);

      if (!ac) {
        error(`Acceptance criteria not found: ${ref}`);
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(ac, null, 2));
      } else {
        const story = storyRepository.findById(ac.storyId);
        output(`Code: ${ac.code}`);
        output(`Story: ${story?.code || ac.storyId}`);
        output(`Status: ${formatStatus(ac.status)}`);
        output(`Description: ${ac.description}`);

        const ext = ac.extensions as Record<string, unknown>;
        if (ext.testable) {
          output(`\nTestable: ${ext.testable}`);
        }

        if (ac.verificationNotes) {
          output(`\nVerification Notes: ${ac.verificationNotes}`);
        }
        if (ac.verifiedAt) {
          output(`Verified At: ${ac.verifiedAt}`);
        }
      }
    });

  /**
   * ac verify - Mark AC as verified
   */
  cmd
    .command('verify <ref>')
    .description('Mark acceptance criteria as verified (accepts ID, code like AC-001, or short prefix)')
    .option('-s, --story <code>', 'Story to search within')
    .option('-n, --notes <notes>', 'Verification notes/evidence', 'Verified')
    .action((ref, options) => {
      try {
        const storyId = options.story ? resolveStory(options.story)?.id : undefined;
        const found = resolveAc(ref, storyId);
        if (!found) {
          error(`Acceptance criteria not found: ${ref}`);
          process.exit(1);
        }
        const ac = acceptanceCriteriaRepository.verify(found.id, options.notes);
        success(`AC verified: ${ac.code}`);
        if (options.notes !== 'Verified') {
          output(`  Notes: ${options.notes}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to verify');
        process.exit(1);
      }
    });

  /**
   * ac fail - Mark AC as failed
   */
  cmd
    .command('fail <ref>')
    .description('Mark acceptance criteria as failed (accepts ID, code like AC-001, or short prefix)')
    .option('-s, --story <code>', 'Story to search within')
    .requiredOption('-n, --notes <notes>', 'Failure reason')
    .action((ref, options) => {
      try {
        const storyId = options.story ? resolveStory(options.story)?.id : undefined;
        const found = resolveAc(ref, storyId);
        if (!found) {
          error(`Acceptance criteria not found: ${ref}`);
          process.exit(1);
        }
        const ac = acceptanceCriteriaRepository.fail(found.id, options.notes);
        error(`AC failed: ${ac.code}`);
        output(`  Reason: ${options.notes}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to update');
        process.exit(1);
      }
    });

  /**
   * ac reset - Reset AC to pending
   */
  cmd
    .command('reset <ref>')
    .description('Reset acceptance criteria to pending (accepts ID, code like AC-001, or short prefix)')
    .option('-s, --story <code>', 'Story to search within')
    .action((ref, options) => {
      try {
        const storyId = options.story ? resolveStory(options.story)?.id : undefined;
        const found = resolveAc(ref, storyId);
        if (!found) {
          error(`Acceptance criteria not found: ${ref}`);
          process.exit(1);
        }
        const ac = acceptanceCriteriaRepository.update(found.id, {
          status: 'pending',
          verificationNotes: null,
        });
        success(`AC reset to pending: ${ac.code}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to reset');
        process.exit(1);
      }
    });

  /**
   * ac update - Update AC description
   */
  cmd
    .command('update <ref>')
    .description('Update acceptance criteria (accepts ID, code like AC-001, or short prefix)')
    .option('-s, --story <code>', 'Story to search within')
    .option('-d, --description <desc>', 'New description')
    .option('--testable <how>', 'How to test this criterion')
    .action((ref, options) => {
      if (!options.description && !options.testable) {
        error('Must specify --description or --testable');
        process.exit(1);
      }

      try {
        const storyId = options.story ? resolveStory(options.story)?.id : undefined;
        const existing = resolveAc(ref, storyId);
        if (!existing) {
          error(`AC not found: ${ref}`);
          process.exit(1);
        }

        const extensions = { ...existing.extensions as Record<string, unknown> };
        if (options.testable) {
          extensions.testable = options.testable;
        }

        const ac = acceptanceCriteriaRepository.update(existing.id, {
          description: options.description,
          extensions: options.testable ? extensions : undefined,
        });
        success(`AC updated: ${ac.code}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to update');
        process.exit(1);
      }
    });

  /**
   * ac delete - Delete AC
   */
  cmd
    .command('delete <ref>')
    .description('Delete acceptance criteria (accepts ID, code like AC-001, or short prefix)')
    .option('-s, --story <code>', 'Story to search within')
    .action((ref, options) => {
      try {
        const storyId = options.story ? resolveStory(options.story)?.id : undefined;
        const ac = resolveAc(ref, storyId);
        if (!ac) {
          error(`AC not found: ${ref}`);
          process.exit(1);
        }
        acceptanceCriteriaRepository.delete(ac.id);
        success(`AC deleted: ${ac.code}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete');
        process.exit(1);
      }
    });

  /**
   * ac progress - Show AC progress for a story
   */
  cmd
    .command('progress')
    .description('Show AC verification progress for a story')
    .requiredOption('-s, --story <code>', 'Story code or ID')
    .action((options) => {
      const story = resolveStory(options.story);
      if (!story) {
        error(`Story not found: ${options.story}`);
        process.exit(1);
      }

      const counts = acceptanceCriteriaRepository.countByStatus(story.id);
      const total = counts.pending + counts.verified + counts.failed;

      if (getOutputFormat() === 'json') {
        output(JSON.stringify({ story: story.code, ...counts, total }, null, 2));
      } else {
        output(`AC Progress for ${story.code}:`);
        output(`  Total: ${total}`);
        output(`  ${formatStatus('verified')}: ${counts.verified}`);
        output(`  ${formatStatus('pending')}: ${counts.pending}`);
        output(`  ${formatStatus('failed')}: ${counts.failed}`);

        if (total > 0) {
          const pct = Math.round((counts.verified / total) * 100);
          const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
          output(`\n  [${bar}] ${pct}%`);
        }

        if (acceptanceCriteriaRepository.allVerified(story.id)) {
          output(`\n  ✓ All acceptance criteria verified!`);
        }
      }
    });

  return cmd;
}
