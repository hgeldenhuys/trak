/**
 * App Component - Main TUI Application Shell
 *
 * Manages view state and keyboard navigation for the Board TUI.
 * Provides the top-level container and view switching logic.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';
import { execSync } from 'child_process';

/**
 * Reset terminal to normal state
 * Restores cursor, exits alternate screen, resets modes
 */
function resetTerminal(): void {
  // Reset sequence: show cursor, exit alternate screen, reset modes
  const resetSequence = [
    '\x1b[?25h',      // Show cursor
    '\x1b[?1049l',    // Exit alternate screen buffer
    '\x1b[?1000l',    // Disable mouse tracking
    '\x1b[?1002l',    // Disable mouse button tracking
    '\x1b[?1003l',    // Disable all mouse tracking
    '\x1b[?1006l',    // Disable SGR mouse mode
    '\x1b[?2004l',    // Disable bracketed paste
    '\x1b[0m',        // Reset all attributes
    '\x1b[H\x1b[J',   // Clear screen (for good measure)
    '\x1bc',          // Full terminal reset (RIS)
  ].join('');

  process.stdout.write(resetSequence);

  // Run stty sane to fully restore terminal state
  try {
    execSync('stty sane', { stdio: 'ignore' });
  } catch {}
}

/**
 * Clean exit with terminal reset
 */
function cleanExit(code: number = 0): void {
  resetTerminal();
  process.exit(code);
}

// Import views
import { KanbanBoard, StoryDetailView, ListView, BlockedView, RetrospectivesView, SystemInfoView, ChartsView, AgentsView, ArchitectureDocsView } from './views';
import { ViewSwitcher } from './components';
import type { ViewType } from './components';
import { useStory } from './hooks';

/**
 * View labels for display
 */
const VIEW_LABELS: Record<ViewType, string> = {
  board: 'Board View',
  story: 'Story View',
  list: 'List View',
  blocked: 'Blocked View',
  retros: 'Retrospectives',
  charts: 'Charts',
  agents: 'Agents',
  archdocs: 'Architecture Docs',
  systeminfo: 'System Info',
};

/**
 * All available views in cycle order
 * Order: Board[1], List[2], Story[3], Blocked[4], Retros[5], Charts[6], Agents[7], ArchDocs[8], System[0]
 */
const VIEWS: ViewType[] = ['board', 'list', 'story', 'blocked', 'retros', 'charts', 'agents', 'archdocs', 'systeminfo'];

/**
 * App state for sharing between components
 */
export interface AppState {
  currentView: ViewType;
  selectedFeatureId: string | null;
  selectedStoryId: string | null;
  selectedTaskId: string | null;
}

/**
 * App actions for state management
 */
export interface AppActions {
  setCurrentView: (view: ViewType) => void;
  selectFeature: (featureId: string | null) => void;
  selectStory: (storyId: string | null) => void;
  selectTask: (taskId: string | null) => void;
  cycleView: (direction: 'next' | 'prev') => void;
}

/**
 * Main App component
 */
export function App() {
  const { width, height } = useTerminalDimensions();

  // Application state
  const [currentView, setCurrentView] = useState<ViewType>('board');
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Fetch selected story for header display
  const { data: selectedStory } = useStory(selectedStoryId || '');

  // View cycling
  const cycleView = useCallback((direction: 'next' | 'prev') => {
    setCurrentView((current: ViewType) => {
      const currentIndex = VIEWS.indexOf(current);
      if (direction === 'next') {
        return VIEWS[(currentIndex + 1) % VIEWS.length];
      } else {
        return VIEWS[(currentIndex - 1 + VIEWS.length) % VIEWS.length];
      }
    });
  }, []);

  // Setup exit handlers on mount
  useEffect(() => {
    // Handle SIGINT (Ctrl+C) and SIGTERM
    const handleSignal = () => cleanExit(0);
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);

    // Handle uncaught exceptions
    const handleError = (err: Error) => {
      resetTerminal();
      console.error('Uncaught error:', err);
      process.exit(1);
    };
    process.on('uncaughtException', handleError);

    return () => {
      process.off('SIGINT', handleSignal);
      process.off('SIGTERM', handleSignal);
      process.off('uncaughtException', handleError);
    };
  }, []);

  // Global keyboard handler
  useKeyboard((event: KeyEvent) => {
    // Quit application
    if (event.name === 'q' && event.ctrl) {
      cleanExit(0);
    }

    // Also allow just 'q' when not in input mode
    if (event.name === 'q') {
      cleanExit(0);
    }

    // Cycle views with Tab
    if (event.name === 'tab') {
      if (event.shift) {
        cycleView('prev');
      } else {
        cycleView('next');
      }
    }

    // Number keys for direct view switching
    // Order: Board[1], List[2], Story[3], Blocked[4], Retros[5], System[0]
    if (event.name === '1') {
      setCurrentView('board');
    }
    if (event.name === '2') {
      setCurrentView('list');
    }
    if (event.name === '3') {
      setCurrentView('story');
    }
    if (event.name === '4') {
      setCurrentView('blocked');
    }
    if (event.name === '5') {
      setCurrentView('retros');
    }
    if (event.name === '6') {
      setCurrentView('charts');
    }
    if (event.name === '7') {
      setCurrentView('agents');
    }
    if (event.name === '8') {
      setCurrentView('archdocs');
    }
    if (event.name === '0') {
      setCurrentView('systeminfo');
    }

    // Escape to go back / clear selection
    if (event.name === 'escape') {
      if (selectedTaskId) {
        setSelectedTaskId(null);
      } else if (selectedStoryId) {
        setSelectedStoryId(null);
      } else if (selectedFeatureId) {
        setSelectedFeatureId(null);
      }
    }
  });

  // Build app state and actions for child components
  const _appState: AppState = {
    currentView,
    selectedFeatureId,
    selectedStoryId,
    selectedTaskId,
  };

  const _appActions: AppActions = {
    setCurrentView,
    selectFeature: setSelectedFeatureId,
    selectStory: setSelectedStoryId,
    selectTask: setSelectedTaskId,
    cycleView,
  };

  // Render the appropriate view based on currentView state
  const renderView = () => {
    switch (currentView) {
      case 'board':
        return (
          <KanbanBoard
            featureId={selectedFeatureId || undefined}
            storyId={selectedStoryId || undefined}
            onSelectTask={(taskId) => setSelectedTaskId(taskId)}
            onSelectStory={(storyId) => {
              setSelectedStoryId(storyId);
              setCurrentView('story');
            }}
            onEscape={() => {
              if (selectedStoryId) {
                setSelectedStoryId(null);
              } else if (selectedFeatureId) {
                setSelectedFeatureId(null);
              }
            }}
          />
        );

      case 'story':
        if (selectedStoryId) {
          return (
            <StoryDetailView
              storyId={selectedStoryId}
              onBack={() => {
                setCurrentView('list');
              }}
              onSelectTask={(taskId) => setSelectedTaskId(taskId)}
              onSelectStory={(storyId) => setSelectedStoryId(storyId)}
            />
          );
        }
        // No story selected, show list to select one
        return (
          <ListView
            featureId={selectedFeatureId || undefined}
            onSelectStory={(storyId) => {
              setSelectedStoryId(storyId);
            }}
            onEscape={() => {
              if (selectedFeatureId) {
                setSelectedFeatureId(null);
              }
            }}
          />
        );

      case 'list':
        return (
          <ListView
            featureId={selectedFeatureId || undefined}
            onSelectStory={(storyId) => {
              setSelectedStoryId(storyId);
              setCurrentView('story');
            }}
            onEscape={() => {
              if (selectedFeatureId) {
                setSelectedFeatureId(null);
              }
            }}
          />
        );

      case 'blocked':
        return (
          <BlockedView
            onSelectTask={(taskId) => setSelectedTaskId(taskId)}
            onSelectStory={(storyId) => {
              setSelectedStoryId(storyId);
              setCurrentView('story');
            }}
            onEscape={() => setCurrentView('board')}
          />
        );

      case 'retros':
        return (
          <RetrospectivesView
            onSelectStory={(storyId) => {
              setSelectedStoryId(storyId);
              setCurrentView('story');
            }}
            onEscape={() => setCurrentView('board')}
          />
        );

      case 'charts':
        return (
          <ChartsView
            onEscape={() => setCurrentView('board')}
          />
        );

      case 'agents':
        return (
          <AgentsView
            onEscape={() => setCurrentView('board')}
          />
        );

      case 'archdocs':
        return (
          <ArchitectureDocsView
            onEscape={() => setCurrentView('board')}
          />
        );

      case 'systeminfo':
        return (
          <SystemInfoView
            onEscape={() => setCurrentView('board')}
          />
        );

      default:
        return <text fg="red">Unknown view: {currentView}</text>;
    }
  };

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box
        border={true}
        borderStyle="single"
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <box flexDirection="row">
          <text fg="cyan" attributes={TextAttributes.BOLD}>Board TUI</text>
          {selectedStory && (
            <text fg="white">{`  |  ${selectedStory.code}: ${selectedStory.title}`}</text>
          )}
        </box>
        <text fg="gray">{width}x{height}</text>
      </box>

      {/* View switcher tabs */}
      <ViewSwitcher
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      {/* Main content area */}
      <box
        flexDirection="column"
        flexGrow={1}
        paddingLeft={1}
        paddingRight={1}
      >
        {renderView()}
      </box>

      {/* Footer / Help bar */}
      <box
        border={true}
        borderStyle="single"
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
      >
        <text fg="gray">
          TAB:switch view  1-8,0:jump to view  ESC:back  q:quit
        </text>
      </box>
    </box>
  );
}

// Re-export ViewType from components for backwards compatibility
export type { ViewType } from './components';
