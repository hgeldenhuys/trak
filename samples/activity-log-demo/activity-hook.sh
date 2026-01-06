#!/bin/bash
# Activity Log Hook - Logs task status transitions
#
# Usage:
#   ./activity-hook.sh start TASK-ID [STORY-CODE]
#   ./activity-hook.sh complete TASK-ID [STORY-CODE]
#   ./activity-hook.sh error TASK-ID "Error message" [STORY-CODE]

set -e

SOURCE="activity-hook"
COMMAND="${1:-}"
TASK_ID="${2:-}"

# Shift to get remaining arguments
shift 2 2>/dev/null || true

case "$COMMAND" in
  start)
    # Get task title
    TASK_JSON=$(bun board task show "$TASK_ID" --json 2>/dev/null) || {
      echo "Error: Task not found: $TASK_ID"
      exit 1
    }
    TASK_TITLE=$(echo "$TASK_JSON" | jq -r '.title // "Unknown task"')

    # Get story code if task has one
    STORY_ID=$(echo "$TASK_JSON" | jq -r '.storyId // empty')
    STORY_OPTION=""
    if [ -n "$STORY_ID" ]; then
      STORY_JSON=$(bun board story show "$STORY_ID" --json 2>/dev/null) || true
      STORY_CODE=$(echo "$STORY_JSON" | jq -r '.code // empty')
      if [ -n "$STORY_CODE" ]; then
        STORY_OPTION="-S $STORY_CODE"
      fi
    fi

    bun board log add -s "$SOURCE" -l info -m "Task started: $TASK_TITLE" $STORY_OPTION
    echo "Logged: Task started - $TASK_TITLE"
    ;;

  complete)
    # Get task title
    TASK_JSON=$(bun board task show "$TASK_ID" --json 2>/dev/null) || {
      echo "Error: Task not found: $TASK_ID"
      exit 1
    }
    TASK_TITLE=$(echo "$TASK_JSON" | jq -r '.title // "Unknown task"')

    # Get story code if task has one
    STORY_ID=$(echo "$TASK_JSON" | jq -r '.storyId // empty')
    STORY_OPTION=""
    if [ -n "$STORY_ID" ]; then
      STORY_JSON=$(bun board story show "$STORY_ID" --json 2>/dev/null) || true
      STORY_CODE=$(echo "$STORY_JSON" | jq -r '.code // empty')
      if [ -n "$STORY_CODE" ]; then
        STORY_OPTION="-S $STORY_CODE"
      fi
    fi

    bun board log add -s "$SOURCE" -l info -m "Task completed: $TASK_TITLE" $STORY_OPTION
    echo "Logged: Task completed - $TASK_TITLE"
    ;;

  error)
    ERROR_MSG="${1:-Unknown error}"
    STORY_CODE="${2:-}"

    # Get task title if possible
    TASK_JSON=$(bun board task show "$TASK_ID" --json 2>/dev/null) || true
    TASK_TITLE=$(echo "$TASK_JSON" | jq -r '.title // "Unknown task"' 2>/dev/null) || TASK_TITLE="Unknown task"

    # Determine story option
    STORY_OPTION=""
    if [ -n "$STORY_CODE" ]; then
      STORY_OPTION="-S $STORY_CODE"
    else
      STORY_ID=$(echo "$TASK_JSON" | jq -r '.storyId // empty' 2>/dev/null) || true
      if [ -n "$STORY_ID" ]; then
        STORY_JSON=$(bun board story show "$STORY_ID" --json 2>/dev/null) || true
        STORY_CODE=$(echo "$STORY_JSON" | jq -r '.code // empty')
        if [ -n "$STORY_CODE" ]; then
          STORY_OPTION="-S $STORY_CODE"
        fi
      fi
    fi

    bun board log add -s "$SOURCE" -l error -m "Task error ($TASK_TITLE): $ERROR_MSG" $STORY_OPTION
    echo "Logged: Task error - $TASK_TITLE: $ERROR_MSG"
    ;;

  heartbeat)
    # Simple heartbeat message
    MESSAGE="${1:-Agent is alive}"
    STORY_CODE="${2:-}"
    STORY_OPTION=""
    if [ -n "$STORY_CODE" ]; then
      STORY_OPTION="-S $STORY_CODE"
    fi

    bun board log add -s "$SOURCE" -l info -m "$MESSAGE" $STORY_OPTION
    echo "Logged: $MESSAGE"
    ;;

  *)
    echo "Activity Log Hook"
    echo ""
    echo "Usage:"
    echo "  $0 start TASK-ID              Log task started"
    echo "  $0 complete TASK-ID           Log task completed"
    echo "  $0 error TASK-ID 'message'    Log task error"
    echo "  $0 heartbeat 'message'        Log heartbeat"
    echo ""
    echo "Examples:"
    echo "  $0 start abc123"
    echo "  $0 complete abc123"
    echo "  $0 error abc123 'Database connection failed'"
    echo "  $0 heartbeat 'Processing batch 5/10'"
    exit 1
    ;;
esac
