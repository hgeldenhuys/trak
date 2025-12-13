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
export { TypedEventEmitter, eventBus, getEventBus, resetEventBus, } from './event-bus';
// Utility functions
export { createEventTimestamp } from './types';
