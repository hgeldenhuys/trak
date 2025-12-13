#!/bin/bash
# =============================================================================
# Hook: task-status-changed
# =============================================================================
# Called when a trak task status changes.
#
# This hook demonstrates how hooks could work for other trak entities (tasks).
# ADO doesn't have a direct equivalent to trak tasks (they're sub-items of
# stories), so this hook primarily logs the change and could be extended
# to update related ADO work items.
#
# Input (stdin): JSON object with task event data:
# {
#   "taskId": "uuid",
#   "storyId": "uuid",
#   "storyCode": "PROJ-001",
#   "title": "Task title",
#   "status": "completed",
#   "previousStatus": "in_progress",
#   "assignedTo": "backend-dev",
#   "extensions": {}
# }
#
# Output: Log messages to stdout (captured by trak)
#
# Exit codes:
#   0 - Success
#   1 - Error
#
# Potential uses:
#   - Update ADO work item comments when task status changes
#   - Update checklist items in ADO (via Description field)
#   - Add tags to track task completion progress
#   - Trigger CI/CD pipelines when certain tasks complete
#
# =============================================================================

set -e

# Configuration
ADO_DAEMON_HOST="${ADO_DAEMON_HOST:-127.0.0.1}"
ADO_DAEMON_PORT="${ADO_DAEMON_PORT:-9271}"
ADO_DAEMON_URL="http://${ADO_DAEMON_HOST}:${ADO_DAEMON_PORT}"
ADO_UPDATE_ON_TASK_CHANGE="${ADO_UPDATE_ON_TASK_CHANGE:-0}"

# =============================================================================
# Functions
# =============================================================================

log_info() {
  echo "[ado-hook] $1"
}

log_error() {
  echo "[ado-hook] ERROR: $1" >&2
}

log_debug() {
  if [ "${ADO_HOOK_DEBUG:-0}" = "1" ]; then
    echo "[ado-hook] DEBUG: $1"
  fi
}

# Check if daemon is running
check_daemon() {
  curl -sf "${ADO_DAEMON_URL}/health" >/dev/null 2>&1
}

# =============================================================================
# Main Script
# =============================================================================

# Read event JSON from stdin
EVENT=$(cat)
log_debug "Received event: $EVENT"

# Validate we have jq for JSON parsing
if ! command -v jq &>/dev/null; then
  log_error "jq is required but not installed. Install with: brew install jq"
  exit 1
fi

# Extract fields from event
TASK_ID=$(echo "$EVENT" | jq -r '.taskId // empty')
STORY_ID=$(echo "$EVENT" | jq -r '.storyId // empty')
STORY_CODE=$(echo "$EVENT" | jq -r '.storyCode // empty')
TASK_TITLE=$(echo "$EVENT" | jq -r '.title // empty')
NEW_STATUS=$(echo "$EVENT" | jq -r '.status // empty')
PREVIOUS_STATUS=$(echo "$EVENT" | jq -r '.previousStatus // empty')
ASSIGNED_TO=$(echo "$EVENT" | jq -r '.assignedTo // empty')

log_debug "Task ID: $TASK_ID, Story: $STORY_CODE, Status: $PREVIOUS_STATUS -> $NEW_STATUS"
log_info "Task status changed in $STORY_CODE: \"$TASK_TITLE\" -> $NEW_STATUS"

# Skip if status didn't change
if [ "$NEW_STATUS" = "$PREVIOUS_STATUS" ]; then
  log_info "Status unchanged, skipping"
  exit 0
fi

# If task updates are disabled, just log and exit
if [ "$ADO_UPDATE_ON_TASK_CHANGE" != "1" ]; then
  log_debug "ADO updates on task changes disabled"
  exit 0
fi

# Check daemon is running
if ! check_daemon; then
  log_debug "ADO daemon not running - skipping ADO update"
  exit 0
fi

# NOTE: This is a placeholder for future functionality
# Could add a comment to the ADO work item about task progress
# Or update tags to indicate task completion status
#
# Future implementation ideas:
#
# 1. Add comment to work item:
# curl -X POST "${ADO_DAEMON_URL}/ado/work-item/${ADO_ID}/comment" \
#   -H "Content-Type: application/json" \
#   -d "{\"text\": \"Task '${TASK_TITLE}' ${NEW_STATUS} by ${ASSIGNED_TO}\"}"
#
# 2. Update checklist in description:
# This would require fetching the current description, updating the
# checklist items, and patching the work item.
#
# 3. Add/update progress tag:
# curl -X POST "${ADO_DAEMON_URL}/ado/work-item/${ADO_ID}/tag" \
#   -H "Content-Type: application/json" \
#   -d "{\"tag\": \"tasks:3/5\"}"

log_info "Task update recorded (ADO integration not implemented for tasks)"

# Example: Calculate task completion and potentially update story status
# This could trigger an automatic story status change when all tasks complete
if [ "$NEW_STATUS" = "completed" ]; then
  log_debug "Task completed - checking if all tasks are done..."
  # Would need to query trak for all tasks in story and their statuses
  # If all tasks completed, could trigger story status update
fi

exit 0
