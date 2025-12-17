/**
 * Learning CLI Command - Manage agent learnings
 */

import { Command } from 'commander';
import { agentLearningRepository } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';

function formatCategory(category: string): string {
  const colors: Record<string, string> = {
    pattern: '\x1b[32m',    // green
    pitfall: '\x1b[31m',    // red
    technique: '\x1b[34m',  // blue
  };
  const reset = '\x1b[0m';
  return `${colors[category] || ''}${category.toUpperCase()}${reset}`;
}

function formatConfidence(confidence: number): string {
  const percent = Math.round(confidence * 100);
  if (percent >= 80) return `\x1b[32m${percent}%\x1b[0m`; // green
  if (percent >= 50) return `\x1b[33m${percent}%\x1b[0m`; // yellow
  return `\x1b[31m${percent}%\x1b[0m`; // red
}

export function createLearningCommand(): Command {
  const cmd = new Command('learning')
    .description('Manage agent learnings');

  /**
   * learning add - Add a new learning
   */
  cmd
    .command('add')
    .description('Add a new learning')
    .requiredOption('-r, --role <role>', 'Agent role this learning applies to')
    .requiredOption('-l, --learning <text>', 'The learning content')
    .requiredOption('-c, --category <category>', 'Category: pattern, pitfall, or technique')
    .option('-s, --specialization <spec>', 'Specialization this learning applies to')
    .option('--story <storyId>', 'Story this learning came from')
    .option('--task <taskId>', 'Task this learning came from')
    .option('--confidence <num>', 'Confidence level 0-1', '0.5')
    .action((options) => {
      const validCategories = ['pattern', 'pitfall', 'technique'];
      if (!validCategories.includes(options.category)) {
        error(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
        process.exit(1);
      }

      const confidence = parseFloat(options.confidence);
      if (isNaN(confidence) || confidence < 0 || confidence > 1) {
        error('Confidence must be a number between 0 and 1');
        process.exit(1);
      }

      try {
        const learning = agentLearningRepository.create({
          role: options.role,
          learning: options.learning,
          category: options.category,
          specialization: options.specialization,
          storyId: options.story,
          taskId: options.task,
          confidence,
        });

        if (getOutputFormat() === 'json') {
          output(JSON.stringify(learning, null, 2));
        } else {
          success(`Learning added: ${learning.id.slice(0, 8)}`);
          output(`  Role: ${learning.role}`);
          if (learning.specialization) {
            output(`  Specialization: ${learning.specialization}`);
          }
          output(`  Category: ${learning.category}`);
          output(`  Confidence: ${Math.round(learning.confidence * 100)}%`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to add learning');
        process.exit(1);
      }
    });

  /**
   * learning list - List learnings
   */
  cmd
    .command('list')
    .description('List learnings')
    .requiredOption('-r, --role <role>', 'Filter by role')
    .option('-s, --specialization <spec>', 'Filter by specialization (uses inheritance)')
    .option('-c, --category <category>', 'Filter by category')
    .option('--story <storyId>', 'Filter by story')
    .option('--inherit', 'Use learning inheritance (default with specialization)', false)
    .action((options) => {
      let learnings;

      if (options.story) {
        learnings = agentLearningRepository.findByStory(options.story);
        // Filter by role if specified
        if (options.role) {
          learnings = learnings.filter(l => l.role === options.role);
        }
      } else if (options.specialization || options.inherit) {
        // Use inheritance-aware query
        learnings = agentLearningRepository.findLearningsForRole(options.role, options.specialization);
      } else {
        learnings = agentLearningRepository.findByRole(options.role);
      }

      // Filter by category if specified
      if (options.category) {
        learnings = learnings.filter(l => l.category === options.category);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(learnings, null, 2));
      } else if (learnings.length === 0) {
        output('No learnings found');
      } else {
        const rows = learnings.map(l => ({
          id: l.id.slice(0, 8),
          role: l.role,
          specialization: l.specialization || '-',
          category: formatCategory(l.category),
          confidence: formatConfidence(l.confidence),
          learning: l.learning.slice(0, 50) + (l.learning.length > 50 ? '...' : ''),
        }));

        output(formatTable(rows, ['id', 'role', 'specialization', 'category', 'confidence', 'learning'], {
          headers: {
            id: 'ID',
            role: 'ROLE',
            specialization: 'SPEC',
            category: 'CATEGORY',
            confidence: 'CONF',
            learning: 'LEARNING'
          }
        }));
      }
    });

  /**
   * learning show - Show learning details
   */
  cmd
    .command('show <id>')
    .description('Show learning details')
    .action((id) => {
      // Try to find by full ID or prefix
      let learning = agentLearningRepository.findById(id);
      if (!learning) {
        const all = agentLearningRepository.findAll();
        learning = all.find(l => l.id.startsWith(id)) || null;
      }

      if (!learning) {
        error(`Learning not found: ${id}`);
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(learning, null, 2));
      } else {
        output(`ID: ${learning.id}`);
        output(`Role: ${learning.role}`);
        if (learning.specialization) {
          output(`Specialization: ${learning.specialization}`);
        }
        output(`Category: ${learning.category}`);
        output(`Confidence: ${Math.round(learning.confidence * 100)}%`);
        output(`\nLearning:\n${learning.learning}`);
        if (learning.storyId) {
          output(`\nFrom Story: ${learning.storyId}`);
        }
        if (learning.taskId) {
          output(`From Task: ${learning.taskId}`);
        }
        output(`\nCreated At: ${learning.createdAt}`);
      }
    });

  /**
   * learning delete - Delete a learning
   */
  cmd
    .command('delete <id>')
    .description('Delete a learning')
    .action((id) => {
      // Try to find by full ID or prefix
      let learning = agentLearningRepository.findById(id);
      if (!learning) {
        const all = agentLearningRepository.findAll();
        learning = all.find(l => l.id.startsWith(id)) || null;
      }

      if (!learning) {
        error(`Learning not found: ${id}`);
        process.exit(1);
      }

      try {
        agentLearningRepository.delete(learning.id);
        success(`Learning deleted: ${learning.id.slice(0, 8)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete');
        process.exit(1);
      }
    });

  /**
   * learning search - Search learnings
   */
  cmd
    .command('search <term>')
    .description('Search learnings by content')
    .action((term) => {
      const learnings = agentLearningRepository.search(term);

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(learnings, null, 2));
      } else if (learnings.length === 0) {
        output(`No learnings matching "${term}"`);
      } else {
        output(`Found ${learnings.length} learning(s):\n`);
        const rows = learnings.map(l => ({
          id: l.id.slice(0, 8),
          role: l.role,
          category: formatCategory(l.category),
          confidence: formatConfidence(l.confidence),
          learning: l.learning.slice(0, 50) + (l.learning.length > 50 ? '...' : ''),
        }));

        output(formatTable(rows, ['id', 'role', 'category', 'confidence', 'learning'], {
          headers: {
            id: 'ID',
            role: 'ROLE',
            category: 'CATEGORY',
            confidence: 'CONF',
            learning: 'LEARNING'
          }
        }));
      }
    });

  return cmd;
}
