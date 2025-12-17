#!/usr/bin/env bun
/**
 * Migrate Weave JSON files to database
 *
 * Reads existing JSON files from a Weave directory and imports entries
 * into the database via the WeaveEntryRepository.
 *
 * Usage:
 *   bun run scripts/migrate-weave-json.ts /path/to/.agent/weave
 *
 * Expected directory structure:
 *   /path/to/.agent/weave/
 *     epistemology.json
 *     qualia.json
 *     ontology.json
 *     mereology.json
 *     causation.json
 *     axiology.json
 *     teleology.json
 *     history.json
 *     praxeology.json
 *     modality.json
 *     deontics.json
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { initDb, closeDb, resolveDbPath } from '../src/db';
import { weaveEntryRepository } from '../src/repositories';
import type { WeaveDimension, CreateWeaveEntryInput } from '../src/types';

/**
 * Dimension mapping: JSON filename -> dimension code
 */
const FILE_TO_DIMENSION: Record<string, WeaveDimension> = {
  'qualia.json': 'Q',
  'epistemology.json': 'E',
  'ontology.json': 'O',
  'mereology.json': 'M',
  'causation.json': 'C',
  'axiology.json': 'A',
  'teleology.json': 'T',
  'history.json': 'H',
  'praxeology.json': 'Pi',
  'modality.json': 'Mu',
  'deontics.json': 'Delta',
};

/**
 * Category mapping for different JSON structures
 * Maps the JSON key to a type name
 */
const CATEGORY_MAPPINGS: Record<WeaveDimension, Record<string, string>> = {
  Q: {
    experiences: 'experience',
    painPoints: 'painpoint',
    solutions: 'solution',
    workflows: 'workflow',
    bestPractices: 'bestpractice',
    patterns: 'pattern',
  },
  E: {
    patterns: 'pattern',
    knowledge: 'concept',
    validations: 'validation',
    concepts: 'concept',
  },
  O: {
    entities: 'entity',
    relations: 'relation',
    constraints: 'constraint',
  },
  M: {
    components: 'component',
    compositions: 'composition',
    parts: 'part',
  },
  C: {
    causalChains: 'causalchain',
    rootCauses: 'rootcause',
    mechanisms: 'mechanism',
  },
  A: {
    valueJudgments: 'valuejudgment',
    tradeoffs: 'tradeoff',
    qualityMetrics: 'qualitymetric',
  },
  T: {
    purposes: 'purpose',
    goals: 'goal',
    intents: 'intent',
  },
  H: {
    evolutions: 'evolution',
    timelines: 'timeline',
    legacyPatterns: 'legacypattern',
  },
  Pi: {
    wowPatterns: 'wowpattern',
    delegationStrategies: 'delegationstrategy',
    bestPractices: 'bestpractice',
  },
  Mu: {
    alternatives: 'alternative',
    rejectedOptions: 'rejectedoption',
    possibleFutures: 'possiblefuture',
  },
  Delta: {
    obligations: 'obligation',
    permissions: 'permission',
    prohibitions: 'prohibition',
  },
};

interface ImportStats {
  dimension: WeaveDimension;
  imported: number;
  skipped: number;
  errors: string[];
}

/**
 * Parse an entry from the JSON structure
 */
function parseEntry(
  dimension: WeaveDimension,
  type: string,
  id: string,
  value: unknown
): CreateWeaveEntryInput | null {
  // Handle different JSON structures
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    // Common structure: { summary, detail, confidence, evidence, ... }
    const concept = (obj.summary as string) || (obj.title as string) || (obj.name as string) || id;
    const description = (obj.detail as string) || (obj.description as string) || (obj.content as string) || '';
    const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0.5;

    // Evidence can be a string or array
    let evidence: string[] = [];
    if (Array.isArray(obj.evidence)) {
      evidence = obj.evidence.map(e => String(e));
    } else if (typeof obj.evidence === 'string') {
      evidence = [obj.evidence];
    }

    // Extract any remaining fields as metadata
    const metadata: Record<string, unknown> = {};
    const skipFields = ['summary', 'detail', 'title', 'name', 'description', 'content', 'confidence', 'evidence'];
    for (const [key, val] of Object.entries(obj)) {
      if (!skipFields.includes(key)) {
        metadata[key] = val;
      }
    }

    return {
      dimension,
      type,
      concept,
      description,
      confidence,
      evidence: evidence.length > 0 ? evidence : undefined,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };
  }

  // Handle simple string values
  if (typeof value === 'string') {
    return {
      dimension,
      type,
      concept: id,
      description: value,
      confidence: 0.5,
    };
  }

  return null;
}

/**
 * Import entries from a single JSON file
 */
function importFile(filePath: string, dimension: WeaveDimension): ImportStats {
  const stats: ImportStats = {
    dimension,
    imported: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as Record<string, unknown>;

    const categoryMap = CATEGORY_MAPPINGS[dimension];

    for (const [category, entries] of Object.entries(data)) {
      const type = categoryMap[category] || category.toLowerCase().replace(/s$/, '');

      if (typeof entries !== 'object' || entries === null) {
        continue;
      }

      // Handle both object and array formats
      const entryObj = entries as Record<string, unknown>;
      for (const [entryId, entryValue] of Object.entries(entryObj)) {
        try {
          const input = parseEntry(dimension, type, entryId, entryValue);
          if (input) {
            weaveEntryRepository.create(input);
            stats.imported++;
          } else {
            stats.skipped++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stats.errors.push(`${category}/${entryId}: ${msg}`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`Failed to read file: ${msg}`);
  }

  return stats;
}

/**
 * Main migration function
 */
async function migrate(weavePath: string): Promise<void> {
  console.log('Weave JSON to Database Migration');
  console.log('='.repeat(50));
  console.log(`Source: ${weavePath}`);
  console.log(`Database: ${resolveDbPath()}`);
  console.log('');

  if (!existsSync(weavePath)) {
    console.error(`Error: Directory not found: ${weavePath}`);
    process.exit(1);
  }

  // Initialize database
  initDb();

  const files = readdirSync(weavePath).filter(f => f.endsWith('.json'));
  const allStats: ImportStats[] = [];

  for (const file of files) {
    const dimension = FILE_TO_DIMENSION[file];
    if (!dimension) {
      console.log(`Skipping unknown file: ${file}`);
      continue;
    }

    console.log(`Processing ${file} -> ${dimension}...`);
    const filePath = join(weavePath, file);
    const stats = importFile(filePath, dimension);
    allStats.push(stats);

    console.log(`  Imported: ${stats.imported}, Skipped: ${stats.skipped}`);
    if (stats.errors.length > 0) {
      console.log(`  Errors: ${stats.errors.length}`);
      for (const err of stats.errors.slice(0, 3)) {
        console.log(`    - ${err}`);
      }
      if (stats.errors.length > 3) {
        console.log(`    ... and ${stats.errors.length - 3} more`);
      }
    }
  }

  // Summary
  console.log('');
  console.log('Migration Summary');
  console.log('-'.repeat(50));

  const totalImported = allStats.reduce((sum, s) => sum + s.imported, 0);
  const totalSkipped = allStats.reduce((sum, s) => sum + s.skipped, 0);
  const totalErrors = allStats.reduce((sum, s) => sum + s.errors.length, 0);

  console.log(`Total Imported: ${totalImported}`);
  console.log(`Total Skipped: ${totalSkipped}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log('');

  // Show per-dimension breakdown
  console.log('By Dimension:');
  for (const stats of allStats) {
    console.log(`  ${stats.dimension}: ${stats.imported} entries`);
  }

  closeDb();
  console.log('');
  console.log('Migration complete!');
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: bun run scripts/migrate-weave-json.ts /path/to/.agent/weave');
  console.log('');
  console.log('This script imports Weave JSON files into the database.');
  console.log('');
  console.log('Expected JSON files in the directory:');
  for (const [file, dim] of Object.entries(FILE_TO_DIMENSION)) {
    console.log(`  ${file} -> dimension ${dim}`);
  }
  process.exit(0);
}

const weavePath = args[0];
migrate(weavePath);
