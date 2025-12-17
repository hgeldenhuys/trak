/**
 * Build script for TUI executable
 *
 * Creates a standalone executable using Bun's compile feature.
 * Handles OpenTUI native dependencies with TMPDIR workaround.
 *
 * Usage: bun run scripts/build-tui.ts
 * Output: dist/board-tui (or dist/board-tui.exe on Windows)
 */

import { $ } from 'bun';

const TARGET = process.platform === 'win32' ? 'dist/board-tui.exe' : 'dist/board-tui';

console.log('Building TUI executable...');
console.log(`Platform: ${process.platform}`);
console.log(`Target: ${TARGET}`);
console.log('');

// Ensure dist directory exists
await $`mkdir -p dist`;

// Build with bun compile
// Use bootstrap.ts as entry point - it sets TMPDIR before importing OpenTUI
// --minify triggers production mode JSX transforms (jsx instead of jsxDEV)
// --target bun ensures Bun-specific optimizations
const result = await $`TMPDIR=/tmp bun build src/tui/bootstrap.ts --compile --outfile ${TARGET} --minify --target bun`.quiet();

if (result.exitCode === 0) {
  console.log(`[OK] TUI built successfully: ${TARGET}`);

  // Get file size
  const file = Bun.file(TARGET);
  const sizeBytes = await file.size;
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(1);
  console.log(`  Size: ${sizeMB} MB`);

  // On macOS, remove quarantine attribute to prevent Gatekeeper blocking
  // Note: Bun-compiled binaries cannot be ad-hoc signed due to structural issues
  if (process.platform === 'darwin') {
    console.log('');
    console.log('Preparing binary for macOS...');

    // Remove quarantine attribute if present (prevents "app is damaged" errors)
    try {
      await $`xattr -d com.apple.quarantine ${TARGET} 2>/dev/null`.nothrow();
    } catch {
      // Ignore - attribute may not exist
    }
    console.log('  [OK] Quarantine attribute cleared');

    // Note about Gatekeeper
    console.log('');
    console.log('Note: If macOS blocks the binary, run:');
    console.log(`  xattr -d com.apple.quarantine ${TARGET}`);
    console.log('  or allow in System Settings > Privacy & Security');
  }

  console.log('');
  console.log('To run:');
  console.log(`  TMPDIR=/tmp ./${TARGET}`);
  console.log('');
  console.log('Note: TMPDIR workaround is required for OpenTUI native library');
} else {
  console.error('[FAILED] Build failed');
  console.error(result.stderr.toString());
  process.exit(1);
}
