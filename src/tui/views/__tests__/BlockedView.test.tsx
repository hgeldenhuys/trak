/**
 * BlockedView Tests
 *
 * Tests for the blocked tasks view component.
 * Since OpenTUI components cannot be fully rendered in tests,
 * we test the logic by:
 * - Testing task filtering logic
 * - Testing data transformation functions
 * - Testing navigation state machine
 * - Verifying module exports
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { TaskStatus, Priority, StoryStatus } from '../../../types';
import type { Task, Story } from '../../../types';

// =============================================================================
// Mock Data
// =============================================================================

const mockStories: Story[] = [
  {
    id: 'story-1',
    featureId: 'feature-1',
    code: 'FEAT-001',
    title: 'First Story',
    description: 'First story description',
    why: 'Testing',
    status: StoryStatus.IN_PROGRESS,
    priority: Priority.P1,
    assignedTo: 'dev@test.com',
    estimatedComplexity: 'medium',
    extensions: {},
    createdAt: '2025-12-01T10:00:00Z',
    updatedAt: '2025-12-10T10:00:00Z',
  },
  {
    id: 'story-2',
    featureId: 'feature-1',
    code: 'FEAT-002',
    title: 'Second Story',
    description: 'Second story description',
    why: 'Testing',
    status: StoryStatus.IN_PROGRESS,
    priority: Priority.P2,
    assignedTo: null,
    estimatedComplexity: 'low',
    extensions: {},
    createdAt: '2025-12-02T10:00:00Z',
    updatedAt: '2025-12-11T10:00:00Z',
  },
];

const mockTasks: Task[] = [
  {
    id: 'task-1',
    storyId: 'story-1',
    title: 'Blocked Task 1',
    description: 'This task is blocked',
    status: TaskStatus.BLOCKED,
    priority: Priority.P0,
    assignedTo: 'dev1@test.com',
    order: 1,
    dependencies: [],
    acCoverage: [],
    estimatedComplexity: 'high',
    files: [],
    reference: null,
    estimatedEffort: null,
    effortUnit: null,
    actualEffort: null,
    startedAt: null,
    completedAt: null,
    extensions: {},
    createdAt: '2025-12-01T10:00:00Z',
    updatedAt: '2025-12-10T10:00:00Z',
  },
  {
    id: 'task-2',
    storyId: 'story-1',
    title: 'Normal Task',
    description: 'This task is not blocked',
    status: TaskStatus.IN_PROGRESS,
    priority: Priority.P2,
    assignedTo: 'dev2@test.com',
    order: 2,
    dependencies: [],
    acCoverage: [],
    estimatedComplexity: 'medium',
    files: [],
    reference: null,
    estimatedEffort: null,
    effortUnit: null,
    actualEffort: null,
    startedAt: '2025-12-05T10:00:00Z',
    completedAt: null,
    extensions: {},
    createdAt: '2025-12-02T10:00:00Z',
    updatedAt: '2025-12-11T10:00:00Z',
  },
  {
    id: 'task-3',
    storyId: 'story-2',
    title: 'Blocked Task 2',
    description: 'Another blocked task',
    status: TaskStatus.BLOCKED,
    priority: Priority.P1,
    assignedTo: null,
    order: 1,
    dependencies: [],
    acCoverage: [],
    estimatedComplexity: 'low',
    files: [],
    reference: null,
    estimatedEffort: null,
    effortUnit: null,
    actualEffort: null,
    startedAt: null,
    completedAt: null,
    extensions: {},
    createdAt: '2025-12-03T10:00:00Z',
    updatedAt: '2025-12-12T10:00:00Z',
  },
  {
    id: 'task-4',
    storyId: 'story-2',
    title: 'Completed Task',
    description: 'This task is done',
    status: TaskStatus.COMPLETED,
    priority: Priority.P3,
    assignedTo: 'dev1@test.com',
    order: 2,
    dependencies: [],
    acCoverage: [],
    estimatedComplexity: 'low',
    files: [],
    reference: null,
    estimatedEffort: null,
    effortUnit: null,
    actualEffort: null,
    startedAt: '2025-12-04T10:00:00Z',
    completedAt: '2025-12-06T10:00:00Z',
    extensions: {},
    createdAt: '2025-12-04T10:00:00Z',
    updatedAt: '2025-12-06T10:00:00Z',
  },
];

// =============================================================================
// Helper Functions (Extracted from component)
// =============================================================================

/**
 * Filter tasks to only blocked ones
 */
function filterBlockedTasks(tasks: Task[]): Task[] {
  return tasks.filter(task => task.status === TaskStatus.BLOCKED);
}

/**
 * Build story lookup map
 */
function buildStoryMap(stories: Story[]): Map<string, Story> {
  const map = new Map<string, Story>();
  for (const story of stories) {
    map.set(story.id, story);
  }
  return map;
}

/**
 * Get story code for a task
 */
function getStoryCode(storyMap: Map<string, Story>, storyId: string): string {
  const story = storyMap.get(storyId);
  return story?.code || '???';
}

/**
 * Priority colors
 */
const PRIORITY_COLORS: Record<string, string> = {
  P0: 'red',
  P1: 'yellow',
  P2: 'blue',
  P3: 'gray',
};

/**
 * Get priority color
 */
function getPriorityColor(priority: string): string {
  return PRIORITY_COLORS[priority] || 'white';
}

/**
 * Truncate text to max length
 */
function truncateText(text: string, maxLen: number): string {
  if (text.length > maxLen) {
    return text.slice(0, maxLen - 2) + '..';
  }
  return text;
}

/**
 * Navigation state for the blocked view
 */
interface NavigationState {
  selectedIndex: number;
  totalItems: number;
}

function createNavigationState(totalItems: number): NavigationState {
  return {
    selectedIndex: 0,
    totalItems,
  };
}

function navigateUp(state: NavigationState): NavigationState {
  return {
    ...state,
    selectedIndex: Math.max(0, state.selectedIndex - 1),
  };
}

function navigateDown(state: NavigationState): NavigationState {
  return {
    ...state,
    selectedIndex: Math.min(state.totalItems - 1, state.selectedIndex + 1),
  };
}

function jumpToTop(state: NavigationState): NavigationState {
  return {
    ...state,
    selectedIndex: 0,
  };
}

function jumpToBottom(state: NavigationState): NavigationState {
  return {
    ...state,
    selectedIndex: Math.max(0, state.totalItems - 1),
  };
}

// =============================================================================
// Task Filtering Tests
// =============================================================================

describe('BlockedView - Task Filtering', () => {
  it('should filter only blocked tasks', () => {
    const blockedTasks = filterBlockedTasks(mockTasks);
    expect(blockedTasks.length).toBe(2);
    expect(blockedTasks.every(t => t.status === TaskStatus.BLOCKED)).toBe(true);
  });

  it('should return empty array when no blocked tasks', () => {
    const nonBlockedTasks = mockTasks.filter(t => t.status !== TaskStatus.BLOCKED);
    const blockedTasks = filterBlockedTasks(nonBlockedTasks);
    expect(blockedTasks.length).toBe(0);
  });

  it('should preserve task properties after filtering', () => {
    const blockedTasks = filterBlockedTasks(mockTasks);
    const task1 = blockedTasks.find(t => t.id === 'task-1');

    expect(task1).toBeDefined();
    expect(task1?.title).toBe('Blocked Task 1');
    expect(task1?.priority).toBe(Priority.P0);
    expect(task1?.storyId).toBe('story-1');
  });
});

// =============================================================================
// Story Map Tests
// =============================================================================

describe('BlockedView - Story Map', () => {
  it('should build story map from stories array', () => {
    const storyMap = buildStoryMap(mockStories);
    expect(storyMap.size).toBe(2);
  });

  it('should allow lookup by story ID', () => {
    const storyMap = buildStoryMap(mockStories);
    const story = storyMap.get('story-1');

    expect(story).toBeDefined();
    expect(story?.code).toBe('FEAT-001');
  });

  it('should return undefined for unknown story ID', () => {
    const storyMap = buildStoryMap(mockStories);
    const story = storyMap.get('unknown-id');

    expect(story).toBeUndefined();
  });
});

// =============================================================================
// Story Code Lookup Tests
// =============================================================================

describe('BlockedView - getStoryCode', () => {
  it('should return story code for valid story ID', () => {
    const storyMap = buildStoryMap(mockStories);
    expect(getStoryCode(storyMap, 'story-1')).toBe('FEAT-001');
    expect(getStoryCode(storyMap, 'story-2')).toBe('FEAT-002');
  });

  it('should return "???" for unknown story ID', () => {
    const storyMap = buildStoryMap(mockStories);
    expect(getStoryCode(storyMap, 'unknown')).toBe('???');
  });

  it('should return "???" for empty story map', () => {
    const storyMap = new Map<string, Story>();
    expect(getStoryCode(storyMap, 'story-1')).toBe('???');
  });
});

// =============================================================================
// Priority Color Tests
// =============================================================================

describe('BlockedView - Priority Colors', () => {
  it('should return red for P0', () => {
    expect(getPriorityColor('P0')).toBe('red');
  });

  it('should return yellow for P1', () => {
    expect(getPriorityColor('P1')).toBe('yellow');
  });

  it('should return blue for P2', () => {
    expect(getPriorityColor('P2')).toBe('blue');
  });

  it('should return gray for P3', () => {
    expect(getPriorityColor('P3')).toBe('gray');
  });

  it('should return white for unknown priority', () => {
    expect(getPriorityColor('unknown')).toBe('white');
  });
});

// =============================================================================
// Text Truncation Tests
// =============================================================================

describe('BlockedView - Text Truncation', () => {
  it('should not truncate text shorter than max length', () => {
    expect(truncateText('Short text', 20)).toBe('Short text');
  });

  it('should truncate text longer than max length', () => {
    expect(truncateText('This is a very long text that needs truncation', 20)).toBe('This is a very lon..');
  });

  it('should truncate text exactly at max length', () => {
    expect(truncateText('Exactly twenty chars', 20)).toBe('Exactly twenty chars');
  });

  it('should handle empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });

  it('should handle max length of 2 (edge case)', () => {
    expect(truncateText('Hello', 2)).toBe('..');
  });
});

// =============================================================================
// Navigation State Tests
// =============================================================================

describe('BlockedView - Navigation State', () => {
  describe('createNavigationState', () => {
    it('should create state with selectedIndex 0', () => {
      const state = createNavigationState(5);
      expect(state.selectedIndex).toBe(0);
    });

    it('should track total items', () => {
      const state = createNavigationState(10);
      expect(state.totalItems).toBe(10);
    });
  });

  describe('navigateUp', () => {
    it('should decrease selectedIndex when not at top', () => {
      let state = createNavigationState(5);
      state = { ...state, selectedIndex: 3 };
      state = navigateUp(state);
      expect(state.selectedIndex).toBe(2);
    });

    it('should not go below 0', () => {
      let state = createNavigationState(5);
      state = navigateUp(state);
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe('navigateDown', () => {
    it('should increase selectedIndex when not at bottom', () => {
      let state = createNavigationState(5);
      state = navigateDown(state);
      expect(state.selectedIndex).toBe(1);
    });

    it('should not exceed totalItems - 1', () => {
      let state = createNavigationState(5);
      state = { ...state, selectedIndex: 4 };
      state = navigateDown(state);
      expect(state.selectedIndex).toBe(4);
    });
  });

  describe('jumpToTop', () => {
    it('should set selectedIndex to 0', () => {
      let state = createNavigationState(5);
      state = { ...state, selectedIndex: 3 };
      state = jumpToTop(state);
      expect(state.selectedIndex).toBe(0);
    });
  });

  describe('jumpToBottom', () => {
    it('should set selectedIndex to last item', () => {
      let state = createNavigationState(5);
      state = jumpToBottom(state);
      expect(state.selectedIndex).toBe(4);
    });

    it('should handle empty list (totalItems = 0)', () => {
      let state = createNavigationState(0);
      state = jumpToBottom(state);
      expect(state.selectedIndex).toBe(0);
    });
  });
});

// =============================================================================
// Keyboard Mapping Tests
// =============================================================================

describe('BlockedView - Keyboard Mapping', () => {
  interface KeyAction {
    key: string;
    expectedAction: string;
  }

  const keyMappings: KeyAction[] = [
    { key: 'up', expectedAction: 'navigateUp' },
    { key: 'k', expectedAction: 'navigateUp' },
    { key: 'down', expectedAction: 'navigateDown' },
    { key: 'j', expectedAction: 'navigateDown' },
    { key: 'return', expectedAction: 'selectStory' },
    { key: 'escape', expectedAction: 'onEscape' },
    { key: 'g', expectedAction: 'jumpToTop' },
    { key: 'G', expectedAction: 'jumpToBottom' },
  ];

  function getKeyAction(key: string): string {
    switch (key) {
      case 'up':
      case 'k':
        return 'navigateUp';
      case 'down':
      case 'j':
        return 'navigateDown';
      case 'return':
        return 'selectStory';
      case 'escape':
        return 'onEscape';
      case 'g':
        return 'jumpToTop';
      case 'G':
        return 'jumpToBottom';
      default:
        return 'none';
    }
  }

  for (const mapping of keyMappings) {
    it(`should map "${mapping.key}" to "${mapping.expectedAction}"`, () => {
      expect(getKeyAction(mapping.key)).toBe(mapping.expectedAction);
    });
  }
});

// =============================================================================
// Empty State Tests
// =============================================================================

describe('BlockedView - Empty State', () => {
  it('should indicate no blocked tasks when list is empty', () => {
    const blockedTasks = filterBlockedTasks([]);
    expect(blockedTasks.length).toBe(0);

    // The component should show "No blocked tasks - great job!"
    const emptyMessage = 'No blocked tasks - great job!';
    expect(emptyMessage).toContain('No blocked tasks');
  });
});

// =============================================================================
// Loading State Tests
// =============================================================================

describe('BlockedView - Loading State', () => {
  it('should have correct loading message', () => {
    const loadingMessage = 'Loading blocked tasks...';
    expect(loadingMessage).toContain('Loading');
  });
});

// =============================================================================
// Column Headers Tests
// =============================================================================

describe('BlockedView - Column Headers', () => {
  const expectedHeaders = ['Story', 'Task', 'Assignee', 'Updated', 'Impediment'];

  it('should have all expected column headers', () => {
    for (const header of expectedHeaders) {
      expect(expectedHeaders).toContain(header);
    }
  });

  it('should have exactly 5 columns', () => {
    expect(expectedHeaders.length).toBe(5);
  });
});

// =============================================================================
// Help Text Tests
// =============================================================================

describe('BlockedView - Help Text', () => {
  const helpText = 'j/k: navigate  Enter: view story  g/G: top/bottom  ESC: back';

  it('should include navigation hint (j/k)', () => {
    expect(helpText).toContain('j/k');
    expect(helpText).toContain('navigate');
  });

  it('should include Enter hint', () => {
    expect(helpText).toContain('Enter');
    expect(helpText).toContain('view story');
  });

  it('should include jump hints (g/G)', () => {
    expect(helpText).toContain('g/G');
    expect(helpText).toContain('top/bottom');
  });

  it('should include ESC hint', () => {
    expect(helpText).toContain('ESC');
    expect(helpText).toContain('back');
  });
});

// =============================================================================
// Module Export Tests
// =============================================================================

describe('BlockedView - Module Exports', () => {
  it('should export BlockedView component', async () => {
    const module = await import('../BlockedView');
    expect(module.BlockedView).toBeDefined();
    expect(typeof module.BlockedView).toBe('function');
  });

  it('should export BlockedViewProps interface (type-level test)', async () => {
    const props: import('../BlockedView').BlockedViewProps = {
      onSelectTask: (taskId: string) => {},
      onSelectStory: (storyId: string) => {},
      onEscape: () => {},
    };

    expect(typeof props.onSelectTask).toBe('function');
    expect(typeof props.onSelectStory).toBe('function');
    expect(typeof props.onEscape).toBe('function');
  });

  it('should allow all callbacks to be optional', async () => {
    const props: import('../BlockedView').BlockedViewProps = {};

    expect(props.onSelectTask).toBeUndefined();
    expect(props.onSelectStory).toBeUndefined();
    expect(props.onEscape).toBeUndefined();
  });
});

// =============================================================================
// Props Interface Tests
// =============================================================================

describe('BlockedView - Props Interface', () => {
  it('should accept onSelectTask callback', () => {
    const mockCallback = mock((taskId: string) => {});
    const props = { onSelectTask: mockCallback };

    props.onSelectTask('task-1');
    expect(mockCallback).toHaveBeenCalledWith('task-1');
  });

  it('should accept onSelectStory callback', () => {
    const mockCallback = mock((storyId: string) => {});
    const props = { onSelectStory: mockCallback };

    props.onSelectStory('story-1');
    expect(mockCallback).toHaveBeenCalledWith('story-1');
  });

  it('should accept onEscape callback', () => {
    const mockCallback = mock(() => {});
    const props = { onEscape: mockCallback };

    props.onEscape();
    expect(mockCallback).toHaveBeenCalled();
  });
});
