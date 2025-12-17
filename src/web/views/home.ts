/**
 * Home View - Landing page with overview
 *
 * Shows summary statistics and quick links.
 */

import { renderLayout, escapeHtml } from './layout';
import type { Feature, Story, Task } from '../../types';

export interface HomeViewData {
  features: Feature[];
  stories: Story[];
  tasks: Task[];
}

/**
 * Render the home page
 */
export function renderHome(data: HomeViewData): string {
  const { features, stories, tasks } = data;

  // Calculate statistics
  const storiesByStatus: Record<string, number> = {};
  for (const story of stories) {
    storiesByStatus[story.status] = (storiesByStatus[story.status] || 0) + 1;
  }

  const tasksByStatus: Record<string, number> = {};
  for (const task of tasks) {
    tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
  }

  const content = `
    <h2 style="color: var(--accent-cyan); margin-bottom: 1.5rem;">Dashboard</h2>

    <div class="info-grid" style="margin-bottom: 2rem;">
      <div class="info-item">
        <label>Features</label>
        <div class="value" style="font-size: 2rem; color: var(--accent-blue);">${features.length}</div>
      </div>
      <div class="info-item">
        <label>Stories</label>
        <div class="value" style="font-size: 2rem; color: var(--accent-cyan);">${stories.length}</div>
      </div>
      <div class="info-item">
        <label>Tasks</label>
        <div class="value" style="font-size: 2rem; color: var(--accent-magenta);">${tasks.length}</div>
      </div>
      <div class="info-item">
        <label>Completed Tasks</label>
        <div class="value" style="font-size: 2rem; color: var(--accent-green);">${tasksByStatus['completed'] || 0}</div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem;">
      <!-- Stories Summary -->
      <div class="story-detail">
        <h3 style="color: var(--accent-cyan); margin-bottom: 1rem;">Stories by Status</h3>
        <div class="system-info-grid">
          ${Object.entries(storiesByStatus).map(([status, count]) => `
            <div class="system-info-row">
              <span class="label">${escapeHtml(status)}</span>
              <span class="value">${count}</span>
            </div>
          `).join('')}
          ${Object.keys(storiesByStatus).length === 0 ? '<div class="system-info-row"><span class="label">No stories yet</span></div>' : ''}
        </div>
      </div>

      <!-- Tasks Summary -->
      <div class="story-detail">
        <h3 style="color: var(--accent-cyan); margin-bottom: 1rem;">Tasks by Status</h3>
        <div class="system-info-grid">
          ${Object.entries(tasksByStatus).map(([status, count]) => `
            <div class="system-info-row">
              <span class="label">${escapeHtml(status)}</span>
              <span class="value">${count}</span>
            </div>
          `).join('')}
          ${Object.keys(tasksByStatus).length === 0 ? '<div class="system-info-row"><span class="label">No tasks yet</span></div>' : ''}
        </div>
      </div>

      <!-- Features List -->
      <div class="story-detail">
        <h3 style="color: var(--accent-cyan); margin-bottom: 1rem;">Features</h3>
        ${features.length === 0 ? `
          <p style="color: var(--text-muted);">No features created yet.</p>
        ` : `
          <ul class="ac-list">
            ${features.map((f) => `
              <li class="ac-item">
                <span class="code">${escapeHtml(f.code)}</span>
                <span class="content">${escapeHtml(f.name)}</span>
              </li>
            `).join('')}
          </ul>
        `}
      </div>

      <!-- Quick Actions -->
      <div class="story-detail">
        <h3 style="color: var(--accent-cyan); margin-bottom: 1rem;">Quick Links</h3>
        <ul class="task-list-detail">
          <li class="task-item">
            <a href="/board" style="flex: 1;">View Kanban Board</a>
          </li>
          <li class="task-item">
            <a href="/list" style="flex: 1;">View All Stories</a>
          </li>
          <li class="task-item">
            <a href="/blocked" style="flex: 1;">View Blocked Tasks</a>
          </li>
          <li class="task-item">
            <a href="/retros" style="flex: 1;">View Retrospectives</a>
          </li>
        </ul>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Home',
    currentPath: '/',
    content,
  });
}
