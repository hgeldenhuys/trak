/**
 * Validate CLI Command - Story Validation for Loom Workflow (LOOM-003)
 *
 * Provides validation commands for the dynamic agent workflow:
 * - validate story: Validates agent definitions, task assignments, and mini-retros
 *
 * AC Coverage: AC-006
 */

import { Command } from 'commander';
import {
  storyRepository,
  taskRepository,
  agentDefinitionRepository,
  noteRepository,
} from '../../repositories';
import {
  output,
  success,
  error,
  warn,
  info,
  getOutputFormat,
} from '../utils/output';
import {
  isVersionedAgentName,
  isGenericRole,
  logValidationFailure,
} from '../../validation';
import { TaskStatus } from '../../types';

/**
 * Validation result for a single check
 */
interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  remediation?: string;
}

/**
 * Overall validation result
 */
interface ValidationResult {
  storyCode: string;
  passed: boolean;
  checks: ValidationCheck[];
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
  };
}

/**
 * Create the validate command
 */
export function createValidateCommand(): Command {
  const cmd = new Command('validate')
    .description('Validate stories, tasks, and agents');

  /**
   * validate story - Validate a story for Loom workflow compliance
   *
   * Checks:
   * 1. Story-specific agent definitions exist
   * 2. All tasks have versioned agent assignees
   * 3. Completed tasks have mini-retrospective notes
   *
   * AC Coverage: AC-006
   */
  cmd
    .command('story <code>')
    .description('Validate a story for Loom workflow compliance')
    .option('--strict', 'Fail on any validation warning', false)
    .action((code: string, options) => {
      // Find the story
      const story = storyRepository.findByCode(code);
      if (!story) {
        error(`Story not found: ${code}`);
        process.exit(1);
      }

      const checks: ValidationCheck[] = [];
      let hasFailures = false;

      // Check 1: Story-specific agent definitions exist
      const storyAgents = agentDefinitionRepository.findByStory(code);
      if (storyAgents.length === 0) {
        checks.push({
          name: 'Story Agent Definitions',
          passed: false,
          message: `No agent definitions found for story ${code}`,
          remediation: `Create story-specific agents with: board agent create -r <role> -n <role>-${code.toLowerCase()}-v1 --story ${code}`,
        });
        hasFailures = true;

        logValidationFailure(code, 'missing-story-agents', {
          storyCode: code,
          storyTitle: story.title,
        });
      } else {
        checks.push({
          name: 'Story Agent Definitions',
          passed: true,
          message: `Found ${storyAgents.length} agent definition(s): ${storyAgents.map(a => `${a.name}-v${a.version}`).join(', ')}`,
        });
      }

      // Check 2: Versioned agent assignments (only for stories with managed agents)
      const tasks = taskRepository.findAll({ storyId: story.id });

      // Only validate versioned assignments if story uses managed agents
      if (storyAgents.length > 0) {
        const tasksWithGenericRoles: string[] = [];
        const tasksWithInvalidFormat: string[] = [];
        const unassignedTasks: string[] = [];

        for (const task of tasks) {
          if (!task.assignedTo) {
            unassignedTasks.push(`${task.id.slice(0, 8)}: ${task.title}`);
          } else if (isGenericRole(task.assignedTo)) {
            tasksWithGenericRoles.push(`${task.id.slice(0, 8)}: ${task.title} (assigned to ${task.assignedTo})`);
          } else if (!isVersionedAgentName(task.assignedTo)) {
            tasksWithInvalidFormat.push(`${task.id.slice(0, 8)}: ${task.title} (assigned to ${task.assignedTo})`);
          }
        }

        if (tasksWithGenericRoles.length > 0) {
          checks.push({
            name: 'Versioned Agent Assignments',
            passed: false,
            message: `${tasksWithGenericRoles.length} task(s) assigned to generic roles:\n    - ${tasksWithGenericRoles.join('\n    - ')}`,
            remediation: 'Reassign tasks to versioned agents (e.g., backend-dev-story-001-v1 instead of backend-dev)',
          });
          hasFailures = true;

          logValidationFailure(code, 'generic-role-assignment', {
            tasks: tasksWithGenericRoles,
          });
        } else if (tasksWithInvalidFormat.length > 0) {
          checks.push({
            name: 'Versioned Agent Assignments',
            passed: false,
            message: `${tasksWithInvalidFormat.length} task(s) with invalid agent name format:\n    - ${tasksWithInvalidFormat.join('\n    - ')}`,
            remediation: 'Use format: role-context-vN (e.g., backend-dev-session-001-v1)',
          });
          hasFailures = true;

          logValidationFailure(code, 'invalid-agent-format', {
            tasks: tasksWithInvalidFormat,
          });
        } else if (unassignedTasks.length > 0 && options.strict) {
          checks.push({
            name: 'Versioned Agent Assignments',
            passed: false,
            message: `${unassignedTasks.length} task(s) have no assignee:\n    - ${unassignedTasks.join('\n    - ')}`,
            remediation: 'Assign tasks to versioned agents with: board task update <id> -a <agent-name>',
          });
          hasFailures = true;
        } else {
          const assignedCount = tasks.length - unassignedTasks.length;
          const msg = unassignedTasks.length > 0
            ? `${assignedCount}/${tasks.length} tasks have valid versioned agent assignments (${unassignedTasks.length} unassigned)`
            : `All ${tasks.length} tasks have valid versioned agent assignments`;
          checks.push({
            name: 'Versioned Agent Assignments',
            passed: true,
            message: msg,
          });
        }
      } else {
        // Story doesn't use managed agents - skip versioned assignment check
        checks.push({
          name: 'Versioned Agent Assignments',
          passed: true,
          message: 'Story does not use managed agents - assignee validation skipped',
        });
      }

      // Check 3: Completed tasks have mini-retrospective notes
      const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED);
      const tasksWithoutRetro: string[] = [];

      for (const task of completedTasks) {
        // Look for notes on this task that contain retrospective keywords
        const taskNotes = noteRepository.findByEntity('task', task.id);
        const hasRetroNote = taskNotes.some(note =>
          note.content.toLowerCase().includes('retrospective') ||
          note.content.toLowerCase().includes('retro') ||
          note.content.toLowerCase().includes('learnings') ||
          note.content.toLowerCase().includes('what went well') ||
          note.content.toLowerCase().includes('improvement')
        );

        if (!hasRetroNote && completedTasks.length > 0) {
          tasksWithoutRetro.push(`${task.id.slice(0, 8)}: ${task.title}`);
        }
      }

      if (tasksWithoutRetro.length > 0 && options.strict) {
        checks.push({
          name: 'Mini-Retrospectives',
          passed: false,
          message: `${tasksWithoutRetro.length} completed task(s) missing mini-retrospective:\n    - ${tasksWithoutRetro.join('\n    - ')}`,
          remediation: 'Add retrospective notes with: board note add -t task -i <task-id> -c "Retrospective: ..."',
        });
        hasFailures = true;

        logValidationFailure(code, 'missing-mini-retrospective', {
          tasks: tasksWithoutRetro,
        });
      } else if (completedTasks.length === 0) {
        checks.push({
          name: 'Mini-Retrospectives',
          passed: true,
          message: 'No completed tasks to check for retrospectives',
        });
      } else {
        const retroCount = completedTasks.length - tasksWithoutRetro.length;
        const msg = tasksWithoutRetro.length > 0
          ? `${retroCount}/${completedTasks.length} completed tasks have mini-retrospectives (${tasksWithoutRetro.length} missing - not strict)`
          : `All ${completedTasks.length} completed tasks have mini-retrospectives`;
        checks.push({
          name: 'Mini-Retrospectives',
          passed: true,
          message: msg,
        });
      }

      // Build result
      const result: ValidationResult = {
        storyCode: code,
        passed: !hasFailures,
        checks,
        summary: {
          totalChecks: checks.length,
          passedChecks: checks.filter(c => c.passed).length,
          failedChecks: checks.filter(c => !c.passed).length,
        },
      };

      // Output
      if (getOutputFormat() === 'json') {
        output(JSON.stringify(result, null, 2));
      } else {
        output('');
        output(`=== Validation: ${code} ===`);
        output('');

        for (const check of checks) {
          const icon = check.passed ? '✅' : '❌';
          output(`${icon} ${check.name}`);
          output(`   ${check.message}`);
          if (!check.passed && check.remediation) {
            output('');
            output(`   Remediation:`);
            output(`   ${check.remediation}`);
          }
          output('');
        }

        output('---');
        if (result.passed) {
          success(`Validation PASSED (${result.summary.passedChecks}/${result.summary.totalChecks} checks)`);
        } else {
          error(`Validation FAILED (${result.summary.failedChecks}/${result.summary.totalChecks} checks failed)`);
        }
      }

      if (!result.passed) {
        process.exit(1);
      }
    });

  return cmd;
}
