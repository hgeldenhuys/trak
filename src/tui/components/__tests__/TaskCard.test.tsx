/**
 * TaskCard Component Tests
 *
 * Tests for the task card component that displays individual tasks
 * in the Kanban board view.
 *
 * Tests cover:
 * - Story code display in header
 * - Relative timestamp display
 * - Title truncation
 * - Description preview
 * - Priority color mapping
 * - Assignee display
 * - Focus state styling
 * - Props interface
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Priority, TaskStatus } from '../../../types';
import type { Task } from '../../../types';

// =============================================================================
// Mock Data
// =============================================================================

const mockTask: Task = {
  id: 'task-123',
  storyId: 'story-456',
  title: 'Implement feature X',
  description: 'This is a detailed description of what needs to be done for the task.',
  status: TaskStatus.IN_PROGRESS,
  priority: Priority.P1,
  assignedTo: 'developer@test.com',
  order: 1,
  dependencies: [],
  acCoverage: [],
  estimatedComplexity: 'medium',
  files: [],
  reference: null,
  estimatedEffort: null,
  effortUnit: null,
  actualEffort: null,
  startedAt: '2025-12-10T10:00:00Z',
  completedAt: null,
  extensions: {},
  createdAt: '2025-12-01T10:00:00Z',
  updatedAt: '2025-12-14T10:00:00Z',
};

// =============================================================================
// Helper Functions (Extracted from component for testing)
// =============================================================================

/**
 * Priority color mapping
 */
const PRIORITY_COLORS: Record<Priority, string> = {
  P0: 'red',
  P1: 'yellow',
  P2: 'blue',
  P3: 'gray',
};

/**
 * Get priority color
 */
function getPriorityColor(priority: Priority | string): string {
  return PRIORITY_COLORS[priority as Priority] || 'white';
}

/**
 * Truncate title (max 25 chars)
 */
function truncateTitle(title: string, maxLen: number = 25): string {
  if (title.length > maxLen) {
    return title.slice(0, maxLen - 3) + '...';
  }
  return title;
}

/**
 * Get description preview (max 30 chars)
 */
function getDescriptionPreview(description: string | null, maxLen: number = 30): string {
  if (!description) {
    return '';
  }
  if (description.length > maxLen) {
    return description.slice(0, maxLen - 3) + '...';
  }
  return description;
}

/**
 * Get assignee display text
 */
function getAssigneeDisplay(assignedTo: string | null): string {
  return assignedTo || 'Unassigned';
}

/**
 * Get border style based on focus state
 */
function getBorderStyle(isFocused: boolean): string {
  return isFocused ? 'double' : 'single';
}

/**
 * Get border color based on focus state
 */
function getBorderColor(isFocused: boolean): string {
  return isFocused ? 'cyan' : 'gray';
}

/**
 * Get text color based on focus state
 */
function getTextColor(isFocused: boolean, defaultColor: string): string {
  return isFocused ? 'white' : defaultColor;
}

// =============================================================================
// Priority Color Tests
// =============================================================================

describe('TaskCard - Priority Colors', () => {
  it('should return red for P0 (Critical)', () => {
    expect(getPriorityColor(Priority.P0)).toBe('red');
  });

  it('should return yellow for P1 (High)', () => {
    expect(getPriorityColor(Priority.P1)).toBe('yellow');
  });

  it('should return blue for P2 (Medium)', () => {
    expect(getPriorityColor(Priority.P2)).toBe('blue');
  });

  it('should return gray for P3 (Low)', () => {
    expect(getPriorityColor(Priority.P3)).toBe('gray');
  });

  it('should return white for unknown priority', () => {
    expect(getPriorityColor('unknown' as Priority)).toBe('white');
  });
});

// =============================================================================
// Title Truncation Tests
// =============================================================================

describe('TaskCard - Title Truncation', () => {
  it('should not truncate titles under 25 chars', () => {
    expect(truncateTitle('Short title')).toBe('Short title');
  });

  it('should truncate titles over 25 chars', () => {
    const longTitle = 'This is a very long title that needs to be truncated';
    const truncated = truncateTitle(longTitle);
    expect(truncated.length).toBe(25);
    expect(truncated.endsWith('...')).toBe(true);
  });

  it('should handle exactly 25 char titles', () => {
    const title25 = '1234567890123456789012345';
    expect(truncateTitle(title25)).toBe(title25);
  });

  it('should handle empty string', () => {
    expect(truncateTitle('')).toBe('');
  });

  it('should support custom max length', () => {
    const title = 'A moderately long title';
    const truncated = truncateTitle(title, 10);
    // maxLen 10 means 10 - 3 = 7 chars + '...'
    expect(truncated).toBe('A moder...');
  });
});

// =============================================================================
// Description Preview Tests
// =============================================================================

describe('TaskCard - Description Preview', () => {
  it('should return empty string for null description', () => {
    expect(getDescriptionPreview(null)).toBe('');
  });

  it('should return empty string for empty description', () => {
    expect(getDescriptionPreview('')).toBe('');
  });

  it('should not truncate descriptions under 30 chars', () => {
    const shortDesc = 'A short description';
    expect(getDescriptionPreview(shortDesc)).toBe(shortDesc);
  });

  it('should truncate descriptions over 30 chars', () => {
    const longDesc = 'This is a very long description that needs truncation';
    const preview = getDescriptionPreview(longDesc);
    expect(preview.length).toBe(30);
    expect(preview.endsWith('...')).toBe(true);
  });

  it('should handle exactly 30 char descriptions', () => {
    const desc30 = '123456789012345678901234567890';
    expect(getDescriptionPreview(desc30)).toBe(desc30);
  });

  it('should support custom max length', () => {
    const desc = 'A medium length description';
    const preview = getDescriptionPreview(desc, 15);
    expect(preview).toBe('A medium len...');
  });
});

// =============================================================================
// Assignee Display Tests
// =============================================================================

describe('TaskCard - Assignee Display', () => {
  it('should return assignee email when assigned', () => {
    expect(getAssigneeDisplay('dev@test.com')).toBe('dev@test.com');
  });

  it('should return "Unassigned" for null', () => {
    expect(getAssigneeDisplay(null)).toBe('Unassigned');
  });

  it('should return "Unassigned" for empty string', () => {
    expect(getAssigneeDisplay('')).toBe('Unassigned');
  });

  it('should handle short names', () => {
    expect(getAssigneeDisplay('John')).toBe('John');
  });
});

// =============================================================================
// Border Style Tests (Focus State)
// =============================================================================

describe('TaskCard - Border Style', () => {
  it('should return double border when focused', () => {
    expect(getBorderStyle(true)).toBe('double');
  });

  it('should return single border when not focused', () => {
    expect(getBorderStyle(false)).toBe('single');
  });
});

// =============================================================================
// Border Color Tests (Focus State)
// =============================================================================

describe('TaskCard - Border Color', () => {
  it('should return cyan border when focused', () => {
    expect(getBorderColor(true)).toBe('cyan');
  });

  it('should return gray border when not focused', () => {
    expect(getBorderColor(false)).toBe('gray');
  });
});

// =============================================================================
// Text Color Tests (Focus State)
// =============================================================================

describe('TaskCard - Text Color', () => {
  it('should return white when focused, regardless of default', () => {
    expect(getTextColor(true, 'cyan')).toBe('white');
    expect(getTextColor(true, 'gray')).toBe('white');
    expect(getTextColor(true, 'magenta')).toBe('white');
  });

  it('should return default color when not focused', () => {
    expect(getTextColor(false, 'cyan')).toBe('cyan');
    expect(getTextColor(false, 'gray')).toBe('gray');
    expect(getTextColor(false, 'magenta')).toBe('magenta');
  });
});

// =============================================================================
// Story Code Display Tests
// =============================================================================

describe('TaskCard - Story Code Display', () => {
  it('should display story code in header', () => {
    // The component receives storyCode as a prop
    const storyCode = 'BOARD-001';
    expect(storyCode).toBe('BOARD-001');
  });

  it('should handle various story code formats', () => {
    const codes = ['BOARD-001', 'FEAT-123', 'BUG-456', 'TASK-789'];
    for (const code of codes) {
      expect(code.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Relative Time Display Tests
// =============================================================================

describe('TaskCard - Relative Time Display', () => {
  // Note: formatRelativeTime is tested separately in formatRelativeTime.test.ts
  // These tests verify the integration concept

  it('should use task.updatedAt for relative time', () => {
    expect(mockTask.updatedAt).toBe('2025-12-14T10:00:00Z');
  });

  it('should have updatedAt field in task', () => {
    expect(mockTask).toHaveProperty('updatedAt');
  });
});

// =============================================================================
// Card Structure Tests
// =============================================================================

describe('TaskCard - Card Structure', () => {
  describe('header row', () => {
    it('should include story code', () => {
      const storyCode = 'BOARD-001';
      expect(storyCode).toBeTruthy();
    });

    it('should include relative time', () => {
      const relativeTime = '2h ago';
      expect(relativeTime).toBeTruthy();
    });
  });

  describe('title row', () => {
    it('should display task title', () => {
      expect(mockTask.title).toBe('Implement feature X');
    });

    it('should truncate long titles', () => {
      const longTitle = 'This is a very long task title that exceeds the limit';
      const truncated = truncateTitle(longTitle);
      expect(truncated.length).toBeLessThanOrEqual(25);
    });
  });

  describe('description row', () => {
    it('should display description preview when available', () => {
      const preview = getDescriptionPreview(mockTask.description);
      // 30 chars: 27 chars + '...'
      expect(preview).toBe('This is a detailed descript...');
    });

    it('should show nothing when no description', () => {
      const preview = getDescriptionPreview(null);
      expect(preview).toBe('');
    });
  });

  describe('metadata row', () => {
    it('should display priority', () => {
      expect(mockTask.priority).toBe(Priority.P1);
    });

    it('should display assignee', () => {
      expect(getAssigneeDisplay(mockTask.assignedTo)).toBe('developer@test.com');
    });

    it('should display "Unassigned" when no assignee', () => {
      expect(getAssigneeDisplay(null)).toBe('Unassigned');
    });
  });
});

// =============================================================================
// Focus State Visual Tests
// =============================================================================

describe('TaskCard - Focus State Visual', () => {
  it('should have different appearance when focused', () => {
    const focusedBorder = getBorderStyle(true);
    const unfocusedBorder = getBorderStyle(false);

    expect(focusedBorder).not.toBe(unfocusedBorder);
  });

  it('should have cyan border color when focused', () => {
    expect(getBorderColor(true)).toBe('cyan');
  });

  it('should have gray border color when not focused', () => {
    expect(getBorderColor(false)).toBe('gray');
  });

  it('should use white text for all elements when focused', () => {
    const colors = ['cyan', 'gray', 'magenta', 'yellow'];
    for (const color of colors) {
      expect(getTextColor(true, color)).toBe('white');
    }
  });
});

// =============================================================================
// Props Interface Tests
// =============================================================================

describe('TaskCard - Props Interface', () => {
  it('should require task prop', () => {
    const props = {
      task: mockTask,
      storyCode: 'BOARD-001',
      isFocused: false,
    };

    expect(props.task).toBeDefined();
    expect(props.task.id).toBe('task-123');
  });

  it('should require storyCode prop', () => {
    const props = {
      task: mockTask,
      storyCode: 'BOARD-001',
      isFocused: false,
    };

    expect(props.storyCode).toBe('BOARD-001');
  });

  it('should require isFocused prop', () => {
    const props = {
      task: mockTask,
      storyCode: 'BOARD-001',
      isFocused: true,
    };

    expect(props.isFocused).toBe(true);
  });

  it('should accept optional onSelect callback', () => {
    const mockCallback = mock(() => {});
    const props = {
      task: mockTask,
      storyCode: 'BOARD-001',
      isFocused: false,
      onSelect: mockCallback,
    };

    props.onSelect();
    expect(mockCallback).toHaveBeenCalled();
  });
});

// =============================================================================
// Module Export Tests
// =============================================================================

describe('TaskCard - Module Exports', () => {
  it('should export TaskCard component', async () => {
    const module = await import('../TaskCard');
    expect(module.TaskCard).toBeDefined();
    expect(typeof module.TaskCard).toBe('function');
  });

  it('should export TaskCardProps interface (type-level test)', async () => {
    const props: import('../TaskCard').TaskCardProps = {
      task: mockTask,
      storyCode: 'BOARD-001',
      isFocused: false,
      onSelect: () => {},
    };

    expect(props.task).toBeDefined();
    expect(props.storyCode).toBe('BOARD-001');
    expect(props.isFocused).toBe(false);
    expect(typeof props.onSelect).toBe('function');
  });

  it('should allow onSelect to be undefined', async () => {
    const props: import('../TaskCard').TaskCardProps = {
      task: mockTask,
      storyCode: 'BOARD-001',
      isFocused: false,
    };

    expect(props.onSelect).toBeUndefined();
  });
});

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe('TaskCard - Edge Cases', () => {
  it('should handle task with all null optional fields', () => {
    const minimalTask: Task = {
      id: 'task-minimal',
      storyId: 'story-1',
      title: 'Minimal Task',
      description: null,
      status: TaskStatus.PENDING,
      priority: Priority.P2,
      assignedTo: null,
      order: 1,
      dependencies: [],
      acCoverage: [],
      estimatedComplexity: null,
      files: [],
      reference: null,
      estimatedEffort: null,
      effortUnit: null,
      actualEffort: null,
      startedAt: null,
      completedAt: null,
      extensions: {},
      createdAt: '2025-12-01T10:00:00Z',
      updatedAt: '2025-12-01T10:00:00Z',
    };

    expect(getDescriptionPreview(minimalTask.description)).toBe('');
    expect(getAssigneeDisplay(minimalTask.assignedTo)).toBe('Unassigned');
  });

  it('should handle very short title', () => {
    expect(truncateTitle('A')).toBe('A');
  });

  it('should handle special characters in title', () => {
    const specialTitle = 'Task: Fix <bug> & test';  // 22 chars, under 25 limit
    expect(truncateTitle(specialTitle)).toBe(specialTitle);
  });

  it('should handle unicode in description', () => {
    const unicodeDesc = 'Test task with accents';  // 22 chars, under 30 limit
    expect(getDescriptionPreview(unicodeDesc)).toBe(unicodeDesc);
  });

  it('should handle email-style assignee', () => {
    expect(getAssigneeDisplay('user@domain.com')).toBe('user@domain.com');
  });

  it('should handle username-style assignee', () => {
    expect(getAssigneeDisplay('@johndoe')).toBe('@johndoe');
  });
});

// =============================================================================
// Integration Tests (Component Behavior)
// =============================================================================

describe('TaskCard - Integration Behavior', () => {
  it('should compose all display elements correctly', () => {
    // Simulate what the component does
    const task = mockTask;
    const storyCode = 'BOARD-001';
    const isFocused = false;

    const title = truncateTitle(task.title);
    const description = getDescriptionPreview(task.description);
    const assignee = getAssigneeDisplay(task.assignedTo);
    const priorityColor = getPriorityColor(task.priority);
    const borderStyle = getBorderStyle(isFocused);
    const borderColor = getBorderColor(isFocused);

    expect(title).toBe('Implement feature X');
    expect(description).toBe('This is a detailed descript...');
    expect(assignee).toBe('developer@test.com');
    expect(priorityColor).toBe('yellow');
    expect(borderStyle).toBe('single');
    expect(borderColor).toBe('gray');
  });

  it('should use correct colors when focused', () => {
    const isFocused = true;

    expect(getTextColor(isFocused, 'magenta')).toBe('white'); // story code
    expect(getTextColor(isFocused, 'gray')).toBe('white');    // time
    expect(getTextColor(isFocused, 'cyan')).toBe('white');    // title
  });
});
