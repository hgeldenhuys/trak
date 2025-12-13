# ADO Integration Hooks

Example hook scripts that integrate trak events with the Azure DevOps daemon.

## Overview

Hooks are shell scripts that trak executes when certain events occur (e.g., story status changes). These example hooks demonstrate how to call the ADO daemon's REST API to keep Azure DevOps work items in sync with trak stories.

## Prerequisites

- **jq** - JSON processor for parsing event data
  ```bash
  # macOS
  brew install jq

  # Ubuntu/Debian
  apt install jq

  # Arch Linux
  pacman -S jq
  ```

- **curl** - HTTP client (usually pre-installed)

- **ADO daemon running** - The hooks call the daemon's REST API
  ```bash
  echo $ADO_PAT | trak-ado --pat-stdin --org <org> --project <project>
  ```

## Installation

Use the included install script:

```bash
# Install to default location (~/.trak/hooks)
./install-hooks.sh

# Install to custom location
./install-hooks.sh /path/to/hooks

# Force overwrite existing hooks
./install-hooks.sh --force

# List installed hooks
./install-hooks.sh --list

# Uninstall hooks
./install-hooks.sh --uninstall
```

Or manually copy the scripts:

```bash
mkdir -p ~/.trak/hooks
cp *.sh ~/.trak/hooks/
chmod +x ~/.trak/hooks/*.sh
```

## Hook Scripts

### story-status-changed.sh

Called when a trak story's status changes. Updates the corresponding ADO work item state.

**Event JSON format:**
```json
{
  "storyId": "uuid",
  "code": "PROJ-001",
  "status": "completed",
  "previousStatus": "in_progress",
  "extensions": {
    "adoWorkItemId": 12345
  }
}
```

**Behavior:**
- Skips if no `adoWorkItemId` in extensions
- Uses the daemon's `trakStatus` mapping for proper state conversion
- Logs the state transition

**Example daemon call:**
```bash
curl -X POST "http://127.0.0.1:9271/ado/work-item/12345/state" \
  -H "Content-Type: application/json" \
  -d '{"trakStatus": "completed"}'
```

### story-created.sh

Called when a new trak story is created. By default, logs the event for awareness.

**Event JSON format:**
```json
{
  "storyId": "uuid",
  "code": "PROJ-001",
  "featureCode": "FEAT",
  "title": "Story title",
  "description": "Story description",
  "status": "draft",
  "priority": "P2",
  "extensions": {}
}
```

**Behavior:**
- Logs new story creation
- Skips if story already has an ADO link
- Auto-creation of ADO work items is opt-in via `ADO_AUTO_CREATE_WORK_ITEMS=1`

### ado-draft-promotion.ts

**TypeScript/Bun hook** that automatically creates ADO work items when draft stories are promoted.

Called when a trak story's status changes from 'draft' to any non-draft status (e.g., 'planned', 'in_progress'). If the story has no `adoWorkItemId`, calls the daemon API to create a new ADO work item.

**Event JSON format:**
```json
{
  "storyId": "uuid",
  "code": "PROJ-001",
  "status": "planned",
  "previousStatus": "draft",
  "title": "Story title",
  "description": "Story description",
  "extensions": {}
}
```

**Behavior:**
- Detects draft-to-non-draft status transitions
- Skips if story already has an `adoWorkItemId` (idempotent)
- Creates ADO work item via `POST /ado/work-item` endpoint
- Handles daemon unavailable gracefully with helpful error messages
- Default work item type is 'Issue' (configurable via `ADO_DEFAULT_WORK_ITEM_TYPE`)

**Example daemon call:**
```bash
curl -X POST "http://127.0.0.1:9271/ado/work-item" \
  -H "Content-Type: application/json" \
  -d '{"storyId": "abc-123", "type": "Issue"}'
```

**Testing:**
```bash
# Test draft promotion (daemon must be running)
echo '{"storyId":"test-123","code":"TEST-001","status":"planned","previousStatus":"draft","extensions":{}}' | bun ./ado-draft-promotion.ts

# With debug output
ADO_HOOK_DEBUG=1 echo '{"storyId":"test-123","code":"TEST-001","status":"planned","previousStatus":"draft","extensions":{}}' | bun ./ado-draft-promotion.ts
```

### task-status-changed.sh

Called when a trak task's status changes. Demonstrates hook extensibility for other entities.

**Event JSON format:**
```json
{
  "taskId": "uuid",
  "storyId": "uuid",
  "storyCode": "PROJ-001",
  "title": "Task title",
  "status": "completed",
  "previousStatus": "in_progress",
  "assignedTo": "backend-dev",
  "extensions": {}
}
```

**Behavior:**
- Logs task status changes
- ADO updates disabled by default (enable with `ADO_UPDATE_ON_TASK_CHANGE=1`)
- Placeholder for future task-to-ADO integration

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADO_DAEMON_HOST` | `127.0.0.1` | ADO daemon hostname |
| `ADO_DAEMON_PORT` | `9271` | ADO daemon port |
| `ADO_HOOK_DEBUG` | `0` | Enable debug logging (set to `1`) |
| `ADO_AUTO_CREATE_WORK_ITEMS` | `0` | Auto-create ADO items for new stories |
| `ADO_UPDATE_ON_TASK_CHANGE` | `0` | Update ADO when tasks change |
| `ADO_DEFAULT_WORK_ITEM_TYPE` | `User Story` | Work item type for auto-creation |

### Example: Enable Debug Mode

```bash
export ADO_HOOK_DEBUG=1
```

### Example: Custom Daemon Port

```bash
export ADO_DAEMON_PORT=9999
```

## Status Mapping

The hooks use the daemon's built-in status mapping. By default:

| Trak Status | ADO State |
|-------------|-----------|
| draft | New |
| planned | New |
| in_progress | Active |
| review | Resolved |
| completed | Closed |
| cancelled | Removed |

The mapping is configurable in the daemon's mapping configuration.

## Linking Stories to ADO

For a story to sync with ADO, it must have `adoWorkItemId` in its extensions:

```bash
# Link existing story to ADO work item
board story update PROJ-001 --extension adoWorkItemId=12345

# View the link
board story get PROJ-001 --format json | jq '.extensions.adoWorkItemId'
```

## Testing Hooks

### Test with sample event:

```bash
# Test story-status-changed hook
echo '{"code":"TEST-001","status":"completed","previousStatus":"in_progress","extensions":{"adoWorkItemId":123}}' | ./story-status-changed.sh

# Test with debug output
ADO_HOOK_DEBUG=1 echo '{"code":"TEST-001","status":"completed","previousStatus":"in_progress","extensions":{"adoWorkItemId":123}}' | ./story-status-changed.sh
```

### Test daemon connectivity:

```bash
curl http://127.0.0.1:9271/health
curl http://127.0.0.1:9271/status
```

## Troubleshooting

### Hook not executing

1. Check hooks are executable:
   ```bash
   ls -la ~/.trak/hooks/
   chmod +x ~/.trak/hooks/*.sh
   ```

2. Verify trak hook configuration

3. Check hook script syntax:
   ```bash
   bash -n ~/.trak/hooks/story-status-changed.sh
   ```

### ADO update fails

1. Check daemon is running:
   ```bash
   curl http://127.0.0.1:9271/health
   ```

2. Check work item exists and is accessible:
   ```bash
   curl http://127.0.0.1:9271/ado/work-item/12345/sync
   ```

3. Enable debug mode:
   ```bash
   export ADO_HOOK_DEBUG=1
   ```

4. Check daemon logs for errors

### jq not found

Install jq for your platform:
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt install jq
```

### Permission denied

Make hooks executable:
```bash
chmod +x ~/.trak/hooks/*.sh
```

## Extending Hooks

### Adding Custom Logic

Edit the hook scripts to add custom behavior. For example, adding Slack notifications:

```bash
# In story-status-changed.sh, after successful ADO update:
if [ "$NEW_STATUS" = "completed" ]; then
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"Story $STORY_CODE completed!\"}"
fi
```

### Creating New Hooks

1. Create a new script in the hooks directory
2. Follow the same pattern: read JSON from stdin, parse with jq, call APIs
3. Make it executable
4. Configure trak to call it for the appropriate event

## API Reference

The hooks call the ADO daemon's REST API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Daemon health check |
| `/status` | GET | Sync status and statistics |
| `/ado/work-item` | POST | Create ADO work item from trak story |
| `/ado/work-item/:id/state` | POST | Update work item state |
| `/ado/work-item/:id/sync` | POST | Force sync single item |
| `/sync` | POST | Trigger full sync |

See the main [README.md](../README.md) for full API documentation.
