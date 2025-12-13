#!/usr/bin/env bun
/**
 * Build script for CLI executable
 *
 * Uses `bun build --compile` to create a standalone executable
 * that can run without requiring Bun to be installed.
 */

import { $ } from 'bun';

const isWindows = process.platform === 'win32';
const TARGET = isWindows ? 'dist/board-cli.exe' : 'dist/board-cli';
const SOURCE = 'src/cli/index.ts';

async function build(): Promise<void> {
  console.log('Building CLI executable...');
  console.log(`  Source: ${SOURCE}`);
  console.log(`  Target: ${TARGET}`);
  console.log(`  Platform: ${process.platform}`);
  console.log('');

  // Ensure dist directory exists
  await $`mkdir -p dist`.quiet();

  // Build with bun compile
  const result = await $`bun build ${SOURCE} --compile --outfile ${TARGET}`.quiet();

  if (result.exitCode === 0) {
    console.log(`✓ CLI built successfully: ${TARGET}`);

    // Get file size
    const file = Bun.file(TARGET);
    const sizeBytes = await file.size;
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);
    console.log(`  Size: ${sizeMB} MB (${sizeBytes.toLocaleString()} bytes)`);

    // Make executable on Unix systems
    if (!isWindows) {
      await $`chmod +x ${TARGET}`.quiet();
      console.log('  Permissions: executable');
    }
  } else {
    console.error('✗ Build failed');
    console.error(result.stderr.toString());
    process.exit(1);
  }
}

build();
