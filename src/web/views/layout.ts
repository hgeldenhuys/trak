/**
 * HTML Layout Template
 *
 * Provides the base HTML structure for all web views.
 */

import { styles } from './styles';

export interface LayoutOptions {
  title: string;
  currentPath: string;
  content: string;
  scripts?: string;
}

/**
 * Navigation items for the header
 */
const navItems = [
  { path: '/', label: 'Home' },
  { path: '/board', label: 'Board' },
  { path: '/list', label: 'List' },
  { path: '/blocked', label: 'Blocked' },
  { path: '/retros', label: 'Retros' },
  { path: '/agents', label: 'Agents' },
  { path: '/system', label: 'System' },
];

/**
 * Render the base HTML layout
 */
export function renderLayout(options: LayoutOptions): string {
  const { title, currentPath, content, scripts = '' } = options;

  const navHtml = navItems
    .map((item) => {
      const isActive = currentPath === item.path;
      return `<a href="${item.path}" class="${isActive ? 'active' : ''}">${item.label}</a>`;
    })
    .join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Board</title>
  <style>${styles}</style>
</head>
<body>
  <header class="header">
    <h1>Board CLI Web</h1>
    <nav class="nav">
      ${navHtml}
    </nav>
    <div class="live-indicator" id="live-indicator">
      <span class="dot"></span>
      <span>Live</span>
    </div>
  </header>
  <main class="container">
    ${content}
  </main>
  <footer class="footer">
    Board CLI/TUI System - Web Interface
  </footer>
  <script>
    // SSE Connection for live updates
    let eventSource = null;
    let reconnectTimeout = null;

    function connectSSE() {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource('/api/events');
      const indicator = document.getElementById('live-indicator');

      eventSource.onopen = function() {
        console.log('SSE connected');
        if (indicator) {
          indicator.querySelector('.dot').style.backgroundColor = '#9ece6a';
          indicator.querySelector('span:last-child').textContent = 'Live';
        }
      };

      eventSource.onmessage = function(event) {
        console.log('SSE message:', event.data);
        try {
          const data = JSON.parse(event.data);
          handleEvent(data);
        } catch (e) {
          console.error('Failed to parse SSE message:', e);
        }
      };

      eventSource.onerror = function(error) {
        console.error('SSE error:', error);
        if (indicator) {
          indicator.querySelector('.dot').style.backgroundColor = '#f7768e';
          indicator.querySelector('span:last-child').textContent = 'Disconnected';
        }
        eventSource.close();
        // Reconnect after 5 seconds
        reconnectTimeout = setTimeout(connectSSE, 5000);
      };
    }

    function handleEvent(data) {
      // Auto-reload page on any entity change
      if (data.type && (
        data.type.startsWith('feature:') ||
        data.type.startsWith('story:') ||
        data.type.startsWith('task:') ||
        data.type.startsWith('ac:')
      )) {
        // Debounce reloads
        if (!window.reloadTimeout) {
          window.reloadTimeout = setTimeout(() => {
            window.location.reload();
          }, 500);
        }
      }
    }

    // Connect on page load
    connectSSE();

    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    });
  </script>
  ${scripts}
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m] || m);
}

/**
 * Format relative time from ISO timestamp
 */
export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 30) {
    return date.toLocaleDateString();
  }
  if (diffDay > 0) {
    return `${diffDay}d ago`;
  }
  if (diffHour > 0) {
    return `${diffHour}h ago`;
  }
  if (diffMin > 0) {
    return `${diffMin}m ago`;
  }
  return 'just now';
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 2) + '..';
}
