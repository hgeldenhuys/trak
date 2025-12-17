/**
 * Blocked View - View of all blocked tasks
 *
 * Shows all tasks with status='blocked' with:
 * - Task title, story code, assignee
 * - Impediment notes if available
 */

import { renderLayout, escapeHtml, truncate, formatRelativeTime } from './layout';
import type { Task, Story, Impediment } from '../../types';

export interface BlockedViewData {
  tasks: Task[];
  stories: Story[];
  impediments: Impediment[];
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
 * Build impediment lookup map by entity
 */
function buildImpedimentMap(impediments: Impediment[]): Map<string, Impediment[]> {
  const map = new Map<string, Impediment[]>();
  for (const imp of impediments) {
    const key = `${imp.entityType}:${imp.entityId}`;
    const existing = map.get(key) || [];
    existing.push(imp);
    map.set(key, existing);
  }
  return map;
}

/**
 * Get impediment notes for a task
 */
function getImpedimentNotes(taskId: string, impedimentMap: Map<string, Impediment[]>): string {
  const impediments = impedimentMap.get(`task:${taskId}`) || [];
  const openImpediments = impediments.filter(
    (imp) => imp.status === 'open' || imp.status === 'in_progress'
  );

  if (openImpediments.length === 0) {
    return 'No impediment recorded';
  }

  return openImpediments.map((imp) => imp.title).join('; ');
}

/**
 * Render the blocked view
 */
export function renderBlocked(data: BlockedViewData): string {
  const { tasks, stories, impediments } = data;
  const storyMap = buildStoryMap(stories);
  const impedimentMap = buildImpedimentMap(impediments);

  // Filter for blocked tasks
  const blockedTasks = tasks.filter((t) => t.status === 'blocked');

  const content = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h2 style="color: var(--accent-red);">Blocked Tasks</h2>
      <span style="color: var(--text-muted); font-size: 0.875rem;">
        ${blockedTasks.length} blocked
      </span>
    </div>

    ${blockedTasks.length === 0 ? `
      <div class="empty-state">
        <div class="icon" style="color: var(--accent-green);">+</div>
        <p style="color: var(--accent-green);">No blocked tasks - great job!</p>
      </div>
    ` : `
      <table class="list-table">
        <thead>
          <tr>
            <th>Story</th>
            <th>Task</th>
            <th>Assignee</th>
            <th>Updated</th>
            <th>Impediment</th>
          </tr>
        </thead>
        <tbody>
          ${blockedTasks.map((task) => {
            const story = storyMap.get(task.storyId);
            const storyCode = story?.code || '???';
            const impedimentNotes = getImpedimentNotes(task.id, impedimentMap);

            return `
              <tr>
                <td><a href="/story/${task.storyId}">${escapeHtml(storyCode)}</a></td>
                <td>${escapeHtml(truncate(task.title, 40))}</td>
                <td>${task.assignedTo ? escapeHtml(task.assignedTo) : '-'}</td>
                <td style="color: var(--text-muted);">${formatRelativeTime(task.updatedAt)}</td>
                <td class="impediment-note">${escapeHtml(truncate(impedimentNotes, 50))}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `}
  `;

  return renderLayout({
    title: 'Blocked Tasks',
    currentPath: '/blocked',
    content,
  });
}
