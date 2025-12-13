# Trak Adapters

This directory contains adapter packages that sync trak's SQLite-based board with external project management systems.

## Architecture

Adapters are **standalone daemons** that:

1. **Run independently** - Each adapter is a separate Bun executable that can be started/stopped without affecting trak CLI/TUI
2. **Hold credentials in memory** - PAT/tokens are passed via stdin and never written to disk
3. **Expose localhost REST API** - Hooks can call the adapter's API to trigger syncs without needing credentials
4. **Poll external systems** - Periodically fetch updates and sync them to trak's SQLite database

```
                                    +-------------------+
                                    |  Azure DevOps     |
                                    |  (or Jira, etc.)  |
                                    +--------+----------+
                                             |
                                             | REST API (with PAT)
                                             |
+------------------+                +--------v----------+
|                  |   HTTP calls   |                   |
|   trak hooks     | <------------> |  trak-ado daemon  |
|   (no creds)     |  localhost     |  (holds PAT)      |
+------------------+                +--------+----------+
                                             |
                                             | SQLite
                                             |
                                    +--------v----------+
                                    |                   |
                                    |  trak database    |
                                    |  (~/.trak/...)    |
                                    +-------------------+
```

## Directory Structure

```
adapters/
  README.md                    # This file
  _template/                   # Template for creating new adapters
    README.md                  # Guide for creating adapters
  azure-devops/                # Azure DevOps adapter
    package.json               # Standalone package
    tsconfig.json              # TypeScript config
    src/
      types.ts                 # Type definitions
      config.ts                # Configuration handling
      daemon.ts                # Main entry point
      api/                     # ADO REST API client
      sync/                    # Sync logic (inbound/outbound)
      server/                  # Localhost REST API server
    hooks/                     # Example hook scripts
    README.md                  # Adapter documentation
```

## Creating a New Adapter

1. Copy `_template/` to a new directory (e.g., `jira/`)
2. Update `package.json` with the adapter name
3. Implement the required interfaces:
   - `ExternalClient` - API client for the external system
   - `FieldMapper` - Maps fields between trak and external system
   - `SyncService` - Handles inbound/outbound sync logic
4. Create the daemon entry point
5. Add localhost REST API endpoints
6. Write example hook scripts

See `_template/README.md` for detailed instructions.

## Common Patterns

### PAT via stdin

All adapters should accept authentication tokens via stdin for security:

```bash
echo $PAT | trak-ado --pat-stdin --org myorg --project myproject
```

This ensures tokens are never:
- Stored in shell history
- Written to configuration files
- Logged to stdout/stderr

### Localhost-only API

Adapters expose REST APIs bound to `127.0.0.1` only:

```bash
# The daemon starts a server on localhost:PORT
curl http://127.0.0.1:9271/health
```

This allows hooks to trigger actions without needing credentials.

### Field Mapping

Each adapter defines mappings between external system fields and trak fields:

```yaml
# Example: ADO state to trak status
states:
  New: draft
  Active: in_progress
  Resolved: review
  Closed: completed

# Example: Field mappings
fields:
  title: System.Title
  description: System.Description
  priority: Microsoft.VSTS.Common.Priority
```

### Hook Integration

Hooks can call the adapter's REST API when trak entities change:

```bash
# In hooks/story-status-changed.sh
curl -X POST "http://127.0.0.1:9271/ado/work-item/${ADO_ID}/state" \
  -H "Content-Type: application/json" \
  -d '{"state": "Active"}'
```

## Available Adapters

| Adapter | Status | Port | External System |
|---------|--------|------|-----------------|
| `azure-devops` | Core Complete | 9271 | Azure DevOps Boards |
| `jira` | Planned | 9272 | Atlassian Jira |
| `github-projects` | Planned | 9273 | GitHub Projects |
| `linear` | Planned | 9274 | Linear |

## Security Considerations

1. **Credentials are memory-only** - Never write PAT/tokens to disk
2. **Localhost binding** - API servers bind to 127.0.0.1 only
3. **No credential logging** - Sanitize all log output
4. **Secure stdin reading** - Clear buffers after reading PAT
5. **Graceful shutdown** - Clear credentials from memory on exit
