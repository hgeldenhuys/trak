import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
/**
 * App Component - Main TUI Application Shell
 *
 * Manages view state and keyboard navigation for the Board TUI.
 * Provides the top-level container and view switching logic.
 */
import { useState, useCallback } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
/**
 * View labels for display
 */
const VIEW_LABELS = {
    board: 'Board View',
    story: 'Story View',
    list: 'List View',
};
/**
 * All available views in cycle order
 */
const VIEWS = ['board', 'story', 'list'];
/**
 * Main App component
 */
export function App() {
    const { width, height } = useTerminalDimensions();
    // Application state
    const [currentView, setCurrentView] = useState('board');
    const [selectedFeatureId, setSelectedFeatureId] = useState(null);
    const [selectedStoryId, setSelectedStoryId] = useState(null);
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    // View cycling
    const cycleView = useCallback((direction) => {
        setCurrentView((current) => {
            const currentIndex = VIEWS.indexOf(current);
            if (direction === 'next') {
                return VIEWS[(currentIndex + 1) % VIEWS.length];
            }
            else {
                return VIEWS[(currentIndex - 1 + VIEWS.length) % VIEWS.length];
            }
        });
    }, []);
    // Global keyboard handler
    useKeyboard((event) => {
        // Quit application
        if (event.name === 'q' && event.ctrl) {
            process.exit(0);
        }
        // Also allow just 'q' when not in input mode
        if (event.name === 'q') {
            process.exit(0);
        }
        // Cycle views with Tab
        if (event.name === 'tab') {
            if (event.shift) {
                cycleView('prev');
            }
            else {
                cycleView('next');
            }
        }
        // Number keys for direct view switching
        if (event.name === '1') {
            setCurrentView('board');
        }
        if (event.name === '2') {
            setCurrentView('story');
        }
        if (event.name === '3') {
            setCurrentView('list');
        }
        // Escape to go back / clear selection
        if (event.name === 'escape') {
            if (selectedTaskId) {
                setSelectedTaskId(null);
            }
            else if (selectedStoryId) {
                setSelectedStoryId(null);
            }
            else if (selectedFeatureId) {
                setSelectedFeatureId(null);
            }
        }
    });
    // Build app state and actions for child components
    const _appState = {
        currentView,
        selectedFeatureId,
        selectedStoryId,
        selectedTaskId,
    };
    const _appActions = {
        setCurrentView,
        selectFeature: setSelectedFeatureId,
        selectStory: setSelectedStoryId,
        selectTask: setSelectedTaskId,
        cycleView,
    };
    // Build view tabs string
    const viewTabsText = VIEWS.map((view, index) => {
        const isActive = currentView === view;
        const prefix = isActive ? '> ' : '  ';
        return `${prefix}[${index + 1}] ${VIEW_LABELS[view]}`;
    }).join('  ');
    return (_jsxs("box", { flexDirection: "column", width: "100%", height: "100%", children: [_jsxs("box", { border: true, borderStyle: "single", paddingLeft: 1, paddingRight: 1, flexDirection: "row", justifyContent: "space-between", children: [_jsx("text", { fg: "cyan", children: "Board TUI" }), _jsxs("text", { fg: "gray", children: [width, "x", height] })] }), _jsx("box", { flexDirection: "row", paddingLeft: 1, paddingRight: 1, children: _jsx("text", { fg: "white", children: viewTabsText }) }), _jsxs("box", { flexDirection: "column", flexGrow: 1, paddingLeft: 1, paddingRight: 1, paddingTop: 1, children: [_jsxs("text", { fg: "white", children: ["Current view: ", VIEW_LABELS[currentView]] }), _jsx("text", { fg: "gray", children: selectedFeatureId ? `Feature: ${selectedFeatureId}` : 'No feature selected' }), _jsx("text", { fg: "gray", children: selectedStoryId ? `Story: ${selectedStoryId}` : 'No story selected' }), _jsx("text", { fg: "gray", children: selectedTaskId ? `Task: ${selectedTaskId}` : 'No task selected' }), _jsx("text", { fg: "gray", children: "Views will be implemented in subsequent tasks." })] }), _jsx("box", { border: true, borderStyle: "single", paddingLeft: 1, paddingRight: 1, flexDirection: "row", children: _jsx("text", { fg: "gray", children: "TAB:switch view  1/2/3:jump to view  ESC:back  q:quit" }) })] }));
}
