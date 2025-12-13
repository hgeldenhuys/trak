/**
 * App Component - Main TUI Application Shell
 *
 * Manages view state and keyboard navigation for the Board TUI.
 * Provides the top-level container and view switching logic.
 */

import React, { useState, useCallback } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';

// Import views
import { KanbanBoard, StoryDetailView, ListView } from './views';
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
};

/**
 * All available views in cycle order
 */
const VIEWS: ViewType[] = ['board', 'story', 'list'];

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

  // Global keyboard handler
  useKeyboard((event: KeyEvent) => {
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
      } else {
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
          TAB:switch view  1/2/3:jump to view  ESC:back  q:quit
        </text>
      </box>
    </box>
  );
}

// Re-export ViewType from components for backwards compatibility
export type { ViewType } from './components';
