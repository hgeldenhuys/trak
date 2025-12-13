import { jsx as _jsx } from "@opentui/react/jsx-runtime";
/**
 * TUI Entry Point - Board CLI/TUI System
 *
 * Initializes the OpenTUI renderer, database connection,
 * and starts the React application.
 *
 * IMPORTANT: Sets TMPDIR=/tmp to work around OpenTUI temp file issues.
 */
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { App } from './App';
import { initDb } from '../db';
/**
 * TMPDIR workaround for OpenTUI
 *
 * OpenTUI may have issues with certain temp directories.
 * Setting TMPDIR=/tmp ensures compatibility.
 */
if (!process.env.TMPDIR) {
    process.env.TMPDIR = '/tmp';
}
/**
 * Get database path from environment or use default
 */
function getDatabasePath() {
    return process.env.BOARD_DB_PATH || '.board.db';
}
/**
 * Initialize the application
 *
 * 1. Initialize database connection
 * 2. Create OpenTUI renderer (await - returns Promise!)
 * 3. Create React root with renderer and render App
 */
async function main() {
    try {
        // Initialize database first
        const dbPath = getDatabasePath();
        console.log(`Initializing database at: ${dbPath}`);
        initDb({ dbPath });
        console.log('Database initialized successfully');
        // Clear console before starting TUI
        console.clear();
        // Create OpenTUI renderer - MUST await!
        const renderer = await createCliRenderer();
        // Create React root with renderer and render the App component
        // Note: createRoot takes the renderer and returns { render, unmount }
        const root = createRoot(renderer);
        root.render(_jsx(App, {}));
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\nShutting down...');
            root.unmount();
            process.exit(0);
        });
        process.on('SIGTERM', () => {
            console.log('\nShutting down...');
            root.unmount();
            process.exit(0);
        });
    }
    catch (error) {
        console.error('Failed to start TUI:', error);
        process.exit(1);
    }
}
// Start the application
main();
