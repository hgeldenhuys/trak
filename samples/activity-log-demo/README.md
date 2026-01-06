# Activity Log Demo Adapter

This sample demonstrates how to integrate activity logging with the Board CLI for real-time agent monitoring in the TUI.

## Overview

Activity logs provide visibility into what external agents, hooks, and adapters are doing. They appear in the TUI's Activity Log Panel, making it easy to monitor agent health and debug issues.

## Usage

### Shell Script Hook

Use `activity-hook.sh` to log task status transitions:

```bash
# Log a task starting
./activity-hook.sh start TASK-ID

# Log a task completing
./activity-hook.sh complete TASK-ID

# Log an error
./activity-hook.sh error TASK-ID "Error message"
```

Example integration with task workflow:

```bash
# Start a task and log it
bun board task update abc123 -s in_progress && ./activity-hook.sh start abc123

# Complete a task and log it
bun board task update abc123 -s completed && ./activity-hook.sh complete abc123
```

### TypeScript Hook

The `activity-hook.ts` provides the same functionality in TypeScript:

```bash
bun activity-hook.ts start TASK-ID
bun activity-hook.ts complete TASK-ID
bun activity-hook.ts error TASK-ID "Error message"
```

## Log Levels

- **info** (gray) - Normal activity, progress updates
- **warn** (yellow) - Potential issues, timeouts, retries
- **error** (red) - Failures, exceptions, blocked tasks

## Viewing Logs

### CLI Commands

```bash
# List recent logs
bun board log list

# List logs for a specific story
bun board log list -S TUI-004

# List logs from a specific source
bun board log list -s 'activity-hook'

# Show log details
bun board log show abc123

# Clear old logs
bun board log clear --older-than 24h --confirm
```

### TUI Activity Panel

When viewing a story in the TUI (Tab 1 or 2), the Activity Log Panel at the bottom shows real-time updates:

```
[2m] activity-hook   INFO  Task started: Implement feature
[1m] activity-hook   WARN  Connection retry #2
[3s] activity-hook   ERROR Task failed: Database timeout
```

The panel updates automatically via the event bus when new logs are added.

## Creating Custom Adapters

Use the CLI to add log entries from any script or process:

```bash
# Basic log
bun board log add -s 'my-adapter' -m 'Processing started'

# Log with level
bun board log add -s 'my-adapter' -l warn -m 'Slow response detected'

# Log associated with a story
bun board log add -s 'my-adapter' -m 'Story processing' -S TUI-004
```

## Best Practices

1. **Use meaningful source names** - Makes filtering easier (`my-hook`, `deploy-adapter`, `test-runner`)
2. **Keep messages concise** - The TUI truncates long messages
3. **Use appropriate log levels** - Don't mark everything as error
4. **Associate with stories** - Use `-S` flag when working on a specific story
5. **Clean up periodically** - Use `log clear` to remove old entries
