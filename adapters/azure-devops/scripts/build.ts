#!/usr/bin/env bun
/**
 * Build script for trak-ado standalone executable
 *
 * Uses `bun build --compile` to create a standalone executable
 * that can run without requiring Bun to be installed.
 *
 * Usage: bun run scripts/build.ts
 * Output: dist/trak-ado (or dist/trak-ado.exe on Windows)
 */

import { $ } from 'bun';
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';

// =============================================================================
// Configuration
// =============================================================================

const config = {
  entrypoint: 'src/daemon.ts',
  outfile: 'dist/trak-ado',
  target: 'bun',
  minify: true,
};

// Platform detection
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

// Adjust output filename for Windows
const outputFile = isWindows ? `${config.outfile}.exe` : config.outfile;

// Get platform name for display
function getPlatformName(): string {
  if (isWindows) return 'windows';
  if (isMac) return 'darwin';
  if (isLinux) return 'linux';
  return process.platform;
}

// =============================================================================
// Build Steps
// =============================================================================

async function cleanDist(): Promise<void> {
  console.log('  Cleaning dist directory...');

  const distDir = dirname(outputFile);
  if (existsSync(distDir)) {
    // Remove existing executable if present
    if (existsSync(outputFile)) {
      rmSync(outputFile, { force: true });
    }
  }

  // Ensure dist directory exists
  await $`mkdir -p dist`.quiet();
}

async function runBuild(): Promise<boolean> {
  console.log('  Compiling with Bun...');

  // Build command with minification
  const buildArgs = [
    'build',
    config.entrypoint,
    '--compile',
    '--outfile',
    outputFile,
  ];

  if (config.minify) {
    buildArgs.push('--minify');
  }

  try {
    const result = await $`bun ${buildArgs}`.quiet();
    return result.exitCode === 0;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`  Build error: ${error.message}`);
    }
    return false;
  }
}

async function makeExecutable(): Promise<void> {
  if (!isWindows) {
    console.log('  Setting executable permissions...');
    await $`chmod +x ${outputFile}`.quiet();
  }
}

async function reportSize(): Promise<void> {
  const file = Bun.file(outputFile);
  const sizeBytes = await file.size;
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);

  console.log('');
  console.log(`  Build successful: ${outputFile}`);
  console.log(`  Size: ${sizeMB} MB (${sizeBytes.toLocaleString()} bytes)`);
  console.log(`  Permissions: ${isWindows ? 'executable (Windows)' : 'executable'}`);
}

// =============================================================================
// Main Build Function
// =============================================================================

async function build(): Promise<void> {
  console.log('Building trak-ado adapter...');
  console.log(`  Source: ${config.entrypoint}`);
  console.log(`  Target: ${outputFile}`);
  console.log(`  Platform: ${getPlatformName()}`);
  console.log(`  Minify: ${config.minify}`);
  console.log('');

  // Step 1: Clean dist directory
  await cleanDist();

  // Step 2: Run Bun build
  const buildSuccess = await runBuild();

  if (!buildSuccess) {
    console.error('');
    console.error('Build failed');
    process.exit(1);
  }

  // Step 3: Make executable (Unix only)
  await makeExecutable();

  // Step 4: Report file size
  await reportSize();

  console.log('');
  console.log('To run the adapter:');
  console.log(`  echo $ADO_PAT | ./${outputFile} --pat-stdin --org <org> --project <project>`);
  console.log('');
  console.log('For help:');
  console.log(`  ./${outputFile} --help`);
}

// =============================================================================
// Entry Point
// =============================================================================

build().catch((error) => {
  console.error('Build failed with error:', error.message);
  process.exit(1);
});
