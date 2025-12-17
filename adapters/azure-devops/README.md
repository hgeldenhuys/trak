# trak-ado - Azure DevOps Adapter

Bidirectional sync daemon between trak's SQLite-based board and Azure DevOps Boards.

## Overview

The `trak-ado` daemon:
- Runs as a background process, independent of trak CLI/TUI
- Holds PAT (Personal Access Token) in memory only - never written to disk
- Exposes a localhost REST API for hook integration
- Polls ADO at configurable intervals for inbound sync
- Proxies authenticated requests to ADO for outbound sync

## Installation

```bash
cd adapters/azure-devops
bun install
bun run build
```

This creates a standalone executable `trak-ado` in the `dist/` directory.

## Usage

### Starting the Daemon

**IMPORTANT:** The PAT must be provided via stdin for security. Never pass it as a command-line argument.

```bash
# Using environment variable
echo $ADO_PAT | ./trak-ado --pat-stdin --org ively --project ively.core

# Using a secure prompt
read -s PAT && echo $PAT | ./trak-ado --pat-stdin --org ively --project ively.core

# Using a file (less secure, for testing only)
cat ~/.ado-pat | ./trak-ado --pat-stdin --org ively --project ively.core
```

### Command-Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--pat-stdin` | | Read PAT from stdin (required) | - |
| `--org` | `-o` | Azure DevOps organization | - |
| `--project` | `-p` | Azure DevOps project | - |
| `--board` | `-b` | Board name | Project name |
| `--port` | | REST API port | 9271 |
| `--poll-interval` | | Polling interval (seconds) | 30 |
| `--mapping-config` | `-m` | Custom field mapping file | Built-in |
| `--verbose` | `-v` | Enable verbose logging | false |
| `--help` | `-h` | Show help | - |
| `--version` | | Show version | - |

### Environment Variables

| Variable | Alias | Description |
|----------|-------|-------------|
| `ADO_ORG` | `AZURE_DEVOPS_ORG` | Azure DevOps organization |
| `ADO_PROJECT` | `AZURE_DEVOPS_PROJECT` | Azure DevOps project |
| `ADO_BOARD` | `AZURE_DEVOPS_BOARD` | Board name |
| `ADO_PORT` | - | REST API port |
| `ADO_POLL_INTERVAL` | - | Polling interval (seconds) |

## REST API

The daemon exposes a REST API bound to `127.0.0.1` only (not accessible from network).

### Endpoints

#### GET /health

Returns daemon health status.

```bash
curl http://127.0.0.1:9271/health
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 3600,
    "adoConnected": true,
    "trakConnected": true,
    "version": "0.1.0",
    "startedAt": "2025-12-10T10:00:00.000Z"
  },
  "timestamp": "2025-12-10T11:00:00.000Z"
}
```

#### GET /status

Returns sync status and statistics.

```bash
curl http://127.0.0.1:9271/status
```

Response:
```json
{
  "success": true,
  "data": {
    "health": { ... },
    "inboundSync": {
      "isRunning": false,
      "lastSyncAt": "2025-12-10T10:59:30.000Z",
      "lastError": null,
      "lastSyncCount": 5,
      "totalSynced": 150,
      "errorCount": 0
    },
    "outboundSync": {
      "isRunning": false,
      "lastSyncAt": "2025-12-10T10:58:00.000Z",
      "lastError": null,
      "lastSyncCount": 2,
      "totalSynced": 45,
      "errorCount": 0
    },
    "cachedWorkItems": 42
  },
  "timestamp": "2025-12-10T11:00:00.000Z"
}
```

#### POST /ado/work-item/:id/state

Update an ADO work item's state. Used by hooks when trak story status changes.

```bash
curl -X POST http://127.0.0.1:9271/ado/work-item/12345/state \
  -H "Content-Type: application/json" \
  -d '{"state": "Active", "reason": "Story started in trak"}'
```

Response:
```json
{
  "success": true,
  "data": {
    "workItemId": 12345,
    "previousState": "New",
    "newState": "Active",
    "updatedAt": "2025-12-10T11:00:05.000Z"
  },
  "timestamp": "2025-12-10T11:00:05.000Z"
}
```

#### POST /ado/work-item/:id/sync

Force sync a specific work item (fetches from ADO and updates trak).

```bash
curl -X POST http://127.0.0.1:9271/ado/work-item/12345/sync \
  -H "Content-Type: application/json" \
  -d '{"direction": "inbound"}'
```

#### POST /sync

Trigger a full sync cycle.

```bash
curl -X POST http://127.0.0.1:9271/sync \
  -H "Content-Type: application/json" \
  -d '{"direction": "both", "force": true}'
```

Response:
```json
{
  "success": true,
  "data": {
    "syncId": "sync-abc123",
    "direction": "both",
    "itemsProcessed": 42,
    "startedAt": "2025-12-10T11:00:00.000Z",
    "completedAt": "2025-12-10T11:00:15.000Z"
  },
  "timestamp": "2025-12-10T11:00:15.000Z"
}
```

## Hook Integration

The daemon is designed to be called from trak hooks when story status changes.

### Available Example Hooks

The `hooks/` directory contains ready-to-use hook scripts:

| Hook Script | Event | Description |
|-------------|-------|-------------|
| `story-status-changed.sh` | Story status change | Updates ADO work item state |
| `story-created.sh` | Story created | Logs new stories (auto-create is opt-in) |
| `task-status-changed.sh` | Task status change | Placeholder for task sync |
| `install-hooks.sh` | - | Installer script for hooks |

Install hooks with:
```bash
cd adapters/azure-devops/hooks
./install-hooks.sh
```

See [hooks/README.md](hooks/README.md) for detailed documentation.

### Example: Bash Hook

Create a hook at `hooks/story-status-changed.sh`:

```bash
#!/bin/bash
# Called when a trak story status changes
# Updates the corresponding ADO work item

# Get the ADO work item ID from story extensions
ADO_ID=$(board story get "$STORY_ID" --format json | jq -r '.extensions.adoWorkItemId')

if [ -n "$ADO_ID" ] && [ "$ADO_ID" != "null" ]; then
  # Map trak status to ADO state
  case "$NEW_STATUS" in
    "draft"|"planned") ADO_STATE="New" ;;
    "in_progress") ADO_STATE="Active" ;;
    "review") ADO_STATE="Resolved" ;;
    "completed") ADO_STATE="Closed" ;;
    "cancelled") ADO_STATE="Removed" ;;
    *) ADO_STATE="" ;;
  esac

  if [ -n "$ADO_STATE" ]; then
    curl -s -X POST "http://127.0.0.1:9271/ado/work-item/${ADO_ID}/state" \
      -H "Content-Type: application/json" \
      -d "{\"state\": \"${ADO_STATE}\"}"
  fi
fi
```

### Example: TypeScript Hook (with claude-hooks-sdk)

```typescript
import { createHook } from 'claude-hooks-sdk';

export default createHook({
  name: 'ado-sync',
  events: ['story:status_changed'],
  async handler(event) {
    const adoId = event.story.extensions?.adoWorkItemId;
    if (!adoId) return;

    const stateMap: Record<string, string> = {
      draft: 'New',
      planned: 'New',
      in_progress: 'Active',
      review: 'Resolved',
      completed: 'Closed',
      cancelled: 'Removed',
    };

    const adoState = stateMap[event.newStatus];
    if (!adoState) return;

    await fetch(`http://127.0.0.1:9271/ado/work-item/${adoId}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: adoState }),
    });
  },
});
```

## Supported Process Templates

The adapter supports three Azure DevOps process templates out of the box:

### Work Item Types

| Process | Work Item Types |
|---------|-----------------|
| **Basic** | Issue, Task, Epic |
| **Agile** | User Story, Bug, Task, Feature, Epic |
| **Scrum** | Product Backlog Item (PBI), Bug, Task, Feature, Epic |

All types are enabled by default. Use `--mapping-config` to limit to specific types.

## Field Mapping

### Default Mappings

**Status/State Mapping by Process Template:**

| Process | ADO State | Trak Status |
|---------|-----------|-------------|
| **Agile** | New | draft |
| | Active | in_progress |
| | Resolved | review |
| | Closed | completed |
| | Removed | cancelled |
| **Scrum** | New | draft |
| | Approved | planned |
| | Committed | in_progress |
| | Done | completed |
| | Removed | cancelled |
| **Basic** | To Do | draft |
| | Doing | in_progress |
| | Done | completed |

**Priority Mapping:**

| ADO Priority | Trak Priority |
|--------------|---------------|
| 1 (Critical) | P0 |
| 2 (High) | P1 |
| 3 (Medium) | P2 |
| 4 (Low) | P3 |

**Field Mapping:**

| Trak Field | ADO Field |
|------------|-----------|
| title | System.Title |
| description | System.Description |
| why | Microsoft.VSTS.Common.AcceptanceCriteria |
| assignedTo | System.AssignedTo |
| createdAt | System.CreatedDate |
| updatedAt | System.ChangedDate |

### Custom Mapping Configuration

Create a YAML file to customize field mappings:

```yaml
# my-mapping.yaml
states:
  inbound:
    New: draft
    Active: in_progress
    Resolved: review
    Closed: completed
    Removed: cancelled
  outbound:
    draft: New
    planned: New
    in_progress: Active
    review: Resolved
    completed: Closed
    cancelled: Removed

priorities:
  inbound:
    1: P0
    2: P1
    3: P2
    4: P3
  outbound:
    P0: 1
    P1: 2
    P2: 3
    P3: 4

fields:
  - trakField: title
    adoField: System.Title
  - trakField: description
    adoField: System.Description
  - trakField: why
    adoField: Microsoft.VSTS.Common.AcceptanceCriteria
  - trakField: estimatedComplexity
    adoField: Microsoft.VSTS.Scheduling.StoryPoints
    inboundTransform: storyPointsToComplexity
    outboundTransform: complexityToStoryPoints

workItemTypes:
  - User Story
  - Bug
```

**Example: Scrum Process Only**

```yaml
# scrum-mapping.yaml
states:
  inbound:
    New: draft
    Approved: planned
    Committed: in_progress
    Done: completed
    Removed: cancelled
  outbound:
    draft: New
    planned: Approved
    in_progress: Committed
    review: Committed
    completed: Done
    cancelled: Removed

workItemTypes:
  - Product Backlog Item
  - Bug
  - Task
```

Use with: `--mapping-config ./my-mapping.yaml`

## Configuration Reference

### Test Configuration

For the ively.core board:

```bash
# Organization: ively
# Project: ively.core
# Board: ively.core Team

echo $ADO_PAT | ./trak-ado --pat-stdin --org ively --project ively.core
```

### Azure DevOps PAT Requirements

Your PAT needs these scopes:
- **Work Items:** Read & Write
- **Project and Team:** Read (for board queries)

To create a PAT:
1. Go to Azure DevOps > User Settings > Personal access tokens
2. Click "New Token"
3. Select scopes: Work Items (Read & Write), Project and Team (Read)
4. Copy the token and store securely

## Troubleshooting

### Daemon won't start

1. Check PAT is being provided via stdin:
   ```bash
   echo $ADO_PAT | ./trak-ado --pat-stdin --org ively --project ively.core
   ```

2. Verify organization and project names:
   ```bash
   # Check you can access ADO
   curl -u :$ADO_PAT "https://dev.azure.com/ively/_apis/projects/ively.core?api-version=7.0"
   ```

3. Check port is available:
   ```bash
   lsof -i :9271
   ```

### Sync not working

1. Check daemon health:
   ```bash
   curl http://127.0.0.1:9271/health
   ```

2. Check sync status for errors:
   ```bash
   curl http://127.0.0.1:9271/status
   ```

3. Enable verbose logging:
   ```bash
   echo $ADO_PAT | ./trak-ado --pat-stdin --org ively --project ively.core --verbose
   ```

### Work item not updating

1. Verify the work item ID exists in ADO
2. Check field mapping is correct
3. Verify PAT has write permissions
4. Check for state transition rules in ADO (some transitions may be blocked)

## Security Considerations

1. **PAT in memory only** - The PAT is never written to disk or logged
2. **Localhost binding** - The API server only binds to 127.0.0.1
3. **No credential logging** - All output is sanitized to remove tokens
4. **Secure stdin reading** - Buffers are cleared after reading PAT
5. **Graceful shutdown** - Credentials are cleared from memory on exit

## Development

```bash
# Install dependencies
bun install

# Run in development mode
echo $ADO_PAT | bun run dev

# Run tests
bun test

# Build executable
bun run build
```
