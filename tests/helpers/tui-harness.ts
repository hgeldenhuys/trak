/**
 * TUI Test Harness
 *
 * Provides utilities for capturing and measuring event propagation
 * in the Board CLI/TUI system. Used to verify event-driven reactivity
 * meets latency requirements (<100ms).
 *
 * Note: Due to an inconsistency in the codebase where FeatureRepository
 * uses getEventBus() while Story/Task repositories use the eventBus constant,
 * this harness subscribes to BOTH to ensure complete event coverage after
 * resetEventBus() calls.
 */

import { eventBus, getEventBus } from '../../src/events';
import type { BoardEventName } from '../../src/events';

/**
 * Record of a captured event
 */
export interface EventRecord {
  /** The event name */
  event: string;
  /** High-resolution timestamp when event was received */
  timestamp: number;
  /** The event payload */
  payload: unknown;
}

/**
 * Event types that TUI would subscribe to
 */
const TUI_EVENT_TYPES: BoardEventName[] = [
  'feature:created',
  'feature:updated',
  'feature:deleted',
  'story:created',
  'story:updated',
  'story:deleted',
  'story:status-changed',
  'task:created',
  'task:updated',
  'task:deleted',
  'task:status-changed',
  'ac:created',
  'ac:updated',
  'ac:deleted',
  'ac:verified',
];

/**
 * Test harness for capturing and measuring event propagation
 *
 * Simulates how the TUI would receive events from repository mutations.
 * Provides utilities for measuring latency and verifying event payloads.
 *
 * @example
 * ```typescript
 * const harness = new TuiTestHarness();
 *
 * // Perform action
 * taskRepository.create({ storyId, title: 'Test' });
 *
 * // Verify event was received
 * const events = harness.getEventsByType('task:created');
 * expect(events.length).toBe(1);
 *
 * // Cleanup
 * harness.cleanup();
 * ```
 */
export class TuiTestHarness {
  private events: EventRecord[] = [];
  private listeners: Map<string, (payload: unknown) => void> = new Map();
  private getEventBusListeners: Map<string, (payload: unknown) => void> =
    new Map();

  constructor() {
    // Subscribe to eventBus constant (used by story/task repositories)
    for (const eventType of TUI_EVENT_TYPES) {
      const handler = (payload: unknown) => {
        this.events.push({
          event: eventType,
          timestamp: performance.now(),
          payload,
        });
      };
      this.listeners.set(eventType, handler);
      eventBus.on(eventType, handler);
    }

    // Also subscribe to getEventBus() (used by feature repository)
    // This handles the case where they're different instances after resetEventBus()
    const bus = getEventBus();
    if (bus !== eventBus) {
      for (const eventType of TUI_EVENT_TYPES) {
        const handler = (payload: unknown) => {
          this.events.push({
            event: eventType,
            timestamp: performance.now(),
            payload,
          });
        };
        this.getEventBusListeners.set(eventType, handler);
        bus.on(eventType, handler);
      }
    }
  }

  /**
   * Get all captured events
   * @returns Copy of all event records
   */
  getEvents(): EventRecord[] {
    return [...this.events];
  }

  /**
   * Get events filtered by type
   * @param type - The event type to filter by
   * @returns Array of matching event records
   */
  getEventsByType(type: string): EventRecord[] {
    return this.events.filter((e) => e.event === type);
  }

  /**
   * Get the most recently captured event
   * @returns The last event record or undefined if none
   */
  getLastEvent(): EventRecord | undefined {
    return this.events[this.events.length - 1];
  }

  /**
   * Clear all captured events
   * Useful for measuring individual operations
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Remove all event listeners and clear captured events
   * Call this in afterEach to prevent memory leaks
   */
  cleanup(): void {
    // Clean up listeners from eventBus constant
    for (const [eventType, handler] of this.listeners) {
      eventBus.off(eventType as BoardEventName, handler);
    }
    this.listeners.clear();

    // Clean up listeners from getEventBus()
    const bus = getEventBus();
    for (const [eventType, handler] of this.getEventBusListeners) {
      bus.off(eventType as BoardEventName, handler);
    }
    this.getEventBusListeners.clear();

    this.events = [];
  }

  /**
   * Measure the latency from an action to event reception
   *
   * Executes the provided action and waits for the expected event,
   * then calculates the time elapsed.
   *
   * @param action - Function that triggers the event
   * @param expectedEvent - Event name to wait for
   * @param timeout - Maximum time to wait in ms (default: 1000)
   * @returns Object with action result and latency in milliseconds
   *
   * @example
   * ```typescript
   * const { result, latencyMs } = await harness.measureLatency(
   *   () => taskRepository.create({ storyId, title: 'Test' }),
   *   'task:created'
   * );
   * expect(latencyMs).toBeLessThan(100);
   * ```
   */
  async measureLatency<T>(
    action: () => T,
    expectedEvent: string,
    timeout: number = 1000
  ): Promise<{ result: T; latencyMs: number }> {
    const start = performance.now();
    const result = action();

    // Wait for event with timeout
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${expectedEvent}`));
      }, timeout);

      const check = () => {
        const event = this.events.find(
          (e) => e.event === expectedEvent && e.timestamp >= start
        );
        if (event) {
          clearTimeout(timeoutId);
          resolve();
        } else {
          setTimeout(check, 1);
        }
      };
      check();
    });

    const event = this.events.find(
      (e) => e.event === expectedEvent && e.timestamp >= start
    );
    const latencyMs = event ? event.timestamp - start : -1;

    return { result, latencyMs };
  }

  /**
   * Wait for a specific event to be received
   *
   * @param expectedEvent - Event name to wait for
   * @param timeout - Maximum time to wait in ms (default: 1000)
   * @returns Promise that resolves when event is received
   */
  async waitForEvent(
    expectedEvent: string,
    timeout: number = 1000
  ): Promise<EventRecord> {
    const start = performance.now();

    return new Promise<EventRecord>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${expectedEvent}`));
      }, timeout);

      const check = () => {
        const event = this.events.find(
          (e) => e.event === expectedEvent && e.timestamp >= start
        );
        if (event) {
          clearTimeout(timeoutId);
          resolve(event);
        } else {
          setTimeout(check, 1);
        }
      };
      check();
    });
  }

  /**
   * Get count of events by type
   * @returns Object mapping event types to counts
   */
  getEventCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of this.events) {
      counts[event.event] = (counts[event.event] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get total number of captured events
   * @returns Total event count
   */
  getTotalEventCount(): number {
    return this.events.length;
  }
}
