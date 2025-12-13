#!/usr/bin/env bun
/**
 * Board CLI - Command-line interface for story and task management
 *
 * Main entry point that sets up Commander.js with global options
 * and initializes the database before any command execution.
 */
import { Command, CommanderError } from 'commander';
import { initDb, closeDb } from '../db';
import { setOutputOptions, error, verbose } from './utils/output';
import { createStoryCommand } from './commands/story';
import { taskCommand } from './commands/task';
import { featureCommand } from './commands/feature';
/**
 * Create and configure the main CLI program
 */
function createProgram() {
    const program = new Command();
    program
        .name('board')
        .description('Board CLI for story and task management')
        .version('0.1.0')
        .option('--db-path <path>', 'Path to SQLite database', '.board.db')
        .option('--json', 'Output as JSON', false)
        .option('-v, --verbose', 'Verbose output', false);
    // Global hook to initialize database and set output options before any command
    program.hook('preAction', async (thisCommand) => {
        const options = thisCommand.opts();
        // Set global output options for all commands
        setOutputOptions({
            json: options.json ?? false,
            verbose: options.verbose ?? false,
        });
        verbose(`Database path: ${options.dbPath}`);
        verbose(`JSON output: ${options.json}`);
        // Initialize database
        try {
            initDb({ dbPath: options.dbPath });
            verbose('Database initialized successfully');
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            error(`Failed to initialize database: ${message}`);
            process.exit(1);
        }
    });
    // Cleanup hook to close database after command execution
    program.hook('postAction', async () => {
        closeDb();
        verbose('Database connection closed');
    });
    // Add subcommands
    // Story command with list, delete subcommands
    program.addCommand(createStoryCommand());
    // Task command with create, list, show, update, status, delete subcommands
    program.addCommand(taskCommand);
    // Feature command with create, list, show, update, delete subcommands
    program.addCommand(featureCommand);
    return program;
}
/**
 * Main entry point
 */
async function main() {
    const program = createProgram();
    // Enable exit override for better error handling
    program.exitOverride();
    try {
        await program.parseAsync(process.argv);
    }
    catch (err) {
        // Handle Commander-specific errors
        if (err instanceof CommanderError) {
            // Don't show error for help/version output
            if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
                process.exit(0);
            }
            // Show usage errors
            if (err.code === 'commander.missingArgument' || err.code === 'commander.missingMandatoryOptionValue') {
                error(err.message);
                process.exit(1);
            }
        }
        // Handle other errors
        const message = err instanceof Error ? err.message : String(err);
        error(message);
        process.exit(1);
    }
}
// Run the CLI
main();
