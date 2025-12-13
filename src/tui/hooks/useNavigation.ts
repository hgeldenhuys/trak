/**
 * useNavigation Hook - Keyboard navigation for TUI
 *
 * Manages navigation state for Kanban-style board navigation.
 * Supports arrow keys and vim-style hjkl navigation.
 */

import { useState, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import type { KeyEvent } from '@opentui/core';

/**
 * Navigation state for board/list navigation
 */
export interface NavigationState {
  /** Currently focused column index (for kanban columns) */
  focusedColumn: number;
  /** Currently focused row/item index within the column/list */
  focusedRow: number;
  /** Whether help overlay is visible */
  showHelp: boolean;
}

/**
 * Navigation actions for programmatic control
 */
export interface NavigationActions {
  /** Move focus up (previous row) */
  moveUp: () => void;
  /** Move focus down (next row) */
  moveDown: () => void;
  /** Move focus left (previous column) */
  moveLeft: () => void;
  /** Move focus right (next column) */
  moveRight: () => void;
  /** Select current item */
  select: () => void;
  /** Toggle help overlay */
  toggleHelp: () => void;
  /** Set focused position directly */
  setFocus: (column: number, row: number) => void;
  /** Reset navigation to initial state */
  reset: () => void;
}

/**
 * Options for useNavigation hook
 */
export interface UseNavigationOptions {
  /** Maximum number of columns (default: 1) */
  maxColumns?: number;
  /** Function to get row count for a given column */
  getRowCount: (column: number) => number;
  /** Callback when item is selected (Enter/Space pressed) */
  onSelect?: (column: number, row: number) => void;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
  /** Whether to enable keyboard handling (default: true) */
  enabled?: boolean;
  /** Initial column (default: 0) */
  initialColumn?: number;
  /** Initial row (default: 0) */
  initialRow?: number;
}

/**
 * Result of useNavigation hook
 */
export interface UseNavigationResult {
  /** Current navigation state */
  state: NavigationState;
  /** Navigation action handlers */
  actions: NavigationActions;
  /** Whether a specific position is focused */
  isFocused: (column: number, row: number) => boolean;
  /** Whether a specific column is focused */
  isColumnFocused: (column: number) => boolean;
}

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
export function useNavigation(options: UseNavigationOptions): UseNavigationResult {
  const {
    maxColumns = 1,
    getRowCount,
    onSelect,
    onEscape,
    enabled = true,
    initialColumn = 0,
    initialRow = 0,
  } = options;

  const [state, setState] = useState<NavigationState>({
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
  const setFocus = useCallback((column: number, row: number) => {
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
  useKeyboard((event: KeyEvent) => {
    if (!enabled) return;

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
  const isFocused = useCallback(
    (column: number, row: number) => {
      return state.focusedColumn === column && state.focusedRow === row;
    },
    [state.focusedColumn, state.focusedRow]
  );

  // Helper to check if a column is focused
  const isColumnFocused = useCallback(
    (column: number) => {
      return state.focusedColumn === column;
    },
    [state.focusedColumn]
  );

  const actions: NavigationActions = {
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
