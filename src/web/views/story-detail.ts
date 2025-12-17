/**
 * Story Detail View - Detailed view of a single story
 *
 * Shows comprehensive story information including:
 * - Story code, title, status, priority
 * - Description and why
 * - Acceptance criteria with status
 * - Tasks with status
 */

import { renderLayout, escapeHtml, formatRelativeTime } from './layout';
import type { Story, Task, AcceptanceCriteria } from '../../types';

export interface StoryDetailViewData {
  story: Story;
  tasks: Task[];
  acceptanceCriteria: AcceptanceCriteria[];
}

/**
 * Get status icon
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed':
    case 'verified':
      return '[x]';
    case 'in_progress':
      return '[>]';
    case 'blocked':
    case 'failed':
      return '[!]';
    default:
      return '[ ]';
  }
}

/**
 * Get status icon class
 */
function getStatusIconClass(status: string): string {
  switch (status) {
    case 'completed':
    case 'verified':
      return 'completed';
    case 'in_progress':
      return 'in_progress';
    case 'blocked':
    case 'failed':
      return 'blocked';
    default:
      return 'pending';
  }
}

/**
 * Render acceptance criteria list
 */
function renderAcceptanceCriteria(criteria: AcceptanceCriteria[]): string {
  if (criteria.length === 0) {
    return '<p style="color: var(--text-muted);">No acceptance criteria defined</p>';
  }

  const verifiedCount = criteria.filter((ac) => ac.status === 'verified').length;

  return `
    <p style="color: var(--text-muted); margin-bottom: 0.5rem; font-size: 0.875rem;">
      ${verifiedCount}/${criteria.length} verified
    </p>
    <ul class="ac-list">
      ${criteria.map((ac) => `
        <li class="ac-item">
          <span class="icon ${getStatusIconClass(ac.status)}">${getStatusIcon(ac.status)}</span>
          <span class="content">
            <span class="code">${escapeHtml(ac.code)}:</span>
            ${escapeHtml(ac.description)}
          </span>
        </li>
      `).join('')}
    </ul>
  `;
}

/**
 * Render tasks list
 */
function renderTasks(tasks: Task[]): string {
  if (tasks.length === 0) {
    return '<p style="color: var(--text-muted);">No tasks defined</p>';
  }

  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  return `
    <p style="color: var(--text-muted); margin-bottom: 0.5rem; font-size: 0.875rem;">
      ${completedCount}/${tasks.length} completed
    </p>
    <ul class="task-list-detail">
      ${tasks.map((task) => `
        <li class="task-item">
          <span class="icon ${getStatusIconClass(task.status)}">${getStatusIcon(task.status)}</span>
          <div class="content">
            <div class="title">${escapeHtml(task.title)}</div>
            <div class="meta">
              <span class="priority-badge ${task.priority}">${task.priority}</span>
              ${task.assignedTo ? ` - ${escapeHtml(task.assignedTo)}` : ''}
              ${task.estimatedComplexity ? ` - ${task.estimatedComplexity} complexity` : ''}
            </div>
          </div>
        </li>
      `).join('')}
    </ul>
  `;
}

/**
 * Render the story detail view
 */
export function renderStoryDetail(data: StoryDetailViewData): string {
  const { story, tasks, acceptanceCriteria } = data;

  const content = `
    <div style="margin-bottom: 1rem;">
      <a href="/board" style="color: var(--text-muted); font-size: 0.875rem;">&larr; Back to Board</a>
    </div>

    <div class="story-detail">
      <div class="story-header">
        <div>
          <div class="code">${escapeHtml(story.code)}</div>
          <div class="title">${escapeHtml(story.title)}</div>
        </div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span class="status-badge ${story.status}">${escapeHtml(story.status)}</span>
          <span class="priority-badge ${story.priority}">${story.priority}</span>
        </div>
      </div>

      <div class="info-grid" style="margin-bottom: 1.5rem;">
        <div class="info-item">
          <label>Assigned To</label>
          <div class="value">${story.assignedTo ? escapeHtml(story.assignedTo) : '-'}</div>
        </div>
        <div class="info-item">
          <label>Complexity</label>
          <div class="value">${story.estimatedComplexity || '-'}</div>
        </div>
        <div class="info-item">
          <label>Created</label>
          <div class="value">${formatRelativeTime(story.createdAt)}</div>
        </div>
        <div class="info-item">
          <label>Updated</label>
          <div class="value">${formatRelativeTime(story.updatedAt)}</div>
        </div>
      </div>

      <div class="story-section">
        <h3>Description</h3>
        <p>${escapeHtml(story.description) || '<span style="color: var(--text-muted);">No description</span>'}</p>
      </div>

      <div class="story-section">
        <h3>Why</h3>
        <p>${escapeHtml(story.why) || '<span style="color: var(--text-muted);">No context provided</span>'}</p>
      </div>

      <div class="story-section">
        <h3>Acceptance Criteria</h3>
        ${renderAcceptanceCriteria(acceptanceCriteria)}
      </div>

      <div class="story-section">
        <h3>Tasks</h3>
        ${renderTasks(tasks)}
      </div>
    </div>
  `;

  return renderLayout({
    title: `${story.code} - ${story.title}`,
    currentPath: `/story/${story.id}`,
    content,
  });
}

/**
 * Render story not found page
 */
export function renderStoryNotFound(storyId: string): string {
  const content = `
    <div class="empty-state">
      <div class="icon">?</div>
      <p>Story not found: ${escapeHtml(storyId)}</p>
      <p style="margin-top: 1rem;"><a href="/board">Back to Board</a></p>
    </div>
  `;

  return renderLayout({
    title: 'Story Not Found',
    currentPath: '/story',
    content,
  });
}
