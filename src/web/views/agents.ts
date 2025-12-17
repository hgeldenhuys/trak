/**
 * Agents View - Agent definitions and learnings display
 *
 * Shows agent definitions with version, role, success/failure metrics,
 * and learnings grouped by role with confidence visualization.
 */

import { renderLayout, escapeHtml, formatRelativeTime } from './layout';
import type { AgentDefinition, AgentLearning } from '../../types';

export interface AgentsViewData {
  definitions: AgentDefinition[];
  learnings: AgentLearning[];
}

/**
 * Group learnings by role
 */
function groupLearningsByRole(learnings: AgentLearning[]): Map<string, AgentLearning[]> {
  const grouped = new Map<string, AgentLearning[]>();
  for (const learning of learnings) {
    const role = learning.role;
    if (!grouped.has(role)) {
      grouped.set(role, []);
    }
    grouped.get(role)!.push(learning);
  }
  return grouped;
}

/**
 * Render confidence bar
 */
function renderConfidenceBar(confidence: number): string {
  const percentage = Math.round(confidence * 100);
  const color = confidence >= 0.8
    ? 'var(--accent-green)'
    : confidence >= 0.5
      ? 'var(--accent-yellow)'
      : 'var(--accent-red)';

  return `
    <div class="confidence-bar-container">
      <div class="confidence-bar" style="width: ${percentage}%; background-color: ${color};"></div>
      <span class="confidence-value">${percentage}%</span>
    </div>
  `;
}

/**
 * Render category badge
 */
function renderCategoryBadge(category: string): string {
  const categoryColors: Record<string, string> = {
    pattern: 'var(--accent-blue)',
    pitfall: 'var(--accent-red)',
    optimization: 'var(--accent-green)',
    convention: 'var(--accent-cyan)',
    preference: 'var(--accent-magenta)',
  };
  const color = categoryColors[category] || 'var(--accent-gray)';
  return `<span class="category-badge" style="background-color: ${color};">${escapeHtml(category)}</span>`;
}

/**
 * Render success/failure metrics
 */
function renderMetrics(successCount: number, failureCount: number): string {
  const total = successCount + failureCount;
  const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;

  return `
    <div class="metrics">
      <span class="metric success" title="Success count">
        <span class="metric-icon">+</span>${successCount}
      </span>
      <span class="metric failure" title="Failure count">
        <span class="metric-icon">-</span>${failureCount}
      </span>
      ${total > 0 ? `<span class="metric rate" title="Success rate">${successRate}%</span>` : ''}
    </div>
  `;
}

/**
 * Render the agents view
 */
export function renderAgents(data: AgentsViewData): string {
  const { definitions, learnings } = data;
  const learningsByRole = groupLearningsByRole(learnings);

  // Agent Definitions section
  const definitionsSection = definitions.length === 0
    ? `
      <div class="empty-state">
        <div class="icon">[?]</div>
        <p>No agent definitions found</p>
      </div>
    `
    : `
      <table class="list-table agents-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Version</th>
            <th>Role</th>
            <th>Specialization</th>
            <th>Metrics</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${definitions.map(def => `
            <tr>
              <td class="name-cell">
                <span class="agent-name">${escapeHtml(def.name)}</span>
                ${def.derivedFrom ? `<span class="derived-from" title="Derived from">^ ${escapeHtml(def.derivedFrom.slice(0, 8))}</span>` : ''}
              </td>
              <td><span class="version-badge">v${def.version}</span></td>
              <td><span class="role-badge">${escapeHtml(def.role)}</span></td>
              <td>${def.specialization ? `<span class="specialization">${escapeHtml(def.specialization)}</span>` : '<span class="text-muted">-</span>'}</td>
              <td>${renderMetrics(def.successCount, def.failureCount)}</td>
              <td class="date-cell">${formatRelativeTime(def.createdAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  // Learnings section grouped by role
  const learningsSection = learnings.length === 0
    ? `
      <div class="empty-state">
        <div class="icon">[!]</div>
        <p>No agent learnings recorded yet</p>
      </div>
    `
    : `
      <div class="learnings-grid">
        ${Array.from(learningsByRole.entries()).map(([role, roleLearnings]) => `
          <div class="learnings-group">
            <div class="learnings-group-header">
              <span class="role-badge">${escapeHtml(role)}</span>
              <span class="learning-count">${roleLearnings.length} learning${roleLearnings.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="learnings-list">
              ${roleLearnings.map(learning => `
                <div class="learning-card">
                  <div class="learning-header">
                    ${renderCategoryBadge(learning.category)}
                    ${learning.specialization ? `<span class="specialization-tag">${escapeHtml(learning.specialization)}</span>` : ''}
                  </div>
                  <div class="learning-content">${escapeHtml(learning.learning)}</div>
                  <div class="learning-footer">
                    <div class="confidence-section">
                      <span class="confidence-label">Confidence:</span>
                      ${renderConfidenceBar(learning.confidence)}
                    </div>
                    <div class="learning-meta">
                      ${learning.storyId ? `<span class="story-ref" title="Story">${escapeHtml(learning.storyId.slice(0, 8))}</span>` : ''}
                      <span class="learning-date">${formatRelativeTime(learning.createdAt)}</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;

  const content = `
    <style>
      /* Agents-specific styles */
      .agents-section {
        background-color: var(--bg-secondary);
        border-radius: 8px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
      }

      .agents-section h2 {
        color: var(--accent-cyan);
        margin-bottom: 1rem;
        font-size: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .agents-table {
        font-size: 0.875rem;
      }

      .agent-name {
        color: var(--accent-cyan);
        font-weight: 500;
      }

      .derived-from {
        display: block;
        font-size: 0.7rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
      }

      .version-badge {
        background-color: var(--bg-tertiary);
        color: var(--accent-yellow);
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
      }

      .role-badge {
        background-color: var(--accent-blue);
        color: var(--bg-primary);
        padding: 0.125rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: lowercase;
      }

      .specialization {
        color: var(--accent-magenta);
        font-size: 0.875rem;
      }

      .text-muted {
        color: var(--text-muted);
      }

      .date-cell {
        color: var(--text-muted);
        font-size: 0.75rem;
      }

      .name-cell {
        min-width: 150px;
      }

      /* Metrics */
      .metrics {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .metric {
        display: inline-flex;
        align-items: center;
        gap: 0.125rem;
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .metric-icon {
        font-weight: bold;
      }

      .metric.success {
        background-color: rgba(158, 206, 106, 0.2);
        color: var(--accent-green);
      }

      .metric.failure {
        background-color: rgba(247, 118, 142, 0.2);
        color: var(--accent-red);
      }

      .metric.rate {
        background-color: var(--bg-tertiary);
        color: var(--text-secondary);
      }

      /* Learnings Grid */
      .learnings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
        gap: 1rem;
      }

      .learnings-group {
        background-color: var(--bg-tertiary);
        border-radius: 8px;
        padding: 1rem;
      }

      .learnings-group-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid var(--border-color);
      }

      .learning-count {
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .learnings-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .learning-card {
        background-color: var(--bg-secondary);
        border-radius: 6px;
        padding: 0.75rem;
        border-left: 3px solid var(--accent-cyan);
      }

      .learning-header {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        margin-bottom: 0.5rem;
      }

      .category-badge {
        color: var(--bg-primary);
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
      }

      .specialization-tag {
        font-size: 0.7rem;
        color: var(--accent-magenta);
        background-color: rgba(187, 154, 247, 0.15);
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
      }

      .learning-content {
        color: var(--text-primary);
        font-size: 0.875rem;
        line-height: 1.5;
        margin-bottom: 0.75rem;
      }

      .learning-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .confidence-section {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .confidence-label {
        font-size: 0.7rem;
        color: var(--text-muted);
      }

      .confidence-bar-container {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        min-width: 80px;
      }

      .confidence-bar {
        height: 6px;
        border-radius: 3px;
        transition: width 0.3s ease;
      }

      .confidence-bar-container {
        background-color: var(--bg-primary);
        padding: 2px;
        border-radius: 4px;
        position: relative;
      }

      .confidence-value {
        font-size: 0.7rem;
        color: var(--text-muted);
        min-width: 32px;
      }

      .learning-meta {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .story-ref {
        font-size: 0.7rem;
        color: var(--accent-cyan);
        background-color: var(--bg-tertiary);
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
      }

      .learning-date {
        font-size: 0.7rem;
        color: var(--text-muted);
      }

      /* Summary stats */
      .summary-stats {
        display: flex;
        gap: 1.5rem;
        margin-bottom: 1rem;
        flex-wrap: wrap;
      }

      .stat-item {
        display: flex;
        align-items: baseline;
        gap: 0.375rem;
      }

      .stat-value {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--accent-cyan);
      }

      .stat-label {
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      @media (max-width: 768px) {
        .learnings-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>

    <div class="agents-section">
      <h2>Agent Definitions</h2>
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-value">${definitions.length}</span>
          <span class="stat-label">definitions</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${new Set(definitions.map(d => d.role)).size}</span>
          <span class="stat-label">unique roles</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${definitions.reduce((sum, d) => sum + d.successCount, 0)}</span>
          <span class="stat-label">total successes</span>
        </div>
      </div>
      ${definitionsSection}
    </div>

    <div class="agents-section">
      <h2>Agent Learnings</h2>
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-value">${learnings.length}</span>
          <span class="stat-label">learnings</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${learningsByRole.size}</span>
          <span class="stat-label">roles with learnings</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${learnings.length > 0 ? Math.round(learnings.reduce((sum, l) => sum + l.confidence, 0) / learnings.length * 100) : 0}%</span>
          <span class="stat-label">avg confidence</span>
        </div>
      </div>
      ${learningsSection}
    </div>
  `;

  return renderLayout({
    title: 'Agents',
    currentPath: '/agents',
    content,
  });
}
