# Board CLI & TUI

A powerful command-line interface and terminal UI for story and task management. Built with TypeScript, Bun, and SQLite.

**Core Use Case:** Agent runs CLI commands to mutate the board → User watches changes in real-time via TUI.

```
┌─────────────────────────┐    ┌─────────────────────────┐
│  Terminal 1: TUI        │    │  Terminal 2: CLI        │
│  (watching the board)   │    │  (making changes)       │
│                         │    │                         │
│  Task moves To Do→Done  │←───│  board task update      │
│  instantly (<100ms)     │    │    abc123 --status done │
└─────────────────────────┘    └─────────────────────────┘
```

## Features

- **SQLite-backed** - Single source of truth with WAL mode for concurrent access
- **Real-time TUI** - Kanban board with live updates across processes
- **Hierarchical Structure** - Features → Stories → Tasks → Acceptance Criteria
- **Rich Metadata** - Notes, impediments, labels, relations, and QEOM annotations
- **Auto-History** - All mutations automatically logged with actor tracking
- **Session Tracking** - Track work periods, durations, and context switches
- **Task Files** - Track which files were modified per task
- **Standalone Executables** - Single-file binaries (~60MB) with no runtime dependencies

## Installation

### Binary Install (Recommended)

Download pre-built binaries - no dependencies required:

```bash
curl -fsSL https://raw.githubusercontent.com/hgeldenhuys/trak/main/install-binary.sh | bash
```

This downloads `board` and `board-tui` to `/usr/local/bin` (~120MB total).

**Requirements:** macOS (darwin arm64/x86_64). Linux coming soon.

### From Source

If you want to modify the code or build from source:

```bash
curl -fsSL https://raw.githubusercontent.com/hgeldenhuys/trak/main/install.sh | bash
```

This will:
- Clone the repo to `~/.trak`
- Install dependencies with Bun
- Build CLI and TUI executables
- Create symlinks in `/usr/local/bin`

**Requires:** [Bun](https://bun.sh) installed.

### Manual Build

```bash
# Clone the repository
gh repo clone hgeldenhuys/trak
cd trak

# Install dependencies
bun install

# Build executables
bun run build

# Create global symlinks (optional)
sudo ln -sf $(pwd)/dist/board-cli /usr/local/bin/board
sudo ln -sf $(pwd)/dist/board-tui /usr/local/bin/board-tui
```

### TUI Alias (Recommended)

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
alias trak='TMPDIR=/tmp board-tui'
```

The `TMPDIR` workaround is required for the OpenTUI native library.

## Quick Start

```bash
# Initialize a project-local database (optional but recommended)
board init

# Create a feature (container for stories)
board feature create -c NOTIFY -n "Notifications System"

# Create a story under that feature
board story create -f NOTIFY -t "Email Notifications" -d "Send email alerts" -w "Users need to be notified of important events"

# Create tasks for the story
board task create -s NOTIFY-001 -t "Design email templates"
board task create -s NOTIFY-001 -t "Implement SMTP service"
board task create -s NOTIFY-001 -t "Add notification preferences"

# Update task status
board task status <task-id> in_progress
board task status <task-id> completed

# Open the TUI to watch progress
board-tui
```

## CLI Reference

### Global Options

| Option | Description |
|--------|-------------|
| `--db-path <path>` | SQLite database path (default: auto-resolved, env: `BOARD_DB_PATH`) |
| `--actor <name>` | Actor name for history tracking (default: `cli`, env: `BOARD_ACTOR`) |
| `--json` | Output as JSON |
| `-v, --verbose` | Verbose output |

**Database Location Priority (Project-Centric):**
1. `--db-path` flag (highest priority)
2. `BOARD_DB_PATH` environment variable
3. `.board.db` in current directory (if exists) - **project-local**
4. `~/.board/data.db` (global fallback)

This project-centric approach means each project can have its own isolated board.

**Actor for History:**
Set who is making changes for audit trail:
```bash
board --actor backend-dev story create ...
# Or use environment variable
export BOARD_ACTOR=backend-dev
```

### Initialize (board init)

Create a project-local `.board.db` in the current directory. This isolates your project's board from other projects.

```bash
# Initialize project-local database
board init

# Re-initialize (preserves data, runs migrations)
board init --force

# Check status
board init  # "Already initialized" message if exists
```

The `init` command is:
- **Idempotent** - Safe to run multiple times
- **Non-destructive** - Does not delete existing data
- **Auto-migrating** - Applies new schema migrations on --force

### Features

Features are containers for related stories. The feature code becomes a prefix for story IDs.

```bash
# Create a feature
board feature create -c AUTH -n "Authentication" -d "User authentication system"

# List all features
board feature list

# Show feature details (includes stories)
board feature show AUTH

# Update a feature
board feature update AUTH -n "Auth & Authorization"

# Delete a feature (cascades to stories/tasks)
board feature delete AUTH
```

### Stories

Stories are units of work containing tasks. IDs follow the pattern `{FEATURE}-{NNN}`.

```bash
# Create a story
board story create -f AUTH -t "User Login" \
  -d "Implement user login flow" \
  -w "Users need to authenticate to access protected resources" \
  -p P1 \
  -s draft

# List stories
board story list                    # All stories (excludes archived)
board story list --include-archived # Include archived stories
board story list -f AUTH            # By feature
board story list -s in_progress     # By status

# Show story details
board story show AUTH-001

# Update a story
board story update AUTH-001 --status in_progress --priority P0

# Delete a story
board story delete AUTH-001
```

**Story Statuses:** `draft`, `planned`, `in_progress`, `review`, `completed`, `cancelled`, `archived`

**Priorities:** `P0` (critical), `P1` (high), `P2` (medium), `P3` (low)

### Tasks

Tasks are atomic units of work within a story.

```bash
# Create a task
board task create -s AUTH-001 -t "Implement JWT validation" \
  -d "Add middleware to validate JWT tokens" \
  -p P1

# List tasks
board task list                     # All tasks
board task list -s AUTH-001         # By story
board task list --status pending    # By status

# Show task details
board task show <task-id>

# Update task status (shorthand)
board task status <task-id> in_progress
board task status <task-id> blocked
board task status <task-id> completed

# Update task fields
board task update <task-id> --title "New title" --priority P0

# Delete a task
board task delete <task-id>
```

**Task Statuses:** `pending`, `in_progress`, `blocked`, `completed`, `cancelled`

### Notes

Free-form text attached to any entity.

```bash
# Add a note
board note add -s AUTH-001 -c "Remember to check rate limiting" -a "backend-dev"
board note add -t <task-id> -c "Blocked waiting for API docs" --pin

# List notes
board note list -s AUTH-001         # For a story
board note list -t <task-id>        # For a task
board note list --pinned            # All pinned notes
board note list --all               # All notes

# Show note details
board note show <note-id>

# Toggle pin status
board note pin <note-id>

# Delete a note
board note delete <note-id>
```

### Impediments (Blockers)

Track blockers and obstacles with status and severity.

```bash
# Raise an impediment
board impediment raise -s AUTH-001 \
  --title "External OAuth provider down" \
  -d "Google OAuth returning 503 errors" \
  --severity critical \
  --raised-by backend-dev

# List impediments
board impediment list -s AUTH-001   # For a story
board impediment list --open        # All open impediments
board impediment list --status escalated

# Show impediment details
board impediment show <id>

# Update status
board impediment assign <id> platform-team
board impediment escalate <id>
board impediment resolve <id> -r "Provider recovered, added retry logic"

# Delete an impediment
board impediment delete <id>
```

**Impediment Statuses:** `open`, `in_progress`, `resolved`, `escalated`

**Severities:** `low`, `medium`, `high`, `critical`

### Labels (Tags)

Categorize entities with colored labels.

```bash
# Create a label
board label create -n "tech-debt" -c "#ffa500" -d "Technical debt items"
board label create -n "bug" -c "#ff0000" -d "Bug reports"
board label create -n "enhancement" -c "#00ff00"

# List all labels
board label list

# Apply a label to an entity
board label apply -l tech-debt -s AUTH-001
board label apply -l bug -t <task-id>

# Show labels for an entity
board label show -s AUTH-001

# Remove a label
board label remove -l tech-debt -s AUTH-001

# Delete a label (removes from all entities)
board label delete tech-debt
```

### Relations

Create links between entities.

```bash
# Create a relation
board relation create --from AUTH-001 --to AUTH-002 --type blocks
board relation create --from AUTH-001 --to AUTH-003 --type relates_to -d "Shared authentication logic"

# Create bidirectional relation (creates both directions)
board relation create --from AUTH-001 --to AUTH-002 --type blocks --bidirectional

# List relations
board relation list --entity AUTH-001    # All relations for entity
board relation list --from AUTH-001      # Outbound relations
board relation list --to AUTH-001        # Inbound relations
board relation list --type blocks        # By type
board relation list --all                # All relations

# Show blockers for an entity
board relation blockers AUTH-001

# Delete a relation
board relation delete <relation-id>
```

**Relation Types:**
- `blocks` / `blocked_by` - Dependency relationships
- `relates_to` - General association
- `duplicates` - Duplicate items
- `parent_of` / `child_of` - Hierarchical relationships

### QEOM Metadata (Formal Ontology)

Annotate entities with formal ontology classifications.

**Dimensions:**
- **Q (Qualia)** - Experiences, pain points, solutions, workflows
- **E (Epistemology)** - Patterns, validations, concepts
- **O (Ontology)** - Entities, relations, constraints
- **M (Mereology)** - Components, compositions, parts

```bash
# Add a QEOM annotation
board qeom add -s AUTH-001 \
  -d Q \
  -c painpoint \
  --content "JWT refresh token rotation is complex" \
  --confidence 0.8 \
  --evidence "Multiple bugs in production"

board qeom add -s AUTH-001 \
  -d E \
  -c pattern \
  --content "Token bucket rate limiting"

# List annotations
board qeom list -s AUTH-001              # For an entity
board qeom list -d Q                     # By dimension
board qeom list -c pattern               # By category
board qeom list --high-confidence        # Confidence >= 80%
board qeom list --all                    # All annotations

# Show annotation details
board qeom show <id>

# Get dimension summary for an entity
board qeom summary -s AUTH-001

# Search annotations
board qeom search "rate limit"

# Update confidence with new evidence
board qeom update-confidence <id> --evidence 0.9 --weight 2

# Delete an annotation
board qeom delete <id>
```

### Acceptance Criteria

Manage acceptance criteria for stories with verification tracking.

```bash
# Add acceptance criteria to a story
board ac add -s AUTH-001 \
  -d "User can log in with email and password" \
  --testable "POST /auth/login returns 200 and JWT token"

board ac add -s AUTH-001 \
  -d "Invalid credentials return 401" \
  -c AC-002  # Custom code (auto-generated if omitted)

# List ACs for a story
board ac list -s AUTH-001

# Show AC details
board ac show <id>

# Verify an AC (mark as passed)
board ac verify <id> -n "Tested via integration tests"

# Mark an AC as failed
board ac fail <id> -n "Rate limiting not implemented yet"

# Reset AC to pending
board ac reset <id>

# Update AC description
board ac update <id> -d "Updated requirement"

# Show verification progress
board ac progress -s AUTH-001

# Delete an AC
board ac delete <id>
```

**AC Statuses:** `pending`, `verified`, `failed`

### Decisions

Track architectural and design decisions with rationale.

```bash
# Record a decision
board decision add -s AUTH-001 \
  -q "Which authentication method should we use?" \
  -c "JWT with refresh tokens" \
  -r "Stateless, scalable, industry standard" \
  -a "Session cookies" "OAuth only" \
  --by architect

# List decisions
board decision list                    # All decisions
board decision list -s AUTH-001        # For a story
board decision list --status accepted  # By status
board decision list --by architect     # By decider

# Show decision details
board decision show <id>

# Supersede a decision with a new one
board decision supersede <id> \
  -c "OAuth 2.0 with PKCE" \
  -r "Better security for mobile clients"

# Deprecate a decision
board decision deprecate <id>

# Search decisions
board decision search "authentication"

# Delete a decision
board decision delete <id>
```

**Decision Statuses:**
- `proposed` - Under consideration
- `accepted` - Active decision
- `deprecated` - No longer recommended
- `superseded` - Replaced by another decision

### Sessions

Track work periods for time management and context switching.

```bash
# Start a work session
board session start --story AUTH-001 --phase implementation

# Check current session
board session current

# Switch to different story mid-session
board session switch -s NOTIFY-002

# Update current phase
board session phase testing

# End session (shows duration and activity summary)
board session end

# List sessions
board session list                  # Your sessions
board session list --active         # Currently active sessions
board session list --actor ci-bot   # By actor

# Show session details with activity log
board session show <session-id>
```

**Phases:** Free-form text like `planning`, `implementation`, `testing`, `review`

### History

View audit log of all changes with actor tracking.

```bash
# List recent changes
board history list
board history list -n 50            # Last 50 entries
board history list --actor backend-dev
board history list --action created
board history list --type story

# Show history for a specific entity
board history entity AUTH-001

# Show details of a history entry
board history show <history-id>

# View activity statistics
board history stats
board history stats --actor backend-dev

# Today's activity
board history today
```

**Actions:** `created`, `updated`, `deleted`, `status_changed`, `verified`

### Task Files & References

Track which files were modified as part of a task.

```bash
# Add a file to a task
board task add-file <task-id> src/auth/login.ts

# Remove a file
board task remove-file <task-id> src/auth/login.ts

# List files for a task
board task files <task-id>

# Auto-capture files from git status
board task capture-files <task-id>

# Set a reference link (to prior art, docs, patterns)
board task set-ref <task-id> "https://docs.example.com/auth-pattern"

# Clear reference
board task set-ref <task-id>
```

## TUI Usage

Launch the TUI to view the board in real-time:

```bash
board-tui                           # Uses default .board.db
TMPDIR=/tmp board-tui               # If alias not set
board-tui --db-path /path/to/db     # Custom database
```

### Keyboard Controls

| Key | Action |
|-----|--------|
| `1` | Board view (Kanban) |
| `2` | Story detail view |
| `3` | List view (all stories) |
| `h/j/k/l` or arrows | Navigate |
| `Enter` | Select item |
| `?` | Help overlay |
| `q` | Quit |

### Views

1. **Board View** - Kanban-style columns showing tasks grouped by status (To Do, In Progress, Blocked, Done)
2. **Story View** - Detailed view of selected story with description, "why", acceptance criteria, and tasks
3. **List View** - Table view of all stories for browsing and selection

### Mouse Support

While in the TUI, mouse tracking is enabled. To select/copy text:
- Hold `Option (⌥)` while selecting to bypass mouse tracking

## Database

The board uses SQLite with WAL mode for concurrent access.

### Tables

| Table | Description |
|-------|-------------|
| `features` | Feature containers |
| `stories` | Stories with status and priority |
| `tasks` | Tasks linked to stories |
| `acceptance_criteria` | ACs for stories with verification status |
| `history` | Audit log of all changes |
| `sessions` | Work session tracking |
| `notes` | Free-form notes |
| `impediments` | Blockers and obstacles |
| `labels` | Tag definitions |
| `entity_labels` | Many-to-many label assignments |
| `relations` | Entity relationships |
| `qeom_metadata` | QEOM annotations |
| `decisions` | Architectural decisions with rationale |

### Migrations

Migrations run automatically on first use. Schema version is tracked in `schema_versions` table.

### Multiple Databases / Project-Centric Workflow

**Recommended: Project-Local Databases**

Each project gets its own `.board.db` via `board init`:

```bash
# In project-a/
cd project-a
board init
board feature create -c FEAT -n "Feature"

# In project-b/
cd project-b
board init
board feature create -c OTHER -n "Other Feature"

# Each project sees only its own data
cd project-a && board story list  # Only project-a stories
cd project-b && board story list  # Only project-b stories
```

**Manual Override**

Use `--db-path` to explicitly specify a database:

```bash
board --db-path project-a.db story list
board --db-path project-b.db story list
```

## Development

### Project Structure

```
src/
├── types/           # TypeScript interfaces and enums
├── db/              # Database schema and migrations
├── events/          # Event bus for reactivity
├── repositories/    # Data access layer
├── cli/             # Commander.js CLI
│   ├── commands/    # Command implementations
│   └── utils/       # Output formatting
├── tui/             # OpenTUI terminal interface
│   ├── hooks/       # React hooks for data
│   ├── views/       # View components
│   └── components/  # Reusable UI components
└── scripts/         # Build scripts
```

### Running in Development

```bash
# CLI in dev mode
bun run board story list

# TUI in dev mode
bun run tui
```

### Building

```bash
bun run build:cli    # Build CLI executable
bun run build:tui    # Build TUI executable
bun run build        # Build both
```

### Testing

```bash
bun test             # Run all tests
bun test src/        # Unit tests
bun test tests/      # Integration tests
```

## Architecture

### Event-Driven Reactivity

```
User Action → Repository.method() → SQLite UPDATE → eventBus.emit('data', {...})
                                                            ↓
UI Re-renders ← setData(queryFn()) ← useQuery hook receives event
```

### Cross-Process Updates

The TUI polls SQLite at 100ms intervals to detect changes made by CLI or other processes. Combined with in-process event bus subscriptions, this provides sub-100ms update latency.

### Extensions Field

All entities include an `extensions` field (`Record<string, unknown>`) for storing custom metadata without schema changes.

## Adapters

trak supports adapters for syncing with external project management systems:

- **Azure DevOps** - Bidirectional sync with ADO boards
  See [adapters/azure-devops/README.md](adapters/azure-devops/README.md)

More adapters coming soon (Jira, GitHub Projects, Linear, etc.)

For creating custom adapters, see [adapters/README.md](adapters/README.md).

## Changelog

### [Unreleased]

### [0.5.0] - 2025-12-14

#### Added
- **Project-centric database resolution** - Local `.board.db` takes precedence over global
  - `board init` command to initialize project-local database
  - Resolution order: `--db-path` > `BOARD_DB_PATH` env > `.board.db` (local) > `~/.board/data.db` (global)
  - TUI uses same resolution logic for consistent behavior
  - Idempotent init (safe to run multiple times)

### [0.4.0] - 2025-12-13

#### Added
- **Archived status** - Stories can now be archived (`board story update STORY-001 -s archived`)
  - Archived stories hidden by default in CLI (`--include-archived` to show)
  - TUI hides archived by default (press `a` to toggle visibility)
  - Gray color styling for archived status
- **Data export/import** - Export board data to JSON for git portability
  - `board data export [file]` - Exports features, stories, tasks, ACs to JSON
  - `board data import <file>` - Imports with merge (default) or `--replace` mode
  - `--dry-run` flag to preview import changes
- **Story detail inline editing** - Vim-style modal editing in TUI
  - Press `e` to enter edit mode, `ESC` to save and exit
  - `j/k` to navigate fields, `Tab` to cycle enum values
  - InlineTextInput for text fields, CycleSelector for status/priority
  - SyncStatusIndicator shows ADO sync state

### [0.3.0] - 2025-12-12

#### Added
- **Effort tracking** - Estimate and track task effort
  - `--estimated-effort` and `--actual-effort` flags on tasks
  - `--effort-unit` supports hours, points, days
  - `board story effort-report` for story-level summary
- **Task flags** - Quick status indicators
  - `--flagged` marks tasks needing attention
  - `board task list --flagged` filters flagged tasks
- **Bulk status updates** - Update multiple tasks at once
  - `board task bulk-status -s STORY-001 --from pending --to in_progress`

### [0.2.0] - 2025-12-11

#### Added
- **Azure DevOps adapter** - Bidirectional sync with ADO boards
  - Sync stories to/from ADO work items
  - Local draft stories with push-to-ADO on promotion
  - Real-time SSE updates

### [0.1.0] - 2025-12-10

#### Added
- Initial release
- SQLite-backed storage with WAL mode
- CLI for features, stories, tasks, ACs
- TUI with Kanban board and list views
- History tracking and sessions
- Notes, impediments, labels, relations
- QEOM metadata annotations

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `bun test`
5. Submit a pull request
