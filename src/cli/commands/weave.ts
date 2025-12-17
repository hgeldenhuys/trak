/**
 * Weave CLI Command - Manage Weave knowledge framework entries
 *
 * Supports the 11 Weave dimensions:
 * Q (Qualia), E (Epistemology), O (Ontology), M (Mereology),
 * C (Causation), A (Axiology), T (Teleology), H (History),
 * Pi (Praxeology), Mu (Modality), Delta (Deontics)
 */

import { Command } from 'commander';
import { weaveEntryRepository, VALID_DIMENSIONS } from '../../repositories';
import { output, success, error, formatTable, getOutputFormat } from '../utils/output';
import type { WeaveDimension, WeaveEntry } from '../../types';

/**
 * Format dimension for display
 */
function formatDimension(dimension: string): string {
  const colors: Record<string, string> = {
    Q: '\x1b[35m',     // magenta - Qualia
    E: '\x1b[34m',     // blue - Epistemology
    O: '\x1b[36m',     // cyan - Ontology
    M: '\x1b[33m',     // yellow - Mereology
    C: '\x1b[31m',     // red - Causation
    A: '\x1b[32m',     // green - Axiology
    T: '\x1b[37m',     // white - Teleology
    H: '\x1b[90m',     // gray - History
    Pi: '\x1b[95m',    // bright magenta - Praxeology
    Mu: '\x1b[94m',    // bright blue - Modality
    Delta: '\x1b[93m', // bright yellow - Deontics
  };
  const reset = '\x1b[0m';
  return `${colors[dimension] || ''}${dimension}${reset}`;
}

/**
 * Format confidence for display
 */
function formatConfidence(confidence: number): string {
  const percent = Math.round(confidence * 100);
  if (percent >= 80) return `\x1b[32m${percent}%\x1b[0m`; // green
  if (percent >= 50) return `\x1b[33m${percent}%\x1b[0m`; // yellow
  return `\x1b[31m${percent}%\x1b[0m`; // red
}

/**
 * Format type for display
 */
function formatType(type: string): string {
  return `\x1b[36m${type}\x1b[0m`; // cyan
}

/**
 * Dimension descriptions for help text
 */
const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  Q: 'Qualia - experiences, pain points, solutions',
  E: 'Epistemology - patterns, validations, concepts',
  O: 'Ontology - entities, relations, constraints',
  M: 'Mereology - components, compositions, parts',
  C: 'Causation - causal chains, root causes, mechanisms',
  A: 'Axiology - value judgments, tradeoffs, quality metrics',
  T: 'Teleology - purposes, goals, intents',
  H: 'History - evolutions, timelines, legacy patterns',
  Pi: 'Praxeology - wow patterns, delegation strategies, best practices',
  Mu: 'Modality - alternatives, rejected options, possible futures',
  Delta: 'Deontics - obligations, permissions, prohibitions',
};

/**
 * Validate dimension
 */
function validateDimension(dim: string): WeaveDimension {
  if (!VALID_DIMENSIONS.includes(dim as WeaveDimension)) {
    throw new Error(`Invalid dimension: ${dim}. Valid dimensions: ${VALID_DIMENSIONS.join(', ')}`);
  }
  return dim as WeaveDimension;
}

export function createWeaveCommand(): Command {
  const cmd = new Command('weave')
    .description('Manage Weave knowledge framework entries');

  // =========================================================================
  // weave add - Add a new Weave entry
  // =========================================================================
  cmd
    .command('add')
    .description('Add a new Weave knowledge entry')
    .requiredOption('-d, --dimension <dim>', `Dimension: ${VALID_DIMENSIONS.join(', ')}`)
    .requiredOption('-t, --type <type>', 'Entry type (e.g., pattern, painpoint, solution, concept, entity)')
    .requiredOption('-c, --concept <text>', 'Short title/concept for the entry')
    .requiredOption('--description <text>', 'Full description of the entry')
    .option('--confidence <num>', 'Confidence level 0-1 (default: 0.5)', '0.5')
    .option('-e, --evidence <text>', 'Evidence (can be specified multiple times)', (val, arr: string[]) => [...arr, val], [] as string[])
    .option('--discovered-in <storyId>', 'Story ID where this was discovered')
    .option('--metadata <json>', 'Additional metadata as JSON string')
    .action((options) => {
      try {
        const dimension = validateDimension(options.dimension);

        const confidence = parseFloat(options.confidence);
        if (isNaN(confidence) || confidence < 0 || confidence > 1) {
          error('Confidence must be a number between 0 and 1');
          process.exit(1);
        }

        let metadata: Record<string, unknown> = {};
        if (options.metadata) {
          try {
            metadata = JSON.parse(options.metadata);
          } catch {
            error('Invalid metadata JSON');
            process.exit(1);
          }
        }

        const entry = weaveEntryRepository.create({
          dimension,
          type: options.type,
          concept: options.concept,
          description: options.description,
          confidence,
          evidence: options.evidence.length > 0 ? options.evidence : undefined,
          discoveredIn: options.discoveredIn,
          discoveredAt: options.discoveredIn ? new Date().toISOString().split('T')[0] : undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        });

        if (getOutputFormat() === 'json') {
          output(JSON.stringify(entry, null, 2));
        } else {
          success(`Weave entry added: ${entry.id.slice(0, 8)}`);
          output(`  Dimension: ${DIMENSION_DESCRIPTIONS[entry.dimension]}`);
          output(`  Type: ${entry.type}`);
          output(`  Concept: ${entry.concept}`);
          output(`  Confidence: ${Math.round(entry.confidence * 100)}%`);
          if (entry.evidence.length > 0) {
            output(`  Evidence: ${entry.evidence.length} item(s)`);
          }
          if (entry.discoveredIn) {
            output(`  Discovered In: ${entry.discoveredIn}`);
          }
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to add entry');
        process.exit(1);
      }
    });

  // =========================================================================
  // weave list - List Weave entries
  // =========================================================================
  cmd
    .command('list')
    .description('List Weave entries')
    .option('-d, --dimension <dim>', `Filter by dimension: ${VALID_DIMENSIONS.join(', ')}`)
    .option('-t, --type <type>', 'Filter by type')
    .option('--min-confidence <num>', 'Minimum confidence threshold (0-1)')
    .option('--discovered-in <storyId>', 'Filter by story')
    .action((options) => {
      try {
        let entries: WeaveEntry[];

        if (options.dimension && options.type) {
          const dimension = validateDimension(options.dimension);
          entries = weaveEntryRepository.findByDimensionAndType(dimension, options.type);
        } else if (options.dimension) {
          const dimension = validateDimension(options.dimension);
          entries = weaveEntryRepository.findByDimension(dimension);
        } else if (options.discoveredIn) {
          entries = weaveEntryRepository.findByDiscoveredIn(options.discoveredIn);
        } else if (options.minConfidence) {
          const minConf = parseFloat(options.minConfidence);
          if (isNaN(minConf) || minConf < 0 || minConf > 1) {
            error('Min confidence must be a number between 0 and 1');
            process.exit(1);
          }
          entries = weaveEntryRepository.findWithMinConfidence(minConf);
        } else {
          entries = weaveEntryRepository.findAll();
        }

        // Apply additional filters
        if (options.minConfidence && !options.dimension && !options.discoveredIn) {
          // Already filtered above
        } else if (options.minConfidence) {
          const minConf = parseFloat(options.minConfidence);
          entries = entries.filter(e => e.confidence >= minConf);
        }

        if (options.type && !options.dimension) {
          entries = entries.filter(e => e.type === options.type);
        }

        if (getOutputFormat() === 'json') {
          output(JSON.stringify(entries, null, 2));
        } else if (entries.length === 0) {
          output('No Weave entries found');
        } else {
          const rows = entries.map(e => ({
            id: e.id.slice(0, 8),
            dimension: formatDimension(e.dimension),
            type: formatType(e.type),
            concept: e.concept.slice(0, 40) + (e.concept.length > 40 ? '...' : ''),
            confidence: formatConfidence(e.confidence),
            evidence: e.evidence.length.toString(),
          }));

          output(`Found ${entries.length} entry/entries:\n`);
          output(formatTable(rows, ['id', 'dimension', 'type', 'concept', 'confidence', 'evidence'], {
            headers: {
              id: 'ID',
              dimension: 'DIM',
              type: 'TYPE',
              concept: 'CONCEPT',
              confidence: 'CONF',
              evidence: 'EV',
            }
          }));
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to list entries');
        process.exit(1);
      }
    });

  // =========================================================================
  // weave show - Show entry details
  // =========================================================================
  cmd
    .command('show <id>')
    .description('Show Weave entry details')
    .action((id) => {
      try {
        // Try to find by full ID or prefix
        let entry = weaveEntryRepository.findById(id);
        if (!entry) {
          const all = weaveEntryRepository.findAll();
          entry = all.find(e => e.id.startsWith(id)) || null;
        }

        if (!entry) {
          error(`Weave entry not found: ${id}`);
          process.exit(1);
        }

        if (getOutputFormat() === 'json') {
          // Include references in JSON output
          const refsFrom = weaveEntryRepository.findReferencesFrom(entry.id);
          const refsTo = weaveEntryRepository.findReferencesTo(entry.id);
          output(JSON.stringify({
            ...entry,
            referencesFrom: refsFrom,
            referencesTo: refsTo,
          }, null, 2));
        } else {
          output(`ID: ${entry.id}`);
          output(`Dimension: ${DIMENSION_DESCRIPTIONS[entry.dimension]}`);
          output(`Type: ${entry.type}`);
          output(`Concept: ${entry.concept}`);
          output(`Confidence: ${Math.round(entry.confidence * 100)}%`);
          output(`\nDescription:\n${entry.description}`);

          if (entry.evidence.length > 0) {
            output(`\nEvidence:`);
            for (const ev of entry.evidence) {
              output(`  - ${ev}`);
            }
          }

          if (entry.discoveredIn) {
            output(`\nDiscovered In: ${entry.discoveredIn}`);
            if (entry.discoveredAt) {
              output(`Discovered At: ${entry.discoveredAt}`);
            }
          }

          if (Object.keys(entry.metadata).length > 0) {
            output(`\nMetadata: ${JSON.stringify(entry.metadata, null, 2)}`);
          }

          // Show cross-references
          const refsFrom = weaveEntryRepository.findReferencesFrom(entry.id);
          const refsTo = weaveEntryRepository.findReferencesTo(entry.id);

          if (refsFrom.length > 0) {
            output(`\nReferences to other entries:`);
            for (const ref of refsFrom) {
              const target = weaveEntryRepository.findById(ref.toEntryId);
              output(`  -> [${ref.relationType}] ${target?.concept || ref.toEntryId}`);
            }
          }

          if (refsTo.length > 0) {
            output(`\nReferenced by:`);
            for (const ref of refsTo) {
              const source = weaveEntryRepository.findById(ref.fromEntryId);
              output(`  <- [${ref.relationType}] ${source?.concept || ref.fromEntryId}`);
            }
          }

          output(`\nCreated At: ${entry.createdAt}`);
          output(`Updated At: ${entry.updatedAt}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to show entry');
        process.exit(1);
      }
    });

  // =========================================================================
  // weave search - Search entries
  // =========================================================================
  cmd
    .command('search <query>')
    .description('Search Weave entries by content')
    .option('-d, --dimension <dim>', `Filter by dimension: ${VALID_DIMENSIONS.join(', ')}`)
    .option('-t, --type <type>', 'Filter by type')
    .action((query, options) => {
      try {
        const searchOptions: { dimension?: WeaveDimension; type?: string } = {};

        if (options.dimension) {
          searchOptions.dimension = validateDimension(options.dimension);
        }
        if (options.type) {
          searchOptions.type = options.type;
        }

        const entries = weaveEntryRepository.search(query, searchOptions);

        if (getOutputFormat() === 'json') {
          output(JSON.stringify(entries, null, 2));
        } else if (entries.length === 0) {
          output(`No entries matching "${query}"`);
        } else {
          output(`Found ${entries.length} entry/entries matching "${query}":\n`);
          const rows = entries.map(e => ({
            id: e.id.slice(0, 8),
            dimension: formatDimension(e.dimension),
            type: formatType(e.type),
            concept: e.concept.slice(0, 40) + (e.concept.length > 40 ? '...' : ''),
            confidence: formatConfidence(e.confidence),
          }));

          output(formatTable(rows, ['id', 'dimension', 'type', 'concept', 'confidence'], {
            headers: {
              id: 'ID',
              dimension: 'DIM',
              type: 'TYPE',
              concept: 'CONCEPT',
              confidence: 'CONF',
            }
          }));
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to search entries');
        process.exit(1);
      }
    });

  // =========================================================================
  // weave delete - Delete an entry
  // =========================================================================
  cmd
    .command('delete <id>')
    .description('Delete a Weave entry')
    .action((id) => {
      try {
        // Try to find by full ID or prefix
        let entry = weaveEntryRepository.findById(id);
        if (!entry) {
          const all = weaveEntryRepository.findAll();
          entry = all.find(e => e.id.startsWith(id)) || null;
        }

        if (!entry) {
          error(`Weave entry not found: ${id}`);
          process.exit(1);
        }

        weaveEntryRepository.delete(entry.id);
        success(`Weave entry deleted: ${entry.id.slice(0, 8)} (${entry.concept})`);
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to delete entry');
        process.exit(1);
      }
    });

  // =========================================================================
  // weave summary - Show summary statistics
  // =========================================================================
  cmd
    .command('summary')
    .description('Show Weave knowledge base summary')
    .action(() => {
      try {
        const byDimension = weaveEntryRepository.countByDimension();
        const byDimAndType = weaveEntryRepository.countByDimensionAndType();

        if (getOutputFormat() === 'json') {
          output(JSON.stringify({
            byDimension,
            byDimensionAndType: byDimAndType,
          }, null, 2));
        } else {
          const total = Object.values(byDimension).reduce((a, b) => a + b, 0);
          output(`Weave Knowledge Base Summary`);
          output(`${'='.repeat(50)}`);
          output(`Total Entries: ${total}\n`);

          for (const dim of VALID_DIMENSIONS) {
            const count = byDimension[dim] || 0;
            if (count > 0) {
              output(`${formatDimension(dim)} (${DIMENSION_DESCRIPTIONS[dim].split(' - ')[0]}): ${count}`);
              const types = byDimAndType[dim];
              if (types) {
                for (const [type, typeCount] of Object.entries(types)) {
                  output(`    ${type}: ${typeCount}`);
                }
              }
            }
          }
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to generate summary');
        process.exit(1);
      }
    });

  // =========================================================================
  // weave ref - Create a reference between entries
  // =========================================================================
  cmd
    .command('ref <fromId> <toId>')
    .description('Create a reference between two entries')
    .option('-t, --type <type>', 'Relation type (default: relates_to)', 'relates_to')
    .action((fromId, toId, options) => {
      try {
        const ref = weaveEntryRepository.createReference({
          fromEntryId: fromId,
          toEntryId: toId,
          relationType: options.type,
        });

        if (getOutputFormat() === 'json') {
          output(JSON.stringify(ref, null, 2));
        } else {
          success(`Reference created: ${ref.id.slice(0, 8)}`);
          output(`  From: ${fromId.slice(0, 8)}`);
          output(`  To: ${toId.slice(0, 8)}`);
          output(`  Type: ${options.type}`);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : 'Failed to create reference');
        process.exit(1);
      }
    });

  return cmd;
}
