/**
 * CSS Styles for Web Views
 *
 * Provides consistent styling across all HTML views.
 * Uses CSS variables for theming and a dark-mode friendly palette.
 */

export const styles = `
:root {
  --bg-primary: #1a1b26;
  --bg-secondary: #24283b;
  --bg-tertiary: #343a4f;
  --bg-hover: #414868;
  --text-primary: #c0caf5;
  --text-secondary: #a9b1d6;
  --text-muted: #565f89;
  --border-color: #414868;
  --accent-cyan: #7dcfff;
  --accent-blue: #7aa2f7;
  --accent-green: #9ece6a;
  --accent-yellow: #e0af68;
  --accent-orange: #ff9e64;
  --accent-red: #f7768e;
  --accent-magenta: #bb9af7;
  --accent-gray: #565f89;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
  font-size: 14px;
  line-height: 1.6;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
}

a {
  color: var(--accent-cyan);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

/* Layout */
.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 1rem;
}

.header h1 {
  font-size: 1.25rem;
  color: var(--accent-cyan);
}

.nav {
  display: flex;
  gap: 1rem;
}

.nav a {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.nav a:hover {
  background-color: var(--bg-hover);
  text-decoration: none;
}

.nav a.active {
  background-color: var(--accent-blue);
  color: var(--bg-primary);
}

/* Kanban Board */
.kanban {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding-bottom: 1rem;
}

.column {
  flex: 1;
  min-width: 280px;
  max-width: 350px;
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 0.75rem;
}

.column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  margin-bottom: 0.75rem;
  border-bottom: 2px solid var(--border-color);
}

.column-header h2 {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.column-header .count {
  background-color: var(--bg-tertiary);
  padding: 0.125rem 0.5rem;
  border-radius: 12px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.column.todo .column-header { border-bottom-color: var(--accent-gray); }
.column.in-progress .column-header { border-bottom-color: var(--accent-yellow); }
.column.blocked .column-header { border-bottom-color: var(--accent-red); }
.column.done .column-header { border-bottom-color: var(--accent-green); }

.column.todo .column-header h2 { color: var(--accent-gray); }
.column.in-progress .column-header h2 { color: var(--accent-yellow); }
.column.blocked .column-header h2 { color: var(--accent-red); }
.column.done .column-header h2 { color: var(--accent-green); }

/* Task Cards */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.task-card {
  background-color: var(--bg-tertiary);
  border-radius: 6px;
  padding: 0.75rem;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border-left: 3px solid transparent;
}

.task-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.task-card.P0 { border-left-color: var(--accent-red); }
.task-card.P1 { border-left-color: var(--accent-yellow); }
.task-card.P2 { border-left-color: var(--accent-blue); }
.task-card.P3 { border-left-color: var(--accent-gray); }

.task-card .story-code {
  font-size: 0.7rem;
  color: var(--accent-cyan);
  margin-bottom: 0.25rem;
}

.task-card .task-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.task-card .task-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.task-card .assignee {
  background-color: var(--bg-secondary);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

/* Story Detail */
.story-detail {
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.5rem;
}

.story-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.story-header .code {
  font-size: 1.5rem;
  color: var(--accent-cyan);
  font-weight: 600;
}

.story-header .title {
  font-size: 1.25rem;
  color: var(--text-primary);
  margin-top: 0.5rem;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.status-badge.draft { background-color: var(--accent-gray); color: var(--bg-primary); }
.status-badge.planned { background-color: var(--accent-blue); color: var(--bg-primary); }
.status-badge.in_progress { background-color: var(--accent-yellow); color: var(--bg-primary); }
.status-badge.review { background-color: var(--accent-magenta); color: var(--bg-primary); }
.status-badge.completed { background-color: var(--accent-green); color: var(--bg-primary); }
.status-badge.cancelled { background-color: var(--accent-red); color: var(--bg-primary); }
.status-badge.archived { background-color: var(--accent-gray); color: var(--text-primary); }
.status-badge.pending { background-color: var(--accent-gray); color: var(--bg-primary); }
.status-badge.blocked { background-color: var(--accent-red); color: var(--bg-primary); }

.priority-badge {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
}

.priority-badge.P0 { background-color: var(--accent-red); color: var(--bg-primary); }
.priority-badge.P1 { background-color: var(--accent-yellow); color: var(--bg-primary); }
.priority-badge.P2 { background-color: var(--accent-blue); color: var(--bg-primary); }
.priority-badge.P3 { background-color: var(--accent-gray); color: var(--text-primary); }

.story-section {
  margin-bottom: 1.5rem;
}

.story-section h3 {
  font-size: 0.875rem;
  color: var(--accent-cyan);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.story-section p {
  color: var(--text-secondary);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  background-color: var(--bg-tertiary);
  padding: 1rem;
  border-radius: 6px;
}

.info-item label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.info-item .value {
  color: var(--text-primary);
}

/* Lists */
.list-table {
  width: 100%;
  border-collapse: collapse;
}

.list-table th,
.list-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.list-table th {
  background-color: var(--bg-secondary);
  color: var(--text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.list-table tbody tr {
  transition: background-color 0.2s;
}

.list-table tbody tr:hover {
  background-color: var(--bg-hover);
}

.list-table a {
  color: var(--accent-cyan);
}

/* Blocked View */
.impediment-note {
  color: var(--accent-yellow);
  font-style: italic;
}

/* Retrospectives */
.retro-card {
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.retro-card .header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.retro-card .notes {
  background-color: var(--bg-tertiary);
  padding: 0.75rem;
  border-radius: 6px;
  border-left: 3px solid var(--accent-magenta);
}

.retro-card .note {
  margin-bottom: 0.5rem;
}

.retro-card .note:last-child {
  margin-bottom: 0;
}

.retro-card .note-content {
  color: var(--text-primary);
}

.retro-card .note-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* System Info */
.system-info {
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 1.5rem;
}

.system-info h2 {
  color: var(--accent-cyan);
  margin-bottom: 1rem;
  font-size: 1rem;
}

.system-info-grid {
  display: grid;
  gap: 0.75rem;
}

.system-info-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-color);
}

.system-info-row:last-child {
  border-bottom: none;
}

.system-info-row .label {
  color: var(--text-muted);
  font-weight: 500;
}

.system-info-row .value {
  color: var(--text-primary);
  word-break: break-all;
}

.system-info-row .value.success {
  color: var(--accent-green);
}

.system-info-row .value.error {
  color: var(--accent-red);
}

/* Acceptance Criteria */
.ac-list {
  list-style: none;
}

.ac-item {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-color);
}

.ac-item:last-child {
  border-bottom: none;
}

.ac-item .icon {
  font-size: 1rem;
}

.ac-item .icon.verified { color: var(--accent-green); }
.ac-item .icon.failed { color: var(--accent-red); }
.ac-item .icon.pending { color: var(--text-muted); }

.ac-item .content {
  flex: 1;
}

.ac-item .code {
  color: var(--accent-cyan);
  font-weight: 500;
}

/* Task List in Story Detail */
.task-list-detail {
  list-style: none;
}

.task-item {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  background-color: var(--bg-tertiary);
  border-radius: 6px;
  margin-bottom: 0.5rem;
}

.task-item:last-child {
  margin-bottom: 0;
}

.task-item .icon {
  font-size: 1rem;
}

.task-item .icon.completed { color: var(--accent-green); }
.task-item .icon.in_progress { color: var(--accent-yellow); }
.task-item .icon.blocked { color: var(--accent-red); }
.task-item .icon.pending { color: var(--text-muted); }

.task-item .content {
  flex: 1;
}

.task-item .title {
  font-weight: 500;
}

.task-item .meta {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 3rem;
  color: var(--text-muted);
}

.empty-state .icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state p {
  font-size: 1rem;
}

/* Footer */
.footer {
  text-align: center;
  padding: 1rem;
  color: var(--text-muted);
  font-size: 0.75rem;
  margin-top: 2rem;
  border-top: 1px solid var(--border-color);
}

/* Live indicator */
.live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--accent-green);
}

.live-indicator .dot {
  width: 8px;
  height: 8px;
  background-color: var(--accent-green);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Responsive */
@media (max-width: 768px) {
  .kanban {
    flex-direction: column;
  }

  .column {
    max-width: none;
  }

  .nav {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .header {
    flex-direction: column;
    gap: 1rem;
  }
}
`;
