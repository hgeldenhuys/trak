/**
 * useNavigation Hook - Keyboard navigation for TUI
 *
 * Manages navigation state for Kanban-style board navigation.
 * Supports arrow keys and vim-style hjkl navigation.
 */
import { useState, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
/**
 * Keyboard navigation hook for TUI board/list navigation
 *
 * Handles:
 * - Arrow keys for navigation
 * - Vim-style hjkl keys
 * - Enter/Space for selection
 * - ? for help toggle
 * - Escape for going back
 *
 * @param options - Navigation configuration
 * @returns Navigation state, actions, and helper functions
 *
 * @example
 * ```typescript
 * const { state, actions, isFocused } = useNavigation({
 *   maxColumns: 4,
 *   getRowCount: (col) => columns[col].items.length,
 *   onSelect: (col, row) => handleSelect(col, row),
 * });
 * ```
 */
export function useNavigation(options) {
    const { maxColumns = 1, getRowCount, onSelect, onEscape, enabled = true, initialColumn = 0, initialRow = 0, } = options;
    const [state, setState] = useState({
        focusedColumn: initialColumn,
        focusedRow: initialRow,
        showHelp: false,
    });
    // Move up (previous row)
    const moveUp = useCallback(() => {
        setState((prev) => {
            const newRow = Math.max(0, prev.focusedRow - 1);
            return { ...prev, focusedRow: newRow };
        });
    }, []);
    // Move down (next row)
    const moveDown = useCallback(() => {
        setState((prev) => {
            const rowCount = getRowCount(prev.focusedColumn);
            const newRow = Math.min(rowCount - 1, prev.focusedRow + 1);
            return { ...prev, focusedRow: Math.max(0, newRow) };
        });
    }, [getRowCount]);
    // Move left (previous column)
    const moveLeft = useCallback(() => {
        setState((prev) => {
            const newColumn = Math.max(0, prev.focusedColumn - 1);
            // Adjust row if new column has fewer items
            const rowCount = getRowCount(newColumn);
            const newRow = Math.min(prev.focusedRow, Math.max(0, rowCount - 1));
            return { ...prev, focusedColumn: newColumn, focusedRow: newRow };
        });
    }, [getRowCount]);
    // Move right (next column)
    const moveRight = useCallback(() => {
        setState((prev) => {
            const newColumn = Math.min(maxColumns - 1, prev.focusedColumn + 1);
            // Adjust row if new column has fewer items
            const rowCount = getRowCount(newColumn);
            const newRow = Math.min(prev.focusedRow, Math.max(0, rowCount - 1));
            return { ...prev, focusedColumn: newColumn, focusedRow: newRow };
        });
    }, [maxColumns, getRowCount]);
    // Select current item
    const select = useCallback(() => {
        if (onSelect) {
            onSelect(state.focusedColumn, state.focusedRow);
        }
    }, [onSelect, state.focusedColumn, state.focusedRow]);
    // Toggle help overlay
    const toggleHelp = useCallback(() => {
        setState((prev) => ({ ...prev, showHelp: !prev.showHelp }));
    }, []);
    // Set focus directly
    const setFocus = useCallback((column, row) => {
        setState((prev) => ({
            ...prev,
            focusedColumn: Math.max(0, Math.min(maxColumns - 1, column)),
            focusedRow: Math.max(0, row),
        }));
    }, [maxColumns]);
    // Reset to initial state
    const reset = useCallback(() => {
        setState({
            focusedColumn: initialColumn,
            focusedRow: initialRow,
            showHelp: false,
        });
    }, [initialColumn, initialRow]);
    // Keyboard handler
    useKeyboard((event) => {
        if (!enabled)
            return;
        // If help is shown, only handle escape and ? to close it
        if (state.showHelp) {
            if (event.name === 'escape' || event.name === '?') {
                toggleHelp();
            }
            return;
        }
        // Navigation - Arrow keys
        if (event.name === 'up') {
            moveUp();
            return;
        }
        if (event.name === 'down') {
            moveDown();
            return;
        }
        if (event.name === 'left') {
            moveLeft();
            return;
        }
        if (event.name === 'right') {
            moveRight();
            return;
        }
        // Navigation - Vim style hjkl
        if (event.name === 'k') {
            moveUp();
            return;
        }
        if (event.name === 'j') {
            moveDown();
            return;
        }
        if (event.name === 'h') {
            moveLeft();
            return;
        }
        if (event.name === 'l') {
            moveRight();
            return;
        }
        // Selection - Enter or Space
        if (event.name === 'return' || event.name === 'space') {
            select();
            return;
        }
        // Help toggle
        if (event.name === '?') {
            toggleHelp();
            return;
        }
        // Escape - go back / call onEscape
        if (event.name === 'escape') {
            if (onEscape) {
                onEscape();
            }
            return;
        }
    });
    // Helper to check if a position is focused
    const isFocused = useCallback((column, row) => {
        return state.focusedColumn === column && state.focusedRow === row;
    }, [state.focusedColumn, state.focusedRow]);
    // Helper to check if a column is focused
    const isColumnFocused = useCallback((column) => {
        return state.focusedColumn === column;
    }, [state.focusedColumn]);
    const actions = {
        moveUp,
        moveDown,
        moveLeft,
        moveRight,
        select,
        toggleHelp,
        setFocus,
        reset,
    };
    return {
        state,
        actions,
        isFocused,
        isColumnFocused,
    };
}
