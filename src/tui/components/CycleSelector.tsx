/**
 * CycleSelector - Generic component for cycling through enum values
 *
 * Used for editing StoryStatus and Priority fields in forms.
 * Supports cycling forward/backward through options with keyboard.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `backgroundColor` for box background colors
 * - Use `attributes={TextAttributes.BOLD}` for bold, not `bold`
 */

import React, { useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';
import { StoryStatus, Priority } from '../../types/enums';

/**
 * Props for CycleSelector component
 */
export interface CycleSelectorProps<T extends string> {
  /** Array of options to cycle through */
  options: T[];
  /** Currently selected value */
  value: T;
  /** Callback when value changes */
  onChange: (value: T) => void;
  /** Whether the component is focused (receives keyboard input) */
  focused: boolean;
  /** Optional custom labels for options (defaults to value itself) */
  labels?: Partial<Record<T, string>>;
  /** Optional custom colors for options */
  colors?: Partial<Record<T, string>>;
  /** Whether to show adjacent values (< current >) */
  showAdjacent?: boolean;
}

/**
 * Default colors for StoryStatus values
 */
const STATUS_COLORS: Record<string, string> = {
  [StoryStatus.DRAFT]: 'gray',
  [StoryStatus.PLANNED]: 'blue',
  [StoryStatus.IN_PROGRESS]: 'yellow',
  [StoryStatus.REVIEW]: 'magenta',
  [StoryStatus.COMPLETED]: 'green',
  [StoryStatus.CANCELLED]: 'red',
  [StoryStatus.ARCHIVED]: 'gray',
};

/**
 * Default colors for Priority values
 */
const PRIORITY_COLORS: Record<string, string> = {
  [Priority.P0]: 'red',
  [Priority.P1]: 'yellow',
  [Priority.P2]: 'blue',
  [Priority.P3]: 'gray',
};

/**
 * Default labels for StoryStatus values
 */
const STATUS_LABELS: Record<string, string> = {
  [StoryStatus.DRAFT]: 'Draft',
  [StoryStatus.PLANNED]: 'Planned',
  [StoryStatus.IN_PROGRESS]: 'In Progress',
  [StoryStatus.REVIEW]: 'Review',
  [StoryStatus.COMPLETED]: 'Completed',
  [StoryStatus.CANCELLED]: 'Cancelled',
  [StoryStatus.ARCHIVED]: 'Archived',
};

/**
 * Default labels for Priority values
 */
const PRIORITY_LABELS: Record<string, string> = {
  [Priority.P0]: 'P0 (Critical)',
  [Priority.P1]: 'P1 (High)',
  [Priority.P2]: 'P2 (Medium)',
  [Priority.P3]: 'P3 (Low)',
};

/**
 * Merge default colors with custom colors based on value type
 */
function getDefaultColors<T extends string>(options: T[]): Partial<Record<T, string>> {
  // Check if options look like StoryStatus values
  if (options.includes('draft' as T) || options.includes('planned' as T)) {
    return STATUS_COLORS as Partial<Record<T, string>>;
  }
  // Check if options look like Priority values
  if (options.includes('P0' as T) || options.includes('P1' as T)) {
    return PRIORITY_COLORS as Partial<Record<T, string>>;
  }
  return {};
}

/**
 * Merge default labels with custom labels based on value type
 */
function getDefaultLabels<T extends string>(options: T[]): Partial<Record<T, string>> {
  // Check if options look like StoryStatus values
  if (options.includes('draft' as T) || options.includes('planned' as T)) {
    return STATUS_LABELS as Partial<Record<T, string>>;
  }
  // Check if options look like Priority values
  if (options.includes('P0' as T) || options.includes('P1' as T)) {
    return PRIORITY_LABELS as Partial<Record<T, string>>;
  }
  return {};
}

/**
 * CycleSelector component
 *
 * A generic component for cycling through enum values with keyboard navigation.
 * Supports forward cycling (space/return) and backward cycling (shift+space).
 * Shows visual indication when focused.
 *
 * @param props - Component props
 * @returns CycleSelector JSX
 *
 * @example
 * ```tsx
 * // Status selector
 * <CycleSelector
 *   options={Object.values(StoryStatus)}
 *   value={status}
 *   onChange={setStatus}
 *   focused={focusedField === 'status'}
 * />
 *
 * // Priority selector with custom labels
 * <CycleSelector
 *   options={Object.values(Priority)}
 *   value={priority}
 *   onChange={setPriority}
 *   focused={focusedField === 'priority'}
 *   labels={{ P0: 'Urgent', P1: 'High', P2: 'Medium', P3: 'Low' }}
 * />
 * ```
 */
export function CycleSelector<T extends string>({
  options,
  value,
  onChange,
  focused,
  labels: customLabels,
  colors: customColors,
  showAdjacent = true,
}: CycleSelectorProps<T>) {
  // Merge custom labels/colors with defaults
  const defaultLabels = getDefaultLabels(options);
  const defaultColors = getDefaultColors(options);
  const labels = { ...defaultLabels, ...customLabels };
  const colors = { ...defaultColors, ...customColors };

  // Get current index
  const currentIndex = options.indexOf(value);

  // Cycle forward through options
  const cycleForward = useCallback(() => {
    const nextIndex = (currentIndex + 1) % options.length;
    onChange(options[nextIndex]);
  }, [currentIndex, options, onChange]);

  // Cycle backward through options
  const cycleBackward = useCallback(() => {
    const prevIndex = (currentIndex - 1 + options.length) % options.length;
    onChange(options[prevIndex]);
  }, [currentIndex, options, onChange]);

  // Keyboard handler - only active when focused
  useKeyboard((event: KeyEvent) => {
    if (!focused) return;

    // Cycle forward with space or return
    if (event.name === 'space' || event.name === 'return') {
      cycleForward();
      return;
    }

    // Cycle backward with left arrow or h (vim-style)
    if (event.name === 'left' || event.name === 'h') {
      cycleBackward();
      return;
    }

    // Cycle forward with right arrow or l (vim-style)
    if (event.name === 'right' || event.name === 'l') {
      cycleForward();
      return;
    }
  });

  // Get display label for a value
  const getLabel = (val: T): string => {
    return labels[val] || val;
  };

  // Get color for a value
  const getColor = (val: T): string => {
    return colors[val] || 'white';
  };

  // Get adjacent values for display
  const getPrevValue = (): T | null => {
    if (options.length <= 1) return null;
    const prevIndex = (currentIndex - 1 + options.length) % options.length;
    return options[prevIndex];
  };

  const getNextValue = (): T | null => {
    if (options.length <= 1) return null;
    const nextIndex = (currentIndex + 1) % options.length;
    return options[nextIndex];
  };

  const prevValue = getPrevValue();
  const nextValue = getNextValue();
  const currentLabel = getLabel(value);
  const currentColor = getColor(value);

  // Render with adjacent values shown
  if (showAdjacent && options.length > 1) {
    return (
      <box
        flexDirection="row"
        backgroundColor={focused ? 'blue' : undefined}
        paddingLeft={1}
        paddingRight={1}
      >
        {/* Previous indicator */}
        <text fg={focused ? 'white' : 'gray'}>{'< '}</text>

        {/* Previous value (dimmed) */}
        {prevValue && (
          <text fg="gray">{getLabel(prevValue).substring(0, 3)}</text>
        )}

        {/* Separator */}
        <text fg="gray">{' | '}</text>

        {/* Current value (highlighted) */}
        <text
          fg={focused ? 'white' : currentColor}
          attributes={TextAttributes.BOLD}
        >
          {currentLabel}
        </text>

        {/* Separator */}
        <text fg="gray">{' | '}</text>

        {/* Next value (dimmed) */}
        {nextValue && (
          <text fg="gray">{getLabel(nextValue).substring(0, 3)}</text>
        )}

        {/* Next indicator */}
        <text fg={focused ? 'white' : 'gray'}>{' >'}</text>
      </box>
    );
  }

  // Simple render without adjacent values
  return (
    <box
      flexDirection="row"
      backgroundColor={focused ? 'blue' : undefined}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Navigation indicator when focused */}
      {focused && <text fg="white">{'< '}</text>}

      {/* Current value */}
      <text
        fg={focused ? 'white' : currentColor}
        attributes={TextAttributes.BOLD}
      >
        {currentLabel}
      </text>

      {/* Navigation indicator when focused */}
      {focused && <text fg="white">{' >'}</text>}
    </box>
  );
}

/**
 * Pre-configured CycleSelector for StoryStatus
 */
export interface StatusSelectorProps {
  value: StoryStatus;
  onChange: (value: StoryStatus) => void;
  focused: boolean;
  showAdjacent?: boolean;
}

export function StatusSelector({
  value,
  onChange,
  focused,
  showAdjacent = true,
}: StatusSelectorProps) {
  // Define status order for cycling (excluding cancelled from normal flow)
  const statusOrder: StoryStatus[] = [
    StoryStatus.DRAFT,
    StoryStatus.PLANNED,
    StoryStatus.IN_PROGRESS,
    StoryStatus.REVIEW,
    StoryStatus.COMPLETED,
  ];

  return (
    <CycleSelector
      options={statusOrder}
      value={value}
      onChange={onChange}
      focused={focused}
      showAdjacent={showAdjacent}
    />
  );
}

/**
 * Pre-configured CycleSelector for Priority
 */
export interface PrioritySelectorProps {
  value: Priority;
  onChange: (value: Priority) => void;
  focused: boolean;
  showAdjacent?: boolean;
}

export function PrioritySelector({
  value,
  onChange,
  focused,
  showAdjacent = true,
}: PrioritySelectorProps) {
  const priorityOrder: Priority[] = [
    Priority.P0,
    Priority.P1,
    Priority.P2,
    Priority.P3,
  ];

  return (
    <CycleSelector
      options={priorityOrder}
      value={value}
      onChange={onChange}
      focused={focused}
      showAdjacent={showAdjacent}
    />
  );
}

/**
 * Helper function to cycle a value forward in an array
 *
 * @param options - Array of options
 * @param current - Current value
 * @returns Next value in the cycle
 */
export function cycleValueForward<T>(options: T[], current: T): T {
  const currentIndex = options.indexOf(current);
  if (currentIndex === -1) return options[0];
  const nextIndex = (currentIndex + 1) % options.length;
  return options[nextIndex];
}

/**
 * Helper function to cycle a value backward in an array
 *
 * @param options - Array of options
 * @param current - Current value
 * @returns Previous value in the cycle
 */
export function cycleValueBackward<T>(options: T[], current: T): T {
  const currentIndex = options.indexOf(current);
  if (currentIndex === -1) return options[options.length - 1];
  const prevIndex = (currentIndex - 1 + options.length) % options.length;
  return options[prevIndex];
}
