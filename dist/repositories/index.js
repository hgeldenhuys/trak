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
// =============================================================================
// Acceptance Criteria Repository
// =============================================================================
export { AcceptanceCriteriaRepository, acceptanceCriteriaRepository, } from './criteria-repository';
// =============================================================================
// History Repository
// =============================================================================
export { HistoryRepository, historyRepository, } from './history-repository';
// =============================================================================
// Session Repository
// =============================================================================
export { SessionRepository, sessionRepository, } from './session-repository';
// =============================================================================
// Unified Repositories Object
// =============================================================================
import { featureRepository } from './feature-repository';
import { storyRepository } from './story-repository';
import { taskRepository } from './task-repository';
import { acceptanceCriteriaRepository } from './criteria-repository';
import { historyRepository } from './history-repository';
import { sessionRepository } from './session-repository';
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
};
