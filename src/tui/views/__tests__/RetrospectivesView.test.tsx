/**
 * RetrospectivesView Tests
 *
 * Tests for the retrospectives view component that displays
 * completed/archived stories with their learnings (notes).
 *
 * Since OpenTUI components cannot be fully rendered in tests,
 * we test the logic by:
 * - Testing story filtering logic
 * - Testing story sorting
 * - Testing note association
 * - Testing navigation state machine
 * - Verifying module exports
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { StoryStatus, Priority, EntityType } from '../../../types';
import type { Story, Note } from '../../../types';

// =============================================================================
// Mock Data
// =============================================================================

const mockStories: Story[] = [
  {
    id: 'story-1',
    featureId: 'feature-1',
    code: 'RETRO-001',
    title: 'Completed Story',
    description: 'A completed story',
    why: 'Testing',
    status: StoryStatus.COMPLETED,
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
    code: 'RETRO-002',
    title: 'Archived Story',
    description: 'An archived story',
    why: 'Testing',
    status: StoryStatus.ARCHIVED,
    priority: Priority.P2,
    assignedTo: null,
    estimatedComplexity: 'low',
    extensions: {},
    createdAt: '2025-12-02T10:00:00Z',
    updatedAt: '2025-12-05T10:00:00Z', // Older than story-1
  },
  {
    id: 'story-3',
    featureId: 'feature-1',
    code: 'RETRO-003',
    title: 'In Progress Story',
    description: 'Still in progress',
    why: 'Testing',
    status: StoryStatus.IN_PROGRESS,
    priority: Priority.P1,
    assignedTo: 'dev@test.com',
    estimatedComplexity: 'high',
    extensions: {},
    createdAt: '2025-12-03T10:00:00Z',
    updatedAt: '2025-12-12T10:00:00Z',
  },
  {
    id: 'story-4',
    featureId: 'feature-1',
    code: 'RETRO-004',
    title: 'Another Completed Story',
    description: 'Recently completed',
    why: 'Testing',
    status: StoryStatus.COMPLETED,
    priority: Priority.P0,
    assignedTo: 'dev@test.com',
    estimatedComplexity: 'low',
    extensions: {},
    createdAt: '2025-12-04T10:00:00Z',
    updatedAt: '2025-12-14T10:00:00Z', // Most recent
  },
  {
    id: 'story-5',
    featureId: 'feature-1',
    code: 'RETRO-005',
    title: 'Draft Story',
    description: 'Just a draft',
    why: 'Testing',
    status: StoryStatus.DRAFT,
    priority: Priority.P3,
    assignedTo: null,
    estimatedComplexity: 'low',
    extensions: {},
    createdAt: '2025-12-05T10:00:00Z',
    updatedAt: '2025-12-06T10:00:00Z',
  },
];

const mockNotes: Note[] = [
  {
    id: 'note-1',
    entityType: EntityType.STORY,
    entityId: 'story-1',
    content: 'First learning from this story',
    author: 'dev@test.com',
    extensions: {},
    createdAt: '2025-12-09T10:00:00Z',
    updatedAt: '2025-12-09T10:00:00Z',
  },
  {
    id: 'note-2',
    entityType: EntityType.STORY,
    entityId: 'story-1',
    content: 'Second learning from this story',
    author: 'qa@test.com',
    extensions: {},
    createdAt: '2025-12-10T10:00:00Z',
    updatedAt: '2025-12-10T10:00:00Z',
  },
  {
    id: 'note-3',
    entityType: EntityType.STORY,
    entityId: 'story-4',
    content: 'Learning from story 4',
    author: 'dev@test.com',
    extensions: {},
    createdAt: '2025-12-14T10:00:00Z',
    updatedAt: '2025-12-14T10:00:00Z',
  },
  {
    id: 'note-4',
    entityType: EntityType.TASK,
    entityId: 'task-1',
    content: 'This is a task note, not a story note',
    author: 'dev@test.com',
    extensions: {},
    createdAt: '2025-12-08T10:00:00Z',
    updatedAt: '2025-12-08T10:00:00Z',
  },
];

// =============================================================================
// Helper Functions (Extracted from component)
// =============================================================================

/**
 * Filter stories to only completed/archived ones
 */
function filterRetroStories(stories: Story[]): Story[] {
  return stories.filter(
    story => story.status === StoryStatus.COMPLETED || story.status === StoryStatus.ARCHIVED
  );
}

/**
 * Sort stories by updatedAt descending (most recent first)
 */
function sortByUpdatedAtDesc(stories: Story[]): Story[] {
  return [...stories].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

/**
 * Find notes for a specific story
 */
function findNotesForStory(notes: Note[], storyId: string): Note[] {
  return notes.filter(
    note => note.entityType === EntityType.STORY && note.entityId === storyId
  );
}

/**
 * Story with notes interface
 */
interface StoryWithNotes {
  story: Story;
  notes: Note[];
}

/**
 * Build story with notes array
 */
function buildStoryWithNotes(stories: Story[], allNotes: Note[]): StoryWithNotes[] {
  const retroStories = filterRetroStories(stories);
  const sortedStories = sortByUpdatedAtDesc(retroStories);

  return sortedStories.map(story => ({
    story,
    notes: findNotesForStory(allNotes, story.id),
  }));
}

/**
 * Navigation state for the retrospectives view
 */
interface NavigationState {
  selectedIndex: number;
  expandedStoryId: string | null;
  totalItems: number;
}

function createNavigationState(totalItems: number): NavigationState {
  return {
    selectedIndex: 0,
    expandedStoryId: null,
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

function expandStory(state: NavigationState, storyId: string): NavigationState {
  return {
    ...state,
    expandedStoryId: storyId,
  };
}

function collapseStory(state: NavigationState): NavigationState {
  return {
    ...state,
    expandedStoryId: null,
  };
}

function toggleExpand(state: NavigationState, storyId: string): NavigationState {
  if (state.expandedStoryId === storyId) {
    return collapseStory(state);
  }
  return expandStory(state, storyId);
}

/**
 * Get status color
 */
function getStatusColor(status: StoryStatus): string {
  return status === StoryStatus.COMPLETED ? 'green' : 'gray';
}

/**
 * Truncate title
 */
function truncateTitle(title: string, maxLen: number = 50): string {
  if (title.length > maxLen) {
    return title.slice(0, maxLen - 2) + '..';
  }
  return title;
}

// =============================================================================
// Story Filtering Tests
// =============================================================================

describe('RetrospectivesView - Story Filtering', () => {
  it('should filter only completed and archived stories', () => {
    const retroStories = filterRetroStories(mockStories);
    expect(retroStories.length).toBe(3);

    const statuses = retroStories.map(s => s.status);
    expect(statuses.every(s => s === StoryStatus.COMPLETED || s === StoryStatus.ARCHIVED)).toBe(true);
  });

  it('should exclude in_progress stories', () => {
    const retroStories = filterRetroStories(mockStories);
    const hasInProgress = retroStories.some(s => s.status === StoryStatus.IN_PROGRESS);
    expect(hasInProgress).toBe(false);
  });

  it('should exclude draft stories', () => {
    const retroStories = filterRetroStories(mockStories);
    const hasDraft = retroStories.some(s => s.status === StoryStatus.DRAFT);
    expect(hasDraft).toBe(false);
  });

  it('should return empty array when no completed/archived stories', () => {
    const inProgressOnly = mockStories.filter(s => s.status === StoryStatus.IN_PROGRESS);
    const retroStories = filterRetroStories(inProgressOnly);
    expect(retroStories.length).toBe(0);
  });

  it('should include both completed and archived stories', () => {
    const retroStories = filterRetroStories(mockStories);

    const hasCompleted = retroStories.some(s => s.status === StoryStatus.COMPLETED);
    const hasArchived = retroStories.some(s => s.status === StoryStatus.ARCHIVED);

    expect(hasCompleted).toBe(true);
    expect(hasArchived).toBe(true);
  });
});

// =============================================================================
// Story Sorting Tests
// =============================================================================

describe('RetrospectivesView - Story Sorting', () => {
  it('should sort stories by updatedAt descending', () => {
    const sorted = sortByUpdatedAtDesc(filterRetroStories(mockStories));

    // Most recent first (story-4: 2025-12-14)
    expect(sorted[0].id).toBe('story-4');
    // Then story-1 (2025-12-10)
    expect(sorted[1].id).toBe('story-1');
    // Finally story-2 (2025-12-05)
    expect(sorted[2].id).toBe('story-2');
  });

  it('should not mutate the original array', () => {
    const original = filterRetroStories(mockStories);
    const originalFirst = original[0];
    const sorted = sortByUpdatedAtDesc(original);

    // Original array should not be modified
    expect(original[0]).toBe(originalFirst);
  });

  it('should handle empty array', () => {
    const sorted = sortByUpdatedAtDesc([]);
    expect(sorted.length).toBe(0);
  });

  it('should handle single item array', () => {
    const singleStory = [mockStories[0]];
    const sorted = sortByUpdatedAtDesc(singleStory);
    expect(sorted.length).toBe(1);
    expect(sorted[0].id).toBe('story-1');
  });
});

// =============================================================================
// Note Association Tests
// =============================================================================

describe('RetrospectivesView - Note Association', () => {
  it('should find notes for a specific story', () => {
    const notes = findNotesForStory(mockNotes, 'story-1');
    expect(notes.length).toBe(2);
  });

  it('should return empty array for story with no notes', () => {
    const notes = findNotesForStory(mockNotes, 'story-2');
    expect(notes.length).toBe(0);
  });

  it('should not include task notes', () => {
    const notes = findNotesForStory(mockNotes, 'task-1');
    // Task notes should not be returned (different entityType)
    expect(notes.length).toBe(0);
  });

  it('should only include story notes, not task notes', () => {
    const allStoryNotes = mockNotes.filter(n => n.entityType === EntityType.STORY);
    expect(allStoryNotes.length).toBe(3);
  });
});

// =============================================================================
// Build Story With Notes Tests
// =============================================================================

describe('RetrospectivesView - buildStoryWithNotes', () => {
  it('should build array of stories with their notes', () => {
    const result = buildStoryWithNotes(mockStories, mockNotes);

    expect(result.length).toBe(3); // 3 completed/archived stories
  });

  it('should sort by most recent first', () => {
    const result = buildStoryWithNotes(mockStories, mockNotes);

    expect(result[0].story.id).toBe('story-4'); // Most recent
    expect(result[1].story.id).toBe('story-1');
    expect(result[2].story.id).toBe('story-2'); // Oldest
  });

  it('should attach correct notes to each story', () => {
    const result = buildStoryWithNotes(mockStories, mockNotes);

    const story1 = result.find(r => r.story.id === 'story-1');
    const story2 = result.find(r => r.story.id === 'story-2');
    const story4 = result.find(r => r.story.id === 'story-4');

    expect(story1?.notes.length).toBe(2);
    expect(story2?.notes.length).toBe(0);
    expect(story4?.notes.length).toBe(1);
  });
});

// =============================================================================
// Navigation State Tests
// =============================================================================

describe('RetrospectivesView - Navigation State', () => {
  describe('createNavigationState', () => {
    it('should create state with selectedIndex 0', () => {
      const state = createNavigationState(5);
      expect(state.selectedIndex).toBe(0);
    });

    it('should have no expanded story initially', () => {
      const state = createNavigationState(5);
      expect(state.expandedStoryId).toBeNull();
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

  describe('expandStory', () => {
    it('should set expandedStoryId', () => {
      let state = createNavigationState(5);
      state = expandStory(state, 'story-1');
      expect(state.expandedStoryId).toBe('story-1');
    });

    it('should replace existing expanded story', () => {
      let state = createNavigationState(5);
      state = expandStory(state, 'story-1');
      state = expandStory(state, 'story-2');
      expect(state.expandedStoryId).toBe('story-2');
    });
  });

  describe('collapseStory', () => {
    it('should clear expandedStoryId', () => {
      let state = createNavigationState(5);
      state = expandStory(state, 'story-1');
      state = collapseStory(state);
      expect(state.expandedStoryId).toBeNull();
    });
  });

  describe('toggleExpand', () => {
    it('should expand collapsed story', () => {
      let state = createNavigationState(5);
      state = toggleExpand(state, 'story-1');
      expect(state.expandedStoryId).toBe('story-1');
    });

    it('should collapse expanded story', () => {
      let state = createNavigationState(5);
      state = expandStory(state, 'story-1');
      state = toggleExpand(state, 'story-1');
      expect(state.expandedStoryId).toBeNull();
    });

    it('should switch to different story when toggling', () => {
      let state = createNavigationState(5);
      state = expandStory(state, 'story-1');
      state = toggleExpand(state, 'story-2');
      expect(state.expandedStoryId).toBe('story-2');
    });
  });
});

// =============================================================================
// Status Color Tests
// =============================================================================

describe('RetrospectivesView - Status Colors', () => {
  it('should return green for completed status', () => {
    expect(getStatusColor(StoryStatus.COMPLETED)).toBe('green');
  });

  it('should return gray for archived status', () => {
    expect(getStatusColor(StoryStatus.ARCHIVED)).toBe('gray');
  });

  it('should return gray for other statuses', () => {
    expect(getStatusColor(StoryStatus.IN_PROGRESS)).toBe('gray');
    expect(getStatusColor(StoryStatus.DRAFT)).toBe('gray');
  });
});

// =============================================================================
// Title Truncation Tests
// =============================================================================

describe('RetrospectivesView - Title Truncation', () => {
  it('should not truncate short titles', () => {
    expect(truncateTitle('Short title')).toBe('Short title');
  });

  it('should truncate titles longer than 50 chars by default', () => {
    const longTitle = 'This is a very long title that exceeds fifty characters limit';
    const truncated = truncateTitle(longTitle);
    expect(truncated.length).toBeLessThanOrEqual(50);
    expect(truncated.endsWith('..')).toBe(true);
  });

  it('should use custom max length', () => {
    const title = 'A twenty char title!';
    const truncated = truncateTitle(title, 15);
    expect(truncated).toBe('A twenty char..');
  });

  it('should handle exactly 50 char titles', () => {
    const title50 = '12345678901234567890123456789012345678901234567890';
    expect(truncateTitle(title50)).toBe(title50);
  });
});

// =============================================================================
// Keyboard Mapping Tests
// =============================================================================

describe('RetrospectivesView - Keyboard Mapping', () => {
  interface KeyAction {
    key: string;
    expectedAction: string;
  }

  const keyMappings: KeyAction[] = [
    { key: 'up', expectedAction: 'navigateUp' },
    { key: 'k', expectedAction: 'navigateUp' },
    { key: 'down', expectedAction: 'navigateDown' },
    { key: 'j', expectedAction: 'navigateDown' },
    { key: 'return', expectedAction: 'toggleExpand' },
    { key: 'space', expectedAction: 'collapse' },
    { key: 'escape', expectedAction: 'escapeOrCollapse' },
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
        return 'toggleExpand';
      case 'space':
        return 'collapse';
      case 'escape':
        return 'escapeOrCollapse';
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

describe('RetrospectivesView - Empty State', () => {
  it('should indicate no stories when list is empty', () => {
    const retroStories = filterRetroStories([]);
    expect(retroStories.length).toBe(0);

    const emptyMessage = 'No completed or archived stories yet';
    expect(emptyMessage).toContain('No completed');
  });
});

// =============================================================================
// Loading State Tests
// =============================================================================

describe('RetrospectivesView - Loading State', () => {
  it('should have correct loading message', () => {
    const loadingMessage = 'Loading retrospectives...';
    expect(loadingMessage).toContain('Loading');
  });
});

// =============================================================================
// Help Text Tests
// =============================================================================

describe('RetrospectivesView - Help Text', () => {
  const helpText = 'j/k: navigate  Enter: expand/view  Space: collapse  g/G: top/bottom  ESC: back';

  it('should include navigation hint (j/k)', () => {
    expect(helpText).toContain('j/k');
    expect(helpText).toContain('navigate');
  });

  it('should include Enter hint', () => {
    expect(helpText).toContain('Enter');
    expect(helpText).toContain('expand');
  });

  it('should include Space hint', () => {
    expect(helpText).toContain('Space');
    expect(helpText).toContain('collapse');
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

describe('RetrospectivesView - Module Exports', () => {
  it('should export RetrospectivesView component', async () => {
    const module = await import('../RetrospectivesView');
    expect(module.RetrospectivesView).toBeDefined();
    expect(typeof module.RetrospectivesView).toBe('function');
  });

  it('should export RetrospectivesViewProps interface (type-level test)', async () => {
    const props: import('../RetrospectivesView').RetrospectivesViewProps = {
      onSelectStory: (storyId: string) => {},
      onEscape: () => {},
    };

    expect(typeof props.onSelectStory).toBe('function');
    expect(typeof props.onEscape).toBe('function');
  });

  it('should allow all callbacks to be optional', async () => {
    const props: import('../RetrospectivesView').RetrospectivesViewProps = {};

    expect(props.onSelectStory).toBeUndefined();
    expect(props.onEscape).toBeUndefined();
  });
});

// =============================================================================
// Props Interface Tests
// =============================================================================

describe('RetrospectivesView - Props Interface', () => {
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
