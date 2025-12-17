/**
 * Web Server Entry Point
 *
 * Start the web server with:
 *   bun run src/web/index.ts
 *
 * Configuration:
 *   WEB_PORT - Server port (default: 3000)
 *   BOARD_DB_PATH - Database path (default: .board.db in cwd)
 */

import { createServer } from './server';

// Start the server
createServer();
