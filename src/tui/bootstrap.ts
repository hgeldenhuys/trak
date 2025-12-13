/**
 * TUI Bootstrap - Sets TMPDIR before loading OpenTUI
 *
 * This file MUST be the entry point for the compiled binary.
 * It sets TMPDIR=/tmp before any OpenTUI native modules are loaded.
 */

// Set TMPDIR FIRST - before any imports
process.env.TMPDIR = '/tmp';

// Now dynamically import the main app
import('./index.js');
