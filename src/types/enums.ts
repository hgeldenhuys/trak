/**
 * Enums for Board CLI/TUI System
 *
 * These enums define the possible states and priority levels
 * for tasks and stories in the board system.
 */

/**
 * Status values for tasks
 */
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * Status values for stories
 */
export enum StoryStatus {
  DRAFT = 'draft',
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived',
}

/**
 * Priority levels for stories and tasks
 * P0 = Critical/Urgent
 * P1 = High priority
 * P2 = Medium priority
 * P3 = Low priority
 */
export enum Priority {
  P0 = 'P0',
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
}

/**
 * Types of history actions that can be recorded
 */
export enum HistoryAction {
  CREATED = 'created',
  UPDATED = 'updated',
  STATUS_CHANGED = 'status_changed',
  DELETED = 'deleted',
  ASSIGNED = 'assigned',
  COMMENT_ADDED = 'comment_added',
}

/**
 * Entity types for history tracking
 */
export enum EntityType {
  FEATURE = 'feature',
  STORY = 'story',
  TASK = 'task',
  ACCEPTANCE_CRITERIA = 'acceptance_criteria',
  SESSION = 'session',
  IMPEDIMENT = 'impediment',
  NOTE = 'note',
  LABEL = 'label',
  DECISION = 'decision',
}

/**
 * Status values for impediments
 */
export enum ImpedimentStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  ESCALATED = 'escalated',
}

/**
 * Severity levels for impediments
 */
export enum ImpedimentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Relation types for linking entities
 */
export enum RelationType {
  BLOCKS = 'blocks',           // A blocks B
  BLOCKED_BY = 'blocked_by',   // A is blocked by B
  RELATES_TO = 'relates_to',   // A relates to B (bidirectional)
  DUPLICATES = 'duplicates',   // A duplicates B
  PARENT_OF = 'parent_of',     // A is parent of B
  CHILD_OF = 'child_of',       // A is child of B
}

/**
 * QEOM Dimensions for formal ontology metadata
 * Q = Qualia (experiences, pain points, solutions)
 * E = Epistemology (patterns, validations, concepts)
 * O = Ontology (entities, relations, constraints)
 * M = Mereology (components, compositions, parts)
 */
export enum QEOMDimension {
  QUALIA = 'Q',
  EPISTEMOLOGY = 'E',
  ONTOLOGY = 'O',
  MEREOLOGY = 'M',
}

/**
 * Units for effort estimation
 * HOURS = Human hours of work
 * POINTS = Story points (abstract complexity measure)
 * AI_HOURS = AI-assisted development hours (typically faster than human hours)
 */
export enum EffortUnit {
  HOURS = 'hours',
  POINTS = 'points',
  AI_HOURS = 'ai-hours',
}
