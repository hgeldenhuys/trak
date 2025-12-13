/**
 * TypedEventEmitter - Type-safe event bus for Board CLI/TUI System
 *
 * Wraps Node.js EventEmitter with strongly-typed event handling
 * using the BoardEvents interface for compile-time type checking.
 */

import { EventEmitter } from 'events';
import type {
  BoardEvents,
  BoardEventName,
  EventListener,
  EventPayload,
} from './types';

/**
 * TypedEventEmitter provides type-safe event emission and subscription
 *
 * @example
 * ```typescript
 * const bus = new TypedEventEmitter();
 *
 * // Type-safe subscription - payload is correctly typed
 * bus.on('story:created', (payload) => {
 *   console.log(payload.entity.title); // TypeScript knows this is a Story
 * });
 *
 * // Type-safe emission - payload must match event type
 * bus.emit('story:created', {
 *   entityId: 'story-123',
 *   entity: story,
 *   timestamp: new Date().toISOString(),
 * });
 * ```
 */
export class TypedEventEmitter {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    // Increase max listeners to handle many subscribers
    this.emitter.setMaxListeners(100);
  }

  /**
   * Subscribe to an event with a type-safe listener
   *
   * @param event - The event name to subscribe to
   * @param listener - Callback function that receives the typed payload
   * @returns this - For method chaining
   */
  on<E extends BoardEventName>(
    event: E,
    listener: EventListener<E>
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Subscribe to an event once with a type-safe listener
   * The listener is automatically removed after the first invocation
   *
   * @param event - The event name to subscribe to
   * @param listener - Callback function that receives the typed payload
   * @returns this - For method chaining
   */
  once<E extends BoardEventName>(
    event: E,
    listener: EventListener<E>
  ): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Unsubscribe a listener from an event
   *
   * @param event - The event name to unsubscribe from
   * @param listener - The listener function to remove
   * @returns this - For method chaining
   */
  off<E extends BoardEventName>(
    event: E,
    listener: EventListener<E>
  ): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Emit an event with a type-safe payload
   *
   * @param event - The event name to emit
   * @param payload - The event payload (must match the event type)
   * @returns boolean - True if the event had listeners, false otherwise
   */
  emit<E extends BoardEventName>(
    event: E,
    payload: EventPayload<E>
  ): boolean {
    return this.emitter.emit(event, payload);
  }

  /**
   * Remove all listeners for a specific event or all events
   *
   * @param event - Optional event name. If omitted, removes all listeners
   * @returns this - For method chaining
   */
  removeAllListeners<E extends BoardEventName>(event?: E): this {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  /**
   * Get the number of listeners for a specific event
   *
   * @param event - The event name to check
   * @returns number - Count of listeners for the event
   */
  listenerCount<E extends BoardEventName>(event: E): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * Get all registered event names
   *
   * @returns Array of event names that have listeners
   */
  eventNames(): BoardEventName[] {
    return this.emitter.eventNames() as BoardEventName[];
  }

  /**
   * Get all listeners for a specific event
   *
   * @param event - The event name
   * @returns Array of listener functions
   */
  listeners<E extends BoardEventName>(event: E): EventListener<E>[] {
    return this.emitter.listeners(event) as EventListener<E>[];
  }

  /**
   * Prepend a listener to the beginning of the listeners array
   *
   * @param event - The event name
   * @param listener - The listener function
   * @returns this - For method chaining
   */
  prependListener<E extends BoardEventName>(
    event: E,
    listener: EventListener<E>
  ): this {
    this.emitter.prependListener(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Prepend a one-time listener to the beginning of the listeners array
   *
   * @param event - The event name
   * @param listener - The listener function
   * @returns this - For method chaining
   */
  prependOnceListener<E extends BoardEventName>(
    event: E,
    listener: EventListener<E>
  ): this {
    this.emitter.prependOnceListener(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Set the maximum number of listeners per event
   *
   * @param n - Maximum number of listeners
   * @returns this - For method chaining
   */
  setMaxListeners(n: number): this {
    this.emitter.setMaxListeners(n);
    return this;
  }

  /**
   * Get the maximum number of listeners per event
   *
   * @returns number - Current max listeners setting
   */
  getMaxListeners(): number {
    return this.emitter.getMaxListeners();
  }
}

// =============================================================================
// Singleton Event Bus Instance
// =============================================================================

/**
 * Singleton event bus instance for global event handling
 *
 * Use this for application-wide event communication.
 * For isolated testing or scoped event handling, create a new TypedEventEmitter instance.
 *
 * @example
 * ```typescript
 * import { eventBus } from './events';
 *
 * // Subscribe to events
 * eventBus.on('task:completed', (payload) => {
 *   console.log(`Task ${payload.entityId} completed!`);
 * });
 *
 * // Emit events
 * eventBus.emit('task:completed', { entityId, entity, timestamp });
 * ```
 */
let eventBusInstance: TypedEventEmitter | null = null;

/**
 * Get the singleton event bus instance
 * Creates the instance on first call (lazy initialization)
 */
export function getEventBus(): TypedEventEmitter {
  if (!eventBusInstance) {
    eventBusInstance = new TypedEventEmitter();
  }
  return eventBusInstance;
}

/**
 * Reset the singleton event bus (useful for testing)
 * Removes all listeners and creates a fresh instance
 */
export function resetEventBus(): void {
  if (eventBusInstance) {
    eventBusInstance.removeAllListeners();
  }
  eventBusInstance = new TypedEventEmitter();
}

/**
 * The global event bus singleton
 * Prefer using getEventBus() for explicit access
 */
export const eventBus = getEventBus();
