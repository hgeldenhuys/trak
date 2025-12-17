/**
 * Retrospectives View - Completed/archived stories with learnings
 *
 * Shows completed and archived stories with their notes
 * as retrospective learnings.
 */

import { renderLayout, escapeHtml, truncate, formatRelativeTime } from './layout';
import type { Story, Note } from '../../types';
import { StoryStatus, EntityType } from '../../types';

export interface RetrosViewData {
  stories: Story[];
  notes: Note[];
}

/**
 * Build notes lookup map by entity
 */
function buildNotesMap(notes: Note[]): Map<string, Note[]> {
  const map = new Map<string, Note[]>();
  for (const note of notes) {
    const key = `${note.entityType}:${note.entityId}`;
    const existing = map.get(key) || [];
    existing.push(note);
    map.set(key, existing);
  }
  return map;
}

/**
 * Render the retrospectives view
 */
export function renderRetros(data: RetrosViewData): string {
  const { stories, notes } = data;
  const notesMap = buildNotesMap(notes);

  // Filter for completed/archived stories
  const retroStories = stories.filter(
    (s) => s.status === StoryStatus.COMPLETED || s.status === StoryStatus.ARCHIVED
  );

  // Sort by updatedAt descending
  retroStories.sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const content = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <h2 style="color: var(--accent-cyan);">Retrospectives</h2>
      <span style="color: var(--text-muted); font-size: 0.875rem;">
        ${retroStories.length} completed/archived stories
      </span>
    </div>

    ${retroStories.length === 0 ? `
      <div class="empty-state">
        <div class="icon">-</div>
        <p>No completed or archived stories yet</p>
        <p style="color: var(--text-muted); margin-top: 0.5rem;">
          Complete stories to see them here with their learnings.
        </p>
      </div>
    ` : `
      ${retroStories.map((story) => {
        const storyNotes = notesMap.get(`${EntityType.STORY}:${story.id}`) || [];
        const statusColor = story.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-gray)';

        return `
          <div class="retro-card">
            <div class="header" style="display: flex; justify-content: space-between; padding: 0; margin-bottom: 0.75rem; background: none; border: none;">
              <div>
                <a href="/story/${story.id}" style="color: var(--accent-cyan); font-weight: 600;">${escapeHtml(story.code)}</a>
                <span style="margin-left: 0.5rem;">${escapeHtml(truncate(story.title, 50))}</span>
              </div>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <span class="status-badge ${story.status}">${escapeHtml(story.status)}</span>
                <span style="color: var(--text-muted); font-size: 0.75rem;">${formatRelativeTime(story.updatedAt)}</span>
              </div>
            </div>

            ${storyNotes.length > 0 ? `
              <div class="notes">
                <div style="color: var(--accent-magenta); font-weight: 500; margin-bottom: 0.5rem;">Learnings:</div>
                ${storyNotes.map((note) => `
                  <div class="note">
                    <div class="note-content">${escapeHtml(note.content)}</div>
                    <div class="note-meta">(${escapeHtml(note.author)}, ${formatRelativeTime(note.createdAt)})</div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div style="color: var(--text-muted); font-style: italic;">
                No notes/learnings recorded for this story
              </div>
            `}
          </div>
        `;
      }).join('')}
    `}
  `;

  return renderLayout({
    title: 'Retrospectives',
    currentPath: '/retros',
    content,
  });
}
