/**
 * useEditMode Hook - Vim-style modal editing state management
 *
 * Manages view/edit mode state transitions for vim-style modal editing in TUI.
 * Supports field navigation and edit mode toggling with keyboard shortcuts.
 */

import { useState, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import type { KeyEvent } from '@opentui/core';

/**
 * Edit mode state
 */
export interface EditModeState {
  /** Current mode: 'view' for navigation, 'edit' for field editing */
  mode: 'view' | 'edit';
  /** Currently focused field index (0-based) */
  focusedFieldIndex: number;
  /** Total number of editable fields */
  totalFields: number;
  /** Convenience property: true when mode === 'edit' */
  isEditing: boolean;
}

/**
 * Edit mode action handlers
 */
export interface EditModeActions {
  /** Enter edit mode from view mode */
  enterEditMode: () => void;
  /** Exit edit mode and return to view mode */
  exitEditMode: () => void;
  /** Set the focused field index directly */
  setFocusedField: (index: number) => void;
  /** Move to next field (wraps to first if at end) */
  nextField: () => void;
  /** Move to previous field (wraps to last if at beginning) */
  prevField: () => void;
}

/**
 * Options for useEditMode hook
 */
export interface UseEditModeOptions {
  /** Total number of editable fields */
  totalFields: number;
  /** Callback when entering edit mode */
  onEnterEdit?: () => void;
  /** Callback when exiting edit mode */
  onExitEdit?: () => void;
  /** Callback when confirm key (return) is pressed on a field */
  onConfirm?: (fieldIndex: number) => void;
  /** Whether to enable keyboard handling (default: true) */
  enabled?: boolean;
}

/**
 * Result type for useEditMode hook
 */
export type UseEditModeResult = [EditModeState, EditModeActions];

/**
 * Vim-style modal editing hook for TUI forms and editors
 *
 * Key mappings:
 * - `e` - Enter edit mode (from view mode only)
 * - `escape` - Exit edit mode / cancel
 * - `j` / `down` - Move to next field
 * - `k` / `up` - Move to previous field
 * - `return` - Confirm current field edit
 *
 * @param options - Edit mode configuration
 * @returns Tuple of [state, actions]
 *
 * @example
 * ```typescript
 * const [state, actions] = useEditMode({
 *   totalFields: 3,
 *   onEnterEdit: () => console.log('Entered edit mode'),
 *   onExitEdit: () => console.log('Exited edit mode'),
 *   onConfirm: (index) => console.log(`Confirmed field ${index}`),
 * });
 *
 * // Check current state
 * if (state.isEditing) {
 *   // Show field editor for state.focusedFieldIndex
 * }
 *
 * // Programmatic control
 * actions.enterEditMode();
 * actions.nextField();
 * actions.exitEditMode();
 * ```
 */
export function useEditMode(options: UseEditModeOptions): UseEditModeResult {
  const {
    totalFields,
    onEnterEdit,
    onExitEdit,
    onConfirm,
    enabled = true,
  } = options;

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [focusedFieldIndex, setFocusedFieldIndex] = useState(0);

  // Enter edit mode
  const enterEditMode = useCallback(() => {
    setMode('edit');
    if (onEnterEdit) {
      onEnterEdit();
    }
  }, [onEnterEdit]);

  // Exit edit mode
  const exitEditMode = useCallback(() => {
    setMode('view');
    if (onExitEdit) {
      onExitEdit();
    }
  }, [onExitEdit]);

  // Set focused field directly
  const setFocusedField = useCallback((index: number) => {
    if (totalFields === 0) return;
    // Clamp to valid range
    const clampedIndex = Math.max(0, Math.min(totalFields - 1, index));
    setFocusedFieldIndex(clampedIndex);
  }, [totalFields]);

  // Move to next field (wraps)
  const nextField = useCallback(() => {
    if (totalFields === 0) return;
    setFocusedFieldIndex((prev) => (prev + 1) % totalFields);
  }, [totalFields]);

  // Move to previous field (wraps)
  const prevField = useCallback(() => {
    if (totalFields === 0) return;
    setFocusedFieldIndex((prev) => (prev - 1 + totalFields) % totalFields);
  }, [totalFields]);

  // Handle confirm action
  const handleConfirm = useCallback(() => {
    if (onConfirm) {
      onConfirm(focusedFieldIndex);
    }
  }, [onConfirm, focusedFieldIndex]);

  // Keyboard handler
  useKeyboard((event: KeyEvent) => {
    if (!enabled) return;

    // In view mode: only 'e' enters edit mode
    if (mode === 'view') {
      if (event.name === 'e') {
        enterEditMode();
        return;
      }
      // Other keys in view mode pass through to other handlers
      // (don't return early - let other useKeyboard hooks process)
    }

    // In edit mode: handle navigation and exit
    if (mode === 'edit') {
      // Exit edit mode
      if (event.name === 'escape') {
        exitEditMode();
        return;
      }

      // Navigation - j/down for next
      if (event.name === 'j' || event.name === 'down') {
        nextField();
        return;
      }

      // Navigation - k/up for previous
      if (event.name === 'k' || event.name === 'up') {
        prevField();
        return;
      }

      // Confirm current field
      if (event.name === 'return') {
        handleConfirm();
        return;
      }
    }
  });

  // Build state object
  const state: EditModeState = {
    mode,
    focusedFieldIndex,
    totalFields,
    isEditing: mode === 'edit',
  };

  // Build actions object
  const actions: EditModeActions = {
    enterEditMode,
    exitEditMode,
    setFocusedField,
    nextField,
    prevField,
  };

  return [state, actions];
}
