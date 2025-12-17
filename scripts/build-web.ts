#!/usr/bin/env bun
/**
 * Build script for Web Server executable
 *
 * Uses `bun build --compile` to create a standalone executable
 * that can run without requiring Bun to be installed.
 */

import { $ } from 'bun';

const isWindows = process.platform === 'win32';
const TARGET = isWindows ? 'dist/board-web.exe' : 'dist/board-web';
const SOURCE = 'src/web/index.ts';

async function build(): Promise<void> {
  console.log('Building Web Server executable...');
  console.log(`  Source: ${SOURCE}`);
  console.log(`  Target: ${TARGET}`);
  console.log(`  Platform: ${process.platform}`);
  console.log('');

  // Ensure dist directory exists
  await $`mkdir -p dist`.quiet();

  // Build with bun compile
  const result = await $`bun build ${SOURCE} --compile --outfile ${TARGET} --minify --target bun`.quiet();

  if (result.exitCode === 0) {
    console.log(`✓ Web Server built successfully: ${TARGET}`);

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

    console.log('');
    console.log('To run:');
    console.log(`  ./${TARGET}`);
    console.log('');
    console.log('Configuration:');
    console.log('  WEB_PORT=3345 (default)');
  } else {
    console.error('✗ Build failed');
    console.error(result.stderr.toString());
    process.exit(1);
  }
}

build();
