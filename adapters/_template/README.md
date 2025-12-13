# Trak Adapter Template

This template provides a starting point for creating new trak adapters.

## Getting Started

1. **Copy this template:**
   ```bash
   cp -r adapters/_template adapters/my-adapter
   cd adapters/my-adapter
   ```

2. **Rename and update package.json:**
   ```json
   {
     "name": "trak-myadapter",
     "version": "0.1.0",
     "description": "MyAdapter sync daemon for trak"
   }
   ```

3. **Implement required components:**
   - [ ] Type definitions (`src/types.ts`)
   - [ ] Configuration handling (`src/config.ts`)
   - [ ] API client (`src/api/client.ts`)
   - [ ] Field mapper (`src/mapping/mapper.ts`)
   - [ ] Sync services (`src/sync/`)
   - [ ] REST API server (`src/server/`)
   - [ ] Daemon entry point (`src/daemon.ts`)

## Required Directory Structure

```
my-adapter/
  package.json          # Standalone package
  tsconfig.json         # TypeScript config
  README.md             # Documentation
  src/
    types.ts            # Type definitions
    config.ts           # Configuration & defaults
    daemon.ts           # Main entry point
    api/
      client.ts         # External system API client
      index.ts
    mapping/
      mapper.ts         # Field mapping logic
      defaults.ts       # Default mappings
      index.ts
    sync/
      inbound.ts        # External -> trak sync
      outbound.ts       # trak -> External sync
      poller.ts         # Polling service
      index.ts
    server/
      index.ts          # HTTP server
      routes.ts         # Route definitions
      handlers/
        health.ts
        status.ts
        sync.ts
  hooks/                # Example hook scripts
    on-story-change.sh
    on-story-change.ts
    README.md
```

## Required Types

Define these types in `src/types.ts`:

```typescript
// External system entity types
export interface ExternalWorkItem {
  id: string | number;
  // ... system-specific fields
}

// State mapping
export interface StateMapping {
  inbound: Record<string, string>;  // External -> trak
  outbound: Record<string, string>; // trak -> External
}

// Configuration
export interface AdapterConfig {
  connection: ConnectionConfig;
  sync: SyncConfig;
  mapping: FieldMappingConfig;
  server: ServerConfig;
}

// Daemon state
export interface DaemonState {
  health: DaemonHealth;
  syncStatus: SyncStatus;
}

// API responses
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```

## Required Configuration

In `src/config.ts`:

```typescript
// Pick a unique port (9271 = ADO, 9272 = Jira, etc.)
export const DEFAULT_PORT = 927X;

// Default poll interval (30 seconds recommended)
export const DEFAULT_POLL_INTERVAL = 30_000;

// Default state mappings
export const DEFAULT_STATE_MAPPING: StateMapping = {
  inbound: {
    // External state -> trak status
    'Todo': 'draft',
    'In Progress': 'in_progress',
    'Done': 'completed',
  },
  outbound: {
    // trak status -> External state
    'draft': 'Todo',
    'in_progress': 'In Progress',
    'completed': 'Done',
  },
};
```

## Required API Client Pattern

```typescript
// src/api/client.ts
export class ExternalClient {
  private baseUrl: string;
  private token: string;  // Held in memory only!

  constructor(config: ConnectionConfig, token: string) {
    this.baseUrl = config.baseUrl;
    this.token = token;
  }

  // Never expose token in logs or errors
  async getWorkItem(id: string): Promise<ExternalWorkItem> {
    const response = await fetch(`${this.baseUrl}/items/${id}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    return response.json();
  }

  // Clear token on shutdown
  destroy(): void {
    this.token = '';
  }
}
```

## Required Daemon Entry Point

```typescript
// src/daemon.ts
import { parseCLIArgs, buildConfig } from './config';
import { readPatFromStdin } from './stdin-reader';
import { ExternalClient } from './api/client';
import { startServer } from './server';
import { startPoller } from './sync/poller';

async function main() {
  const args = parseCLIArgs(process.argv.slice(2));

  // REQUIRED: Read PAT from stdin
  if (!args.patStdin) {
    console.error('Error: --pat-stdin is required');
    process.exit(1);
  }
  const pat = await readPatFromStdin();

  const config = buildConfig(args);
  const client = new ExternalClient(config.connection, pat);

  // Start services
  const server = startServer(config.server);
  const poller = startPoller(config.sync, client);

  // Handle shutdown
  const shutdown = () => {
    console.log('Shutting down...');
    poller.stop();
    server.close();
    client.destroy();  // Clear credentials
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(console.error);
```

## Required REST API Endpoints

All adapters must implement these endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Daemon health check |
| `/status` | GET | Sync status and statistics |
| `/sync` | POST | Trigger sync (inbound/outbound/both) |
| `/{system}/work-item/:id/state` | POST | Update external work item state |
| `/{system}/work-item/:id/sync` | POST | Force sync single item |

## Security Requirements

1. **PAT via stdin only** - Never accept credentials as CLI args
2. **Localhost binding** - Server must bind to 127.0.0.1 only
3. **No credential logging** - Sanitize all log output
4. **Memory-only credentials** - Never write tokens to disk
5. **Clear on shutdown** - Zero out credential buffers on exit

## Testing Checklist

- [ ] PAT stdin handling works
- [ ] Server binds to localhost only
- [ ] Polling interval is configurable
- [ ] Inbound sync creates/updates trak stories
- [ ] Outbound sync updates external work items
- [ ] Field mapping works correctly
- [ ] Error handling doesn't leak credentials
- [ ] Graceful shutdown clears credentials
- [ ] Standalone build works

## Example: Adding Jira Adapter

```bash
# 1. Copy template
cp -r adapters/_template adapters/jira

# 2. Update package.json
{
  "name": "trak-jira",
  "version": "0.1.0",
  "description": "Jira adapter daemon for trak"
}

# 3. Define Jira-specific types
# - JiraIssue, JiraStatus, JiraProject, etc.

# 4. Implement Jira REST API client
# - Uses Jira Cloud REST API v3
# - Basic auth with API token

# 5. Define state mappings
# - "To Do" -> "draft"
# - "In Progress" -> "in_progress"
# - "Done" -> "completed"

# 6. Implement sync logic
# - JQL queries for fetching issues
# - Transition API for state changes

# 7. Build and test
bun run build
echo $JIRA_TOKEN | ./trak-jira --pat-stdin --url https://myorg.atlassian.net --project PROJ
```

## Port Assignments

| Port | Adapter |
|------|---------|
| 9271 | Azure DevOps |
| 9272 | Jira |
| 9273 | GitHub Projects |
| 9274 | Linear |
| 9275 | Asana |
| 9276 | Monday.com |
| 9277 | Trello |
| 9278-9299 | Reserved for future |

## Questions?

See the `azure-devops/` adapter for a complete reference implementation.
