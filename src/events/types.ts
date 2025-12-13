/**
 * Event Types for Board CLI/TUI System
 *
 * This module defines all event payload types and the BoardEvents interface
 * for the typed event bus system.
 */

import type {
  Feature,
  Story,
  Task,
  AcceptanceCriteria,
  Session,
} from '../types';
import type { StoryStatus, TaskStatus } from '../types';

/**
 * Base event payload interface
 * All events include entity identification and timestamp
 */
export interface BaseEventPayload {
  /** Unique identifier of the affected entity */
  entityId: string;
  /** ISO timestamp of when the event occurred */
  timestamp: string;
}

/**
 * Generic entity event payload for CRUD operations
 * @template T - The entity type
 */
export interface EntityEvent<T> extends BaseEventPayload {
  /** The current state of the entity */
  entity: T;
  /** Previous state before the change (for updates) */
  previousState?: T;
}

/**
 * Event payload for entity creation
 * @template T - The entity type
 */
export interface EntityCreatedEvent<T> extends BaseEventPayload {
  /** The newly created entity */
  entity: T;
}

/**
 * Event payload for entity updates
 * @template T - The entity type
 */
export interface EntityUpdatedEvent<T> extends BaseEventPayload {
  /** The updated entity */
  entity: T;
  /** State before the update */
  previousState: T;
  /** Fields that were changed */
  changedFields: (keyof T)[];
}

/**
 * Event payload for entity deletion
 * @template T - The entity type
 */
export interface EntityDeletedEvent<T> extends BaseEventPayload {
  /** The deleted entity (final state before deletion) */
  entity: T;
}

/**
 * Event payload for status changes
 * @template T - The entity type
 * @template S - The status enum type
 */
export interface StatusChangedEvent<T, S> extends BaseEventPayload {
  /** The entity after status change */
  entity: T;
  /** Previous status value */
  previousStatus: S;
  /** New status value */
  newStatus: S;
}

/**
 * Event payload for acceptance criteria verification
 */
export interface ACVerifiedEvent extends BaseEventPayload {
  /** The verified acceptance criteria */
  entity: AcceptanceCriteria;
  /** Verification notes */
  verificationNotes: string | null;
  /** Whether verification passed or failed */
  verificationResult: 'verified' | 'failed';
}

/**
 * Event payload for session start
 */
export interface SessionStartedEvent extends BaseEventPayload {
  /** The started session */
  entity: Session;
  /** Actor who started the session */
  actor: string;
}

/**
 * Event payload for session end
 */
export interface SessionEndedEvent extends BaseEventPayload {
  /** The ended session */
  entity: Session;
  /** Duration in milliseconds */
  durationMs: number;
}

// =============================================================================
// Feature Events
// =============================================================================

export type FeatureCreatedEvent = EntityCreatedEvent<Feature>;
export type FeatureUpdatedEvent = EntityUpdatedEvent<Feature>;
export type FeatureDeletedEvent = EntityDeletedEvent<Feature>;

// =============================================================================
// Story Events
// =============================================================================

export type StoryCreatedEvent = EntityCreatedEvent<Story>;
export type StoryUpdatedEvent = EntityUpdatedEvent<Story>;
export type StoryDeletedEvent = EntityDeletedEvent<Story>;
export type StoryStatusChangedEvent = StatusChangedEvent<Story, StoryStatus>;

// =============================================================================
// Task Events
// =============================================================================

export type TaskCreatedEvent = EntityCreatedEvent<Task>;
export type TaskUpdatedEvent = EntityUpdatedEvent<Task>;
export type TaskDeletedEvent = EntityDeletedEvent<Task>;
export type TaskStatusChangedEvent = StatusChangedEvent<Task, TaskStatus>;

// =============================================================================
// Acceptance Criteria Events
// =============================================================================

export type ACCreatedEvent = EntityCreatedEvent<AcceptanceCriteria>;
export type ACUpdatedEvent = EntityUpdatedEvent<AcceptanceCriteria>;
export type ACDeletedEvent = EntityDeletedEvent<AcceptanceCriteria>;

// =============================================================================
// Session Events
// =============================================================================

export type SessionUpdatedEvent = EntityUpdatedEvent<Session>;

// =============================================================================
// Board Events Interface - Maps event names to their payload types
// =============================================================================

/**
 * BoardEvents interface defines all possible events and their payload types
 * Used by TypedEventEmitter for type-safe event handling
 */
export interface BoardEvents {
  // Feature events
  'feature:created': FeatureCreatedEvent;
  'feature:updated': FeatureUpdatedEvent;
  'feature:deleted': FeatureDeletedEvent;

  // Story events
  'story:created': StoryCreatedEvent;
  'story:updated': StoryUpdatedEvent;
  'story:deleted': StoryDeletedEvent;
  'story:status-changed': StoryStatusChangedEvent;

  // Task events
  'task:created': TaskCreatedEvent;
  'task:updated': TaskUpdatedEvent;
  'task:deleted': TaskDeletedEvent;
  'task:status-changed': TaskStatusChangedEvent;

  // Acceptance Criteria events
  'ac:created': ACCreatedEvent;
  'ac:updated': ACUpdatedEvent;
  'ac:deleted': ACDeletedEvent;
  'ac:verified': ACVerifiedEvent;

  // Session events
  'session:started': SessionStartedEvent;
  'session:ended': SessionEndedEvent;
  'session:updated': SessionUpdatedEvent;
}

/**
 * Union type of all event names
 */
export type BoardEventName = keyof BoardEvents;

/**
 * Helper type to get the payload type for a specific event
 */
export type EventPayload<E extends BoardEventName> = BoardEvents[E];

/**
 * Event listener function type
 */
export type EventListener<E extends BoardEventName> = (payload: BoardEvents[E]) => void;

/**
 * Helper function to create a timestamp for events
 */
export function createEventTimestamp(): string {
  return new Date().toISOString();
}
