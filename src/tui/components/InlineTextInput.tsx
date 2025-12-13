/**
 * InlineTextInput Component - Inline text editing for TUI
 *
 * A reusable controlled component for inline text editing in terminal UI.
 * Supports cursor positioning, character insertion/deletion, and navigation.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `attributes={TextAttributes.INVERSE}` for cursor display
 */

import React, { useState, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { type KeyEvent } from '@opentui/core';

/**
 * Props for InlineTextInput component
 */
export interface InlineTextInputProps {
  /** Current text value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when Enter is pressed (confirm edit) */
  onConfirm: () => void;
  /** Callback when Escape is pressed (cancel edit) */
  onCancel: () => void;
  /** Placeholder text when value is empty */
  placeholder?: string;
  /** Whether this input is focused and should handle keyboard events */
  focused: boolean;
}

/**
 * Check if a key event represents a printable character
 * @param event - The key event to check
 * @returns True if the event is a printable character
 */
function isPrintableChar(event: KeyEvent): boolean {
  // Single character keys are usually printable
  if (event.name && event.name.length === 1) {
    // Check if it's an alphanumeric or common symbol
    const code = event.name.charCodeAt(0);
    // Space (32) through tilde (126) are printable ASCII
    return code >= 32 && code <= 126;
  }
  return false;
}

/**
 * InlineTextInput component for inline text editing
 *
 * Provides a focused text input experience with:
 * - Cursor positioning and movement
 * - Character insertion and deletion
 * - Home/End navigation
 * - Enter to confirm, Escape to cancel
 *
 * @param props - Component props
 * @returns InlineTextInput JSX
 *
 * @example
 * ```tsx
 * const [value, setValue] = useState('Hello');
 * const [editing, setEditing] = useState(false);
 *
 * <InlineTextInput
 *   value={value}
 *   onChange={setValue}
 *   onConfirm={() => { saveValue(); setEditing(false); }}
 *   onCancel={() => { setValue(originalValue); setEditing(false); }}
 *   focused={editing}
 *   placeholder="Enter text..."
 * />
 * ```
 */
export function InlineTextInput({
  value,
  onChange,
  onConfirm,
  onCancel,
  placeholder = '',
  focused,
}: InlineTextInputProps) {
  // Cursor position within the text
  const [cursorPos, setCursorPos] = useState(value.length);

  // Ensure cursor position is valid when value changes externally
  useEffect(() => {
    if (cursorPos > value.length) {
      setCursorPos(value.length);
    }
  }, [value, cursorPos]);

  // Reset cursor to end when focus is gained
  useEffect(() => {
    if (focused) {
      setCursorPos(value.length);
    }
  }, [focused]);

  // Handle keyboard events only when focused
  useKeyboard((event: KeyEvent) => {
    if (!focused) return;

    // Confirm with Enter
    if (event.name === 'return') {
      onConfirm();
      return;
    }

    // Cancel with Escape
    if (event.name === 'escape') {
      onCancel();
      return;
    }

    // Delete character before cursor (backspace)
    if (event.name === 'backspace') {
      if (cursorPos > 0) {
        const newValue = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
        onChange(newValue);
        setCursorPos(cursorPos - 1);
      }
      return;
    }

    // Delete character at cursor (delete key)
    if (event.name === 'delete') {
      if (cursorPos < value.length) {
        const newValue = value.slice(0, cursorPos) + value.slice(cursorPos + 1);
        onChange(newValue);
      }
      return;
    }

    // Move cursor left
    if (event.name === 'left') {
      setCursorPos((pos) => Math.max(0, pos - 1));
      return;
    }

    // Move cursor right
    if (event.name === 'right') {
      setCursorPos((pos) => Math.min(value.length, pos + 1));
      return;
    }

    // Move cursor to start (home)
    if (event.name === 'home') {
      setCursorPos(0);
      return;
    }

    // Move cursor to end (end)
    if (event.name === 'end') {
      setCursorPos(value.length);
      return;
    }

    // Insert printable characters at cursor position
    if (isPrintableChar(event)) {
      const char = event.name;
      const newValue = value.slice(0, cursorPos) + char + value.slice(cursorPos);
      onChange(newValue);
      setCursorPos(cursorPos + 1);
      return;
    }
  });

  // Build the display text with cursor
  const renderText = () => {
    // If empty and has placeholder, show placeholder in dim style
    if (value.length === 0 && !focused) {
      return (
        <text fg="gray">
          {placeholder || ' '}
        </text>
      );
    }

    // When focused, show cursor using inverse video
    if (focused) {
      const beforeCursor = value.slice(0, cursorPos);
      const cursorChar = value[cursorPos] || ' '; // Use space if at end
      const afterCursor = value.slice(cursorPos + 1);

      // Build display with cursor shown as inverse video
      // Use a box with backgroundColor for the cursor character
      return (
        <box flexDirection="row">
          {beforeCursor && <text fg="white">{beforeCursor}</text>}
          <box backgroundColor="white">
            <text fg="black">{cursorChar}</text>
          </box>
          {afterCursor && <text fg="white">{afterCursor}</text>}
        </box>
      );
    }

    // Not focused, just show text
    return <text fg="white">{value || placeholder}</text>;
  };

  return (
    <box
      flexDirection="row"
      border={focused}
      borderStyle={focused ? 'single' : undefined}
      borderColor={focused ? 'cyan' : undefined}
      paddingLeft={focused ? 1 : 0}
      paddingRight={focused ? 1 : 0}
      minWidth={Math.max(value.length + 2, placeholder.length + 2, 10)}
    >
      {renderText()}
    </box>
  );
}
