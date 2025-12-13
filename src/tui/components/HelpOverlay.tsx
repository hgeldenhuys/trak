/**
 * HelpOverlay Component - Keyboard shortcut reference overlay
 *
 * Displays a modal overlay with all available keyboard shortcuts.
 * Can be toggled with '?' key and dismissed with Escape or '?'.
 */

import React from 'react';
import { useKeyboard } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';

/**
 * Help content entries
 * Format: [key, description] or ['', ''] for section header or spacing
 */
const HELP_CONTENT: [string, string][] = [
  ['Navigation', ''],
  ['up/k', 'Move up'],
  ['down/j', 'Move down'],
  ['left/h', 'Move left'],
  ['right/l', 'Move right'],
  ['', ''],
  ['Actions', ''],
  ['Enter', 'Select item'],
  ['Space', 'Select item'],
  ['Tab', 'Next view'],
  ['Shift+Tab', 'Previous view'],
  ['1/2/3', 'Jump to view'],
  ['', ''],
  ['General', ''],
  ['Escape', 'Go back'],
  ['?', 'Toggle help'],
  ['q', 'Quit'],
];

/**
 * Props for HelpOverlay component
 */
export interface HelpOverlayProps {
  /** Callback when overlay should close */
  onClose: () => void;
  /** Whether to show the overlay (default: true) */
  visible?: boolean;
}

/**
 * Help overlay component showing keyboard shortcuts
 *
 * @param props - Component props
 * @returns Help overlay JSX
 *
 * @example
 * ```tsx
 * {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
 * ```
 */
export function HelpOverlay({ onClose, visible = true }: HelpOverlayProps) {
  // Handle keyboard events to close overlay
  useKeyboard((event: KeyEvent) => {
    if (!visible) return;

    if (event.name === 'escape' || event.name === '?') {
      onClose();
    }
  });

  if (!visible) return null;

  // Calculate overlay dimensions
  const overlayWidth = 44;
  const overlayHeight = HELP_CONTENT.length + 6;

  // Build help text content
  const helpLines: React.ReactNode[] = [];

  for (let i = 0; i < HELP_CONTENT.length; i++) {
    const [key, desc] = HELP_CONTENT[i];

    if (key === '' && desc === '') {
      // Empty line for spacing
      helpLines.push(
        <text key={`spacing-${i}`}> </text>
      );
    } else if (desc === '') {
      // Section header (use TextAttributes.BOLD for bold text)
      helpLines.push(
        <text key={`header-${i}`} fg="yellow" attributes={TextAttributes.BOLD}>
          {key}
        </text>
      );
    } else {
      // Key-description pair
      helpLines.push(
        <text key={`item-${i}`}>
          <text fg="cyan">{key.padEnd(14)}</text>
          <text fg="white">{desc}</text>
        </text>
      );
    }
  }

  return (
    <box
      position="absolute"
      top={3}
      left={8}
      width={overlayWidth}
      height={overlayHeight}
      border={true}
      borderStyle="double"
      backgroundColor="black"
      flexDirection="column"
      paddingLeft={2}
      paddingRight={2}
      paddingTop={1}
      paddingBottom={1}
    >
      {/* Title */}
      <box flexDirection="row" justifyContent="center" marginBottom={1}>
        <text fg="green" attributes={TextAttributes.BOLD}>
          Keyboard Shortcuts
        </text>
      </box>

      {/* Help content */}
      {helpLines}

      {/* Footer */}
      <box marginTop={1}>
        <text fg="gray">Press ESC or ? to close</text>
      </box>
    </box>
  );
}

/**
 * Compact help bar for footer display
 *
 * Shows essential shortcuts in a single line format
 * suitable for display in a footer bar.
 */
export function HelpBar() {
  return (
    <text fg="gray">
      <text fg="cyan">?</text>
      <text>:help  </text>
      <text fg="cyan">hjkl/arrows</text>
      <text>:nav  </text>
      <text fg="cyan">Enter</text>
      <text>:select  </text>
      <text fg="cyan">Tab</text>
      <text>:views  </text>
      <text fg="cyan">q</text>
      <text>:quit</text>
    </text>
  );
}

/**
 * Hook to manage help overlay visibility
 *
 * Provides state and toggle function for help overlay.
 * Can be used standalone or with HelpOverlay component.
 *
 * @returns Tuple of [isVisible, toggle function]
 *
 * @example
 * ```tsx
 * const [showHelp, toggleHelp] = useHelpOverlay();
 * return (
 *   <>
 *     <HelpOverlay visible={showHelp} onClose={toggleHelp} />
 *     <button onClick={toggleHelp}>?</button>
 *   </>
 * );
 * ```
 */
export function useHelpOverlay(): [boolean, () => void] {
  const [visible, setVisible] = React.useState(false);

  const toggle = React.useCallback(() => {
    setVisible((v) => !v);
  }, []);

  return [visible, toggle];
}
