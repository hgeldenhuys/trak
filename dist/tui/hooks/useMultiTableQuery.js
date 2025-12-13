/**
 * useMultiTableQuery Hook - Multi-table reactive data fetching for TUI
 *
 * Provides automatic re-fetching when changes occur on any subscribed table.
 * Subscribes to multiple event types per table and triggers re-queries within 100ms.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { eventBus } from '../../events';
/**
 * Valid event suffixes for each table
 */
const TABLE_EVENTS = {
    feature: ['created', 'updated', 'deleted'],
    story: ['created', 'updated', 'deleted', 'status-changed'],
    task: ['created', 'updated', 'deleted', 'status-changed'],
    ac: ['created', 'updated', 'deleted', 'verified'],
    session: ['started', 'ended', 'updated'],
};
/**
 * Build all event names for given tables
 */
function getEventsForTables(tables) {
    const events = [];
    for (const table of tables) {
        const suffixes = TABLE_EVENTS[table];
        for (const suffix of suffixes) {
            events.push(`${table}:${suffix}`);
        }
    }
    return events;
}
/**
 * Multi-table reactive query hook that automatically refetches data when
 * any of the subscribed tables change.
 *
 * @param queryFn - Function that fetches data (called synchronously)
 * @param tables - Array of table names to subscribe to for changes
 * @returns Query result with data, loading state, refetch function, and lastUpdated timestamp
 *
 * @example
 * ```typescript
 * // Subscribe to task and story changes
 * const { data, isLoading, refetch, lastUpdated } = useMultiTableQuery(
 *   () => taskRepository.findByStoryId(storyId),
 *   ['task', 'story']
 * );
 * ```
 */
export function useMultiTableQuery(queryFn, tables) {
    // Use ref to store latest queryFn to avoid stale closures
    const queryFnRef = useRef(queryFn);
    queryFnRef.current = queryFn;
    // Initialize state with result of queryFn
    const [data, setData] = useState(() => queryFn());
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    // Debounce timer ref for batching rapid events
    const debounceRef = useRef(null);
    // Refetch function with debouncing for rapid event batching
    const refetch = useCallback(() => {
        // Clear any pending debounce
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        setIsLoading(true);
        // Debounce to batch rapid events (within 50ms window)
        debounceRef.current = setTimeout(() => {
            try {
                const newData = queryFnRef.current();
                setData(newData);
                setLastUpdated(new Date());
            }
            finally {
                setIsLoading(false);
            }
            debounceRef.current = null;
        }, 50);
    }, []);
    // Immediate refetch without debouncing (for manual refetch calls)
    const manualRefetch = useCallback(() => {
        // Clear any pending debounce
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
        setIsLoading(true);
        try {
            const newData = queryFnRef.current();
            setData(newData);
            setLastUpdated(new Date());
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    // Subscribe to events
    useEffect(() => {
        // Build list of events to subscribe to
        const eventsToWatch = getEventsForTables(tables);
        // Handler that triggers refetch on any relevant event
        const handler = () => {
            refetch();
        };
        // Subscribe to all relevant events
        for (const event of eventsToWatch) {
            eventBus.on(event, handler);
        }
        // Cleanup subscriptions and any pending debounce
        return () => {
            for (const event of eventsToWatch) {
                eventBus.off(event, handler);
            }
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [tables.join(','), refetch]);
    return {
        data,
        isLoading,
        refetch: manualRefetch,
        lastUpdated,
    };
}
