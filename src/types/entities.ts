/**
 * Entity Interfaces for Board CLI/TUI System
 *
 * All entities include:
 * - id: UUID for unique identification
 * - createdAt: ISO timestamp of creation
 * - updatedAt: ISO timestamp of last update
 * - extensions: Record<string, unknown> for plugin support
 */

import {
  EffortUnit,
  EntityType,
  HistoryAction,
  ImpedimentSeverity,
  ImpedimentStatus,
  Priority,
  QEOMDimension,
  RelationType,
  StoryStatus,
  TaskStatus,
} from './enums';

/**
 * Base interface for all entities
 * Provides common fields required by all board entities
 */
export interface BaseEntity {
  /** UUID for unique identification */
  id: string;
  /** ISO timestamp of when the entity was created */
  createdAt: string;
  /** ISO timestamp of when the entity was last updated */
  updatedAt: string;
  /** Extensible metadata for plugin support */
  extensions: Record<string, unknown>;
}

/**
 * Feature entity - container for related stories
 *
 * Features group stories by functional area or domain.
 * The code is used as a prefix for story IDs (e.g., NOTIFY-001).
 */
export interface Feature extends BaseEntity {
  /** Short uppercase code for the feature (e.g., 'NOTIFY', 'AUTH') */
  code: string;
  /** Human-readable name of the feature */
  name: string;
  /** Detailed description of what the feature encompasses */
  description: string;
  /** Counter for generating story IDs within this feature */
  storyCounter: number;
}

/**
 * Story entity - a unit of work containing multiple tasks
 *
 * Stories follow the ID pattern: {FEATURE_CODE}-{NNN}
 * For example: NOTIFY-001, AUTH-042
 */
export interface Story extends BaseEntity {
  /** Story code following pattern {FEATURE_CODE}-{NNN} */
  code: string;
  /** Reference to the parent feature's ID */
  featureId: string;
  /** Brief title describing the story */
  title: string;
  /** Detailed description of the story */
  description: string;
  /** Business context: why this story is needed */
  why: string;
  /** Current status of the story */
  status: StoryStatus;
  /** Priority level for the story */
  priority: Priority;
  /** Optional assignee identifier */
  assignedTo: string | null;
  /** Estimated complexity (e.g., 'trivial', 'small', 'medium', 'large', 'epic') */
  estimatedComplexity: string | null;
}

/**
 * Task entity - an atomic unit of work within a story
 *
 * Tasks represent individual pieces of work that can be
 * assigned, tracked, and completed independently.
 */
export interface Task extends BaseEntity {
  /** Reference to the parent story's ID */
  storyId: string;
  /** Brief title describing the task */
  title: string;
  /** Detailed description of what needs to be done */
  description: string;
  /** Current status of the task */
  status: TaskStatus;
  /** Priority level for the task */
  priority: Priority;
  /** Optional assignee identifier (e.g., 'backend-dev', 'frontend-dev') */
  assignedTo: string | null;
  /** Order of the task within the story (for sequencing) */
  order: number;
  /** IDs of tasks that must be completed before this one */
  dependencies: string[];
  /** IDs of acceptance criteria this task covers */
  acCoverage: string[];
  /** Estimated complexity: 'low', 'medium', 'high' */
  estimatedComplexity: 'low' | 'medium' | 'high';
  /** Files modified/created as part of this task */
  files: string[];
  /** Optional reference link to prior art, patterns, or documentation */
  reference: string | null;
  /** Estimated effort for this task (e.g., 4 for 4 hours) */
  estimatedEffort: number | null;
  /** Actual effort measured/recorded for this task */
  actualEffort: number | null;
  /** Unit of effort measurement */
  effortUnit: EffortUnit | null;
  /** ISO timestamp when task started (auto-captured on status -> in_progress) */
  startedAt: string | null;
  /** ISO timestamp when task completed (auto-captured on status -> completed) */
  completedAt: string | null;
}

/**
 * AcceptanceCriteria entity - verification criteria for a story
 *
 * Acceptance criteria define the conditions that must be met
 * for a story to be considered complete.
 */
export interface AcceptanceCriteria extends BaseEntity {
  /** Reference to the parent story's ID */
  storyId: string;
  /** Short identifier for the criterion (e.g., 'AC-001') */
  code: string;
  /** Description of what must be true for this criterion to pass */
  description: string;
  /** Whether this criterion has been verified as complete */
  status: 'pending' | 'verified' | 'failed';
  /** Optional notes about verification */
  verificationNotes: string | null;
  /** Timestamp of when the criterion was verified */
  verifiedAt: string | null;
}

/**
 * HistoryEntry entity - audit log for entity changes
 *
 * History entries track all mutations to entities,
 * enabling audit trails and change tracking.
 */
export interface HistoryEntry extends BaseEntity {
  /** Type of entity this history entry refers to */
  entityType: EntityType;
  /** ID of the entity this history entry refers to */
  entityId: string;
  /** Type of action that was performed */
  action: HistoryAction;
  /** Actor who performed the action (e.g., 'backend-dev', 'cli', 'system') */
  actor: string;
  /** Human-readable summary of what changed */
  summary: string;
  /** Detailed changes in JSON format */
  changes: Record<string, unknown>;
  /** Previous state before the change (for rollback support) */
  previousState: Record<string, unknown> | null;
}

/**
 * Session entity - tracks active work sessions
 *
 * Sessions represent periods of active work on the board,
 * useful for tracking work patterns and context.
 */
export interface Session extends BaseEntity {
  /** Identifier of who started the session (e.g., 'backend-dev', 'user') */
  actor: string;
  /** Optional reference to the story being worked on */
  activeStoryId: string | null;
  /** Optional reference to the task being worked on */
  activeTaskId: string | null;
  /** Timestamp when the session started */
  startedAt: string;
  /** Timestamp when the session ended (null if still active) */
  endedAt: string | null;
  /** Current phase of work (e.g., 'planning', 'execution', 'review') */
  phase: string | null;
  /** Count of context compactions during the session */
  compactionCount: number;
}

/**
 * Note entity - free-form notes attached to any entity
 */
export interface Note extends BaseEntity {
  /** Type of entity this note is attached to */
  entityType: EntityType;
  /** ID of the entity this note is attached to */
  entityId: string;
  /** Note content (supports markdown) */
  content: string;
  /** Who created the note */
  author: string;
  /** Whether this note is pinned/important */
  pinned: boolean;
}

/**
 * Impediment entity - blockers and obstacles
 */
export interface Impediment extends BaseEntity {
  /** Type of entity this impediment is blocking */
  entityType: EntityType;
  /** ID of the entity this impediment is blocking */
  entityId: string;
  /** Brief title of the impediment */
  title: string;
  /** Detailed description of the blocker */
  description: string;
  /** Current status of the impediment */
  status: ImpedimentStatus;
  /** Severity level */
  severity: ImpedimentSeverity;
  /** Who raised the impediment */
  raisedBy: string;
  /** Who is responsible for resolving it */
  assignedTo: string | null;
  /** When the impediment was resolved */
  resolvedAt: string | null;
  /** How it was resolved (for future reference) */
  resolution: string | null;
}

/**
 * Label entity - tags for categorization
 */
export interface Label extends BaseEntity {
  /** Label name (e.g., 'bug', 'enhancement', 'tech-debt') */
  name: string;
  /** Display color (hex code) */
  color: string;
  /** Description of what this label means */
  description: string;
}

/**
 * EntityLabel - many-to-many join for labels
 */
export interface EntityLabel {
  /** Type of entity this label is attached to */
  entityType: EntityType;
  /** ID of the entity */
  entityId: string;
  /** ID of the label */
  labelId: string;
  /** When the label was applied */
  appliedAt: string;
  /** Who applied the label */
  appliedBy: string;
}

/**
 * Relation entity - links between entities
 */
export interface Relation extends BaseEntity {
  /** Type of the source entity */
  sourceType: EntityType;
  /** ID of the source entity */
  sourceId: string;
  /** Type of the target entity */
  targetType: EntityType;
  /** ID of the target entity */
  targetId: string;
  /** Type of relationship */
  relationType: RelationType;
  /** Optional description of the relationship */
  description: string | null;
}

/**
 * QEOM Metadata - formal ontology annotations
 * Attached to any entity to provide dimensional classification
 */
export interface QEOMMetadata extends BaseEntity {
  /** Type of entity this metadata is attached to */
  entityType: EntityType;
  /** ID of the entity */
  entityId: string;
  /** Which QEOM dimension this belongs to */
  dimension: QEOMDimension;
  /** Category within the dimension (e.g., 'painpoint', 'pattern', 'entity') */
  category: string;
  /** The insight or classification */
  content: string;
  /** Confidence level 0-1 */
  confidence: number;
  /** Evidence or source for this classification */
  evidence: string | null;
}

/**
 * Decision entity - architectural/design decisions with rationale
 */
export interface Decision extends BaseEntity {
  /** Type of entity this decision relates to */
  entityType: EntityType;
  /** ID of the entity */
  entityId: string;
  /** The question or problem being decided */
  question: string;
  /** The chosen solution/approach */
  choice: string;
  /** Alternative options that were considered */
  alternatives: string[];
  /** Why this choice was made */
  rationale: string;
  /** Who made this decision */
  decidedBy: string;
  /** When the decision was made */
  decidedAt: string;
  /** Current status: proposed, accepted, deprecated, superseded */
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  /** If superseded, ID of the new decision */
  supersededBy: string | null;
}

/**
 * Type for creating a new Feature (without auto-generated fields)
 */
export type CreateFeatureInput = Pick<Feature, 'code' | 'name' | 'description'> &
  Partial<Pick<Feature, 'extensions'>>;

/**
 * Type for creating a new Story (without auto-generated fields)
 */
export type CreateStoryInput = Pick<Story, 'featureId' | 'title' | 'description' | 'why'> &
  Partial<Pick<Story, 'status' | 'priority' | 'assignedTo' | 'estimatedComplexity' | 'extensions'>>;

/**
 * Type for creating a new Task (without auto-generated fields)
 */
export type CreateTaskInput = Pick<Task, 'storyId' | 'title' | 'description'> &
  Partial<Pick<Task, 'status' | 'priority' | 'assignedTo' | 'order' | 'dependencies' | 'acCoverage' | 'estimatedComplexity' | 'files' | 'reference' | 'estimatedEffort' | 'actualEffort' | 'effortUnit' | 'extensions'>>;

/**
 * Type for creating new AcceptanceCriteria (without auto-generated fields)
 */
export type CreateAcceptanceCriteriaInput = Pick<AcceptanceCriteria, 'storyId' | 'code' | 'description'> &
  Partial<Pick<AcceptanceCriteria, 'status' | 'extensions'>>;

/**
 * Type for creating a new HistoryEntry (without auto-generated fields)
 */
export type CreateHistoryEntryInput = Pick<HistoryEntry, 'entityType' | 'entityId' | 'action' | 'actor' | 'summary'> &
  Partial<Pick<HistoryEntry, 'changes' | 'previousState' | 'extensions'>>;

/**
 * Type for creating a new Session (without auto-generated fields)
 */
export type CreateSessionInput = Pick<Session, 'actor'> &
  Partial<Pick<Session, 'activeStoryId' | 'activeTaskId' | 'phase' | 'extensions'>>;

/**
 * Type for updating a Feature
 */
export type UpdateFeatureInput = Partial<Pick<Feature, 'name' | 'description' | 'extensions'>>;

/**
 * Type for updating a Story
 */
export type UpdateStoryInput = Partial<Pick<Story, 'title' | 'description' | 'why' | 'status' | 'priority' | 'assignedTo' | 'estimatedComplexity' | 'extensions'>>;

/**
 * Type for updating a Task
 */
export type UpdateTaskInput = Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assignedTo' | 'order' | 'dependencies' | 'acCoverage' | 'estimatedComplexity' | 'files' | 'reference' | 'estimatedEffort' | 'actualEffort' | 'effortUnit' | 'startedAt' | 'completedAt' | 'extensions'>>;

/**
 * Type for updating AcceptanceCriteria
 */
export type UpdateAcceptanceCriteriaInput = Partial<Pick<AcceptanceCriteria, 'description' | 'status' | 'verificationNotes' | 'extensions'>>;

/**
 * Type for updating a Session
 */
export type UpdateSessionInput = Partial<Pick<Session, 'activeStoryId' | 'activeTaskId' | 'phase' | 'compactionCount' | 'endedAt' | 'extensions'>>;

/**
 * Type for creating a new Note
 */
export type CreateNoteInput = Pick<Note, 'entityType' | 'entityId' | 'content' | 'author'> &
  Partial<Pick<Note, 'pinned' | 'extensions'>>;

/**
 * Type for updating a Note
 */
export type UpdateNoteInput = Partial<Pick<Note, 'content' | 'pinned' | 'extensions'>>;

/**
 * Type for creating a new Impediment
 */
export type CreateImpedimentInput = Pick<Impediment, 'entityType' | 'entityId' | 'title' | 'description' | 'raisedBy'> &
  Partial<Pick<Impediment, 'status' | 'severity' | 'assignedTo' | 'extensions'>>;

/**
 * Type for updating an Impediment
 */
export type UpdateImpedimentInput = Partial<Pick<Impediment, 'title' | 'description' | 'status' | 'severity' | 'assignedTo' | 'resolution' | 'extensions'>>;

/**
 * Type for creating a new Label
 */
export type CreateLabelInput = Pick<Label, 'name' | 'color'> &
  Partial<Pick<Label, 'description' | 'extensions'>>;

/**
 * Type for updating a Label
 */
export type UpdateLabelInput = Partial<Pick<Label, 'name' | 'color' | 'description' | 'extensions'>>;

/**
 * Type for creating a new Relation
 */
export type CreateRelationInput = Pick<Relation, 'sourceType' | 'sourceId' | 'targetType' | 'targetId' | 'relationType'> &
  Partial<Pick<Relation, 'description' | 'extensions'>>;

/**
 * Type for updating a Relation
 */
export type UpdateRelationInput = Partial<Pick<Relation, 'relationType' | 'description' | 'extensions'>>;

/**
 * Type for creating QEOM Metadata
 */
export type CreateQEOMMetadataInput = Pick<QEOMMetadata, 'entityType' | 'entityId' | 'dimension' | 'category' | 'content'> &
  Partial<Pick<QEOMMetadata, 'confidence' | 'evidence' | 'extensions'>>;

/**
 * Type for updating QEOM Metadata
 */
export type UpdateQEOMMetadataInput = Partial<Pick<QEOMMetadata, 'category' | 'content' | 'confidence' | 'evidence' | 'extensions'>>;

/**
 * Type for creating a new Decision
 */
export type CreateDecisionInput = Pick<Decision, 'entityType' | 'entityId' | 'question' | 'choice' | 'rationale' | 'decidedBy'> &
  Partial<Pick<Decision, 'alternatives' | 'status' | 'extensions'>>;

/**
 * Type for updating a Decision
 */
export type UpdateDecisionInput = Partial<Pick<Decision, 'choice' | 'alternatives' | 'rationale' | 'status' | 'supersededBy' | 'extensions'>>;
