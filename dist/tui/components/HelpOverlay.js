import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
/**
 * HelpOverlay Component - Keyboard shortcut reference overlay
 *
 * Displays a modal overlay with all available keyboard shortcuts.
 * Can be toggled with '?' key and dismissed with Escape or '?'.
 */
import React from 'react';
import { useKeyboard } from '@opentui/react';
import { TextAttributes } from '@opentui/core';
/**
 * Help content entries
 * Format: [key, description] or ['', ''] for section header or spacing
 */
const HELP_CONTENT = [
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
export function HelpOverlay({ onClose, visible = true }) {
    // Handle keyboard events to close overlay
    useKeyboard((event) => {
        if (!visible)
            return;
        if (event.name === 'escape' || event.name === '?') {
            onClose();
        }
    });
    if (!visible)
        return null;
    // Calculate overlay dimensions
    const overlayWidth = 44;
    const overlayHeight = HELP_CONTENT.length + 6;
    // Build help text content
    const helpLines = [];
    for (let i = 0; i < HELP_CONTENT.length; i++) {
        const [key, desc] = HELP_CONTENT[i];
        if (key === '' && desc === '') {
            // Empty line for spacing
            helpLines.push(_jsx("text", { children: " " }, `spacing-${i}`));
        }
        else if (desc === '') {
            // Section header (use TextAttributes.BOLD for bold text)
            helpLines.push(_jsx("text", { fg: "yellow", attributes: TextAttributes.BOLD, children: key }, `header-${i}`));
        }
        else {
            // Key-description pair
            helpLines.push(_jsxs("text", { children: [_jsx("text", { fg: "cyan", children: key.padEnd(14) }), _jsx("text", { fg: "white", children: desc })] }, `item-${i}`));
        }
    }
    return (_jsxs("box", { position: "absolute", top: 3, left: 8, width: overlayWidth, height: overlayHeight, border: true, borderStyle: "double", backgroundColor: "black", flexDirection: "column", paddingLeft: 2, paddingRight: 2, paddingTop: 1, paddingBottom: 1, children: [_jsx("box", { flexDirection: "row", justifyContent: "center", marginBottom: 1, children: _jsx("text", { fg: "green", attributes: TextAttributes.BOLD, children: "Keyboard Shortcuts" }) }), helpLines, _jsx("box", { marginTop: 1, children: _jsx("text", { fg: "gray", children: "Press ESC or ? to close" }) })] }));
}
/**
 * Compact help bar for footer display
 *
 * Shows essential shortcuts in a single line format
 * suitable for display in a footer bar.
 */
export function HelpBar() {
    return (_jsxs("text", { fg: "gray", children: [_jsx("text", { fg: "cyan", children: "?" }), _jsx("text", { children: ":help  " }), _jsx("text", { fg: "cyan", children: "hjkl/arrows" }), _jsx("text", { children: ":nav  " }), _jsx("text", { fg: "cyan", children: "Enter" }), _jsx("text", { children: ":select  " }), _jsx("text", { fg: "cyan", children: "Tab" }), _jsx("text", { children: ":views  " }), _jsx("text", { fg: "cyan", children: "q" }), _jsx("text", { children: ":quit" })] }));
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
export function useHelpOverlay() {
    const [visible, setVisible] = React.useState(false);
    const toggle = React.useCallback(() => {
        setVisible((v) => !v);
    }, []);
    return [visible, toggle];
}
