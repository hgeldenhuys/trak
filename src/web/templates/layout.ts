/**
 * Base HTML Layout Template
 *
 * Generates the complete HTML5 document structure with:
 * - Dark theme matching TUI aesthetic
 * - Navigation bar with keyboard shortcuts
 * - Footer with keyboard hints
 * - Responsive CSS (mobile-first)
 * - Client-side JavaScript for SSE and keyboard navigation
 *
 * Total target: CSS < 10KB, JS < 5KB
 */

import { getClientScript } from './client';

/**
 * Available view types matching TUI
 */
export type ViewType = 'board' | 'story' | 'list' | 'blocked' | 'retros' | 'system';

/**
 * View configuration for navigation
 */
interface ViewConfig {
  key: ViewType;
  label: string;
  shortcut: string;
  path: string;
}

/**
 * Navigation views configuration
 */
const VIEWS: ViewConfig[] = [
  { key: 'board', label: 'Board', shortcut: '1', path: '/board' },
  { key: 'story', label: 'Story', shortcut: '2', path: '/story' },
  { key: 'list', label: 'List', shortcut: '3', path: '/list' },
  { key: 'blocked', label: 'Blocked', shortcut: '4', path: '/blocked' },
  { key: 'retros', label: 'Retros', shortcut: '5', path: '/retros' },
  { key: 'system', label: 'System', shortcut: '0', path: '/system' },
];

/**
 * CSS styles for the web dashboard
 * Dark theme with cyan accents (matching TUI)
 * Mobile-first responsive design
 * Minified to stay under 10KB
 */
const CSS = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html{font-size:16px}body{font-family:system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9;line-height:1.5;min-height:100vh;display:flex;flex-direction:column}a{color:#58a6ff;text-decoration:none}a:hover{text-decoration:underline}button{font:inherit;cursor:pointer;border:0;background:0;color:inherit}.app{display:flex;flex-direction:column;min-height:100vh}header{background:#161b22;border-bottom:1px solid #30363d;padding:.75rem 1rem;position:sticky;top:0;z-index:100}.header-content{display:flex;justify-content:space-between;align-items:center;max-width:1400px;margin:0 auto}.logo{color:#00bcd4;font-weight:700;font-size:1.125rem}.story-context{color:#8b949e;font-size:.875rem;margin-left:1rem}nav{background:#161b22;border-bottom:1px solid #30363d;padding:.5rem 1rem;overflow-x:auto}.nav-items{display:flex;gap:.5rem;max-width:1400px;margin:0 auto;list-style:none}.nav-item{display:inline-flex;align-items:center;padding:.5rem .75rem;border-radius:6px;color:#8b949e;font-size:.875rem;white-space:nowrap;min-height:44px}.nav-item:hover{background:#21262d;color:#c9d1d9;text-decoration:none}.nav-item.active{background:#21262d;color:#00bcd4;font-weight:600}.nav-item .shortcut{color:#484f58;margin-right:.5rem;font-size:.75rem;padding:2px 6px;background:#30363d;border-radius:4px}.nav-item.active .shortcut{background:#00bcd4;color:#0d1117}.nav-badge{background:#da3633;color:#fff;font-size:.625rem;padding:2px 6px;border-radius:10px;margin-left:6px}main{flex:1;padding:1rem;max-width:1400px;width:100%;margin:0 auto}.content{min-height:200px}footer{background:#161b22;border-top:1px solid #30363d;padding:.75rem 1rem;font-size:.75rem;color:#484f58}.footer-content{display:flex;justify-content:space-between;align-items:center;max-width:1400px;margin:0 auto;flex-wrap:wrap;gap:.5rem}.keyboard-hints{display:flex;gap:1rem;flex-wrap:wrap}.hint{display:flex;align-items:center;gap:4px}.hint kbd{background:#30363d;padding:2px 6px;border-radius:4px;font:inherit;font-size:.6875rem}.connection-status{display:flex;align-items:center;gap:6px}.status-dot{width:8px;height:8px;border-radius:50%;background:#484f58}.status-dot.connected{background:#3fb950}.status-dot.disconnected{background:#da3633}.status-dot.connecting{background:#d29922}.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem;margin-bottom:.75rem}.card:focus,.card.focused{outline:2px solid #00bcd4;outline-offset:-2px}.card-title{font-weight:600;color:#c9d1d9;font-size:.9375rem}.card-meta,.card-body{font-size:.75rem;color:#8b949e}.status{display:inline-flex;padding:2px 8px;border-radius:12px;font-size:.75rem;font-weight:500}.status-pending{background:#30363d;color:#8b949e}.status-in_progress,.status-in-progress{background:#1f3d5c;color:#58a6ff}.status-completed,.status-done{background:#1f4030;color:#3fb950}.status-blocked{background:#4a1e1e;color:#f85149}.priority{padding:2px 6px;border-radius:4px;font-size:.6875rem;font-weight:600;text-transform:uppercase}.priority-p0{background:#5c1b1b;color:#f85149}.priority-p1{background:#5c3a1b;color:#d29922}.priority-p2{background:#1f3d5c;color:#58a6ff}.priority-p3{background:#30363d;color:#8b949e}.kanban{display:grid;gap:1rem;grid-template-columns:1fr}.kanban-column{background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:1rem;min-height:200px}.column-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid #30363d}.column-title{font-weight:600;font-size:.9375rem}.column-count{background:#30363d;color:#8b949e;padding:2px 8px;border-radius:10px;font-size:.75rem}.column-todo .column-title{color:#8b949e}.column-in-progress .column-title{color:#58a6ff}.column-done .column-title{color:#3fb950}.column-blocked .column-title{color:#f85149}.task-card{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:.75rem;margin-bottom:.5rem;cursor:pointer}.task-card:hover{border-color:#484f58}.task-card:focus,.task-card.focused{outline:2px solid #00bcd4;outline-offset:-2px}.task-title{font-size:.875rem;font-weight:500;margin-bottom:6px;color:#c9d1d9}.task-meta{display:flex;justify-content:space-between;font-size:.75rem;color:#8b949e}.story-list{display:flex;flex-direction:column;gap:.75rem}.story-item{display:grid;grid-template-columns:1fr auto;gap:1rem;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem;cursor:pointer}.story-item:hover{border-color:#484f58}.story-item:focus,.story-item.focused{outline:2px solid #00bcd4;outline-offset:-2px}.story-code{font-family:monospace;font-size:.75rem;color:#8b949e;margin-bottom:4px}.story-title{font-weight:500;color:#c9d1d9}.story-desc{font-size:.875rem;color:#8b949e;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.story-stats{display:flex;gap:.75rem;font-size:.75rem;color:#8b949e;margin-top:.5rem}.feature-group{margin-bottom:1.5rem}.feature-header{display:flex;align-items:center;gap:.5rem;padding:.5rem 0;margin-bottom:.75rem;border-bottom:1px solid #30363d}.feature-code{font-family:monospace;font-size:.75rem;color:#00bcd4;background:#0d3d47;padding:2px 6px;border-radius:4px}.feature-name{font-weight:600;color:#c9d1d9}.detail-header{margin-bottom:1.5rem}.detail-title{font-size:1.25rem;font-weight:600;color:#c9d1d9;margin-bottom:.5rem}.detail-meta{display:flex;gap:1rem;flex-wrap:wrap;font-size:.875rem;color:#8b949e}.detail-section{margin-bottom:1.5rem}.section-title{font-size:.875rem;font-weight:600;color:#c9d1d9;margin-bottom:.75rem;text-transform:uppercase;letter-spacing:.05em}.ac-list{display:flex;flex-direction:column;gap:.5rem}.ac-item{display:flex;gap:.75rem;padding:.75rem;background:#161b22;border:1px solid #30363d;border-radius:6px}.ac-checkbox{width:18px;height:18px;border:2px solid #30363d;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#3fb950;font-size:.75rem;flex-shrink:0}.ac-checkbox.checked{border-color:#3fb950;background:#1f4030}.ac-code{font-family:monospace;font-size:.6875rem;color:#8b949e;margin-bottom:2px}.ac-desc{font-size:.875rem;color:#c9d1d9}.info-grid{display:grid;gap:1rem;grid-template-columns:1fr}.info-card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem}.info-label{font-size:.75rem;color:#8b949e;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}.info-value{font-size:1.5rem;font-weight:600;color:#c9d1d9}.info-value.highlight{color:#00bcd4}.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;visibility:hidden;transition:opacity .2s}.modal-overlay.visible{opacity:1;visibility:visible}.modal{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:1.5rem;max-width:480px;width:90%;max-height:80vh;overflow-y:auto}.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}.modal-title{font-size:1.125rem;font-weight:600;color:#c9d1d9}.modal-close{width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#8b949e}.modal-close:hover{background:#21262d;color:#c9d1d9}.shortcuts-list{display:flex;flex-direction:column;gap:.5rem}.shortcut-item{display:flex;justify-content:space-between;padding:.5rem;border-radius:4px}.shortcut-item:hover{background:#21262d}.shortcut-keys{display:flex;gap:4px}.shortcut-key{background:#30363d;padding:4px 8px;border-radius:4px;font-family:monospace;font-size:.75rem;min-width:1.5rem;text-align:center}.shortcut-desc{font-size:.875rem;color:#8b949e}.empty-state{text-align:center;padding:3rem 1rem;color:#8b949e}.empty-title{font-size:1.125rem;font-weight:500;color:#c9d1d9;margin-bottom:.5rem}.empty-desc{font-size:.875rem}.loading{display:flex;align-items:center;justify-content:center;padding:2rem;color:#8b949e}.loading::after{content:'';width:20px;height:20px;border:2px solid #30363d;border-top-color:#00bcd4;border-radius:50%;animation:spin .8s linear infinite;margin-left:.5rem}@keyframes spin{to{transform:rotate(360deg)}}.toast-container{position:fixed;bottom:1rem;right:1rem;z-index:1001;display:flex;flex-direction:column;gap:.5rem}.toast{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:.75rem 1rem;display:flex;gap:.5rem;font-size:.875rem;box-shadow:0 4px 12px rgba(0,0,0,.3);animation:slideIn .2s}.toast.success{border-color:#3fb950}.toast.error{border-color:#f85149}.toast.info{border-color:#58a6ff}@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@media(min-width:768px){.kanban{grid-template-columns:repeat(2,1fr)}.info-grid{grid-template-columns:repeat(2,1fr)}.story-item{grid-template-columns:1fr auto auto}}@media(min-width:1024px){.kanban{grid-template-columns:repeat(4,1fr)}.info-grid{grid-template-columns:repeat(4,1fr)}header,nav,main,footer{padding:.75rem 1.5rem}}.flex{display:flex}.gap-2{gap:.5rem}`;

/**
 * Generate navigation HTML
 */
function renderNav(activeView: ViewType, blockedCount?: number): string {
  return VIEWS.map((view) => {
    const isActive = activeView === view.key;
    const activeClass = isActive ? 'active' : '';
    const badge = view.key === 'blocked' && blockedCount && blockedCount > 0
      ? `<span class="nav-badge">${blockedCount}</span>`
      : '';

    return `<a href="${view.path}" class="nav-item ${activeClass}" data-view="${view.key}" tabindex="0">
      <span class="shortcut">${view.shortcut}</span>
      <span>${view.label}</span>${badge}
    </a>`;
  }).join('');
}

/**
 * Options for layout generation
 */
export interface LayoutOptions {
  /** Page title */
  title: string;
  /** Main content HTML */
  content: string;
  /** Currently active view */
  activeView: ViewType;
  /** Selected story context (for header) */
  storyContext?: string;
  /** Number of blocked tasks (for badge) */
  blockedCount?: number;
  /** Additional head content (scripts, meta) */
  headExtra?: string;
  /** Additional body attributes */
  bodyAttrs?: string;
}

/**
 * Generate complete HTML5 document
 *
 * @param options - Layout configuration
 * @returns Complete HTML string
 */
export function layout(options: LayoutOptions): string {
  const {
    title,
    content,
    activeView,
    storyContext,
    blockedCount,
    headExtra = '',
    bodyAttrs = '',
  } = options;

  const storyContextHtml = storyContext
    ? `<span class="story-context">${escapeHtml(storyContext)}</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#0d1117">
  <meta name="description" content="Trak Board - Project Management Dashboard">
  <title>${escapeHtml(title)} | Trak Board</title>
  <style>${CSS}</style>
  ${headExtra}
</head>
<body ${bodyAttrs}>
  <div class="app" id="app">
    <header>
      <div class="header-content">
        <div class="flex gap-2">
          <span class="logo">Trak Board</span>
          ${storyContextHtml}
        </div>
        <div class="connection-status" id="connection-status">
          <span class="status-dot" id="status-dot"></span>
          <span id="status-text">Connecting...</span>
        </div>
      </div>
    </header>

    <nav role="navigation" aria-label="Main navigation">
      <div class="nav-items" role="menubar">
        ${renderNav(activeView, blockedCount)}
      </div>
    </nav>

    <main id="main-content" role="main" aria-live="polite">
      <div class="content" data-view="${activeView}">
        ${content}
      </div>
    </main>

    <footer>
      <div class="footer-content">
        <div class="keyboard-hints">
          <span class="hint"><kbd>1</kbd>-<kbd>5</kbd>,<kbd>0</kbd> views</span>
          <span class="hint"><kbd>Tab</kbd> cycle</span>
          <span class="hint"><kbd>j</kbd>/<kbd>k</kbd> scroll</span>
          <span class="hint"><kbd>Enter</kbd> select</span>
          <span class="hint"><kbd>Esc</kbd> back</span>
          <span class="hint"><kbd>?</kbd> help</span>
        </div>
        <div id="last-update"></div>
      </div>
    </footer>

    <!-- Keyboard Help Modal -->
    <div class="modal-overlay" id="help-modal" role="dialog" aria-labelledby="help-title" aria-modal="true">
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title" id="help-title">Keyboard Shortcuts</h2>
          <button class="modal-close" id="close-help" aria-label="Close help">&times;</button>
        </div>
        <div class="shortcuts-list">
          <div class="shortcut-item">
            <span class="shortcut-desc">Board view</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">1</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Story view</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">2</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">List view</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">3</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Blocked view</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">4</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Retros view</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">5</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">System view</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">0</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Cycle views</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">Tab</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Scroll down</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">j</kbd><kbd class="shortcut-key">&#8595;</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Scroll up</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">k</kbd><kbd class="shortcut-key">&#8593;</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Navigate left</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">h</kbd><kbd class="shortcut-key">&#8592;</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Navigate right</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">l</kbd><kbd class="shortcut-key">&#8594;</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Select / Open</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">Enter</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Go back</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">Esc</kbd></div>
          </div>
          <div class="shortcut-item">
            <span class="shortcut-desc">Show help</span>
            <div class="shortcut-keys"><kbd class="shortcut-key">?</kbd></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast Container -->
    <div class="toast-container" id="toast-container" aria-live="assertive"></div>
  </div>

  <script>${getClientScript()}</script>
</body>
</html>`;
}

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

/**
 * Simple layout wrapper for quick usage
 */
export function simpleLayout(
  title: string,
  content: string,
  activeView: ViewType = 'board',
): string {
  return layout({ title, content, activeView });
}
