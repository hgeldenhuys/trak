/**
 * List View - Table view of all stories
 *
 * Shows stories in a sortable table format with:
 * - Code, title, status, priority, assignee
 * - Quick navigation to story details
 */

import { renderLayout, escapeHtml, truncate, formatRelativeTime } from './layout';
import type { Story, Feature } from '../../types';

export interface ListViewData {
  stories: Story[];
  features: Feature[];
}

/**
 * Build feature lookup map
 */
function buildFeatureMap(features: Feature[]): Map<string, Feature> {
  const map = new Map<string, Feature>();
  for (const feature of features) {
    map.set(feature.id, feature);
  }
  return map;
}

/**
 * Render the list view
 */
export function renderList(data: ListViewData): string {
  const { stories, features } = data;
  const featureMap = buildFeatureMap(features);

  // Filter out archived stories by default
  const activeStories = stories.filter((s) => s.status !== 'archived');

  const content = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h2 style="color: var(--accent-cyan);">Stories</h2>
      <span style="color: var(--text-muted); font-size: 0.875rem;">
        ${activeStories.length} stories (${stories.length - activeStories.length} archived)
      </span>
    </div>

    ${activeStories.length === 0 ? `
      <div class="empty-state">
        <div class="icon">-</div>
        <p>No stories found</p>
      </div>
    ` : `
      <table class="list-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Title</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${activeStories.map((story) => {
            const feature = featureMap.get(story.featureId);
            return `
              <tr>
                <td><a href="/story/${story.id}">${escapeHtml(story.code)}</a></td>
                <td>${escapeHtml(truncate(story.title, 50))}</td>
                <td><span class="status-badge ${story.status}">${escapeHtml(story.status)}</span></td>
                <td><span class="priority-badge ${story.priority}">${story.priority}</span></td>
                <td>${story.assignedTo ? escapeHtml(story.assignedTo) : '-'}</td>
                <td style="color: var(--text-muted);">${formatRelativeTime(story.updatedAt)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `}
  `;

  return renderLayout({
    title: 'Stories',
    currentPath: '/list',
    content,
  });
}
