# Claude Notify Service

Centralized notification service for Claude Code that manages a single FIFO audio queue across multiple repositories and development sessions.

## Features

- **Server-Side Summarization**: Claude API generates intelligent, TTS-friendly summaries from raw events
- **Centralized Audio Queue**: Single FIFO queue that plays notifications sequentially regardless of source project
- **Multi-Channel Support**: TTS (ElevenLabs), Discord webhooks, and console output
- **Thin Client Support**: Projects send raw events; server handles all processing
- **Single Config**: All API keys (Anthropic, ElevenLabs, Discord) in one place
- **Background Daemon**: Runs as a background service with CLI management
- **Clean Failure Mode**: Clients handle service unavailability gracefully

## Installation

```bash
# From the notify-service directory
bun install

# Or install globally
bun link
```

## Quick Start

1. **Initialize configuration**:
   ```bash
   claude-notify config init
   ```

2. **Start the daemon**:
   ```bash
   claude-notify start
   ```

3. **Check status**:
   ```bash
   claude-notify status
   ```

4. **Send test notification**:
   ```bash
   claude-notify test
   ```

## Configuration

Configuration is stored at `~/.claude-notify/config.json`:

```json
{
  "version": "1.0.0",
  "server": {
    "port": 7777,
    "host": "127.0.0.1"
  },
  "summary": {
    "apiKey": "your-anthropic-api-key",
    "model": "claude-haiku-4-20250514"
  },
  "channels": {
    "tts": {
      "enabled": true,
      "apiKey": "your-elevenlabs-api-key",
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "model": "eleven_turbo_v2_5"
    },
    "discord": {
      "enabled": true,
      "webhookUrl": "https://discord.com/api/webhooks/...",
      "username": "Claude Code"
    },
    "console": {
      "enabled": true
    }
  },
  "audio": {
    "fallbackSound": "/System/Library/Sounds/Glass.aiff",
    "cleanupDelayMs": 60000
  },
  "responseStorage": {
    "enabled": true,
    "ttlMs": 3600000,
    "maxEntries": 100
  }
}
```

### Environment Variables

The service also reads from environment variables:
- `ANTHROPIC_API_KEY` - Anthropic API key for server-side summarization
- `ELEVENLABS_API_KEY` - ElevenLabs API key for TTS
- `DISCORD_WEBHOOK_URL` - Discord webhook URL
- `NOTIFY_SERVICE_DEBUG` - Enable debug logging

## CLI Commands

```bash
# Start the service
claude-notify start [--foreground]

# Stop the service
claude-notify stop

# Check service status
claude-notify status

# View configuration
claude-notify config

# Initialize default configuration
claude-notify config init

# Send test notification
claude-notify test

# Per-project Discord webhook
claude-notify webhook <url>        # Set project webhook
claude-notify webhook --show       # Show current webhook
claude-notify webhook --clear      # Remove project webhook

# Per-project voice ID
claude-notify voice <id>           # Set project voice
claude-notify voice --show         # Show current voice
claude-notify voice --clear        # Remove project voice
```

## API Endpoints

### POST /notify

The endpoint accepts two payload formats:

#### Raw Event Payload (Recommended)

Thin clients send raw events; the server handles summarization:

```bash
curl -X POST http://127.0.0.1:7777/notify \
  -H "Content-Type: application/json" \
  -d '{
    "transcriptPath": "/path/to/transcript.jsonl",
    "projectDir": "/path/to/project",
    "projectName": "my-project",
    "durationMs": 45000,
    "usage": {
      "input_tokens": 5000,
      "output_tokens": 1200,
      "cache_read_input_tokens": 2000,
      "cache_creation_input_tokens": 500
    }
  }'
```

The server will:
1. Read the transcript file
2. Generate a TTS-friendly summary via Claude API
3. Calculate context usage percentage
4. Dispatch to TTS, Discord, and console

#### Pre-Summarized Payload (Legacy)

For clients that generate summaries locally:

```bash
curl -X POST http://127.0.0.1:7777/notify \
  -H "Content-Type: application/json" \
  -d '{
    "project": "my-project",
    "summary": "Task completed successfully",
    "channelPrefs": {
      "tts": true,
      "discord": true,
      "console": true
    },
    "metadata": {
      "durationMs": 45000,
      "filesModified": 5,
      "toolsUsed": ["Read", "Write", "Bash"]
    }
  }'
```

The endpoint auto-detects the format by checking for `transcriptPath` field.

### GET /health

Check service health:

```bash
curl http://127.0.0.1:7777/health
```

Response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 3600000,
  "channels": {
    "tts": "ready",
    "discord": "ready",
    "console": "ready"
  }
}
```

### GET /queue

Check audio queue status:

```bash
curl http://127.0.0.1:7777/queue
```

Response:
```json
{
  "queueLength": 2,
  "isPlaying": true,
  "items": [
    {"project": "project-a", "addedAt": "2024-01-15T10:30:00Z", "position": 1},
    {"project": "project-b", "addedAt": "2024-01-15T10:30:05Z", "position": 2}
  ]
}
```

## Integrating with Notification Hooks

The centralized service is the **default mode**. Projects automatically use the thin client when `~/.claude-notify/config.json` exists.

### Setup

1. Run the setup wizard once (creates global config):
   ```bash
   bun hooks/setup-wizard.ts
   ```

2. Start the notify-service:
   ```bash
   bun notify-service/src/cli.ts start
   ```

3. That's it! New projects automatically use the centralized service.

### How It Works

- **Thin client** (`hooks/thin-client.ts`) sends raw event data to the service
- **Server** handles all summarization, TTS, and Discord dispatch
- **No per-project config** required - API keys live in `~/.claude-notify/config.json`
- **Clean failure mode** - if service is unavailable, client logs a warning and continues

## Development

```bash
# Run in development mode (with watch)
bun run dev

# Run tests
bun test

# Type check
bun run typecheck

# Run in foreground for debugging
claude-notify start --foreground
```

## Smoke Tests

After making changes to the service, run the smoke tests to validate all critical paths:

```bash
# Run against configured remote (reads from ~/.claude-notify/config.json)
bun notify-service/src/smoke-test.ts

# Or specify target and key explicitly
bun notify-service/src/smoke-test.ts --url https://notify.example.com --key sk_live_xxx
```

The smoke test validates:

| Test | Description |
|------|-------------|
| Health Check | Server is running and responding |
| Auth (valid key) | SDK key authentication works |
| Auth (invalid key) | Invalid keys are rejected |
| Discord Channel | Discord notifications send successfully |
| TTS Generation | ElevenLabs generates audio |
| Audio Accessible | Generated audio files are accessible via URL |
| Response Page | Response pages are created and accessible |
| Session Name | `sessionName` field is accepted and passed through |
| Summary Quality (LLM) | LLM validates summary follows rules (falls back to regex) |

**Note**: The Summary Quality test uses Claude CLI headless mode to evaluate summaries against the rules. If Claude CLI isn't available, it falls back to regex validation checking: first person, past tense, word count, no markdown.

## Architecture

```
~/.claude-notify/
  config.json     # Global configuration (API keys, preferences)
  daemon.pid      # PID file for daemon management
  daemon.log      # Daemon output log
  cache/
    tts/          # Temporary TTS audio files
```

### Request Flow

```
Project A ─┐                    ┌─ TTS (ElevenLabs)
           │                    │
Project B ─┼── thin-client ──►  │─ Discord (webhook)
           │    POST /notify    │
Project C ─┘                    └─ Console
                                     │
                              notify-service
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
               summarizer.ts    tts.ts         discord.ts
               (Claude API)   (ElevenLabs)    (webhooks)
```

The service:
1. Receives raw event data from thin clients
2. Generates intelligent summaries via Claude API
3. Converts summary to TTS audio using ElevenLabs
4. Enqueues audio in FIFO queue for sequential playback
5. Sends Discord notifications with rich embeds
6. Outputs to console for debugging

## License

MIT
