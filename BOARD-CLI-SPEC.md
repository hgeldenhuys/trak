# Board CLI/TUI Specification

**Version:** 1.0.0
**Date:** 2025-12-09
**Purpose:** Comprehensive specification for a standalone CLI and Terminal User Interface for story/task board management. Designed to be agnostic of any specific workflow system (Loom, Weave, etc.) with an extensible metadata system for integrations.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Structures](#2-data-structures)
3. [Metadata & Plugin System](#3-metadata--plugin-system)
4. [Storage Abstraction Layer](#4-storage-abstraction-layer)
5. [CLI Commands](#5-cli-commands)
6. [TUI Views](#6-tui-views)
7. [Event System & Reactivity](#7-event-system--reactivity)
8. [Workflow State Machine](#8-workflow-state-machine)
9. [Implementation Guidelines](#9-implementation-guidelines)

---

## 1. Overview

### 1.1 Purpose

The Board CLI/TUI provides:

1. **Observation** - Real-time visibility into story/task progress and workflow state
2. **Management** - Create, update, and transition stories/tasks through their lifecycle
3. **Abstraction** - Decouple business logic from storage (JSON files → SQLite → other backends)
4. **Reactivity** - Subscribe to data changes for live updates in TUI
5. **Extensibility** - Plugin-friendly metadata system for integrations (CI/CD, knowledge systems, etc.)

### 1.2 Design Principles

- **Standalone** - No dependencies on external workflow systems
- **Agnostic** - Works with any development methodology (Agile, Kanban, custom)
- **Extensible** - Metadata fields allow plugins to attach additional data
- **Observable** - Event-driven architecture for real-time updates
- **Portable** - Storage abstraction allows migration between backends

### 1.3 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         TUI Layer                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │
│  │ Board View  │ │ Story View  │ │ Task View   │ │ Standup    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Commands: story, task, feature, session, board, standup    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    Service Layer (Business Logic)                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │ StoryService │ │ TaskService  │ │ StateService │             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                 Storage Abstraction Layer (SAL)                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                      IStorageAdapter                         ││
│  │  - read<T>(entity, id)                                       ││
│  │  - write<T>(entity, id, data)                                ││
│  │  - list(entity, filter)                                      ││
│  │  - delete(entity, id)                                        ││
│  │  - subscribe(entity, callback)                               ││
│  └──────────────────────────────────────────────────────────────┘│
│         │                    │                    │               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ JSONAdapter  │    │SQLiteAdapter │    │MemoryAdapter │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      Storage Backend                             │
│  JSON Files (.board/)       │  SQLite  │  In-Memory (testing)   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Structures

### 2.1 Core Entities

#### 2.1.1 Feature

Container for related stories.

```typescript
interface Feature {
  code: string;           // "NOTIFY", "AUTH", "PROD" (2-6 uppercase letters)
  name: string;           // "Notification System"
  description?: string;   // Full description
  storyCounter: number;   // Auto-incrementing for story IDs
  createdAt: string;      // ISO-8601 timestamp

  // Extensible metadata (for plugins)
  extensions?: Record<string, any>;

  // Labels/tags for filtering
  labels?: string[];
}
```

**Storage Path:** `.board/features/{CODE}/manifest.json`

---

#### 2.1.2 Story

The central work unit - a "digital story card" that travels with the work.

```typescript
interface Story {
  // Identity
  id: string;             // "{FEATURE_CODE}-{nnn}" e.g., "NOTIFY-001"
  title: string;          // Human-readable title (5-100 chars)
  feature: string;        // Feature code this belongs to

  // Status
  status: StoryStatus;    // "planned" | "in-progress" | "completed" | "blocked"
  priority: Priority;     // "P0" | "P1" | "P2" | "P3"
  blockedReason?: string; // Required when status is "blocked"

  // Context
  context: {
    why: string;          // Business reason - the value proposition (min 20 chars)
    background?: string;  // Technical or historical background
    userRequest?: string; // Original user request that triggered this
    relatedStories?: string[]; // IDs of related stories
  };

  // Work breakdown
  acceptanceCriteria: AcceptanceCriterion[];
  tasks: Task[];

  // Actor handoffs (optional - for multi-actor workflows)
  actorSections?: Record<ActorType, ActorSection>;

  // Audit trail
  history: HistoryEntry[];

  // Metrics (optional)
  metrics?: Metrics;

  // Timestamps
  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  // Extensible metadata (for plugins like Loom, Weave, CI/CD, etc.)
  extensions?: Record<string, any>;

  // Labels/tags for filtering
  labels?: string[];
}

type StoryStatus = "planned" | "in-progress" | "completed" | "blocked";
type Priority = "P0" | "P1" | "P2" | "P3";
```

**Storage Path:** `.board/features/{CODE}/stories/{STORY_ID}/story.json`

---

#### 2.1.3 Acceptance Criterion (AC)

Testable requirements that define "done".

```typescript
interface AcceptanceCriterion {
  id: string;             // "AC-{nnn}" e.g., "AC-001"
  description: string;    // What must be true (min 10 chars)
  status: ACStatus;       // "pending" | "passed" | "failed"
  verifiedBy?: ActorType; // Who verified
  verifiedAt?: string;    // When verification occurred
  evidence?: string;      // Reference to proof (e.g., "test-log.md#ac-001")
}

type ACStatus = "pending" | "passed" | "failed";
```

---

#### 2.1.4 Task

Atomic unit of work assignable to one agent session.

```typescript
interface Task {
  // Identity
  id: string;             // "T-{nnn}" e.g., "T-001"
  storyId: string;        // Parent story ID
  title: string;          // Brief description (5-100 chars)
  description?: string;   // Detailed description

  // Assignment (optional - not all workflows use actors)
  assignedTo?: string;    // Actor/assignee identifier

  // Dependencies
  dependencies?: string[]; // Task IDs that must complete first
  phase?: number;          // Execution phase (computed from dependencies)

  // Coverage
  acCoverage?: string[];  // AC IDs this task helps satisfy

  // Status
  status: TaskStatus;
  attemptCount?: number;  // For retry tracking

  // Deliverables
  deliverables?: string[];    // Expected outputs
  files?: string[];           // Files to create/modify
  reference?: string;         // Reference files for context

  // Timestamps
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;

  // Failure info
  failureReason?: string;
  notes?: string;

  // Extensible metadata (for plugins)
  extensions?: Record<string, any>;

  // Labels/tags for filtering
  labels?: string[];
}

type TaskStatus = "pending" | "in-progress" | "completed" | "failed" | "blocked";

// Common actor types (extensible - not an exhaustive enum)
type ActorType = string;  // e.g., "architect", "backend-dev", "frontend-dev", "qa", etc.
```

---

#### 2.1.5 Actor Section

Per-actor handoff section for communication.

```typescript
interface ActorSection {
  status: ActorStatus;    // "not-started" | "in-progress" | "completed" | "blocked"
  completedAt?: string;
  notes?: string;

  // Architect-specific
  designDecisions?: string[];
  apiContract?: Record<string, any>;

  // Developer-specific
  filesCreated?: string[];
  filesModified?: string[];
  apiImplemented?: Record<string, string>;

  // QA-specific
  testsWritten?: string[];
  acceptanceCriteriaResults?: Record<string, { status: "pass" | "fail" | "skip"; evidence?: string }>;
  bugsFound?: Bug[];

  // Handoffs
  handoffToFrontend?: string;
  handoffToBackend?: string;
  handoffToQA?: string;
  knownGaps?: string[];

  // Extensible metadata (for plugins)
  extensions?: Record<string, any>;
}

type ActorStatus = "not-started" | "in-progress" | "completed" | "blocked";

interface Bug {
  description: string;
  severity: "critical" | "major" | "minor";
  status: "open" | "fixed" | "wontfix";
}
```

---

#### 2.1.6 History Entry

Audit trail for significant actions.

```typescript
interface HistoryEntry {
  timestamp: string;      // ISO-8601
  actor: ActorType | "stage-manager" | "user";
  action: HistoryAction;
  summary: string;        // Human-readable description
  details?: Record<string, any>;
}

type HistoryAction =
  | "story_created"
  | "story_started"
  | "story_completed"
  | "story_blocked"
  | "story_status_updated"
  | "design_completed"
  | "implementation_completed"
  | "tests_completed"
  | "task_completed"
  | "task_failed"
  | "task_retried"
  | "task_status_updated"
  | "ac_verified"
  | "weave_enriched"
  | "checkpoint_saved"
  | "actor_spawned"
  | "handoff_recorded"
  | "story_planned";
```

---

#### 2.1.7 Metrics

Execution metrics for retrospectives.

```typescript
interface Metrics {
  totalTasks: number;
  tasksAtomicComplete: number;    // Completed in first attempt
  tasksRequiredRetry: number;
  circuitBreakerTriggered: number; // Hit 3-strike limit
  totalActorSpawns: number;
  avgBootupTokens?: number;
  compactionRecoveries: number;
  parallelPhases: number;
  elapsedTimeMinutes?: number;
}
```

---

#### 2.1.8 Backlog

Master list of all stories.

```typescript
interface Backlog {
  version: "2.0";
  currentStory: string | null;    // Currently active story ID
  stories: BacklogStory[];        // Ordered by priority
  metadata?: {
    createdAt: string;
    lastUpdated: string;
    totalCompleted: number;
  };
}

interface BacklogStory {
  id: string;
  title: string;
  status: StoryStatus;
  path: string;           // Relative path to story directory
  priority?: Priority;
  blockedReason?: string;
}
```

**Storage Path:** `.board/backlog.json`

---

#### 2.1.9 Current Session State

Active session state for recovery and progress tracking.

```typescript
interface CurrentSession {
  version?: "2.0";
  activeStory: string | null;
  activeTask: ActiveTask | null;
  progress: Progress;
  session: SessionInfo;
  actorSpawns: ActorSpawn[];
  checkpoints: Checkpoint[];
  lastAction: LastAction | null;
  pendingWeaveProposals?: number;
}

interface ActiveTask {
  id: string;
  storyId?: string;
  phase: TaskPhase;
  startedAt: string;
  lastCheckpoint?: string;
  attemptCount: number;
  assignedAgent?: ActorType;
}

type TaskPhase = "boot-up" | "executing" | "validating" | "updating-state" | "clean-up";

interface Progress {
  phase: string;          // "idle" | "executing" | "completed" | etc.
  tasksCompleted: number;
  tasksTotal: number;
  tasksFailed?: number;
  tasksBlocked?: number;
  currentPhase?: number;  // Execution phase number
  totalPhases?: number;
}

interface SessionInfo {
  sessionId?: string;
  sessionName?: string;   // "brave-elephant" format
  compactionCount: number;
  startedAt: string | null;
}

interface ActorSpawn {
  actorType: ActorType;
  spawnedAt: string;
  taskId?: string;
}

interface Checkpoint {
  timestamp: string;
  label: string;
  progress: Progress;
  activeTask?: string;
}

interface LastAction {
  type: "start" | "progress" | "task" | "end" | "spawn" | "checkpoint";
  timestamp: string;
  details: Record<string, any>;
}
```

**Storage Path:** `.board/current.json`

---

#### 2.1.10 Workflow State

State tracking for long-running workflows.

```typescript
interface WorkflowState {
  storyId: string;
  workflow: WorkflowType;
  startedAt: string;
  completedAt?: string;
  currentStep: number;
  totalSteps: number;
  steps: WorkflowStep[];
  artifacts: WorkflowArtifacts;
  metadata?: Record<string, any>;
}

type WorkflowType = "ideation" | "planning" | "execution" | "completion" | "investigation" | "tweak";

interface WorkflowStep {
  id: number;
  name: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  progress?: string;
  output?: string;
  error?: string;
  checkpoint?: Record<string, any>;
}

type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

interface WorkflowArtifacts {
  retrospective?: string;
  weaveEntries?: string[];
  commits?: string[];
  storyFile?: string;
  tasksCreated?: number;
  [key: string]: any;
}
```

**Storage Path:** `.board/state/{STORY_ID}-{workflow}.json`

---

#### 2.1.11 Config

Global board configuration.

```typescript
interface BoardConfig {
  version: string;        // "1.0.0"
  initialized: string;    // ISO-8601

  // Project info (optional)
  project?: {
    name: string;
    description?: string;
  };

  // ID generation settings
  idFormat?: {
    storyPattern: string;   // Default: "{FEATURE}-{NNN}"
    taskPattern: string;    // Default: "T-{NNN}"
    acPattern: string;      // Default: "AC-{NNN}"
  };

  // Available status values (customizable)
  statuses?: {
    story: string[];        // Default: ["planned", "in-progress", "completed", "blocked"]
    task: string[];         // Default: ["pending", "in-progress", "completed", "failed", "blocked"]
    ac: string[];           // Default: ["pending", "passed", "failed"]
  };

  // Priority levels (customizable)
  priorities?: string[];    // Default: ["P0", "P1", "P2", "P3"]

  // Actor/assignee types (customizable, for filtering)
  actorTypes?: string[];    // e.g., ["backend-dev", "frontend-dev", "qa"]

  // Feature list (auto-populated)
  features: Feature[];

  // Counters for ID generation
  storyCounter: number;
  taskCounter: number;

  // Extensible metadata (for plugins)
  extensions?: Record<string, any>;
}
```

**Storage Path:** `.board/config.json`

---

## 3. Metadata & Plugin System

The board system is designed to be standalone but extensible. Plugins can attach additional data to any entity via the `extensions` field.

### 3.1 Extension Fields

Every major entity (Feature, Story, Task, ActorSection) includes an optional `extensions` field:

```typescript
interface Extensible {
  extensions?: Record<string, any>;
}
```

**Convention:** Extensions are namespaced by plugin name to avoid collisions.

```typescript
// Example: A story with Loom and CI/CD extensions
const story: Story = {
  id: "FEAT-001",
  title: "User Authentication",
  status: "in-progress",
  // ... core fields ...

  extensions: {
    // Loom workflow system
    "loom": {
      weaveProposals: [...],
      weaveRefs: ["E:auth-pattern", "Q:session-timeout"],
      workflowState: "execution",
      sessionId: "abc123"
    },

    // CI/CD integration
    "ci": {
      pipelineId: "build-123",
      lastBuildStatus: "passing",
      coverage: 87.5
    },

    // Time tracking
    "timetrack": {
      estimatedHours: 8,
      loggedHours: 5.5
    }
  }
};
```

### 3.2 Plugin Interface

Plugins can register to receive events and extend CLI/TUI functionality:

```typescript
interface BoardPlugin {
  // Plugin identity
  name: string;           // Unique name, used as extension namespace
  version: string;

  // Lifecycle hooks
  onInit?(board: BoardAPI): Promise<void>;
  onShutdown?(): Promise<void>;

  // Event hooks (called when entities change)
  onStoryCreated?(story: Story): Promise<void>;
  onStoryUpdated?(story: Story, changes: Partial<Story>): Promise<void>;
  onStoryCompleted?(story: Story): Promise<void>;
  onTaskCompleted?(task: Task, story: Story): Promise<void>;
  onACVerified?(ac: AcceptanceCriterion, story: Story): Promise<void>;

  // Extension data management
  getDefaultExtension?(): any;  // Default data for new entities
  validateExtension?(data: any): boolean;  // Validate extension data
  migrateExtension?(data: any, fromVersion: string): any;  // Migrate old data

  // CLI extensions (optional)
  commands?: PluginCommand[];

  // TUI extensions (optional)
  views?: PluginView[];
  widgets?: PluginWidget[];
}

interface PluginCommand {
  name: string;           // e.g., "loom:ideate"
  description: string;
  handler: (args: string[], context: CommandContext) => Promise<void>;
}
```

### 3.3 Plugin Registration

```typescript
// board.config.ts or .board/plugins.json
{
  "plugins": [
    {
      "name": "loom",
      "path": "./plugins/loom-plugin",
      "enabled": true,
      "config": {
        "weaveEnabled": true,
        "autoFinalize": false
      }
    },
    {
      "name": "github",
      "path": "@board/github-plugin",
      "enabled": true,
      "config": {
        "repo": "owner/repo",
        "syncIssues": true
      }
    }
  ]
}
```

### 3.4 Example: Loom Plugin

The Loom workflow system would be implemented as a plugin:

```typescript
const loomPlugin: BoardPlugin = {
  name: "loom",
  version: "2.0.0",

  async onInit(board) {
    // Register Loom-specific commands
    board.registerCommand("loom:ideate", ideateHandler);
    board.registerCommand("loom:start", startHandler);
    board.registerCommand("loom:finalize", finalizeHandler);
  },

  async onStoryCompleted(story) {
    // Extract Weave proposals from actor sections
    const proposals = extractWeaveProposals(story);
    if (proposals.length > 0) {
      await commitToWeave(proposals);
    }
  },

  getDefaultExtension() {
    return {
      weaveProposals: [],
      weaveRefs: [],
      workflowState: null,
      sessionId: null
    };
  },

  commands: [
    {
      name: "loom:ideate",
      description: "Transform feature idea into story",
      handler: async (args, ctx) => { /* ... */ }
    },
    // ... more commands
  ]
};
```

### 3.5 Extension Data Access

```typescript
// Service layer helpers for extension data
class StoryService {
  // Get typed extension data
  getExtension<T>(story: Story, pluginName: string): T | undefined {
    return story.extensions?.[pluginName] as T | undefined;
  }

  // Set extension data (merges with existing)
  async setExtension(storyId: string, pluginName: string, data: any): Promise<void> {
    const story = await this.storage.read<Story>("story", storyId);
    if (!story) throw new Error(`Story not found: ${storyId}`);

    story.extensions = story.extensions || {};
    story.extensions[pluginName] = {
      ...story.extensions[pluginName],
      ...data
    };

    await this.storage.write("story", storyId, story);
  }

  // Remove extension data
  async removeExtension(storyId: string, pluginName: string): Promise<void> {
    const story = await this.storage.read<Story>("story", storyId);
    if (!story) throw new Error(`Story not found: ${storyId}`);

    if (story.extensions) {
      delete story.extensions[pluginName];
      await this.storage.write("story", storyId, story);
    }
  }
}
```

### 3.6 Reserved Extension Namespaces

| Namespace | Purpose |
|-----------|---------|
| `_board` | Internal board system metadata |
| `_migration` | Data migration tracking |
| `loom` | Loom workflow system |
| `weave` | Weave knowledge system |
| `ci` | CI/CD integrations |
| `git` | Git/VCS integrations |
| `time` | Time tracking |
| `notify` | Notification systems |

### 3.7 External Board Adapters

External board systems (Azure DevOps, Jira, GitHub Projects, Linear, etc.) can be connected via adapters that transform their data into the Board CLI's canonical format.

#### 3.7.1 Adapter Interface

```typescript
interface IExternalBoardAdapter {
  // Identity
  name: string;           // "azure-devops", "jira", "github-projects", "linear"
  version: string;

  // Connection
  connect(config: AdapterConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  testConnection(): Promise<{ success: boolean; message?: string }>;

  // Import (External → Board CLI)
  importAll(): Promise<ImportResult>;
  importFeature(externalId: string): Promise<Feature>;
  importStory(externalId: string): Promise<Story>;
  importTask(externalId: string): Promise<Task>;

  // Sync (bidirectional)
  sync(options?: SyncOptions): Promise<SyncResult>;
  syncStory(storyId: string): Promise<SyncResult>;

  // Export (Board CLI → External) - optional
  exportStory?(story: Story): Promise<ExternalReference>;
  exportTask?(task: Task): Promise<ExternalReference>;

  // Mapping
  mapStatus(externalStatus: string): StoryStatus | TaskStatus;
  mapPriority(externalPriority: string): Priority;
  mapActorType?(externalAssignee: string): string;

  // Change detection
  getChangedSince?(since: Date): Promise<ExternalChange[]>;
  subscribeToChanges?(callback: ChangeCallback): Unsubscribe;
}

interface AdapterConfig {
  // Connection settings (adapter-specific)
  url?: string;
  apiKey?: string;
  token?: string;
  organization?: string;
  project?: string;

  // Mapping configuration
  statusMapping?: Record<string, string>;
  priorityMapping?: Record<string, string>;
  actorMapping?: Record<string, string>;

  // Sync settings
  syncDirection: "import" | "export" | "bidirectional";
  syncInterval?: number;        // milliseconds, for polling
  conflictResolution: "local-wins" | "remote-wins" | "manual";
}

interface ImportResult {
  features: { imported: number; skipped: number; errors: string[] };
  stories: { imported: number; skipped: number; errors: string[] };
  tasks: { imported: number; skipped: number; errors: string[] };
}

interface SyncResult {
  imported: number;
  exported: number;
  conflicts: Conflict[];
  errors: string[];
}

interface Conflict {
  entityType: "story" | "task";
  localId: string;
  externalId: string;
  field: string;
  localValue: any;
  remoteValue: any;
}

interface ExternalReference {
  adapter: string;        // "azure-devops"
  externalId: string;     // "12345"
  externalUrl?: string;   // "https://dev.azure.com/org/project/_workitems/edit/12345"
  lastSynced: string;     // ISO-8601
}
```

#### 3.7.2 External Reference Tracking

Imported entities store their external origin in the `extensions` field:

```typescript
const importedStory: Story = {
  id: "FEAT-001",
  title: "User Authentication",
  status: "in-progress",
  // ... core fields ...

  extensions: {
    "_source": {
      adapter: "azure-devops",
      externalId: "12345",
      externalUrl: "https://dev.azure.com/org/project/_workitems/edit/12345",
      lastSynced: "2025-12-09T10:00:00Z",
      externalType: "User Story",        // Original type in source system
      externalStatus: "Active",          // Original status before mapping
      externalPriority: "2"              // Original priority before mapping
    }
  }
};
```

#### 3.7.3 Example: Azure DevOps Adapter

```typescript
class AzureDevOpsAdapter implements IExternalBoardAdapter {
  name = "azure-devops";
  version = "1.0.0";

  private client: AzureDevOpsClient;
  private config: AdapterConfig;

  async connect(config: AdapterConfig): Promise<void> {
    this.config = config;
    this.client = new AzureDevOpsClient({
      organization: config.organization,
      project: config.project,
      token: config.token
    });
  }

  async importStory(workItemId: string): Promise<Story> {
    const workItem = await this.client.getWorkItem(workItemId);

    return {
      id: this.generateLocalId(workItem),
      title: workItem.fields["System.Title"],
      status: this.mapStatus(workItem.fields["System.State"]),
      priority: this.mapPriority(workItem.fields["Microsoft.VSTS.Common.Priority"]),
      context: {
        why: workItem.fields["System.Description"] || "",
        userRequest: workItem.fields["Microsoft.VSTS.Common.AcceptanceCriteria"]
      },
      acceptanceCriteria: this.parseAcceptanceCriteria(workItem),
      tasks: [],
      history: [{
        timestamp: new Date().toISOString(),
        actor: "azure-devops-adapter",
        action: "story_created",
        summary: `Imported from Azure DevOps work item #${workItemId}`
      }],
      createdAt: workItem.fields["System.CreatedDate"],
      extensions: {
        "_source": {
          adapter: "azure-devops",
          externalId: workItemId,
          externalUrl: workItem._links.html.href,
          lastSynced: new Date().toISOString(),
          externalType: workItem.fields["System.WorkItemType"],
          externalStatus: workItem.fields["System.State"]
        }
      }
    };
  }

  mapStatus(adoStatus: string): StoryStatus {
    const mapping = this.config.statusMapping || {
      "New": "planned",
      "Active": "in-progress",
      "Resolved": "in-progress",
      "Closed": "completed",
      "Removed": "blocked"
    };
    return (mapping[adoStatus] || "planned") as StoryStatus;
  }

  mapPriority(adoPriority: string): Priority {
    const mapping = this.config.priorityMapping || {
      "1": "P0",
      "2": "P1",
      "3": "P2",
      "4": "P3"
    };
    return (mapping[adoPriority] || "P1") as Priority;
  }

  // ... other methods
}
```

#### 3.7.4 Adapter Registration

```typescript
// .board/adapters.json
{
  "adapters": [
    {
      "name": "azure-devops",
      "enabled": true,
      "config": {
        "organization": "myorg",
        "project": "myproject",
        "token": "${AZURE_DEVOPS_TOKEN}",
        "syncDirection": "import",
        "syncInterval": 300000,
        "statusMapping": {
          "New": "planned",
          "Active": "in-progress",
          "Closed": "completed"
        }
      }
    },
    {
      "name": "jira",
      "enabled": false,
      "config": {
        "url": "https://mycompany.atlassian.net",
        "project": "PROJ",
        "syncDirection": "bidirectional"
      }
    }
  ]
}
```

#### 3.7.5 CLI Commands for Adapters

```bash
# List configured adapters
board adapter list

# Test adapter connection
board adapter test azure-devops

# Import from external system
board adapter import azure-devops                    # Import all
board adapter import azure-devops --story 12345     # Import specific work item
board adapter import azure-devops --query "State=Active"

# Sync with external system
board adapter sync azure-devops                      # Full sync
board adapter sync azure-devops --story FEAT-001    # Sync specific story

# Show sync status
board adapter status azure-devops

# Configure adapter
board adapter configure azure-devops
```

#### 3.7.6 Common Adapters (Future)

| Adapter | External System | Import | Export | Bidirectional |
|---------|-----------------|--------|--------|---------------|
| `azure-devops` | Azure DevOps Boards | ✓ | ✓ | ✓ |
| `jira` | Atlassian Jira | ✓ | ✓ | ✓ |
| `github-projects` | GitHub Projects | ✓ | ✓ | ✓ |
| `github-issues` | GitHub Issues | ✓ | ✓ | ✓ |
| `linear` | Linear | ✓ | ✓ | ✓ |
| `trello` | Trello | ✓ | ○ | ○ |
| `notion` | Notion Databases | ✓ | ○ | ○ |
| `csv` | CSV Files | ✓ | ✓ | - |
| `markdown` | Markdown Files | ✓ | ✓ | - |

#### 3.7.7 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        External Board Systems                            │
├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
│  Azure DevOps   │      Jira       │  GitHub Projects │      Linear      │
└────────┬────────┴────────┬────────┴────────┬────────┴─────────┬─────────┘
         │                 │                 │                  │
         ▼                 ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Adapter Layer                                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │
│  │ ADO Adapter  │ │ Jira Adapter │ │GitHub Adapter│ │Linear Adapter│   │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘   │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                   │                                      │
│                          Transform to canonical format                   │
│                                   │                                      │
└───────────────────────────────────┼──────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Board CLI Canonical Model                           │
│                                                                          │
│   Feature → Story → Task → AcceptanceCriterion                          │
│                                                                          │
│   (with _source extension tracking origin)                              │
└───────────────────────────────────┼──────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Storage Layer                                    │
│                  (SQLite / JSON / other backends)                        │
└───────────────────────────────────┼──────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         TUI / CLI                                        │
│              (reacts to data changes, displays unified view)            │
└─────────────────────────────────────────────────────────────────────────┘
```

The Board CLI becomes a **unified view** over multiple external systems, with all data normalized to a single format that the TUI can display and react to.

---

## 4. Storage Abstraction Layer

### 4.1 Interface Definition

```typescript
interface IStorageAdapter {
  // CRUD Operations
  read<T>(entity: EntityType, id: string): Promise<T | null>;
  write<T>(entity: EntityType, id: string, data: T): Promise<void>;
  list<T>(entity: EntityType, filter?: Filter): Promise<T[]>;
  delete(entity: EntityType, id: string): Promise<boolean>;
  exists(entity: EntityType, id: string): Promise<boolean>;

  // Batch operations
  readMany<T>(entity: EntityType, ids: string[]): Promise<Map<string, T>>;
  writeMany<T>(entity: EntityType, items: Map<string, T>): Promise<void>;

  // Query operations
  query<T>(entity: EntityType, query: Query): Promise<T[]>;
  count(entity: EntityType, filter?: Filter): Promise<number>;

  // Reactive subscriptions
  subscribe(entity: EntityType, callback: ChangeCallback): Unsubscribe;
  subscribeOne(entity: EntityType, id: string, callback: ChangeCallback): Unsubscribe;

  // Transaction support
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

type EntityType =
  | "feature"
  | "story"
  | "task"
  | "backlog"
  | "current"
  | "config"
  | "workflow-state"
  | "checkpoint";

interface Filter {
  field: string;
  operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "contains" | "startsWith";
  value: any;
}

interface Query {
  filters?: Filter[];
  orderBy?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  offset?: number;
}

type ChangeEvent = {
  type: "created" | "updated" | "deleted";
  entity: EntityType;
  id: string;
  data?: any;
  previousData?: any;
  timestamp: string;
};

type ChangeCallback = (event: ChangeEvent) => void;
type Unsubscribe = () => void;

interface Transaction {
  read<T>(entity: EntityType, id: string): Promise<T | null>;
  write<T>(entity: EntityType, id: string, data: T): Promise<void>;
  delete(entity: EntityType, id: string): Promise<void>;
}
```

### 4.2 JSON Adapter Implementation

```typescript
class JSONStorageAdapter implements IStorageAdapter {
  private basePath: string;
  private watchers: Map<string, FSWatcher>;
  private subscribers: Map<string, Set<ChangeCallback>>;

  constructor(basePath: string = ".board") {
    this.basePath = basePath;
    this.watchers = new Map();
    this.subscribers = new Map();
  }

  private getPath(entity: EntityType, id: string): string {
    switch (entity) {
      case "feature":
        return `${this.basePath}/features/${id}/manifest.json`;
      case "story":
        // id format: "FEATURE-NNN"
        const [featureCode] = id.split("-");
        return `${this.basePath}/features/${featureCode}/stories/${id}/story.json`;
      case "task":
        // Tasks are embedded in stories, need story lookup
        throw new Error("Tasks are embedded in stories - use story operations");
      case "backlog":
        return `${this.basePath}/backlog.json`;
      case "current":
        return `${this.basePath}/current.json`;
      case "config":
        return `${this.basePath}/config.json`;
      case "workflow-state":
        return `${this.basePath}/state/${id}.json`;
      case "checkpoint":
        return `${this.basePath}/state/checkpoints/${id}.json`;
      default:
        throw new Error(`Unknown entity type: ${entity}`);
    }
  }

  async read<T>(entity: EntityType, id: string): Promise<T | null> {
    const path = this.getPath(entity, id);
    try {
      const content = await Bun.file(path).text();
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  async write<T>(entity: EntityType, id: string, data: T): Promise<void> {
    const path = this.getPath(entity, id);
    await Bun.write(path, JSON.stringify(data, null, 2));
    this.notifySubscribers(entity, id, "updated", data);
  }

  // ... additional methods
}
```

### 4.3 SQLite Adapter (Future)

```typescript
class SQLiteStorageAdapter implements IStorageAdapter {
  private db: Database;
  private subscribers: Map<string, Set<ChangeCallback>>;

  constructor(dbPath: string = ".board/board.db") {
    // Implementation for SQLite backend
    // Uses better-sqlite3 or Bun's SQLite
  }

  // Schema would include:
  // - features (code, name, description, story_counter, created_at)
  // - stories (id, feature_code, title, status, priority, context_json, created_at, ...)
  // - tasks (id, story_id, title, status, assigned_to, dependencies_json, ...)
  // - acceptance_criteria (id, story_id, description, status, verified_by, ...)
  // - actor_sections (story_id, actor_type, status, data_json, ...)
  // - history (id, story_id, timestamp, actor, action, summary, details_json)
  // - workflow_states (story_id, workflow, state_json, ...)
}
```

### 4.4 Storage Factory

```typescript
type StorageBackend = "json" | "sqlite" | "memory";

function createStorageAdapter(backend: StorageBackend, options?: any): IStorageAdapter {
  switch (backend) {
    case "json":
      return new JSONStorageAdapter(options?.basePath);
    case "sqlite":
      return new SQLiteStorageAdapter(options?.dbPath);
    case "memory":
      return new MemoryStorageAdapter();
    default:
      throw new Error(`Unknown storage backend: ${backend}`);
  }
}
```

---

## 5. CLI Commands

### 5.1 Command Structure

```
board <command> [subcommand] [options] [arguments]
```

### 5.2 Story Commands

```bash
# List stories
board story list [--status <status>] [--feature <code>] [--format <table|json>]
board story list --status in-progress
board story list --feature NOTIFY --format json

# Show story details
board story show <story-id> [--format <table|json|md>]
board story show NOTIFY-009

# Create story (interactive or from options)
board story create [--feature <code>] [--title <title>] [--why <why>]
board story create --feature NOTIFY --title "Add batch notifications" --why "Users need to send notifications in bulk"

# Update story
board story update <story-id> [--title <title>] [--status <status>] [--priority <priority>]
board story update NOTIFY-009 --status in-progress
board story update NOTIFY-009 --priority P0

# Delete story
board story delete <story-id> [--force]

# Story transitions
board story start <story-id>
board story complete <story-id>
board story block <story-id> --reason "Waiting for API spec"
board story unblock <story-id>
```

### 5.3 Task Commands

```bash
# List tasks
board task list <story-id> [--status <status>] [--actor <type>]
board task list NOTIFY-009 --status pending
board task list NOTIFY-009 --actor backend-dev

# Show task details
board task show <story-id> <task-id>
board task show NOTIFY-009 T-001

# Create task
board task create <story-id> [--title <title>] [--actor <type>] [--depends <task-ids>]
board task create NOTIFY-009 --title "Create schema" --actor backend-dev

# Update task
board task update <story-id> <task-id> [--status <status>] [--notes <notes>]
board task update NOTIFY-009 T-001 --status completed
board task update NOTIFY-009 T-002 --status failed --notes "API timeout"

# Task transitions
board task start <story-id> <task-id>
board task complete <story-id> <task-id>
board task fail <story-id> <task-id> --reason "Test failures"
board task retry <story-id> <task-id>
```

### 5.4 Acceptance Criteria Commands

```bash
# List ACs
board ac list <story-id> [--status <status>]
board ac list NOTIFY-009 --status pending

# Show AC details
board ac show <story-id> <ac-id>
board ac show NOTIFY-009 AC-001

# Create AC
board ac create <story-id> --description "User can login with email"

# Update AC status
board ac pass <story-id> <ac-id> [--evidence <evidence>]
board ac fail <story-id> <ac-id> [--reason <reason>]
board ac pass NOTIFY-009 AC-001 --evidence "test-log.md#ac-001"

# Bulk verify
board ac verify <story-id>  # Interactive verification of all pending ACs
```

### 5.5 Feature Commands

```bash
# List features
board feature list [--format <table|json>]

# Show feature details
board feature show <code>
board feature show NOTIFY

# Create feature
board feature create <name> [--code <code>] [--description <description>]
board feature create "Notification System" --code NOTIFY --description "Multi-channel notifications"

# Feature statistics
board feature stats <code>
board feature stats NOTIFY
```

### 5.6 Session Commands

```bash
# Show current session
board session current

# Start session
board session start <story-id> [--name <name>]
board session start NOTIFY-009 --name "Implementing TTS"

# Update progress
board session progress <completed> <total>
board session progress 5 10

# Log actor spawn
board session spawn <actor-type>
board session spawn backend-dev

# Create checkpoint
board session checkpoint [--label <label>]
board session checkpoint --label "Phase 2 complete"

# End session
board session end [--status <status>]
board session end --status completed
```

### 5.7 Board/View Commands

```bash
# Show board view
board view [--feature <code>]
board view --feature NOTIFY

# Show standup report
board standup [--feature <code>] [--story <id>]
board standup
board standup --story NOTIFY-009

# Show execution state
board state <story-id> [--workflow <type>]
board state NOTIFY-009 --workflow execution

# Show history
board history <story-id> [--limit <n>]
board history NOTIFY-009 --limit 20
```

### 5.8 Workflow Commands

```bash
# Initialize workflow state
board workflow init <story-id> <workflow-type>
board workflow init NOTIFY-009 execution

# Update workflow step
board workflow step <story-id> <workflow-type> <step-id> <status> [--output <output>]
board workflow step NOTIFY-009 execution 3 completed --output "Phase 3 done"

# Create workflow checkpoint
board workflow checkpoint <story-id> <workflow-type> <step-id> [--label <label>]

# Read workflow state
board workflow show <story-id> <workflow-type>
```

### 5.9 Global Options

```bash
--format, -f     Output format: table | json | yaml | md
--verbose, -v    Verbose output
--quiet, -q      Minimal output
--help, -h       Show help
--version        Show version
--storage, -s    Storage backend: json | sqlite | memory
--path, -p       Base path for storage
```

---

## 6. TUI Views

### 6.1 Board View (Main View)

Kanban-style board showing all stories by status.

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  LOOM BOARD - NOTIFY Feature                                              12:34:56 UTC   ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  [P]lanned (3)       │  [I]n Progress (1)   │  [C]ompleted (8)     │  [B]locked (0)      ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║                      │                      │                      │                      ║
║  ┌────────────────┐  │  ┌────────────────┐  │  ┌────────────────┐  │                      ║
║  │ NOTIFY-011     │  │  │ NOTIFY-010  ●  │  │  │ NOTIFY-009 ✓  │  │                      ║
║  │ P1 │ 0/4 tasks │  │  │ P1 │ 3/5 tasks │  │  │ P1 │ 10/10    │  │                      ║
║  │ CLI Board Tool │  │  │ Display Prompt │  │  │ Server-side   │  │                      ║
║  └────────────────┘  │  └────────────────┘  │  │ Centralization│  │                      ║
║                      │                      │  └────────────────┘  │                      ║
║  ┌────────────────┐  │                      │                      │                      ║
║  │ NOTIFY-012     │  │                      │  ┌────────────────┐  │                      ║
║  │ P2 │ 0/3 tasks │  │                      │  │ NOTIFY-008 ✓  │  │                      ║
║  │ Batch Export   │  │                      │  │ P0 │ 6/6      │  │                      ║
║  └────────────────┘  │                      │  │ Discord Rich  │  │                      ║
║                      │                      │  │ Embeds        │  │                      ║
║                      │                      │  └────────────────┘  │                      ║
║                      │                      │                      │                      ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  [Q]uit  [R]efresh  [N]ew Story  [Enter] Select  [/] Search  [?] Help                    ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
```

**Interactions:**
- Arrow keys: Navigate between stories
- Enter: Open story detail view
- N: Create new story
- /: Search/filter
- Tab: Cycle between columns
- R: Refresh
- Q: Quit

---

### 6.2 Story Detail View

Detailed view of a single story.

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  STORY: NOTIFY-009                                                       Status: ✓ Done  ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                          ║
║  Full Server-Side Centralization: Move Summarization, TTS, and Discord to notify-service║
║                                                                                          ║
║  WHY: Eliminate per-project notification configuration maintenance and ensure consistent ║
║       notification behavior across all projects.                                         ║
║                                                                                          ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  ACCEPTANCE CRITERIA (7/7 ✓)                                                             ║
╠──────────────────────────────────────────────────────────────────────────────────────────╣
║  ✓ AC-001  notify-service reads API keys from ~/.claude-notify/config.json only          ║
║  ✓ AC-002  POST /notify accepts raw event data and performs server-side summarization    ║
║  ✓ AC-003  notify-service generates TTS audio from summaries                             ║
║  ✓ AC-004  notify-service sends Discord notifications with rich embeds                   ║
║  ✓ AC-005  Local project hooks become thin clients (no local summarization)              ║
║  ✓ AC-006  Graceful fallback: thin client logs warning, no local processing              ║
║  ✓ AC-007  Per-project config files no longer required                                   ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  TASKS (10/10 ✓)                                                     Phase: Complete     ║
╠──────────────────────────────────────────────────────────────────────────────────────────╣
║  Phase 1 ✓                                                                               ║
║    ✓ T-001  Add Anthropic API key to ServiceConfig              [backend-dev]            ║
║    ✓ T-003  Define RawEventPayload type                         [backend-dev]            ║
║  Phase 2 ✓                                                                               ║
║    ✓ T-002  Create server-side summarizer module                [backend-dev]            ║
║    ✓ T-005  Create thin client module                           [cli-dev]                ║
║    ✓ T-008  Update setup wizard                                 [cli-dev]                ║
║  Phase 3 ✓                                                                               ║
║    ✓ T-004  Update /notify endpoint for raw events              [backend-dev]            ║
║  ...                                                                                     ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  [B]ack  [T]asks  [A]Cs  [H]istory  [E]dit  [/] Search  [?] Help                        ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
```

**Interactions:**
- B/Esc: Back to board
- T: Focus on tasks list
- A: Focus on acceptance criteria
- H: Show history
- E: Edit story details
- Enter on task: Open task detail

---

### 6.3 Task Detail View

Detailed view of a single task.

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  TASK: T-002 (NOTIFY-009)                                           Status: ✓ Completed  ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                          ║
║  Create server-side summarizer module                                                    ║
║                                                                                          ║
║  DESCRIPTION:                                                                            ║
║  Create notify-service/src/summarizer.ts that mirrors the functionality of              ║
║  hooks/summarizer.ts but uses the Anthropic API key from ServiceConfig.                 ║
║  Include: SummaryInput/SummaryOutput types, generateSummary() function.                 ║
║                                                                                          ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  ASSIGNMENT                                                                              ║
╠──────────────────────────────────────────────────────────────────────────────────────────╣
║  Actor:        backend-dev                                                               ║
║  Phase:        2                                                                         ║
║  Dependencies: T-001                                                                     ║
║  AC Coverage:  AC-002                                                                    ║
║  Attempts:     1/3                                                                       ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  FILES                                                                                   ║
╠──────────────────────────────────────────────────────────────────────────────────────────╣
║  Target:       notify-service/src/summarizer.ts                                          ║
║  Reference:    hooks/summarizer.ts                                                       ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  TIMELINE                                                                                ║
╠──────────────────────────────────────────────────────────────────────────────────────────╣
║  Created:      2025-12-09T10:00:00Z                                                      ║
║  Started:      2025-12-09T10:41:00Z                                                      ║
║  Completed:    2025-12-09T10:45:59Z                                                      ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  [B]ack  [S]tart  [C]omplete  [F]ail  [R]etry  [E]dit  [?] Help                         ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
```

---

### 6.4 Standup View

Quick progress report across all active work.

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║                               🚀 LOOM STANDUP REPORT                                      ║
║                               2025-12-09 12:34:56 UTC                                     ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                          ║
║  ACTIVE STORIES                                                                          ║
╠──────────────┬──────────────────────────────────┬──────────┬───────────┬────────────────╣
║  Story ID    │  Title                           │  Status  │  ACs      │  Tasks         ║
╠──────────────┼──────────────────────────────────┼──────────┼───────────┼────────────────╣
║  NOTIFY-010  │  Display User Prompt on Report   │  ● prog  │  2/4 ✓    │  3/5 ✓         ║
║  NOTIFY-011  │  CLI Board Tool                  │  ○ plan  │  0/4 ✓    │  0/4 ✓         ║
║  NOTIFY-012  │  Batch Export                    │  ○ plan  │  0/3 ✓    │  0/3 ✓         ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                          ║
║  CURRENT FOCUS: NOTIFY-010                                                               ║
╠──────────────────────────────────────────────────────────────────────────────────────────╣
║  📊 Progress                                                                             ║
║     [████████████░░░░░░░░░░░░] 60% (3/5 tasks)                                          ║
║                                                                                          ║
║  ✅ Acceptance Criteria                                                                  ║
║     [████████████░░░░░░░░░░░░] 50% (2/4 passing)                                        ║
║     • Passing: AC-001, AC-002                                                            ║
║     • Pending: AC-003, AC-004                                                            ║
║                                                                                          ║
║  📋 Tasks                                                                                ║
║     ✓ T-001: Add prompt field to types          [backend-dev]                           ║
║     ✓ T-002: Update event capture               [cli-dev]                               ║
║     ✓ T-003: Store prompt in database           [backend-dev]                           ║
║     ○ T-004: Display prompt on report page      [backend-dev]                           ║
║     ○ T-005: Write integration tests            [backend-qa]                            ║
║                                                                                          ║
║  🕐 Session: brave-elephant (started 2h 15m ago)                                        ║
║                                                                                          ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  QUICK STATS                                                                             ║
╠──────────────────────────────────────────────────────────────────────────────────────────╣
║  Active Stories: 3          │  Total ACs (active): 11      │  Overall: 18% complete     ║
║  In Progress: 1             │  Total Tasks (active): 12    │                            ║
║  Planned: 2                 │  Blocked: 0                  │                            ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  [R]efresh  [Enter] Select Story  [Q]uit  [?] Help                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
```

---

### 6.5 History View

Audit trail for a story.

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  HISTORY: NOTIFY-009                                                                     ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                          ║
║  2025-12-09T10:51:42Z  │  stage-manager  │  story_completed                             ║
║                        │  All 7 acceptance criteria verified passing                     ║
║                                                                                          ║
║  2025-12-09T10:50:48Z  │  qa-engineer    │  task_completed                              ║
║                        │  T-010 completed: Thin client integration tests                 ║
║                                                                                          ║
║  2025-12-09T10:50:12Z  │  backend-qa     │  task_completed                              ║
║                        │  T-009 completed: Server-side summarizer tests                  ║
║                                                                                          ║
║  2025-12-09T10:49:09Z  │  cli-dev        │  task_completed                              ║
║                        │  T-007 completed: Config loading update                         ║
║                                                                                          ║
║  2025-12-09T10:48:15Z  │  cli-dev        │  task_completed                              ║
║                        │  T-006 completed: Clean failure mode                            ║
║                                                                                          ║
║  2025-12-09T10:47:10Z  │  backend-dev    │  task_completed                              ║
║                        │  T-004 completed: /notify endpoint updated                      ║
║                                                                                          ║
║  ... (scroll for more)                                                                   ║
║                                                                                          ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  [B]ack  [↑↓] Scroll  [/] Filter  [E]xport  [?] Help                                    ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
```

---

### 6.6 Workflow State View

Execution state visualization.

```
╔══════════════════════════════════════════════════════════════════════════════════════════╗
║  WORKFLOW STATE: NOTIFY-009 (execution)                              Status: ✓ Complete  ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                          ║
║  Started: 2025-12-09T10:41:14Z                                                           ║
║  Completed: 2025-12-09T10:50:48Z                                                         ║
║  Duration: 9m 34s                                                                        ║
║                                                                                          ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  EXECUTION STEPS (6/7)                                                                   ║
╠──────────────────────────────────────────────────────────────────────────────────────────╣
║                                                                                          ║
║  ○ Step 0: Pre-flight Checks & Planning                              [pending]          ║
║                                                                                          ║
║  ✓ Step 1: Session Initialization                                    [completed]        ║
║            → Phase 1 complete: T-001 (ServiceConfig), T-003 (RawEventPayload)           ║
║            └─ 2025-12-09T10:43:03Z                                                      ║
║                                                                                          ║
║  ✓ Step 2: Hydrate Agents                                            [completed]        ║
║            → Phase 2 complete: T-002 (summarizer), T-005 (thin client), T-008 (wizard) ║
║            └─ 2025-12-09T10:45:59Z                                                      ║
║                                                                                          ║
║  ✓ Step 3: Execute Tasks (Main Loop)                                 [completed]        ║
║            → Phase 3 complete: T-004 (/notify endpoint)                                 ║
║            └─ 2025-12-09T10:47:10Z                                                      ║
║                                                                                          ║
║  ✓ Step 4: Track Events (Automatic)                                  [completed]        ║
║            → Phase 4 complete: T-006 (clean failure mode)                               ║
║            └─ 2025-12-09T10:48:15Z                                                      ║
║                                                                                          ║
║  ✓ Step 5: Validate Acceptance Criteria                              [completed]        ║
║            → Phase 5 complete: T-007 (config loading)                                   ║
║            └─ 2025-12-09T10:49:09Z                                                      ║
║                                                                                          ║
║  ✓ Step 6: Iterate on Failures                                       [completed]        ║
║            → Phase 6 complete: T-009, T-010 - 35 passing, 4 skipped                     ║
║            └─ 2025-12-09T10:50:48Z                                                      ║
║                                                                                          ║
╠══════════════════════════════════════════════════════════════════════════════════════════╣
║  [B]ack  [C]heckpoints  [A]rtifacts  [?] Help                                           ║
╚══════════════════════════════════════════════════════════════════════════════════════════╝
```

---

## 7. Event System & Reactivity

### 7.1 Event Types

```typescript
// Storage-level events
interface StorageEvent {
  type: "created" | "updated" | "deleted";
  entity: EntityType;
  id: string;
  data?: any;
  previousData?: any;
  timestamp: string;
}

// Domain-level events
interface DomainEvent {
  type: DomainEventType;
  payload: any;
  timestamp: string;
  source: string;       // Component that emitted
}

type DomainEventType =
  // Story events
  | "story.created"
  | "story.updated"
  | "story.started"
  | "story.completed"
  | "story.blocked"

  // Task events
  | "task.created"
  | "task.started"
  | "task.completed"
  | "task.failed"
  | "task.retried"

  // AC events
  | "ac.passed"
  | "ac.failed"
  | "ac.verified"

  // Session events
  | "session.started"
  | "session.ended"
  | "session.checkpoint"

  // Actor events
  | "actor.spawned"
  | "actor.completed"

  // Workflow events
  | "workflow.step.started"
  | "workflow.step.completed"
  | "workflow.completed";
```

### 7.2 Event Bus

```typescript
interface IEventBus {
  // Publishing
  emit(event: DomainEvent): void;

  // Subscribing
  on(eventType: DomainEventType, handler: EventHandler): Unsubscribe;
  once(eventType: DomainEventType, handler: EventHandler): Unsubscribe;
  off(eventType: DomainEventType, handler: EventHandler): void;

  // Pattern matching
  onMatch(pattern: string, handler: EventHandler): Unsubscribe; // "story.*", "task.completed"

  // Replay (for TUI initialization)
  replay(since: string, handler: EventHandler): void;
}

type EventHandler = (event: DomainEvent) => void | Promise<void>;
```

### 7.3 File Watcher Integration

For JSON adapter, watch files for external changes:

```typescript
class FileWatcher {
  private watchers: Map<string, FSWatcher>;
  private debounceMs: number = 100;

  watch(path: string, callback: (event: WatchEvent) => void): Unsubscribe {
    const watcher = Bun.file(path).watch((event, filename) => {
      // Debounce and emit
      callback({
        type: event,
        path,
        filename,
        timestamp: new Date().toISOString()
      });
    });

    this.watchers.set(path, watcher);
    return () => this.unwatch(path);
  }

  unwatch(path: string): void {
    const watcher = this.watchers.get(path);
    if (watcher) {
      watcher.close();
      this.watchers.delete(path);
    }
  }
}
```

### 7.4 TUI Reactivity

```typescript
// TUI subscribes to relevant events
class BoardView {
  private unsubscribes: Unsubscribe[] = [];

  mount() {
    // Subscribe to story changes
    this.unsubscribes.push(
      eventBus.onMatch("story.*", this.handleStoryEvent.bind(this))
    );

    // Subscribe to task changes
    this.unsubscribes.push(
      eventBus.onMatch("task.*", this.handleTaskEvent.bind(this))
    );

    // Initial render
    this.render();
  }

  unmount() {
    this.unsubscribes.forEach(unsub => unsub());
  }

  private handleStoryEvent(event: DomainEvent) {
    // Update relevant part of the view
    this.updateStoryCard(event.payload.storyId);
  }

  private handleTaskEvent(event: DomainEvent) {
    // Update task counts
    this.updateTaskCounts(event.payload.storyId);
  }
}
```

---

## 8. Workflow State Machine

### 8.1 Story State Machine

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
              ┌──────────┐                                    │
              │ PLANNED  │◄────────────────────────────────┐  │
              └────┬─────┘                                 │  │
                   │                                       │  │
                   │ /loom:start                           │  │
                   ▼                                       │  │
              ┌──────────────┐                             │  │
          ┌───│ IN-PROGRESS  │───┐                         │  │
          │   └──────┬───────┘   │                         │  │
          │          │           │                         │  │
          │ block    │ all ACs   │ unblock                 │  │
          │          │ pass      │                         │  │
          ▼          ▼           │                         │  │
    ┌──────────┐  ┌───────────┐  │                         │  │
    │ BLOCKED  │  │ COMPLETED │  │                         │  │
    └────┬─────┘  └───────────┘  │                         │  │
         │                       │                         │  │
         │ unblock               │                         │  │
         └───────────────────────┘                         │  │
                                                           │  │
                                    replan ────────────────┘  │
                                    revert ───────────────────┘
```

### 8.2 Task State Machine

```
                         ┌────────────────────────────────────┐
                         │                                    │
                         ▼                                    │
                   ┌──────────┐                               │
                   │ PENDING  │◄───────────────────────────┐  │
                   └────┬─────┘                            │  │
                        │                                  │  │
                        │ start (deps satisfied)           │  │
                        ▼                                  │  │
                   ┌──────────────┐                        │  │
               ┌───│ IN-PROGRESS  │───┐                    │  │
               │   └──────┬───────┘   │                    │  │
               │          │           │                    │  │
               │ block    │ complete  │ fail               │  │
               │          │           │                    │  │
               ▼          ▼           ▼                    │  │
         ┌──────────┐  ┌───────────┐  ┌──────────┐         │  │
         │ BLOCKED  │  │ COMPLETED │  │  FAILED  │─────────┘  │
         └────┬─────┘  └───────────┘  └────┬─────┘            │
              │                            │                  │
              │ unblock                    │ retry (< 3)      │
              └────────────────────────────┴──────────────────┘
```

### 8.3 Workflow Execution Flow

```
IDEATION                 PLANNING                  EXECUTION                  FINALIZATION
────────                 ────────                  ─────────                  ────────────

┌─────────────┐         ┌─────────────┐          ┌─────────────┐           ┌─────────────┐
│ Capture     │         │ Load Story  │          │ Load Story  │           │ Verify ACs  │
│ Feature Idea│         │             │          │             │           │             │
└─────┬───────┘         └─────┬───────┘          └─────┬───────┘           └─────┬───────┘
      │                       │                        │                         │
      ▼                       ▼                        ▼                         ▼
┌─────────────┐         ┌─────────────┐          ┌─────────────┐           ┌─────────────┐
│ Spawn       │         │ Assess      │          │ Build       │           │ Collect     │
│ Architect   │         │ Complexity  │          │ Exec Phases │           │ Weave Props │
└─────┬───────┘         └─────┬───────┘          └─────┬───────┘           └─────┬───────┘
      │                       │                        │                         │
      ▼                       ▼                        ▼                         ▼
┌─────────────┐         ┌─────────────┐          ┌─────────────┐           ┌─────────────┐
│ Parse       │         │ Create Tasks│          │ Execute     │           │ Generate    │
│ Output      │         │ (delegate)  │          │ Phases      │           │ Retrospect  │
└─────┬───────┘         └─────┬───────┘          └─────┬───────┘           └─────┬───────┘
      │                       │                        │                         │
      ▼                       ▼                        ▼                         ▼
┌─────────────┐         ┌─────────────┐          ┌─────────────┐           ┌─────────────┐
│ Create      │         │ Validate    │          │ Validate    │           │ Commit to   │
│ Story Files │         │ Dependencies│          │ ACs         │           │ Weave       │
└─────┬───────┘         └─────┬───────┘          └─────┬───────┘           └─────┬───────┘
      │                       │                        │                         │
      ▼                       ▼                        ▼                         ▼
┌─────────────┐         ┌─────────────┐          ┌─────────────┐           ┌─────────────┐
│ Update      │         │ Update      │          │ Update      │           │ Git Commit  │
│ Backlog     │         │ Story       │          │ State       │           │             │
└─────────────┘         └─────────────┘          └─────────────┘           └─────────────┘
```

---

## 9. Implementation Guidelines

### 9.1 Technology Stack

**Recommended:**
- Runtime: Bun (TypeScript)
- TUI Framework: `ink` (React for CLI) or `blessed` (full featured)
- CLI Framework: `commander` or `yargs`
- File watching: Bun's native file watcher
- Colors: `chalk` or `picocolors`
- Tables: `cli-table3`
- Prompts: `inquirer` or `prompts`

### 9.2 Project Structure

```
board-cli/
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── story.ts
│   │   │   ├── task.ts
│   │   │   ├── feature.ts
│   │   │   ├── session.ts
│   │   │   ├── board.ts
│   │   │   └── index.ts
│   │   ├── formatters/
│   │   │   ├── table.ts
│   │   │   ├── json.ts
│   │   │   └── markdown.ts
│   │   └── cli.ts
│   │
│   ├── tui/
│   │   ├── views/
│   │   │   ├── BoardView.tsx
│   │   │   ├── StoryView.tsx
│   │   │   ├── TaskView.tsx
│   │   │   ├── StandupView.tsx
│   │   │   ├── HistoryView.tsx
│   │   │   └── WorkflowView.tsx
│   │   ├── components/
│   │   │   ├── StoryCard.tsx
│   │   │   ├── TaskList.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   └── Table.tsx
│   │   └── App.tsx
│   │
│   ├── services/
│   │   ├── StoryService.ts
│   │   ├── TaskService.ts
│   │   ├── FeatureService.ts
│   │   ├── SessionService.ts
│   │   ├── WorkflowService.ts
│   │   └── index.ts
│   │
│   ├── storage/
│   │   ├── adapters/
│   │   │   ├── JSONAdapter.ts
│   │   │   ├── SQLiteAdapter.ts
│   │   │   └── MemoryAdapter.ts
│   │   ├── IStorageAdapter.ts
│   │   └── factory.ts
│   │
│   ├── events/
│   │   ├── EventBus.ts
│   │   ├── FileWatcher.ts
│   │   └── types.ts
│   │
│   ├── types/
│   │   ├── story.ts
│   │   ├── task.ts
│   │   ├── feature.ts
│   │   ├── workflow.ts
│   │   └── index.ts
│   │
│   └── index.ts
│
├── tests/
│   ├── services/
│   ├── storage/
│   └── cli/
│
├── package.json
├── tsconfig.json
└── README.md
```

### 9.3 Entry Points

```typescript
// CLI entry
// bin/loom
#!/usr/bin/env bun
import { cli } from "../src/cli/cli";
cli.parse(process.argv);

// TUI entry
// bin/loom-tui
#!/usr/bin/env bun
import { render } from "ink";
import { App } from "../src/tui/App";
render(<App />);
```

### 9.4 Service Layer Pattern

```typescript
// Example: StoryService
class StoryService {
  constructor(
    private storage: IStorageAdapter,
    private eventBus: IEventBus
  ) {}

  async create(data: CreateStoryInput): Promise<Story> {
    // 1. Validate input
    this.validateInput(data);

    // 2. Generate ID
    const feature = await this.storage.read<Feature>("feature", data.featureCode);
    const storyId = `${data.featureCode}-${String(feature.storyCounter + 1).padStart(3, "0")}`;

    // 3. Build story object
    const story: Story = {
      id: storyId,
      title: data.title,
      status: "planned",
      // ... rest of fields
    };

    // 4. Write to storage
    await this.storage.write("story", storyId, story);

    // 5. Update feature counter
    feature.storyCounter++;
    await this.storage.write("feature", data.featureCode, feature);

    // 6. Emit event
    this.eventBus.emit({
      type: "story.created",
      payload: { storyId, story },
      timestamp: new Date().toISOString(),
      source: "StoryService"
    });

    return story;
  }

  async updateStatus(storyId: string, status: StoryStatus): Promise<Story> {
    const story = await this.storage.read<Story>("story", storyId);
    if (!story) throw new Error(`Story not found: ${storyId}`);

    const previousStatus = story.status;
    story.status = status;

    // Add history entry
    story.history.push({
      timestamp: new Date().toISOString(),
      actor: "stage-manager",
      action: "story_status_updated",
      summary: `Status: ${previousStatus} → ${status}`
    });

    await this.storage.write("story", storyId, story);

    this.eventBus.emit({
      type: `story.${status === "completed" ? "completed" : "updated"}`,
      payload: { storyId, previousStatus, newStatus: status },
      timestamp: new Date().toISOString(),
      source: "StoryService"
    });

    return story;
  }

  // ... other methods
}
```

### 9.5 Error Handling

```typescript
// Custom error types
class BoardError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "BoardError";
  }
}

class StoryNotFoundError extends BoardError {
  constructor(storyId: string) {
    super(`Story not found: ${storyId}`, "STORY_NOT_FOUND", { storyId });
  }
}

class InvalidTransitionError extends BoardError {
  constructor(entity: string, from: string, to: string) {
    super(
      `Invalid transition: ${entity} cannot go from ${from} to ${to}`,
      "INVALID_TRANSITION",
      { entity, from, to }
    );
  }
}

// Error handler for CLI
function handleError(error: Error): never {
  if (error instanceof BoardError) {
    console.error(`Error [${error.code}]: ${error.message}`);
    if (error.details) {
      console.error("Details:", JSON.stringify(error.details, null, 2));
    }
  } else {
    console.error("Unexpected error:", error.message);
  }
  process.exit(1);
}
```

### 9.6 Testing Strategy

```typescript
// Unit tests with MemoryAdapter
describe("StoryService", () => {
  let storage: IStorageAdapter;
  let eventBus: IEventBus;
  let service: StoryService;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
    eventBus = new EventBus();
    service = new StoryService(storage, eventBus);
  });

  it("should create a story with generated ID", async () => {
    // Setup
    await storage.write("feature", "TEST", { code: "TEST", storyCounter: 0 });

    // Execute
    const story = await service.create({
      featureCode: "TEST",
      title: "Test Story",
      why: "Testing the story creation flow"
    });

    // Assert
    expect(story.id).toBe("TEST-001");
    expect(story.status).toBe("planned");
  });

  it("should emit event on status change", async () => {
    const events: DomainEvent[] = [];
    eventBus.on("story.completed", (e) => events.push(e));

    // ... test implementation
  });
});
```

### 9.7 Configuration

```typescript
// config.ts
interface BoardCLIConfig {
  storage: {
    backend: "json" | "sqlite" | "memory";
    basePath: string;
  };
  display: {
    colors: boolean;
    unicode: boolean;
    defaultFormat: "table" | "json" | "md";
  };
  tui: {
    refreshInterval: number;
    theme: "dark" | "light";
  };
}

const defaultConfig: BoardCLIConfig = {
  storage: {
    backend: "json",
    basePath: ".board"
  },
  display: {
    colors: true,
    unicode: true,
    defaultFormat: "table"
  },
  tui: {
    refreshInterval: 1000,
    theme: "dark"
  }
};

// Load from ~/.board/config.json or .board.json
function loadConfig(): BoardCLIConfig {
  // Implementation
}
```

---

## Appendix A: ID Formats

| Entity | Format | Example |
|--------|--------|---------|
| Feature Code | `[A-Z]{2,6}` | `NOTIFY`, `AUTH`, `PROD` |
| Story ID | `{FEATURE}-{NNN}` | `NOTIFY-001`, `AUTH-042` |
| Task ID | `T-{NNN}` | `T-001`, `T-042` |
| AC ID | `AC-{NNN}` | `AC-001`, `AC-007` |
| Workflow State | `{STORY_ID}-{workflow}` | `NOTIFY-001-execution` |
| Checkpoint | `{STORY_ID}-{workflow}-step{N}-{label}-{timestamp}` | `NOTIFY-001-execution-step3-phase-complete-2025-12-09T10-00-00` |

---

## Appendix B: Status Transitions

### Story Status Transitions

| From | To | Trigger |
|------|-----|---------|
| planned | in-progress | `/loom:start` |
| in-progress | completed | All ACs pass |
| in-progress | blocked | Manual block |
| blocked | in-progress | Manual unblock |
| completed | planned | Revert (rare) |

### Task Status Transitions

| From | To | Trigger |
|------|-----|---------|
| pending | in-progress | Dependencies satisfied, task started |
| in-progress | completed | Task finished successfully |
| in-progress | failed | Task failed (< 3 attempts) |
| in-progress | blocked | External blocker |
| failed | pending | Retry (increment attempt) |
| blocked | pending | Unblock |

### AC Status Transitions

| From | To | Trigger |
|------|-----|---------|
| pending | passed | Verification successful |
| pending | failed | Verification failed |
| failed | passed | Re-verification successful |
| passed | failed | Regression detected |

---

## Appendix C: Keyboard Shortcuts (TUI)

### Global

| Key | Action |
|-----|--------|
| `q`, `Ctrl+C` | Quit |
| `?` | Help |
| `r` | Refresh |
| `/` | Search |
| `Tab` | Next panel |
| `Shift+Tab` | Previous panel |
| `Esc` | Back / Cancel |

### Board View

| Key | Action |
|-----|--------|
| `←→` | Move between columns |
| `↑↓` | Navigate stories |
| `Enter` | Open story detail |
| `n` | New story |
| `p` | Filter by priority |
| `f` | Filter by feature |

### Story View

| Key | Action |
|-----|--------|
| `t` | Focus tasks |
| `a` | Focus ACs |
| `h` | Show history |
| `e` | Edit story |
| `s` | Start story |
| `c` | Complete story |
| `b` | Block story |

### Task View

| Key | Action |
|-----|--------|
| `s` | Start task |
| `c` | Complete task |
| `f` | Fail task |
| `r` | Retry task |
| `e` | Edit task |

---

*End of Specification*
