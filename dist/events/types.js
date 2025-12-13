/**
 * Event Types for Board CLI/TUI System
 *
 * This module defines all event payload types and the BoardEvents interface
 * for the typed event bus system.
 */
/**
 * Helper function to create a timestamp for events
 */
export function createEventTimestamp() {
    return new Date().toISOString();
}
