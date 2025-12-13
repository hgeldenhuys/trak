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
export const SCHEMA_VERSION = 1;
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
};
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
};
