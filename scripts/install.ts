#!/usr/bin/env bun
/**
 * Install script for Board CLI and TUI
 *
 * Builds both executables and installs them with terminal reset wrappers.
 * The wrappers ensure the terminal is properly reset after exit,
 * preventing mouse tracking artifacts.
 *
 * Installation locations:
 *   Binaries: ~/.local/bin/board-cli-bin, ~/.local/bin/board-tui-bin
 *   Wrappers: /usr/local/bin/board, /usr/local/bin/board-tui
 *
 * Usage:
 *   bun run scripts/install.ts           # Build and install
 *   bun run scripts/install.ts --local   # Install to ~/.local/bin only
 */

import { $ } from 'bun';
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LOCAL_BIN = join(homedir(), '.local', 'bin');
const GLOBAL_BIN = '/usr/local/bin';

const CLI_WRAPPER = `#!/bin/bash
# Board CLI wrapper - ensures terminal is reset after exit

# Run the CLI binary
~/.local/bin/board-cli-bin "$@"
EXIT_CODE=$?

# Reset terminal to clean state (in case of crash/interrupt)
printf '\\e[?1000l'  # Disable mouse click tracking
printf '\\e[?1002l'  # Disable mouse button tracking
printf '\\e[?1003l'  # Disable mouse any-event tracking
printf '\\e[?1006l'  # Disable SGR mouse mode
printf '\\e[?25h'    # Show cursor
printf '\\e[0m'      # Reset text attributes
stty sane 2>/dev/null  # Reset terminal settings

exit $EXIT_CODE
`;

const TUI_WRAPPER = `#!/bin/bash
# Board TUI wrapper - ensures terminal is reset after exit
# The TUI uses mouse tracking which can leave terminal in bad state

# Run the TUI binary with TMPDIR set (required for OpenTUI)
TMPDIR=/tmp ~/.local/bin/board-tui-bin "$@"
EXIT_CODE=$?

# Reset terminal to clean state
# Disable mouse tracking modes and restore normal terminal
printf '\\e[?1000l'  # Disable mouse click tracking
printf '\\e[?1002l'  # Disable mouse button tracking
printf '\\e[?1003l'  # Disable mouse any-event tracking
printf '\\e[?1006l'  # Disable SGR mouse mode
printf '\\e[?1049l'  # Exit alternate screen buffer
printf '\\e[?25h'    # Show cursor
printf '\\e[0m'      # Reset text attributes
stty sane 2>/dev/null  # Reset terminal settings

exit $EXIT_CODE
`;

async function build(): Promise<boolean> {
  console.log('Building executables...\n');

  // Build CLI
  console.log('Building CLI...');
  const cliResult = await $`bun build src/cli/index.ts --compile --outfile dist/board-cli`.quiet();
  if (cliResult.exitCode !== 0) {
    console.error('Failed to build CLI');
    console.error(cliResult.stderr.toString());
    return false;
  }
  console.log('  ✓ CLI built: dist/board-cli');

  // Build TUI
  console.log('Building TUI...');
  const tuiResult = await $`TMPDIR=/tmp bun build src/tui/bootstrap.ts --compile --outfile dist/board-tui --minify --target bun`.quiet();
  if (tuiResult.exitCode !== 0) {
    console.error('Failed to build TUI');
    console.error(tuiResult.stderr.toString());
    return false;
  }
  console.log('  ✓ TUI built: dist/board-tui');

  return true;
}

async function installLocal(): Promise<boolean> {
  console.log('\nInstalling binaries to ~/.local/bin...');

  // Ensure directory exists
  if (!existsSync(LOCAL_BIN)) {
    mkdirSync(LOCAL_BIN, { recursive: true });
    console.log(`  Created ${LOCAL_BIN}`);
  }

  // Copy CLI binary
  const cliDest = join(LOCAL_BIN, 'board-cli-bin');
  const cliResult = await $`cp dist/board-cli ${cliDest}`.quiet();
  if (cliResult.exitCode !== 0) {
    console.error(`  Failed to copy CLI to ${cliDest}`);
    return false;
  }
  chmodSync(cliDest, 0o755);
  console.log(`  ✓ CLI binary: ${cliDest}`);

  // Copy TUI binary
  const tuiDest = join(LOCAL_BIN, 'board-tui-bin');
  const tuiResult = await $`cp dist/board-tui ${tuiDest}`.quiet();
  if (tuiResult.exitCode !== 0) {
    console.error(`  Failed to copy TUI to ${tuiDest}`);
    return false;
  }
  chmodSync(tuiDest, 0o755);
  console.log(`  ✓ TUI binary: ${tuiDest}`);

  return true;
}

async function installGlobal(): Promise<boolean> {
  console.log('\nInstalling wrappers to /usr/local/bin...');

  // Try to install CLI wrapper
  const cliWrapperPath = join(GLOBAL_BIN, 'board');
  try {
    writeFileSync(cliWrapperPath, CLI_WRAPPER, { mode: 0o755 });
    console.log(`  ✓ CLI wrapper: ${cliWrapperPath}`);
  } catch (err) {
    console.log(`  ⚠ Cannot write to ${cliWrapperPath} - trying with sudo...`);
    const result = await $`sudo tee ${cliWrapperPath} > /dev/null << 'WRAPPER'
${CLI_WRAPPER}
WRAPPER`.quiet();
    if (result.exitCode !== 0) {
      console.error(`  Failed to install CLI wrapper`);
      return false;
    }
    await $`sudo chmod +x ${cliWrapperPath}`.quiet();
    console.log(`  ✓ CLI wrapper: ${cliWrapperPath} (via sudo)`);
  }

  // Try to install TUI wrapper
  const tuiWrapperPath = join(GLOBAL_BIN, 'board-tui');
  try {
    writeFileSync(tuiWrapperPath, TUI_WRAPPER, { mode: 0o755 });
    console.log(`  ✓ TUI wrapper: ${tuiWrapperPath}`);
  } catch (err) {
    console.log(`  ⚠ Cannot write to ${tuiWrapperPath} - trying with sudo...`);
    const result = await $`sudo tee ${tuiWrapperPath} > /dev/null << 'WRAPPER'
${TUI_WRAPPER}
WRAPPER`.quiet();
    if (result.exitCode !== 0) {
      console.error(`  Failed to install TUI wrapper`);
      return false;
    }
    await $`sudo chmod +x ${tuiWrapperPath}`.quiet();
    console.log(`  ✓ TUI wrapper: ${tuiWrapperPath} (via sudo)`);
  }

  return true;
}

function printLocalOnlyInstructions(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Local installation complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nAdd to your shell profile (~/.bashrc, ~/.zshrc):');
  console.log('');
  console.log('  export PATH="$HOME/.local/bin:$PATH"');
  console.log('');
  console.log('Then run:');
  console.log('  board-cli-bin --help    # CLI');
  console.log('  TMPDIR=/tmp board-tui-bin  # TUI');
}

function printSuccess(): void {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Installation complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\nCommands available:');
  console.log('  board          # CLI for story/task management');
  console.log('  board-tui      # Interactive terminal UI');
  console.log('');
  console.log('Quick start:');
  console.log('  cd /path/to/project');
  console.log('  board init     # Create project-local database');
  console.log('  board-tui      # Open board for this project');
}

async function main(): Promise<void> {
  const localOnly = process.argv.includes('--local');

  // Build
  if (!await build()) {
    process.exit(1);
  }

  // Install binaries locally
  if (!await installLocal()) {
    process.exit(1);
  }

  if (localOnly) {
    printLocalOnlyInstructions();
    return;
  }

  // Install global wrappers
  if (!await installGlobal()) {
    console.log('\nGlobal installation failed. Binaries are available at:');
    console.log(`  ${join(LOCAL_BIN, 'board-cli-bin')}`);
    console.log(`  ${join(LOCAL_BIN, 'board-tui-bin')}`);
    process.exit(1);
  }

  printSuccess();
}

main();
