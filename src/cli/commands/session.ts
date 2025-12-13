/**
 * Session CLI Command - Manage work sessions
 *
 * Sessions track work periods - when you start working on a story,
 * what tasks you focus on, and when you stop. Useful for:
 * - Time tracking
 * - Context switching (what was I working on?)
 * - Understanding work patterns
 */

import { Command } from 'commander';
import { sessionRepository, storyRepository, historyRepository } from '../../repositories';
import { setActiveSession, getActor } from '../../context';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const durationMs = end - start;

  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function resolveStory(ref: string): { id: string; code: string } | null {
  const story = storyRepository.findByCode(ref) || storyRepository.findById(ref);
  if (!story) return null;
  return { id: story.id, code: story.code };
}

/**
 * Resolve a session by full ID or short prefix
 */
function resolveSession(ref: string) {
  // Try full ID first
  let session = sessionRepository.findById(ref);
  if (session) return session;

  // Try prefix match
  const all = sessionRepository.findAll();
  session = all.find(s => s.id.startsWith(ref)) || null;
  return session;
}

export function createSessionCommand(): Command {
  const cmd = new Command('session')
    .description('Manage work sessions');

  /**
   * session start - Start a new work session
   */
  cmd
    .command('start')
    .description('Start a new work session')
    .option('-s, --story <code>', 'Story to work on')
    .option('-p, --phase <phase>', 'Current phase (e.g., planning, implementation, testing)')
    .action((options) => {
      // Check for existing active session
      const active = sessionRepository.findActive();
      if (active) {
        error(`Session already active: ${active.id.slice(0, 8)}`);
        output(`  Actor: ${active.actor}`);
        output(`  Started: ${active.startedAt}`);
        if (active.activeStoryId) {
          const story = storyRepository.findById(active.activeStoryId);
          output(`  Story: ${story?.code || active.activeStoryId.slice(0, 8)}`);
        }
        output(`\nEnd it first with: board session end`);
        process.exit(1);
      }

      // Resolve story if provided
      let storyId: string | undefined;
      let storyCode: string | undefined;
      if (options.story) {
        const story = resolveStory(options.story);
        if (!story) {
          error(`Story not found: ${options.story}`);
          process.exit(1);
        }
        storyId = story.id;
        storyCode = story.code;
      }

      const session = sessionRepository.start({
        actor: getActor(),
        activeStoryId: storyId,
        phase: options.phase,
      });

      // Set as active session in context
      setActiveSession(session.id);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(session, null, 2));
      } else {
        success(`Session started: ${session.id.slice(0, 8)}`);
        output(`  Actor: ${session.actor}`);
        if (storyCode) {
          output(`  Story: ${storyCode}`);
        }
        if (session.phase) {
          output(`  Phase: ${session.phase}`);
        }
        output(`  Started: ${session.startedAt}`);
      }
    });

  /**
   * session end - End the active session
   */
  cmd
    .command('end')
    .description('End the active session')
    .action(() => {
      const active = sessionRepository.findActive();
      if (!active) {
        error('No active session');
        process.exit(1);
      }

      const session = sessionRepository.end(active.id);

      // Clear active session in context
      setActiveSession(null);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(session, null, 2));
      } else {
        success(`Session ended: ${session.id.slice(0, 8)}`);
        output(`  Duration: ${formatDuration(session.startedAt, session.endedAt)}`);

        // Show what was done during this session
        const history = historyRepository.findBySession(session.id);
        if (history.length > 0) {
          output(`\n  Activity (${history.length} actions):`);
          const limit = Math.min(history.length, 5);
          for (let i = 0; i < limit; i++) {
            output(`    - ${history[i].summary}`);
          }
          if (history.length > 5) {
            output(`    ... and ${history.length - 5} more`);
          }
        }
      }
    });

  /**
   * session current - Show the active session
   */
  cmd
    .command('current')
    .description('Show the active session')
    .action(() => {
      const active = sessionRepository.findActive();

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(active, null, 2));
      } else if (!active) {
        output('No active session');
        output(`\nStart one with: board session start --story <code>`);
      } else {
        output(`Session: ${active.id.slice(0, 8)}`);
        output(`Actor: ${active.actor}`);
        if (active.activeStoryId) {
          const story = storyRepository.findById(active.activeStoryId);
          output(`Story: ${story?.code || active.activeStoryId.slice(0, 8)}`);
        }
        if (active.phase) {
          output(`Phase: ${active.phase}`);
        }
        output(`Started: ${active.startedAt}`);
        output(`Duration: ${formatDuration(active.startedAt, null)}`);

        // Show recent activity
        const history = historyRepository.findBySession(active.id);
        if (history.length > 0) {
          output(`\nRecent activity (${history.length} actions):`);
          const limit = Math.min(history.length, 5);
          for (let i = 0; i < limit; i++) {
            output(`  - ${history[i].summary}`);
          }
        }
      }
    });

  /**
   * session switch - Switch to a different story within the session
   */
  cmd
    .command('switch')
    .description('Switch to a different story in the active session')
    .requiredOption('-s, --story <code>', 'Story to switch to')
    .action((options) => {
      const active = sessionRepository.findActive();
      if (!active) {
        error('No active session');
        output(`\nStart one with: board session start --story <code>`);
        process.exit(1);
      }

      const story = resolveStory(options.story);
      if (!story) {
        error(`Story not found: ${options.story}`);
        process.exit(1);
      }

      const session = sessionRepository.update(active.id, {
        activeStoryId: story.id,
      });

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(session, null, 2));
      } else {
        success(`Switched to story: ${story.code}`);
      }
    });

  /**
   * session phase - Update the current phase
   */
  cmd
    .command('phase <phase>')
    .description('Update the current phase (planning, implementation, testing, review, etc.)')
    .action((phase) => {
      const active = sessionRepository.findActive();
      if (!active) {
        error('No active session');
        process.exit(1);
      }

      const session = sessionRepository.update(active.id, { phase });

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(session, null, 2));
      } else {
        success(`Phase updated: ${phase}`);
      }
    });

  /**
   * session list - List sessions
   */
  cmd
    .command('list')
    .description('List sessions')
    .option('--active', 'Show only active sessions')
    .option('--actor <name>', 'Filter by actor')
    .option('-n, --limit <n>', 'Limit results', '20')
    .action((options) => {
      let sessions;

      if (options.active) {
        sessions = sessionRepository.findAllActive();
      } else if (options.actor) {
        sessions = sessionRepository.findByActor(options.actor);
      } else {
        // Get all sessions - limited by most recent
        sessions = sessionRepository.findByActor(getActor());
      }

      // Apply limit
      const limit = parseInt(options.limit, 10);
      if (sessions.length > limit) {
        sessions = sessions.slice(0, limit);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(sessions, null, 2));
      } else if (sessions.length === 0) {
        output('No sessions found');
      } else {
        const rows = sessions.map(s => {
          const story = s.activeStoryId ? storyRepository.findById(s.activeStoryId) : null;
          return {
            id: s.id.slice(0, 8),
            actor: s.actor,
            story: story?.code || '-',
            phase: s.phase || '-',
            started: s.startedAt.slice(0, 16).replace('T', ' '),
            duration: formatDuration(s.startedAt, s.endedAt),
            status: s.endedAt ? 'ended' : '\x1b[32mactive\x1b[0m',
          };
        });
        output(formatTable(rows, ['id', 'actor', 'story', 'phase', 'started', 'duration', 'status'], {
          headers: { id: 'ID', actor: 'ACTOR', story: 'STORY', phase: 'PHASE', started: 'STARTED', duration: 'DURATION', status: 'STATUS' }
        }));
      }
    });

  /**
   * session show - Show session details
   */
  cmd
    .command('show <ref>')
    .description('Show session details (accepts full ID or short prefix)')
    .action((ref) => {
      const session = resolveSession(ref);
      if (!session) {
        error(`Session not found: ${ref}`);
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        const history = historyRepository.findBySession(session.id);
        output(JSON.stringify({ ...session, history }, null, 2));
      } else {
        output(`Session: ${session.id}`);
        output(`Actor: ${session.actor}`);
        if (session.activeStoryId) {
          const story = storyRepository.findById(session.activeStoryId);
          output(`Story: ${story?.code || session.activeStoryId}`);
        }
        if (session.phase) {
          output(`Phase: ${session.phase}`);
        }
        output(`Started: ${session.startedAt}`);
        if (session.endedAt) {
          output(`Ended: ${session.endedAt}`);
        }
        output(`Duration: ${formatDuration(session.startedAt, session.endedAt)}`);
        output(`Status: ${session.endedAt ? 'ended' : '\x1b[32mactive\x1b[0m'}`);

        // Show all activity during this session
        const history = historyRepository.findBySession(session.id);
        if (history.length > 0) {
          output(`\nActivity (${history.length} actions):`);
          for (const entry of history) {
            output(`  ${entry.createdAt.slice(11, 19)} ${entry.summary}`);
          }
        }
      }
    });

  return cmd;
}
