#!/bin/bash
# =============================================================================
# Hook: story-created
# =============================================================================
# Called when a new trak story is created.
#
# This hook demonstrates how to handle new story creation. By default, it logs
# the event for awareness. Optionally, it can create a corresponding ADO work
# item and link it back to the trak story.
#
# Input (stdin): JSON object with story data:
# {
#   "storyId": "uuid",
#   "code": "PROJ-001",
#   "featureCode": "FEAT",
#   "title": "Story title",
#   "description": "Story description",
#   "status": "draft",
#   "priority": "P2",
#   "extensions": {}
# }
#
# Output: Log messages to stdout (captured by trak)
#
# Exit codes:
#   0 - Success
#   1 - Error
#
# Configuration:
#   ADO_AUTO_CREATE_WORK_ITEMS=1  - Automatically create ADO work items for new stories
#   ADO_DEFAULT_WORK_ITEM_TYPE   - Work item type to create (default: "User Story")
#   ADO_DEFAULT_AREA_PATH        - Area path for new items (optional)
#   ADO_DEFAULT_ITERATION_PATH   - Iteration path for new items (optional)
#
# =============================================================================

set -e

# Configuration
ADO_DAEMON_HOST="${ADO_DAEMON_HOST:-127.0.0.1}"
ADO_DAEMON_PORT="${ADO_DAEMON_PORT:-9271}"
ADO_DAEMON_URL="http://${ADO_DAEMON_HOST}:${ADO_DAEMON_PORT}"
ADO_AUTO_CREATE="${ADO_AUTO_CREATE_WORK_ITEMS:-0}"
ADO_WORK_ITEM_TYPE="${ADO_DEFAULT_WORK_ITEM_TYPE:-User Story}"

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
STORY_ID=$(echo "$EVENT" | jq -r '.storyId // empty')
STORY_CODE=$(echo "$EVENT" | jq -r '.code // empty')
FEATURE_CODE=$(echo "$EVENT" | jq -r '.featureCode // empty')
TITLE=$(echo "$EVENT" | jq -r '.title // empty')
DESCRIPTION=$(echo "$EVENT" | jq -r '.description // empty')
STATUS=$(echo "$EVENT" | jq -r '.status // "draft"')
PRIORITY=$(echo "$EVENT" | jq -r '.priority // "P2"')
EXISTING_ADO_ID=$(echo "$EVENT" | jq -r '.extensions.adoWorkItemId // empty')

log_info "New story created: $STORY_CODE - $TITLE"
log_debug "Story ID: $STORY_ID, Feature: $FEATURE_CODE, Status: $STATUS, Priority: $PRIORITY"

# Check if already linked to ADO (e.g., created from ADO sync)
if [ -n "$EXISTING_ADO_ID" ] && [ "$EXISTING_ADO_ID" != "null" ]; then
  log_info "Story $STORY_CODE is already linked to ADO work item $EXISTING_ADO_ID"
  exit 0
fi

# If auto-create is disabled, just log and exit
if [ "$ADO_AUTO_CREATE" != "1" ]; then
  log_info "Auto-create disabled. Story $STORY_CODE not linked to ADO."
  log_info "To link manually, use: board story update $STORY_CODE --extension adoWorkItemId=<id>"
  exit 0
fi

# Check daemon is running for auto-create
if ! check_daemon; then
  log_error "ADO daemon not running - cannot auto-create work item"
  log_info "Story $STORY_CODE created without ADO link"
  exit 0  # Don't fail the hook - story was created successfully
fi

log_info "Auto-creating ADO work item for $STORY_CODE..."

# NOTE: This is a placeholder for future functionality
# The daemon doesn't currently have a "create work item" endpoint
# This would need to be implemented in api-server.ts
#
# Future implementation would call something like:
# curl -X POST "${ADO_DAEMON_URL}/ado/work-item" \
#   -H "Content-Type: application/json" \
#   -d "{
#     \"type\": \"$ADO_WORK_ITEM_TYPE\",
#     \"title\": \"$TITLE\",
#     \"description\": \"$DESCRIPTION\",
#     \"trakStoryId\": \"$STORY_ID\",
#     \"trakStoryCode\": \"$STORY_CODE\"
#   }"
#
# Then the response would contain the ADO work item ID which would need
# to be stored back in the trak story extensions.

log_info "Work item creation not yet implemented in daemon"
log_info "Story $STORY_CODE created without ADO link"
log_info "To link manually, use: board story update $STORY_CODE --extension adoWorkItemId=<id>"

exit 0
