/**
 * Agent CLI Command - Manage agent definitions
 */

import { Command } from 'commander';
import { agentDefinitionRepository, agentLearningRepository } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';

function formatNameVersion(name: string, version: number): string {
  return `${name}-v${version}`;
}

export function createAgentCommand(): Command {
  const cmd = new Command('agent')
    .description('Manage agent definitions');

  /**
   * agent list - List all agent definitions
   */
  cmd
    .command('list')
    .description('List all agent definitions')
    .option('-r, --role <role>', 'Filter by role')
    .action((options) => {
      let definitions;

      if (options.role) {
        definitions = agentDefinitionRepository.findByRole(options.role);
      } else {
        definitions = agentDefinitionRepository.findAll();
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(definitions, null, 2));
      } else if (definitions.length === 0) {
        output('No agent definitions found');
      } else {
        // Group by name to show version history
        const grouped = new Map<string, typeof definitions>();
        for (const def of definitions) {
          const existing = grouped.get(def.name) || [];
          existing.push(def);
          grouped.set(def.name, existing);
        }

        const rows = definitions.map(d => {
          const learningCount = agentLearningRepository.countByRole(d.role);
          return {
            nameVersion: formatNameVersion(d.name, d.version),
            role: d.role,
            specialization: d.specialization || '-',
            successRate: d.successCount + d.failureCount > 0
              ? `${Math.round((d.successCount / (d.successCount + d.failureCount)) * 100)}%`
              : '-',
            runs: `${d.successCount + d.failureCount}`,
            learnings: `${learningCount}`,
          };
        });

        output(formatTable(rows, ['nameVersion', 'role', 'specialization', 'successRate', 'runs', 'learnings'], {
          headers: {
            nameVersion: 'NAME-VERSION',
            role: 'ROLE',
            specialization: 'SPECIALIZATION',
            successRate: 'SUCCESS',
            runs: 'RUNS',
            learnings: 'LEARNINGS'
          }
        }));
      }
    });

  /**
   * agent show - Show agent definition details
   */
  cmd
    .command('show <ref>')
    .description('Show agent definition details (accepts name-v1 format, name, or ID)')
    .action((ref) => {
      const definition = agentDefinitionRepository.resolve(ref);
      if (!definition) {
        error(`Agent definition not found: ${ref}`);
        process.exit(1);
      }

      if (getOutputFormat() === 'json') {
        output(JSON.stringify(definition, null, 2));
      } else {
        const learningCount = agentLearningRepository.countByRole(definition.role);

        output(`Name-Version: ${formatNameVersion(definition.name, definition.version)}`);
        output(`ID: ${definition.id}`);
        output(`Role: ${definition.role}`);
        if (definition.specialization) {
          output(`Specialization: ${definition.specialization}`);
        }
        output(`\nPersona: ${definition.persona || '(none)'}`);
        output(`\nObjective: ${definition.objective || '(none)'}`);

        if (Object.keys(definition.priming).length > 0) {
          output(`\nPriming:`);
          output(JSON.stringify(definition.priming, null, 2));
        }

        if (Object.keys(definition.constraints).length > 0) {
          output(`\nConstraints:`);
          output(JSON.stringify(definition.constraints, null, 2));
        }

        output(`\nPerformance:`);
        output(`  Success: ${definition.successCount}`);
        output(`  Failure: ${definition.failureCount}`);
        if (definition.successCount + definition.failureCount > 0) {
          const rate = Math.round((definition.successCount / (definition.successCount + definition.failureCount)) * 100);
          output(`  Success Rate: ${rate}%`);
        }

        output(`\nLearnings Count: ${learningCount}`);

        if (definition.derivedFrom) {
          output(`\nDerived From: ${definition.derivedFrom}`);
        }
        if (definition.createdForStory) {
          output(`Created For Story: ${definition.createdForStory}`);
        }
        output(`Created At: ${definition.createdAt}`);
      }
    });

  /**
   * agent create - Create a new agent definition
   */
  cmd
    .command('create')
    .description('Create a new agent definition')
    .requiredOption('-r, --role <role>', 'Agent role (e.g., backend-dev, frontend-dev)')
    .requiredOption('-n, --name <name>', 'Agent name (e.g., backend-dev-typescript-sse)')
    .option('-p, --persona <persona>', 'Agent persona description')
    .option('-o, --objective <objective>', 'Agent objective')
    .option('--priming <json>', 'Priming context as JSON')
    .option('--constraints <json>', 'Constraints as JSON')
    .option('-s, --specialization <spec>', 'Agent specialization')
    .option('-d, --derived-from <ref>', 'Reference to parent agent definition')
    .option('--story <storyId>', 'Story this agent was created for')
    .action((options) => {
      try {
        let priming = {};
        let constraints = {};

        if (options.priming) {
          try {
            priming = JSON.parse(options.priming);
          } catch {
            error('Invalid JSON for --priming');
            process.exit(1);
          }
        }

        if (options.constraints) {
          try {
            constraints = JSON.parse(options.constraints);
          } catch {
            error('Invalid JSON for --constraints');
            process.exit(1);
          }
        }

        const definition = agentDefinitionRepository.create({
          name: options.name,
          role: options.role,
          persona: options.persona,
          objective: options.objective,
          priming,
          constraints,
          specialization: options.specialization,
          derivedFrom: options.derivedFrom,
          createdForStory: options.story,
        });

        if (getOutputFormat() === 'json') {
          output(JSON.stringify(definition, null, 2));
        } else {
          success(`Agent definition created: ${formatNameVersion(definition.name, definition.version)}`);
          output(`  ID: ${definition.id}`);
          output(`  Role: ${definition.role}`);
          if (definition.specialization) {
            output(`  Specialization: ${definition.specialization}`);
          }
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to create agent definition');
        process.exit(1);
      }
    });

  /**
   * agent delete - Delete an agent definition
   */
  cmd
    .command('delete <ref>')
    .description('Delete an agent definition')
    .action((ref) => {
      const definition = agentDefinitionRepository.resolve(ref);
      if (!definition) {
        error(`Agent definition not found: ${ref}`);
        process.exit(1);
      }

      try {
        agentDefinitionRepository.delete(definition.id);
        success(`Agent definition deleted: ${formatNameVersion(definition.name, definition.version)}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete');
        process.exit(1);
      }
    });

  /**
   * agent success - Record a successful run
   */
  cmd
    .command('success <ref>')
    .description('Record a successful run for an agent')
    .action((ref) => {
      const definition = agentDefinitionRepository.resolve(ref);
      if (!definition) {
        error(`Agent definition not found: ${ref}`);
        process.exit(1);
      }

      try {
        const updated = agentDefinitionRepository.incrementSuccess(definition.id);
        success(`Success recorded for: ${formatNameVersion(updated.name, updated.version)}`);
        output(`  Total successes: ${updated.successCount}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to record success');
        process.exit(1);
      }
    });

  /**
   * agent failure - Record a failed run
   */
  cmd
    .command('failure <ref>')
    .description('Record a failed run for an agent')
    .action((ref) => {
      const definition = agentDefinitionRepository.resolve(ref);
      if (!definition) {
        error(`Agent definition not found: ${ref}`);
        process.exit(1);
      }

      try {
        const updated = agentDefinitionRepository.incrementFailure(definition.id);
        success(`Failure recorded for: ${formatNameVersion(updated.name, updated.version)}`);
        output(`  Total failures: ${updated.failureCount}`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to record failure');
        process.exit(1);
      }
    });

  return cmd;
}
