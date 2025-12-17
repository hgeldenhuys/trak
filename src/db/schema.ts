/**
 * Database Schema Constants for Board CLI/TUI System
 *
 * Uses bun:sqlite native driver.
 * All timestamps are stored as ISO strings.
 * JSON fields are stored as TEXT.
 */

/**
 * Current schema version for migration tracking
 */
export const SCHEMA_VERSION = 6;

/**
 * Table names as constants
 */
export const TABLES = {
  SCHEMA_VERSIONS: 'schema_versions',
  FEATURES: 'features',
  STORIES: 'stories',
  TASKS: 'tasks',
  ACCEPTANCE_CRITERIA: 'acceptance_criteria',
  HISTORY: 'history',
  SESSIONS: 'sessions',
  NOTES: 'notes',
  IMPEDIMENTS: 'impediments',
  LABELS: 'labels',
  ENTITY_LABELS: 'entity_labels',
  RELATIONS: 'relations',
  QEOM_METADATA: 'qeom_metadata',
  DECISIONS: 'decisions',
  AGENT_DEFINITIONS: 'agent_definitions',
  AGENT_LEARNINGS: 'agent_learnings',
} as const;

/**
 * SQL for creating the schema_versions table (migration tracking)
 */
export const CREATE_SCHEMA_VERSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.SCHEMA_VERSIONS} (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT
  );
`;

/**
 * SQL for creating the features table
 */
export const CREATE_FEATURES_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.FEATURES} (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    story_counter INTEGER NOT NULL DEFAULT 0,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * SQL for creating indexes on features table
 */
export const CREATE_FEATURES_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_features_code ON ${TABLES.FEATURES}(code);
`;

/**
 * SQL for creating the stories table
 */
export const CREATE_STORIES_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.STORIES} (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    feature_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    why TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    priority TEXT NOT NULL DEFAULT 'P2',
    assigned_to TEXT,
    estimated_complexity TEXT,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (feature_id) REFERENCES ${TABLES.FEATURES}(id) ON DELETE CASCADE
  );
`;

/**
 * SQL for creating indexes on stories table
 */
export const CREATE_STORIES_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_stories_feature_id ON ${TABLES.STORIES}(feature_id);
  CREATE INDEX IF NOT EXISTS idx_stories_status ON ${TABLES.STORIES}(status);
  CREATE INDEX IF NOT EXISTS idx_stories_code ON ${TABLES.STORIES}(code);
`;

/**
 * SQL for creating the tasks table
 */
export const CREATE_TASKS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.TASKS} (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'P2',
    assigned_to TEXT,
    order_num INTEGER NOT NULL DEFAULT 0,
    dependencies TEXT NOT NULL DEFAULT '[]',
    ac_coverage TEXT NOT NULL DEFAULT '[]',
    estimated_complexity TEXT NOT NULL DEFAULT 'medium',
    files TEXT NOT NULL DEFAULT '[]',
    reference TEXT,
    estimated_effort REAL,
    actual_effort REAL,
    effort_unit TEXT,
    started_at TEXT,
    completed_at TEXT,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (story_id) REFERENCES ${TABLES.STORIES}(id) ON DELETE CASCADE
  );
`;

/**
 * SQL for creating indexes on tasks table
 */
export const CREATE_TASKS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_tasks_story_id ON ${TABLES.TASKS}(story_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON ${TABLES.TASKS}(status);
`;

/**
 * SQL for creating the acceptance_criteria table
 */
export const CREATE_ACCEPTANCE_CRITERIA_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.ACCEPTANCE_CRITERIA} (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    verification_notes TEXT,
    verified_at TEXT,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (story_id) REFERENCES ${TABLES.STORIES}(id) ON DELETE CASCADE
  );
`;

/**
 * SQL for creating indexes on acceptance_criteria table
 */
export const CREATE_ACCEPTANCE_CRITERIA_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_acceptance_criteria_story_id ON ${TABLES.ACCEPTANCE_CRITERIA}(story_id);
  CREATE INDEX IF NOT EXISTS idx_acceptance_criteria_status ON ${TABLES.ACCEPTANCE_CRITERIA}(status);
`;

/**
 * SQL for creating the history table
 */
export const CREATE_HISTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.HISTORY} (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    changes TEXT NOT NULL DEFAULT '{}',
    previous_state TEXT,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * SQL for creating indexes on history table
 */
export const CREATE_HISTORY_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_history_entity_type ON ${TABLES.HISTORY}(entity_type);
  CREATE INDEX IF NOT EXISTS idx_history_entity_id ON ${TABLES.HISTORY}(entity_id);
  CREATE INDEX IF NOT EXISTS idx_history_entity_type_id ON ${TABLES.HISTORY}(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_history_action ON ${TABLES.HISTORY}(action);
`;

/**
 * SQL for creating the sessions table
 */
export const CREATE_SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.SESSIONS} (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    active_story_id TEXT,
    active_task_id TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    phase TEXT,
    compaction_count INTEGER NOT NULL DEFAULT 0,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (active_story_id) REFERENCES ${TABLES.STORIES}(id) ON DELETE SET NULL,
    FOREIGN KEY (active_task_id) REFERENCES ${TABLES.TASKS}(id) ON DELETE SET NULL
  );
`;

/**
 * SQL for creating indexes on sessions table
 */
export const CREATE_SESSIONS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_sessions_actor ON ${TABLES.SESSIONS}(actor);
  CREATE INDEX IF NOT EXISTS idx_sessions_active_story_id ON ${TABLES.SESSIONS}(active_story_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_active_task_id ON ${TABLES.SESSIONS}(active_task_id);
`;

/**
 * SQL for creating the notes table
 */
export const CREATE_NOTES_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.NOTES} (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * SQL for creating indexes on notes table
 */
export const CREATE_NOTES_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_notes_entity ON ${TABLES.NOTES}(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_notes_author ON ${TABLES.NOTES}(author);
  CREATE INDEX IF NOT EXISTS idx_notes_pinned ON ${TABLES.NOTES}(pinned);
`;

/**
 * SQL for creating the impediments table
 */
export const CREATE_IMPEDIMENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.IMPEDIMENTS} (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    severity TEXT NOT NULL DEFAULT 'medium',
    raised_by TEXT NOT NULL,
    assigned_to TEXT,
    resolved_at TEXT,
    resolution TEXT,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * SQL for creating indexes on impediments table
 */
export const CREATE_IMPEDIMENTS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_impediments_entity ON ${TABLES.IMPEDIMENTS}(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_impediments_status ON ${TABLES.IMPEDIMENTS}(status);
  CREATE INDEX IF NOT EXISTS idx_impediments_severity ON ${TABLES.IMPEDIMENTS}(severity);
  CREATE INDEX IF NOT EXISTS idx_impediments_assigned_to ON ${TABLES.IMPEDIMENTS}(assigned_to);
`;

/**
 * SQL for creating the labels table
 */
export const CREATE_LABELS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.LABELS} (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#808080',
    description TEXT NOT NULL DEFAULT '',
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * SQL for creating indexes on labels table
 */
export const CREATE_LABELS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_labels_name ON ${TABLES.LABELS}(name);
`;

/**
 * SQL for creating the entity_labels junction table
 */
export const CREATE_ENTITY_LABELS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.ENTITY_LABELS} (
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    label_id TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    applied_by TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id, label_id),
    FOREIGN KEY (label_id) REFERENCES ${TABLES.LABELS}(id) ON DELETE CASCADE
  );
`;

/**
 * SQL for creating indexes on entity_labels table
 */
export const CREATE_ENTITY_LABELS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_entity_labels_entity ON ${TABLES.ENTITY_LABELS}(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_entity_labels_label_id ON ${TABLES.ENTITY_LABELS}(label_id);
`;

/**
 * SQL for creating the relations table
 */
export const CREATE_RELATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.RELATIONS} (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    description TEXT,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (source_type, source_id, target_type, target_id, relation_type)
  );
`;

/**
 * SQL for creating indexes on relations table
 */
export const CREATE_RELATIONS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_relations_source ON ${TABLES.RELATIONS}(source_type, source_id);
  CREATE INDEX IF NOT EXISTS idx_relations_target ON ${TABLES.RELATIONS}(target_type, target_id);
  CREATE INDEX IF NOT EXISTS idx_relations_type ON ${TABLES.RELATIONS}(relation_type);
`;

/**
 * SQL for creating the qeom_metadata table
 */
export const CREATE_QEOM_METADATA_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.QEOM_METADATA} (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    dimension TEXT NOT NULL,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    evidence TEXT,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * SQL for creating indexes on qeom_metadata table
 */
export const CREATE_QEOM_METADATA_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_qeom_entity ON ${TABLES.QEOM_METADATA}(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_qeom_dimension ON ${TABLES.QEOM_METADATA}(dimension);
  CREATE INDEX IF NOT EXISTS idx_qeom_category ON ${TABLES.QEOM_METADATA}(category);
`;

/**
 * SQL for creating the decisions table
 */
export const CREATE_DECISIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.DECISIONS} (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    question TEXT NOT NULL,
    choice TEXT NOT NULL,
    alternatives TEXT NOT NULL DEFAULT '[]',
    rationale TEXT NOT NULL,
    decided_by TEXT NOT NULL,
    decided_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'accepted',
    superseded_by TEXT,
    extensions TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * SQL for creating indexes on decisions table
 */
export const CREATE_DECISIONS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_decisions_entity ON ${TABLES.DECISIONS}(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_decisions_status ON ${TABLES.DECISIONS}(status);
  CREATE INDEX IF NOT EXISTS idx_decisions_decided_by ON ${TABLES.DECISIONS}(decided_by);
`;

/**
 * SQL for creating the agent_definitions table
 */
export const CREATE_AGENT_DEFINITIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.AGENT_DEFINITIONS} (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    role TEXT NOT NULL,
    specialization TEXT,
    persona TEXT NOT NULL DEFAULT '',
    objective TEXT NOT NULL DEFAULT '',
    priming TEXT NOT NULL DEFAULT '{}',
    constraints TEXT NOT NULL DEFAULT '{}',
    derived_from TEXT,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    created_for_story TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (name, version)
  );
`;

/**
 * SQL for creating indexes on agent_definitions table
 */
export const CREATE_AGENT_DEFINITIONS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_agent_definitions_name ON ${TABLES.AGENT_DEFINITIONS}(name);
  CREATE INDEX IF NOT EXISTS idx_agent_definitions_role ON ${TABLES.AGENT_DEFINITIONS}(role);
  CREATE INDEX IF NOT EXISTS idx_agent_definitions_version ON ${TABLES.AGENT_DEFINITIONS}(name, version);
`;

/**
 * SQL for creating the agent_learnings table
 */
export const CREATE_AGENT_LEARNINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS ${TABLES.AGENT_LEARNINGS} (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    specialization TEXT,
    story_id TEXT,
    task_id TEXT,
    learning TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'pattern',
    confidence REAL NOT NULL DEFAULT 0.5,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

/**
 * SQL for creating indexes on agent_learnings table
 */
export const CREATE_AGENT_LEARNINGS_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_agent_learnings_role ON ${TABLES.AGENT_LEARNINGS}(role);
  CREATE INDEX IF NOT EXISTS idx_agent_learnings_role_spec ON ${TABLES.AGENT_LEARNINGS}(role, specialization);
  CREATE INDEX IF NOT EXISTS idx_agent_learnings_category ON ${TABLES.AGENT_LEARNINGS}(category);
  CREATE INDEX IF NOT EXISTS idx_agent_learnings_story_id ON ${TABLES.AGENT_LEARNINGS}(story_id);
`;

/**
 * All table creation SQL statements in order
 */
export const ALL_TABLE_CREATES = [
  CREATE_SCHEMA_VERSIONS_TABLE,
  CREATE_FEATURES_TABLE,
  CREATE_STORIES_TABLE,
  CREATE_TASKS_TABLE,
  CREATE_ACCEPTANCE_CRITERIA_TABLE,
  CREATE_HISTORY_TABLE,
  CREATE_SESSIONS_TABLE,
  CREATE_NOTES_TABLE,
  CREATE_IMPEDIMENTS_TABLE,
  CREATE_LABELS_TABLE,
  CREATE_ENTITY_LABELS_TABLE,
  CREATE_RELATIONS_TABLE,
  CREATE_QEOM_METADATA_TABLE,
  CREATE_DECISIONS_TABLE,
  CREATE_AGENT_DEFINITIONS_TABLE,
  CREATE_AGENT_LEARNINGS_TABLE,
];

/**
 * All index creation SQL statements
 */
export const ALL_INDEX_CREATES = [
  CREATE_FEATURES_INDEXES,
  CREATE_STORIES_INDEXES,
  CREATE_TASKS_INDEXES,
  CREATE_ACCEPTANCE_CRITERIA_INDEXES,
  CREATE_HISTORY_INDEXES,
  CREATE_SESSIONS_INDEXES,
  CREATE_NOTES_INDEXES,
  CREATE_IMPEDIMENTS_INDEXES,
  CREATE_LABELS_INDEXES,
  CREATE_ENTITY_LABELS_INDEXES,
  CREATE_RELATIONS_INDEXES,
  CREATE_QEOM_METADATA_INDEXES,
  CREATE_DECISIONS_INDEXES,
  CREATE_AGENT_DEFINITIONS_INDEXES,
  CREATE_AGENT_LEARNINGS_INDEXES,
];

/**
 * Column mappings: TypeScript property name -> SQLite column name
 */
export const COLUMN_MAPPINGS = {
  features: {
    id: 'id',
    code: 'code',
    name: 'name',
    description: 'description',
    storyCounter: 'story_counter',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  stories: {
    id: 'id',
    code: 'code',
    featureId: 'feature_id',
    title: 'title',
    description: 'description',
    why: 'why',
    status: 'status',
    priority: 'priority',
    assignedTo: 'assigned_to',
    estimatedComplexity: 'estimated_complexity',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  tasks: {
    id: 'id',
    storyId: 'story_id',
    title: 'title',
    description: 'description',
    status: 'status',
    priority: 'priority',
    assignedTo: 'assigned_to',
    order: 'order_num',
    dependencies: 'dependencies',
    acCoverage: 'ac_coverage',
    estimatedComplexity: 'estimated_complexity',
    files: 'files',
    reference: 'reference',
    estimatedEffort: 'estimated_effort',
    actualEffort: 'actual_effort',
    effortUnit: 'effort_unit',
    startedAt: 'started_at',
    completedAt: 'completed_at',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  acceptanceCriteria: {
    id: 'id',
    storyId: 'story_id',
    code: 'code',
    description: 'description',
    status: 'status',
    verificationNotes: 'verification_notes',
    verifiedAt: 'verified_at',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  history: {
    id: 'id',
    entityType: 'entity_type',
    entityId: 'entity_id',
    action: 'action',
    actor: 'actor',
    summary: 'summary',
    changes: 'changes',
    previousState: 'previous_state',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  sessions: {
    id: 'id',
    actor: 'actor',
    activeStoryId: 'active_story_id',
    activeTaskId: 'active_task_id',
    startedAt: 'started_at',
    endedAt: 'ended_at',
    phase: 'phase',
    compactionCount: 'compaction_count',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  notes: {
    id: 'id',
    entityType: 'entity_type',
    entityId: 'entity_id',
    content: 'content',
    author: 'author',
    pinned: 'pinned',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  impediments: {
    id: 'id',
    entityType: 'entity_type',
    entityId: 'entity_id',
    title: 'title',
    description: 'description',
    status: 'status',
    severity: 'severity',
    raisedBy: 'raised_by',
    assignedTo: 'assigned_to',
    resolvedAt: 'resolved_at',
    resolution: 'resolution',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  labels: {
    id: 'id',
    name: 'name',
    color: 'color',
    description: 'description',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  entityLabels: {
    entityType: 'entity_type',
    entityId: 'entity_id',
    labelId: 'label_id',
    appliedAt: 'applied_at',
    appliedBy: 'applied_by',
  },
  relations: {
    id: 'id',
    sourceType: 'source_type',
    sourceId: 'source_id',
    targetType: 'target_type',
    targetId: 'target_id',
    relationType: 'relation_type',
    description: 'description',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  qeomMetadata: {
    id: 'id',
    entityType: 'entity_type',
    entityId: 'entity_id',
    dimension: 'dimension',
    category: 'category',
    content: 'content',
    confidence: 'confidence',
    evidence: 'evidence',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  decisions: {
    id: 'id',
    entityType: 'entity_type',
    entityId: 'entity_id',
    question: 'question',
    choice: 'choice',
    alternatives: 'alternatives',
    rationale: 'rationale',
    decidedBy: 'decided_by',
    decidedAt: 'decided_at',
    status: 'status',
    supersededBy: 'superseded_by',
    extensions: 'extensions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  agentDefinitions: {
    id: 'id',
    name: 'name',
    version: 'version',
    role: 'role',
    specialization: 'specialization',
    persona: 'persona',
    objective: 'objective',
    priming: 'priming',
    constraints: 'constraints',
    derivedFrom: 'derived_from',
    successCount: 'success_count',
    failureCount: 'failure_count',
    createdForStory: 'created_for_story',
    createdAt: 'created_at',
  },
  agentLearnings: {
    id: 'id',
    role: 'role',
    specialization: 'specialization',
    storyId: 'story_id',
    taskId: 'task_id',
    learning: 'learning',
    category: 'category',
    confidence: 'confidence',
    createdAt: 'created_at',
  },
} as const;
