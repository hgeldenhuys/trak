#!/bin/bash
# =============================================================================
# Hook: story-status-changed
# =============================================================================
# Called when a trak story status changes.
# Updates the corresponding ADO work item via the ADO daemon's REST API.
#
# Input (stdin): JSON object with story event data:
# {
#   "storyId": "uuid",
#   "code": "PROJ-001",
#   "status": "completed",
#   "previousStatus": "in_progress",
#   "extensions": {
#     "adoWorkItemId": 12345,
#     ...
#   }
# }
#
# Output: Log messages to stdout (captured by trak)
#
# Exit codes:
#   0 - Success (or no ADO link, skipped)
#   1 - Error updating ADO
#
# Usage:
#   This script is called automatically by trak when configured as a hook.
#   Manual testing:
#   echo '{"code":"TEST-001","status":"completed","extensions":{"adoWorkItemId":123}}' | ./story-status-changed.sh
#
# =============================================================================

set -e

# Configuration
ADO_DAEMON_HOST="${ADO_DAEMON_HOST:-127.0.0.1}"
ADO_DAEMON_PORT="${ADO_DAEMON_PORT:-9271}"
ADO_DAEMON_URL="http://${ADO_DAEMON_HOST}:${ADO_DAEMON_PORT}"

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
  local health_response
  health_response=$(curl -sf "${ADO_DAEMON_URL}/health" 2>/dev/null) || {
    log_error "ADO daemon is not running at ${ADO_DAEMON_URL}"
    return 1
  }
  log_debug "Daemon health: $health_response"
  return 0
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
STORY_CODE=$(echo "$EVENT" | jq -r '.code // empty')
NEW_STATUS=$(echo "$EVENT" | jq -r '.status // empty')
PREVIOUS_STATUS=$(echo "$EVENT" | jq -r '.previousStatus // empty')
ADO_ID=$(echo "$EVENT" | jq -r '.extensions.adoWorkItemId // empty')

log_debug "Story: $STORY_CODE, Status: $PREVIOUS_STATUS -> $NEW_STATUS, ADO ID: $ADO_ID"

# Skip if no ADO work item linked
if [ -z "$ADO_ID" ] || [ "$ADO_ID" = "null" ]; then
  log_info "No ADO work item linked to $STORY_CODE, skipping sync"
  exit 0
fi

# Skip if status didn't change
if [ "$NEW_STATUS" = "$PREVIOUS_STATUS" ]; then
  log_info "Status unchanged for $STORY_CODE, skipping"
  exit 0
fi

# Validate new status is present
if [ -z "$NEW_STATUS" ]; then
  log_error "Missing status in event data"
  exit 1
fi

# Check daemon is running
if ! check_daemon; then
  log_error "Cannot sync - ADO daemon not available"
  exit 1
fi

log_info "Updating ADO work item $ADO_ID: status -> $NEW_STATUS (from $PREVIOUS_STATUS)"

# Call daemon API to update ADO work item state
# Using trakStatus allows the daemon to handle the mapping to ADO state
RESPONSE=$(curl -sf -X POST "${ADO_DAEMON_URL}/ado/work-item/${ADO_ID}/state" \
  -H "Content-Type: application/json" \
  -d "{\"trakStatus\": \"$NEW_STATUS\"}" 2>&1) || {
  log_error "Failed to update ADO work item $ADO_ID"
  log_error "Response: $RESPONSE"
  exit 1
}

# Parse response
SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
if [ "$SUCCESS" != "true" ]; then
  ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error.message // "Unknown error"')
  log_error "ADO update failed: $ERROR_MSG"
  exit 1
fi

# Extract updated state info
NEW_ADO_STATE=$(echo "$RESPONSE" | jq -r '.workItem.state // "unknown"')
PREV_ADO_STATE=$(echo "$RESPONSE" | jq -r '.workItem.previousState // "unknown"')

log_info "Successfully updated ADO work item $ADO_ID: $PREV_ADO_STATE -> $NEW_ADO_STATE"
log_info "Story $STORY_CODE synced to ADO"

exit 0
