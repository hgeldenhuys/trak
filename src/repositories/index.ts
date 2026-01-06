/**
 * Repositories Module - Board CLI/TUI Data Access Layer
 *
 * This module exports all repository classes and their singleton instances
 * for managing entities in the board system.
 *
 * @example
 * ```typescript
 * import { repositories } from './repositories';
 *
 * // Use singleton instances
 * const story = repositories.stories.create({
 *   featureId: 'feature-123',
 *   title: 'User login',
 *   description: 'As a user...',
 *   why: 'To authenticate users',
 * });
 *
 * // Or import individual repositories
 * import { StoryRepository, storyRepository } from './repositories';
 * ```
 */

// =============================================================================
// Feature Repository
// =============================================================================

export { FeatureRepository, featureRepository } from './feature-repository';

// =============================================================================
// Story Repository
// =============================================================================

export { StoryRepository, storyRepository } from './story-repository';

// =============================================================================
// Task Repository
// =============================================================================

export { TaskRepository, taskRepository } from './task-repository';
export type { TaskFilters } from './task-repository';

// =============================================================================
// Acceptance Criteria Repository
// =============================================================================

export {
  AcceptanceCriteriaRepository,
  acceptanceCriteriaRepository,
} from './criteria-repository';

// =============================================================================
// History Repository
// =============================================================================

export {
  HistoryRepository,
  historyRepository,
} from './history-repository';

export type { AppendHistoryInput } from './history-repository';

// =============================================================================
// Session Repository
// =============================================================================

export {
  SessionRepository,
  sessionRepository,
} from './session-repository';

export type { StartSessionInput } from './session-repository';

// =============================================================================
// Note Repository
// =============================================================================

export { NoteRepository, noteRepository } from './note-repository';

// =============================================================================
// Impediment Repository
// =============================================================================

export { ImpedimentRepository, impedimentRepository } from './impediment-repository';

// =============================================================================
// Label Repository
// =============================================================================

export { LabelRepository, labelRepository } from './label-repository';

// =============================================================================
// Relation Repository
// =============================================================================

export { RelationRepository, relationRepository } from './relation-repository';

// =============================================================================
// QEOM Metadata Repository
// =============================================================================

export { QEOMRepository, qeomRepository } from './qeom-repository';

// =============================================================================
// Decision Repository
// =============================================================================

export { DecisionRepository, decisionRepository } from './decision-repository';

// =============================================================================
// Agent Definition Repository
// =============================================================================

export { AgentDefinitionRepository, agentDefinitionRepository } from './agent-definition-repository';

// =============================================================================
// Agent Learning Repository
// =============================================================================

export { AgentLearningRepository, agentLearningRepository } from './agent-learning-repository';

// =============================================================================
// Weave Entry Repository
// =============================================================================

export { WeaveEntryRepository, weaveEntryRepository, VALID_DIMENSIONS } from './weave-entry-repository';

// =============================================================================
// Activity Log Repository
// =============================================================================

export { ActivityLogRepository, activityLogRepository } from './activity-log-repository';

// =============================================================================
// Unified Repositories Object
// =============================================================================

import { featureRepository } from './feature-repository';
import { storyRepository } from './story-repository';
import { taskRepository } from './task-repository';
import { acceptanceCriteriaRepository } from './criteria-repository';
import { historyRepository } from './history-repository';
import { sessionRepository } from './session-repository';
import { noteRepository } from './note-repository';
import { impedimentRepository } from './impediment-repository';
import { labelRepository } from './label-repository';
import { relationRepository } from './relation-repository';
import { qeomRepository } from './qeom-repository';
import { decisionRepository } from './decision-repository';
import { agentDefinitionRepository } from './agent-definition-repository';
import { agentLearningRepository } from './agent-learning-repository';
import { weaveEntryRepository } from './weave-entry-repository';
import { activityLogRepository } from './activity-log-repository';

/**
 * Unified repositories object containing all singleton instances
 *
 * Use this for convenient access to all repositories from a single import.
 *
 * @example
 * ```typescript
 * import { repositories } from './repositories';
 *
 * // Access any repository
 * const feature = repositories.features.create({ ... });
 * const story = repositories.stories.create({ ... });
 * const task = repositories.tasks.create({ ... });
 * const ac = repositories.acceptanceCriteria.create({ ... });
 * const session = repositories.sessions.start({ actor: 'backend-dev' });
 * repositories.history.append({ ... });
 * ```
 */
export const repositories = {
  /** Feature repository instance */
  features: featureRepository,
  /** Story repository instance */
  stories: storyRepository,
  /** Task repository instance */
  tasks: taskRepository,
  /** Acceptance criteria repository instance */
  acceptanceCriteria: acceptanceCriteriaRepository,
  /** History repository instance */
  history: historyRepository,
  /** Session repository instance */
  sessions: sessionRepository,
  /** Note repository instance */
  notes: noteRepository,
  /** Impediment repository instance */
  impediments: impedimentRepository,
  /** Label repository instance */
  labels: labelRepository,
  /** Relation repository instance */
  relations: relationRepository,
  /** QEOM metadata repository instance */
  qeom: qeomRepository,
  /** Decision repository instance */
  decisions: decisionRepository,
  /** Agent definition repository instance */
  agentDefinitions: agentDefinitionRepository,
  /** Agent learning repository instance */
  agentLearnings: agentLearningRepository,
  /** Weave entry repository instance */
  weaveEntries: weaveEntryRepository,
  /** Activity log repository instance */
  activityLogs: activityLogRepository,
} as const;

/**
 * Type for the repositories object
 */
export type Repositories = typeof repositories;
