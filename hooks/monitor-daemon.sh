#!/bin/bash
#
# Notification Monitor Daemon
#
# Starts the notification monitor as a background process.
# Manages PID file for process tracking and graceful shutdown.
#
# Usage:
#   ./monitor-daemon.sh start   - Start the daemon
#   ./monitor-daemon.sh stop    - Stop the daemon
#   ./monitor-daemon.sh status  - Check daemon status
#   ./monitor-daemon.sh restart - Restart the daemon
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/.claude/logs/monitor.pid"
LOG_FILE="$PROJECT_DIR/.claude/logs/monitor.log"

# Ensure log directory exists
mkdir -p "$(dirname "$PID_FILE")"

start_daemon() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Monitor daemon is already running (PID: $PID)"
            return 1
        else
            # Stale PID file
            rm -f "$PID_FILE"
        fi
    fi

    echo "Starting notification monitor daemon..."
    cd "$PROJECT_DIR"

    # Start the orchestrator (includes monitor + TTS + summarization)
    CLAUDE_PROJECT_DIR="$PROJECT_DIR" nohup bun "$SCRIPT_DIR/notification-orchestrator.ts" \
        >> "$LOG_FILE" 2>&1 &

    PID=$!
    echo $PID > "$PID_FILE"
    echo "Monitor daemon started (PID: $PID)"
    echo "Log file: $LOG_FILE"
}

stop_daemon() {
    if [ ! -f "$PID_FILE" ]; then
        echo "Monitor daemon is not running"
        return 0
    fi

    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Stopping monitor daemon (PID: $PID)..."
        kill -TERM "$PID"

        # Wait for graceful shutdown
        for i in {1..10}; do
            if ! ps -p "$PID" > /dev/null 2>&1; then
                break
            fi
            sleep 0.5
        done

        # Force kill if still running
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Force killing..."
            kill -KILL "$PID"
        fi

        rm -f "$PID_FILE"
        echo "Monitor daemon stopped"
    else
        echo "Monitor daemon was not running (stale PID file)"
        rm -f "$PID_FILE"
    fi
}

status_daemon() {
    if [ ! -f "$PID_FILE" ]; then
        echo "Monitor daemon is not running"
        return 1
    fi

    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Monitor daemon is running (PID: $PID)"

        # Show last few lines of log
        if [ -f "$LOG_FILE" ]; then
            echo ""
            echo "Recent log entries:"
            tail -n 5 "$LOG_FILE"
        fi
        return 0
    else
        echo "Monitor daemon is not running (stale PID file)"
        rm -f "$PID_FILE"
        return 1
    fi
}

case "${1:-status}" in
    start)
        start_daemon
        ;;
    stop)
        stop_daemon
        ;;
    restart)
        stop_daemon
        sleep 1
        start_daemon
        ;;
    status)
        status_daemon
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
