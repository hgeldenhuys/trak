/**
 * Board View - Kanban board with task columns
 *
 * Displays tasks organized by status: To Do, In Progress, Done
 * (Blocked tasks are shown in the dedicated Blocked view)
 */

import { renderLayout, escapeHtml, truncate } from './layout';
import type { Task, Story } from '../../types';
import { TaskStatus } from '../../types';

export interface BoardViewData {
  tasks: Task[];
  stories: Story[];
}

/**
 * Column configuration
 */
const COLUMNS = [
  { status: TaskStatus.PENDING, title: 'To Do', className: 'todo' },
  { status: TaskStatus.IN_PROGRESS, title: 'In Progress', className: 'in-progress' },
  { status: TaskStatus.COMPLETED, title: 'Done', className: 'done' },
];

/**
 * Build a story lookup map
 */
function buildStoryMap(stories: Story[]): Map<string, Story> {
  const map = new Map<string, Story>();
  for (const story of stories) {
    map.set(story.id, story);
  }
  return map;
}

/**
 * Group tasks by status
 */
function groupTasksByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = {
    [TaskStatus.PENDING]: [],
    [TaskStatus.IN_PROGRESS]: [],
    [TaskStatus.BLOCKED]: [],
    [TaskStatus.COMPLETED]: [],
    [TaskStatus.CANCELLED]: [],
  };

  for (const task of tasks) {
    if (groups[task.status]) {
      groups[task.status].push(task);
    }
  }

  return groups;
}

/**
 * Render a single task card
 */
function renderTaskCard(task: Task, storyMap: Map<string, Story>): string {
  const story = storyMap.get(task.storyId);
  const storyCode = story?.code || '???';
  const priorityClass = task.priority || 'P3';

  return `
    <div class="task-card ${priorityClass}" onclick="window.location.href='/story/${task.storyId}'">
      <div class="story-code">${escapeHtml(storyCode)}</div>
      <div class="task-title">${escapeHtml(truncate(task.title, 60))}</div>
      <div class="task-meta">
        <span class="priority-badge ${priorityClass}">${priorityClass}</span>
        ${task.assignedTo ? `<span class="assignee">${escapeHtml(task.assignedTo)}</span>` : ''}
      </div>
    </div>
  `;
}

/**
 * Render a column
 */
function renderColumn(
  title: string,
  className: string,
  tasks: Task[],
  storyMap: Map<string, Story>
): string {
  return `
    <div class="column ${className}">
      <div class="column-header">
        <h2>${escapeHtml(title)}</h2>
        <span class="count">${tasks.length}</span>
      </div>
      <div class="task-list">
        ${tasks.length === 0
          ? '<div class="empty-state"><p>No tasks</p></div>'
          : tasks.map((task) => renderTaskCard(task, storyMap)).join('')
        }
      </div>
    </div>
  `;
}

/**
 * Render the board view
 */
export function renderBoard(data: BoardViewData): string {
  const { tasks, stories } = data;
  const storyMap = buildStoryMap(stories);
  const tasksByStatus = groupTasksByStatus(tasks);

  // Count blocked tasks for info
  const blockedCount = tasksByStatus[TaskStatus.BLOCKED].length;

  const columnsHtml = COLUMNS.map((col) =>
    renderColumn(col.title, col.className, tasksByStatus[col.status], storyMap)
  ).join('');

  const content = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h2 style="color: var(--accent-cyan);">Kanban Board</h2>
      ${blockedCount > 0 ? `
        <a href="/blocked" style="color: var(--accent-red); font-size: 0.875rem;">
          ${blockedCount} blocked task${blockedCount > 1 ? 's' : ''} - View details
        </a>
      ` : ''}
    </div>
    <div class="kanban">
      ${columnsHtml}
    </div>
  `;

  return renderLayout({
    title: 'Board',
    currentPath: '/board',
    content,
  });
}
