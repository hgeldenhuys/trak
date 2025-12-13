/**
 * Events Module - Board CLI/TUI Event Bus System
 *
 * This module provides a typed event bus for reactive updates
 * across the board management system.
 *
 * @example
 * ```typescript
 * import { eventBus, createEventTimestamp } from './events';
 * import type { StoryCreatedEvent } from './events';
 *
 * // Subscribe to story creation events
 * eventBus.on('story:created', (payload) => {
 *   console.log(`New story: ${payload.entity.title}`);
 * });
 *
 * // Emit a story created event
 * eventBus.emit('story:created', {
 *   entityId: story.id,
 *   entity: story,
 *   timestamp: createEventTimestamp(),
 * });
 * ```
 */

// =============================================================================
// Event Bus - Core functionality
// =============================================================================

export {
  TypedEventEmitter,
  eventBus,
  getEventBus,
  resetEventBus,
} from './event-bus';

// =============================================================================
// Event Types - All type definitions
// =============================================================================

// Base types
export type {
  BaseEventPayload,
  EntityEvent,
  EntityCreatedEvent,
  EntityUpdatedEvent,
  EntityDeletedEvent,
  StatusChangedEvent,
  ACVerifiedEvent,
  SessionStartedEvent,
  SessionEndedEvent,
} from './types';

// Feature event types
export type {
  FeatureCreatedEvent,
  FeatureUpdatedEvent,
  FeatureDeletedEvent,
} from './types';

// Story event types
export type {
  StoryCreatedEvent,
  StoryUpdatedEvent,
  StoryDeletedEvent,
  StoryStatusChangedEvent,
} from './types';

// Task event types
export type {
  TaskCreatedEvent,
  TaskUpdatedEvent,
  TaskDeletedEvent,
  TaskStatusChangedEvent,
} from './types';

// Acceptance Criteria event types
export type {
  ACCreatedEvent,
  ACUpdatedEvent,
  ACDeletedEvent,
} from './types';

// Session event types
export type {
  SessionUpdatedEvent,
} from './types';

// Board Events interface and utilities
export type {
  BoardEvents,
  BoardEventName,
  EventPayload,
  EventListener,
} from './types';

// Utility functions
export { createEventTimestamp } from './types';
