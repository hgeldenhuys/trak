/**
 * Log CLI Command - Manage activity logs for agent monitoring
 */

import { Command } from 'commander';
import { activityLogRepository, storyRepository } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';
import type { ActivityLogLevel } from '../../types';

/**
 * Parse duration string to milliseconds
 * Supports: 1h, 2d, 30m, 1w
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([hdmw])$/i);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use formats like: 1h, 2d, 30m, 1w`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'm':
      return value * 60 * 1000; // minutes
    case 'h':
      return value * 60 * 60 * 1000; // hours
    case 'd':
      return value * 24 * 60 * 60 * 1000; // days
    case 'w':
      return value * 7 * 24 * 60 * 60 * 1000; // weeks
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}

/**
 * Format a timestamp to relative time (e.g., "2m ago", "1h ago")
 */
function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/**
 * Truncate string to specified length
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Get ANSI color code for log level
 */
function getLevelColor(level: ActivityLogLevel): string {
  switch (level) {
    case 'error':
      return '\x1b[31m'; // red
    case 'warn':
      return '\x1b[33m'; // yellow
    case 'info':
    default:
      return '\x1b[90m'; // gray
  }
}

const RESET = '\x1b[0m';

/**
 * Resolve a story by code or ID
 */
function resolveStory(ref: string): string | null {
  const story = storyRepository.findByCode(ref) || storyRepository.findById(ref);
  return story?.id ?? null;
}

export function createLogCommand(): Command {
  const logCommand = new Command('log')
    .description('Manage activity logs for agent monitoring');

  /**
   * log add - Add a log entry
   */
  logCommand
    .command('add')
    .description('Add an activity log entry')
    .requiredOption('-s, --source <source>', 'Source of the log (e.g., "my-hook", "adapter-xyz")')
    .requiredOption('-m, --message <message>', 'Log message')
    .option('-l, --level <level>', 'Log level: info, warn, error', 'info')
    .option('-S, --story <code>', 'Story code or ID to associate with this log')
    .action((options) => {
      // Validate level
      const validLevels: ActivityLogLevel[] = ['info', 'warn', 'error'];
      if (!validLevels.includes(options.level)) {
        error(`Invalid level: ${options.level}. Must be one of: info, warn, error`);
        process.exit(1);
      }

      // Resolve story if provided
      let storyId: string | null = null;
      if (options.story) {
        storyId = resolveStory(options.story);
        if (!storyId) {
          error(`Story not found: ${options.story}`);
          process.exit(1);
        }
      }

      const log = activityLogRepository.create({
        source: options.source,
        message: options.message,
        level: options.level as ActivityLogLevel,
        storyId,
      });

      if (getOutputFormat() === 'json') {
        output(log);
      } else {
        success(`Log added: ${log.id.slice(0, 8)}`);
      }
    });

  /**
   * log list - List activity logs
   */
  logCommand
    .command('list')
    .description('List recent activity logs')
    .option('-n, --limit <count>', 'Number of logs to show', '10')
    .option('-S, --story <code>', 'Filter by story code or ID')
    .option('-s, --source <source>', 'Filter by source')
    .action((options) => {
      const limit = parseInt(options.limit, 10);

      let logs;
      if (options.source) {
        logs = activityLogRepository.findBySource(options.source, limit);
      } else if (options.story) {
        const storyId = resolveStory(options.story);
        if (!storyId) {
          error(`Story not found: ${options.story}`);
          process.exit(1);
        }
        logs = activityLogRepository.findRecent(limit, storyId);
      } else {
        logs = activityLogRepository.findRecent(limit);
      }

      if (getOutputFormat() === 'json') {
        output(logs);
      } else if (logs.length === 0) {
        output('No activity logs found');
      } else {
        // Text output with colors
        const rows = logs.map(log => {
          const time = formatRelativeTime(log.timestamp);
          const source = truncate(log.source, 15);
          const level = log.level.toUpperCase().padEnd(5);
          const message = truncate(log.message, 40);
          const levelColor = getLevelColor(log.level);

          return {
            time: `[${time}]`.padEnd(6),
            source: source.padEnd(15),
            level: `${levelColor}${level}${RESET}`,
            message,
          };
        });

        // Print header
        output('TIME   SOURCE          LEVEL MESSAGE');
        output('-'.repeat(70));

        // Print rows
        for (const row of rows) {
          output(`${row.time} ${row.source} ${row.level} ${row.message}`);
        }
      }
    });

  /**
   * log clear - Clear old activity logs
   */
  logCommand
    .command('clear')
    .description('Clear old activity logs')
    .option('--older-than <duration>', 'Clear logs older than duration (e.g., 24h, 7d)', '24h')
    .option('--all', 'Clear all logs')
    .option('--confirm', 'Skip confirmation prompt')
    .action(async (options) => {
      if (options.all) {
        if (!options.confirm) {
          // In non-interactive mode, require --confirm flag
          error('Use --confirm flag to clear all logs without confirmation');
          process.exit(1);
        }

        const count = activityLogRepository.clearAll();

        if (getOutputFormat() === 'json') {
          output({ cleared: count });
        } else {
          success(`Cleared ${count} log entries`);
        }
      } else {
        try {
          const durationMs = parseDuration(options.olderThan);
          const cutoffDate = new Date(Date.now() - durationMs);

          const count = activityLogRepository.cleanup(cutoffDate);

          if (getOutputFormat() === 'json') {
            output({ cleared: count, olderThan: options.olderThan });
          } else {
            success(`Cleared ${count} log entries older than ${options.olderThan}`);
          }
        } catch (err) {
          error(err instanceof Error ? err.message : 'Failed to parse duration');
          process.exit(1);
        }
      }
    });

  /**
   * log show - Show a specific log entry
   */
  logCommand
    .command('show <ref>')
    .description('Show log entry details (accepts full ID or short prefix)')
    .action((ref) => {
      // Try full ID first
      let log = activityLogRepository.findById(ref);

      // Try prefix match if not found
      if (!log) {
        const recent = activityLogRepository.findRecent(100);
        log = recent.find(l => l.id.startsWith(ref)) ?? null;
      }

      if (!log) {
        error(`Log not found: ${ref}`);
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        output(log);
      } else {
        const levelColor = getLevelColor(log.level);
        output(`ID: ${log.id}`);
        output(`Source: ${log.source}`);
        output(`Level: ${levelColor}${log.level}${RESET}`);
        output(`Timestamp: ${log.timestamp}`);
        if (log.storyId) {
          output(`Story ID: ${log.storyId}`);
        }
        output(`\nMessage: ${log.message}`);
        if (Object.keys(log.metadata).length > 0) {
          output(`\nMetadata: ${JSON.stringify(log.metadata, null, 2)}`);
        }
      }
    });

  /**
   * log count - Count activity logs
   */
  logCommand
    .command('count')
    .description('Count total activity logs')
    .action(() => {
      const count = activityLogRepository.count();

      if (getOutputFormat() === 'json') {
        output({ count });
      } else {
        output(`Total activity logs: ${count}`);
      }
    });

  return logCommand;
}
