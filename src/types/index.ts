/**
 * Board CLI/TUI Type System
 *
 * This module exports all types, interfaces, and enums
 * for the board management system.
 */

// Re-export all enums
export {
  TaskStatus,
  StoryStatus,
  Priority,
  HistoryAction,
  EntityType,
  ImpedimentStatus,
  ImpedimentSeverity,
  RelationType,
  QEOMDimension,
  EffortUnit,
} from './enums';

// Re-export all entity interfaces
export type {
  BaseEntity,
  Feature,
  Story,
  Task,
  AcceptanceCriteria,
  HistoryEntry,
  Session,
  Note,
  Impediment,
  Label,
  EntityLabel,
  Relation,
  QEOMMetadata,
  Decision,
} from './entities';

// Re-export all input types for create operations
export type {
  CreateFeatureInput,
  CreateStoryInput,
  CreateTaskInput,
  CreateAcceptanceCriteriaInput,
  CreateHistoryEntryInput,
  CreateSessionInput,
  CreateNoteInput,
  CreateImpedimentInput,
  CreateLabelInput,
  CreateRelationInput,
  CreateQEOMMetadataInput,
  CreateDecisionInput,
} from './entities';

// Re-export all input types for update operations
export type {
  UpdateFeatureInput,
  UpdateStoryInput,
  UpdateTaskInput,
  UpdateAcceptanceCriteriaInput,
  UpdateSessionInput,
  UpdateNoteInput,
  UpdateImpedimentInput,
  UpdateLabelInput,
  UpdateRelationInput,
  UpdateQEOMMetadataInput,
  UpdateDecisionInput,
} from './entities';
