/**
 * ViewSwitcher - Tab bar component for switching between views
 *
 * Displays available views as tabs with keyboard shortcuts.
 * Highlights the currently active view.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `backgroundColor` for box background colors
 * - Use `attributes={TextAttributes.BOLD}` for bold, not `bold`
 */

import React from 'react';
import { TextAttributes } from '@opentui/core';

/**
 * Available view types
 */
export type ViewType = 'board' | 'story' | 'list';

/**
 * Props for ViewSwitcher component
 */
export interface ViewSwitcherProps {
  /** Currently active view */
  currentView: ViewType;
  /** Callback when view is changed */
  onViewChange?: (view: ViewType) => void;
}

/**
 * View configuration with labels and shortcuts
 */
interface ViewConfig {
  key: ViewType;
  label: string;
  shortcut: string;
}

/**
 * Available views configuration
 */
const VIEWS: ViewConfig[] = [
  { key: 'board', label: 'Board', shortcut: '1' },
  { key: 'story', label: 'Story', shortcut: '2' },
  { key: 'list', label: 'List', shortcut: '3' },
];

/**
 * ViewSwitcher component
 *
 * Renders a horizontal tab bar showing available views.
 * The active view is highlighted with cyan color and bold text.
 *
 * @param props - Component props
 * @returns ViewSwitcher JSX
 *
 * @example
 * ```tsx
 * <ViewSwitcher
 *   currentView="board"
 *   onViewChange={(view) => setCurrentView(view)}
 * />
 * ```
 */
export function ViewSwitcher({
  currentView,
  onViewChange,
}: ViewSwitcherProps) {
  return (
    <box flexDirection="row" gap={2} paddingTop={1} paddingBottom={1} paddingLeft={1} paddingRight={1}>
      {VIEWS.map((view) => {
        const isActive = currentView === view.key;
        return (
          <text
            key={view.key}
            fg={isActive ? 'cyan' : 'gray'}
            attributes={isActive ? TextAttributes.BOLD : undefined}
          >
            {`[${view.shortcut}] ${view.label}`}
          </text>
        );
      })}
      <text fg="gray">  |  TAB: cycle views</text>
    </box>
  );
}

/**
 * Get the next view in the cycle
 *
 * @param current - Current view
 * @param direction - Direction to cycle ('next' or 'prev')
 * @returns The next view in the cycle
 */
export function cycleView(
  current: ViewType,
  direction: 'next' | 'prev'
): ViewType {
  const currentIndex = VIEWS.findIndex((v) => v.key === current);
  if (direction === 'next') {
    return VIEWS[(currentIndex + 1) % VIEWS.length].key;
  } else {
    return VIEWS[(currentIndex - 1 + VIEWS.length) % VIEWS.length].key;
  }
}

/**
 * Get view by shortcut key
 *
 * @param key - Shortcut key ('1', '2', or '3')
 * @returns The view for that shortcut, or undefined
 */
export function getViewByShortcut(key: string): ViewType | undefined {
  const view = VIEWS.find((v) => v.shortcut === key);
  return view?.key;
}
