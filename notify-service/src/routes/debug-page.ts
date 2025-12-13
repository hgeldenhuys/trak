/**
 * Debug Dashboard HTML Page (NOTIFY-012)
 *
 * GET /debug/:projectId/ui - Serves an interactive HTML page that:
 * 1. Connects to /debug/:projectId SSE endpoint
 * 2. Shows real-time scrolling event log
 * 3. Color-codes events by type
 * 4. Auto-reconnects on connection loss
 */

import { getConfig } from '../config';

/**
 * Generate the debug dashboard HTML page
 */
export function handleDebugPage(projectId: string): Response {
  const config = getConfig();
  const baseUrl = config?.server.publicUrl || `http://localhost:${config?.server.port || 7777}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Debug: ${projectId} | Notify Service</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'Droid Sans Mono', 'Source Code Pro', monospace;
      background: #0d1117;
      color: #c9d1d9;
      min-height: 100vh;
      padding: 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .header h1 {
      font-size: 18px;
      font-weight: 600;
      color: #f0f6fc;
    }

    .header .project-name {
      color: #58a6ff;
    }

    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #f85149;
      transition: background 0.3s ease;
    }

    .status-dot.connected {
      background: #3fb950;
      box-shadow: 0 0 8px rgba(63, 185, 80, 0.5);
    }

    .controls {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }

    .control-btn {
      padding: 8px 16px;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #c9d1d9;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .control-btn:hover {
      background: #30363d;
      border-color: #8b949e;
    }

    .control-btn.active {
      background: #238636;
      border-color: #238636;
      color: #fff;
    }

    .events-container {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      overflow: hidden;
      height: calc(100vh - 180px);
      display: flex;
      flex-direction: column;
    }

    .events-header {
      display: flex;
      padding: 12px 16px;
      background: #21262d;
      border-bottom: 1px solid #30363d;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: #8b949e;
    }

    .events-header > div:nth-child(1) { width: 100px; }
    .events-header > div:nth-child(2) { width: 140px; }
    .events-header > div:nth-child(3) { width: 120px; }
    .events-header > div:nth-child(4) { flex: 1; }

    .events-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .event {
      display: flex;
      align-items: flex-start;
      padding: 10px 16px;
      border-bottom: 1px solid #21262d;
      font-size: 13px;
      transition: background 0.15s ease;
    }

    .event:hover {
      background: #1c2128;
    }

    .event.new {
      animation: highlight 1s ease-out;
    }

    @keyframes highlight {
      0% { background: rgba(88, 166, 255, 0.2); }
      100% { background: transparent; }
    }

    .event > div:nth-child(1) { width: 100px; color: #8b949e; }
    .event > div:nth-child(2) { width: 140px; }
    .event > div:nth-child(3) { width: 120px; color: #8b949e; font-family: monospace; }
    .event > div:nth-child(4) { flex: 1; word-break: break-word; }

    .event-type {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .event-type.SessionStart { background: #1f6feb; color: #fff; }
    .event-type.UserPromptSubmit { background: #8957e5; color: #fff; }
    .event-type.PostToolUse { background: #388bfd; color: #fff; }
    .event-type.Stop { background: #238636; color: #fff; }
    .event-type.connected { background: #21262d; color: #8b949e; }
    .event-type.history { background: #21262d; color: #8b949e; }
    .event-type.heartbeat { background: #21262d; color: #484f58; }
    .event-type.error { background: #f85149; color: #fff; }

    .event-details {
      color: #c9d1d9;
    }

    .event-details .tool { color: #79c0ff; }
    .event-details .file { color: #7ee787; }
    .event-details .session { color: #d2a8ff; }
    .event-details .duration { color: #ffa657; }
    .event-details .files-count { color: #7ee787; }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #8b949e;
    }

    .empty-state svg {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .stats {
      display: flex;
      gap: 24px;
      padding: 12px 16px;
      background: #21262d;
      border-top: 1px solid #30363d;
      font-size: 12px;
      color: #8b949e;
    }

    .stat {
      display: flex;
      gap: 6px;
    }

    .stat-value {
      color: #f0f6fc;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Debug: <span class="project-name">${projectId}</span></h1>
    <div class="status">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">Connecting...</span>
    </div>
  </div>

  <div class="controls">
    <button class="control-btn active" id="autoScrollBtn" onclick="toggleAutoScroll()">
      Auto-scroll: ON
    </button>
    <button class="control-btn" onclick="clearEvents()">
      Clear
    </button>
    <select class="control-btn" id="limitSelect" onchange="reconnect()">
      <option value="10">Last 10</option>
      <option value="25">Last 25</option>
      <option value="50" selected>Last 50</option>
      <option value="100">Last 100</option>
    </select>
  </div>

  <div class="events-container">
    <div class="events-header">
      <div>Time</div>
      <div>Event</div>
      <div>Session</div>
      <div>Details</div>
    </div>
    <div class="events-list" id="eventsList">
      <div class="empty-state" id="emptyState">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <div>Waiting for events...</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat">Events: <span class="stat-value" id="eventCount">0</span></div>
      <div class="stat">Last event: <span class="stat-value" id="lastEventTime">-</span></div>
    </div>
  </div>

  <script>
    const projectId = '${projectId}';
    const baseUrl = '${baseUrl}';
    let eventSource = null;
    let autoScroll = true;
    let eventCount = 0;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;

    function formatTime(isoString) {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', { hour12: false });
    }

    function formatEventDetails(event) {
      const type = event.eventType || event.event_type;

      switch (type) {
        case 'SessionStart':
          return '<span class="session">Session started</span>';

        case 'UserPromptSubmit':
          const prompt = event.promptText || event.prompt_text || '';
          const truncated = prompt.length > 100 ? prompt.slice(0, 100) + '...' : prompt;
          return truncated ? \`"\${truncated}"\` : '<span class="session">Prompt submitted</span>';

        case 'PostToolUse':
          const tool = event.toolName || event.tool_name || 'Unknown';
          const input = event.toolInput || event.tool_input || {};
          const file = input.file_path || '';
          if (file) {
            const shortFile = file.split('/').pop();
            return \`<span class="tool">\${tool}</span> → <span class="file">\${shortFile}</span>\`;
          }
          return \`<span class="tool">\${tool}</span>\`;

        case 'Stop':
          const duration = event.durationMs || 0;
          const files = event.filesModified || event.files_modified || [];
          const tools = event.toolsUsed || event.tools_used || [];
          const durationSec = (duration / 1000).toFixed(1);
          return \`<span class="duration">\${durationSec}s</span> · <span class="files-count">\${files.length} files</span> · \${tools.length} tools\`;

        case 'connected':
        case 'history':
          return event.message || '';

        case 'heartbeat':
          return \`Last event ID: \${event.lastEventId || event.last_event_id || 0}\`;

        default:
          return JSON.stringify(event).slice(0, 100);
      }
    }

    function addEvent(eventData, eventType = null) {
      const emptyState = document.getElementById('emptyState');
      if (emptyState) {
        emptyState.remove();
      }

      const eventsList = document.getElementById('eventsList');
      const type = eventType || eventData.eventType || eventData.event_type || 'unknown';
      const timestamp = eventData.timestamp || eventData.received_at || new Date().toISOString();
      const sessionId = eventData.sessionId || eventData.session_id || '';
      const sessionName = eventData.sessionName || eventData.session_name || '';
      const sessionDisplay = sessionName || (sessionId ? sessionId.slice(0, 8) : '-');

      const eventEl = document.createElement('div');
      eventEl.className = 'event new';
      eventEl.innerHTML = \`
        <div>\${formatTime(timestamp)}</div>
        <div><span class="event-type \${type}">\${type}</span></div>
        <div>\${sessionDisplay}</div>
        <div class="event-details">\${formatEventDetails(eventData)}</div>
      \`;

      eventsList.appendChild(eventEl);
      eventCount++;

      // Update stats
      document.getElementById('eventCount').textContent = eventCount;
      document.getElementById('lastEventTime').textContent = formatTime(timestamp);

      // Auto-scroll
      if (autoScroll) {
        eventsList.scrollTop = eventsList.scrollHeight;
      }

      // Remove animation class after it completes
      setTimeout(() => eventEl.classList.remove('new'), 1000);
    }

    function setStatus(connected) {
      const dot = document.getElementById('statusDot');
      const text = document.getElementById('statusText');

      if (connected) {
        dot.classList.add('connected');
        text.textContent = 'Connected';
        reconnectAttempts = 0;
      } else {
        dot.classList.remove('connected');
        text.textContent = 'Disconnected';
      }
    }

    function connect() {
      const limit = document.getElementById('limitSelect').value;
      const url = \`\${baseUrl}/debug/\${projectId}?limit=\${limit}\`;

      console.log('Connecting to:', url);

      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource(url);

      eventSource.addEventListener('connected', (e) => {
        setStatus(true);
        addEvent(JSON.parse(e.data), 'connected');
      });

      eventSource.addEventListener('history', (e) => {
        addEvent(JSON.parse(e.data), 'history');
      });

      eventSource.addEventListener('event', (e) => {
        addEvent(JSON.parse(e.data));
      });

      eventSource.addEventListener('heartbeat', (e) => {
        // Update last event time but don't add to visible list (too noisy)
        const data = JSON.parse(e.data);
        // Optionally: addEvent(data, 'heartbeat');
      });

      eventSource.addEventListener('error', (e) => {
        addEvent({ message: 'Connection error' }, 'error');
      });

      eventSource.onerror = () => {
        setStatus(false);

        // Attempt reconnect with exponential backoff
        reconnectAttempts++;
        if (reconnectAttempts <= maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
          console.log(\`Reconnecting in \${delay}ms (attempt \${reconnectAttempts})\`);
          setTimeout(connect, delay);
        }
      };
    }

    function reconnect() {
      clearEvents();
      connect();
    }

    function toggleAutoScroll() {
      autoScroll = !autoScroll;
      const btn = document.getElementById('autoScrollBtn');
      btn.textContent = \`Auto-scroll: \${autoScroll ? 'ON' : 'OFF'}\`;
      btn.classList.toggle('active', autoScroll);
    }

    function clearEvents() {
      const eventsList = document.getElementById('eventsList');
      eventsList.innerHTML = \`
        <div class="empty-state" id="emptyState">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div>Waiting for events...</div>
        </div>
      \`;
      eventCount = 0;
      document.getElementById('eventCount').textContent = '0';
      document.getElementById('lastEventTime').textContent = '-';
    }

    // Connect on page load
    connect();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (eventSource) {
        eventSource.close();
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
