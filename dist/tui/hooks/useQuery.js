/**
 * useQuery Hook - Reactive data fetching for TUI
 *
 * Provides automatic re-fetching when database changes occur,
 * using the event bus for reactivity.
 */
import { useState, useEffect, useCallback } from 'react';
import { eventBus } from '../../events';
/**
 * Event suffixes for CRUD operations
 */
const EVENT_SUFFIXES = ['created', 'updated', 'deleted', 'status-changed', 'verified', 'started', 'ended'];
/**
 * Build all event names for a given table
 */
function getEventsForTable(table) {
    const events = [];
    for (const suffix of EVENT_SUFFIXES) {
        const eventName = `${table}:${suffix}`;
        // Only include valid event names
        if (isValidEventName(eventName)) {
            events.push(eventName);
        }
    }
    return events;
}
/**
 * Check if an event name is valid in BoardEvents
 */
function isValidEventName(name) {
    const validEvents = [
        'feature:created', 'feature:updated', 'feature:deleted',
        'story:created', 'story:updated', 'story:deleted', 'story:status-changed',
        'task:created', 'task:updated', 'task:deleted', 'task:status-changed',
        'ac:created', 'ac:updated', 'ac:deleted', 'ac:verified',
        'session:started', 'session:ended', 'session:updated',
    ];
    return validEvents.includes(name);
}
/**
 * Reactive query hook that automatically refetches data when database changes
 *
 * @param queryFn - Function that fetches data (called synchronously)
 * @param options - Configuration options
 * @returns Query result with data and refetch function
 *
 * @example
 * ```typescript
 * // Watch all tables
 * const { data: stories } = useQuery(() => storyRepo.findAll());
 *
 * // Watch specific tables
 * const { data: tasks } = useQuery(
 *   () => taskRepo.findByStoryId(storyId),
 *   { dependencies: ['task'] }
 * );
 * ```
 */
export function useQuery(queryFn, options = {}) {
    const { dependencies = [], initialData, enabled = true, } = options;
    // Initialize with either initialData or result of queryFn
    const [data, setData] = useState(() => {
        if (initialData !== undefined) {
            return initialData;
        }
        return queryFn();
    });
    const [isLoading, setIsLoading] = useState(false);
    const [refetchCount, setRefetchCount] = useState(0);
    // Refetch function
    const refetch = useCallback(() => {
        setIsLoading(true);
        try {
            const newData = queryFn();
            setData(newData);
            setRefetchCount(c => c + 1);
        }
        finally {
            setIsLoading(false);
        }
    }, [queryFn]);
    // Subscribe to events
    useEffect(() => {
        if (!enabled)
            return;
        // Determine which tables to watch
        const tablesToWatch = dependencies.length > 0
            ? dependencies
            : ['feature', 'story', 'task', 'ac', 'session'];
        // Build list of events to subscribe to
        const eventsToWatch = [];
        for (const table of tablesToWatch) {
            const tableEvents = getEventsForTable(table);
            for (const event of tableEvents) {
                eventsToWatch.push(event);
            }
        }
        // Handler that refetches on any relevant event
        const handler = () => {
            setIsLoading(true);
            try {
                const newData = queryFn();
                setData(newData);
                setRefetchCount(c => c + 1);
            }
            finally {
                setIsLoading(false);
            }
        };
        // Subscribe to all relevant events
        for (const event of eventsToWatch) {
            eventBus.on(event, handler);
        }
        // Cleanup subscriptions
        return () => {
            for (const event of eventsToWatch) {
                eventBus.off(event, handler);
            }
        };
    }, [enabled, dependencies.join(','), queryFn]);
    return {
        data,
        isLoading,
        refetchCount,
        refetch,
    };
}
