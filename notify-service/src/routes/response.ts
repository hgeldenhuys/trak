/**
 * Response Page Endpoint
 *
 * GET /response/{id} - Renders stored AI response as HTML page with markdown conversion
 */

import { marked } from 'marked';
import { getResponse, getLatestResponseByProject } from '../response-store';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Generate HTML page for a response
 */
function renderResponsePage(
  project: string,
  summary: string,
  fullResponse: string,
  metadata?: {
    durationMs?: number;
    filesModified?: number;
    filesList?: string[];  // Actual file paths for table display
    toolsUsed?: string[];
    contextUsagePercent?: number;
    keyOutcomes?: string[];
  },
  createdAt?: Date,
  responseId?: string,
  hasAudio?: boolean,
  userPrompt?: string
): string {
  // Convert markdown to HTML
  const contentHtml = marked.parse(fullResponse) as string;

  // Build metadata section
  let metaSection = '';
  if (metadata) {
    const metaItems: string[] = [];
    if (metadata.durationMs) {
      metaItems.push(`<span class="meta-item"><strong>Duration:</strong> ${formatDuration(metadata.durationMs)}</span>`);
    }
    if (metadata.filesModified !== undefined) {
      metaItems.push(`<span class="meta-item"><strong>Files Modified:</strong> ${metadata.filesModified}</span>`);
    }
    if (metadata.contextUsagePercent !== undefined) {
      metaItems.push(`<span class="meta-item"><strong>Context Usage:</strong> ${metadata.contextUsagePercent}%</span>`);
    }
    if (metaItems.length > 0) {
      metaSection = `<div class="metadata">${metaItems.join('')}</div>`;
    }
  }

  // Build key outcomes section
  let outcomesSection = '';
  if (metadata?.keyOutcomes && metadata.keyOutcomes.length > 0) {
    const outcomesList = metadata.keyOutcomes.map(o => `<li>${o}</li>`).join('');
    outcomesSection = `
      <div class="key-outcomes">
        <h3>Key Outcomes</h3>
        <ul>${outcomesList}</ul>
      </div>
    `;
  }

  // Build tools section
  let toolsSection = '';
  if (metadata?.toolsUsed && metadata.toolsUsed.length > 0) {
    const toolsTags = metadata.toolsUsed.map(t => `<span class="tool-tag">${t}</span>`).join('');
    toolsSection = `
      <div class="tools-used">
        <strong>Tools Used:</strong> ${toolsTags}
      </div>
    `;
  }

  // Build files table section
  let filesSection = '';
  if (metadata?.filesList && metadata.filesList.length > 0) {
    const fileRows = metadata.filesList.map(f => {
      const basename = f.split('/').pop() || f;
      return `<tr><td class="file-name">${escapeHtml(basename)}</td><td class="file-path">${escapeHtml(f)}</td></tr>`;
    }).join('');
    filesSection = `
      <div class="files-modified">
        <h3>📁 Files Modified</h3>
        <table class="files-table">
          <thead>
            <tr><th>File</th><th>Path</th></tr>
          </thead>
          <tbody>
            ${fileRows}
          </tbody>
        </table>
      </div>
    `;
  }

  const timestamp = createdAt ? createdAt.toLocaleString() : new Date().toLocaleString();

  // Build user prompt section (what was asked)
  let userPromptSection = '';
  if (userPrompt && userPrompt.trim()) {
    userPromptSection = `
      <div class="user-prompt">
        <h3>💬 What was asked</h3>
        <p>${escapeHtml(userPrompt)}</p>
      </div>
    `;
  }

  // Build audio player section
  let audioSection = '';
  if (hasAudio && responseId) {
    audioSection = `
      <div class="audio-player">
        <h3>🔊 Audio Summary</h3>
        <audio controls preload="metadata">
          <source src="/audio/${responseId}" type="audio/mpeg">
          Your browser does not support the audio element.
        </audio>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Claude Code AI Response - ${project}">
  <title>${project} - Claude Code Response</title>
  <style>
    :root {
      --bg-color: #1a1a2e;
      --card-bg: #16213e;
      --text-color: #eaeaea;
      --text-muted: #a0a0a0;
      --accent-color: #e94560;
      --accent-secondary: #0f3460;
      --border-color: #2a2a4a;
      --code-bg: #0d1117;
      --success-color: #4ade80;
    }

    @media (prefers-color-scheme: light) {
      :root {
        --bg-color: #f5f5f5;
        --card-bg: #ffffff;
        --text-color: #1a1a1a;
        --text-muted: #666666;
        --accent-color: #dc2626;
        --accent-secondary: #e5e5e5;
        --border-color: #e0e0e0;
        --code-bg: #f4f4f4;
        --success-color: #22c55e;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      line-height: 1.6;
      padding: 16px;
      max-width: 100%;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
    }

    header {
      border-bottom: 2px solid var(--accent-color);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }

    .project-name {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent-color);
      margin-bottom: 8px;
    }

    .summary {
      font-size: 1.1rem;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .timestamp {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin: 16px 0;
      padding: 12px;
      background: var(--accent-secondary);
      border-radius: 8px;
    }

    .meta-item {
      font-size: 0.9rem;
    }

    .user-prompt {
      background: var(--card-bg);
      border-left: 4px solid var(--accent-color);
      padding: 16px;
      margin: 24px 0;
      border-radius: 0 8px 8px 0;
    }

    .user-prompt h3 {
      color: var(--accent-color);
      margin-bottom: 12px;
      font-size: 1rem;
    }

    .user-prompt p {
      color: var(--text-color);
      font-style: italic;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    .key-outcomes {
      background: var(--card-bg);
      border-left: 4px solid var(--success-color);
      padding: 16px;
      margin: 24px 0;
      border-radius: 0 8px 8px 0;
    }

    .key-outcomes h3 {
      color: var(--success-color);
      margin-bottom: 12px;
      font-size: 1rem;
    }

    .key-outcomes ul {
      padding-left: 20px;
    }

    .key-outcomes li {
      margin-bottom: 8px;
    }

    .tools-used {
      margin: 16px 0;
    }

    .tool-tag {
      display: inline-block;
      background: var(--accent-secondary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      margin: 2px 4px 2px 0;
    }

    .content {
      background: var(--card-bg);
      padding: 24px;
      border-radius: 8px;
      border: 1px solid var(--border-color);
    }

    .content h1, .content h2, .content h3, .content h4 {
      margin-top: 24px;
      margin-bottom: 12px;
      color: var(--text-color);
    }

    .content h1 { font-size: 1.75rem; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
    .content h2 { font-size: 1.5rem; }
    .content h3 { font-size: 1.25rem; }
    .content h4 { font-size: 1.1rem; }

    .content p {
      margin-bottom: 16px;
    }

    .content ul, .content ol {
      margin-bottom: 16px;
      padding-left: 24px;
    }

    .content li {
      margin-bottom: 8px;
    }

    .content pre {
      background: var(--code-bg);
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 16px;
    }

    .content code {
      font-family: 'SF Mono', Consolas, Monaco, monospace;
      font-size: 0.9rem;
    }

    .content p code {
      background: var(--code-bg);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .content blockquote {
      border-left: 4px solid var(--accent-color);
      padding-left: 16px;
      margin: 16px 0;
      color: var(--text-muted);
    }

    .content a {
      color: var(--accent-color);
      text-decoration: none;
    }

    .content a:hover {
      text-decoration: underline;
    }

    .content table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }

    .content th, .content td {
      border: 1px solid var(--border-color);
      padding: 8px 12px;
      text-align: left;
    }

    .content th {
      background: var(--accent-secondary);
    }

    .audio-player {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      margin: 24px 0;
    }

    .audio-player h3 {
      margin-bottom: 12px;
      font-size: 1rem;
      color: var(--text-color);
    }

    .audio-player audio {
      width: 100%;
      border-radius: 4px;
    }

    .files-modified {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      margin: 24px 0;
    }

    .files-modified h3 {
      margin-bottom: 12px;
      font-size: 1rem;
      color: var(--text-color);
    }

    .files-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    .files-table th,
    .files-table td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }

    .files-table th {
      background: var(--accent-secondary);
      font-weight: 600;
    }

    .files-table .file-name {
      font-weight: 500;
      white-space: nowrap;
    }

    .files-table .file-path {
      color: var(--text-muted);
      font-family: 'SF Mono', Consolas, Monaco, monospace;
      font-size: 0.85rem;
      word-break: break-all;
    }

    footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    footer a {
      color: var(--accent-color);
    }

    @media (max-width: 600px) {
      body {
        padding: 12px;
      }

      .project-name {
        font-size: 1.25rem;
      }

      .content {
        padding: 16px;
      }

      .metadata {
        flex-direction: column;
        gap: 8px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="project-name">${escapeHtml(project)}</div>
      <div class="summary">${escapeHtml(summary)}</div>
      <div class="timestamp">${timestamp}</div>
    </header>

    ${userPromptSection}
    ${metaSection}
    ${outcomesSection}
    ${toolsSection}
    ${filesSection}
    ${audioSection}

    <main class="content">
      ${contentHtml}
    </main>

    <footer>
      <p>Generated by <a href="https://claude.ai/code" target="_blank">Claude Code</a> Notification Service</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, char => htmlEntities[char]);
}

/**
 * Render 404 page
 */
function render404Page(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Response Not Found</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #1a1a2e;
      color: #eaeaea;
    }
    .container {
      text-align: center;
      padding: 32px;
    }
    h1 {
      font-size: 4rem;
      color: #e94560;
      margin-bottom: 16px;
    }
    p {
      color: #a0a0a0;
      margin-bottom: 24px;
    }
    a {
      color: #e94560;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>This response has expired or does not exist.</p>
    <p>Responses are kept for 24 hours after creation.</p>
  </div>
</body>
</html>`;
}

/**
 * Render 404 page for project-specific route
 */
function render404ProjectPage(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>No Responses - ${escapeHtml(projectName)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: #1a1a2e;
      color: #eaeaea;
    }
    .container {
      text-align: center;
      padding: 32px;
      max-width: 500px;
    }
    h1 {
      font-size: 4rem;
      color: #e94560;
      margin-bottom: 16px;
    }
    .project-name {
      font-size: 1.5rem;
      color: #e94560;
      margin-bottom: 16px;
      font-weight: 600;
    }
    p {
      color: #a0a0a0;
      margin-bottom: 16px;
    }
    .hint {
      font-size: 0.9rem;
      color: #666;
      margin-top: 24px;
    }
    code {
      background: #0d1117;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', Consolas, Monaco, monospace;
    }
    a {
      color: #e94560;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <div class="project-name">${escapeHtml(projectName)}</div>
    <p>No responses found for this project.</p>
    <p>Responses are kept for 24 hours after creation.</p>
    <p class="hint">Project names are case-sensitive. Make sure you're using the exact project name as it appears in your notifications.</p>
  </div>
</body>
</html>`;
}

/**
 * Handle GET /response/:id request
 */
export function handleResponse(id: string): Response {
  if (DEBUG) {
    console.error(`[response] Fetching response: ${id}`);
  }

  const entry = getResponse(id);

  if (!entry) {
    if (DEBUG) {
      console.error(`[response] Response not found: ${id}`);
    }
    return new Response(render404Page(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const html = renderResponsePage(
    entry.project,
    entry.summary,
    entry.fullResponse,
    entry.metadata,
    entry.createdAt,
    entry.id,
    !!entry.audioPath,
    entry.userPrompt
  );

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

/**
 * Handle GET /project/:projectId/latest-response request
 * Returns the most recent response for a given project
 */
export function handleProjectLatestResponse(projectName: string): Response {
  if (DEBUG) {
    console.error(`[response] Fetching latest response for project: ${projectName}`);
  }

  const entry = getLatestResponseByProject(projectName);

  if (!entry) {
    if (DEBUG) {
      console.error(`[response] No responses found for project: ${projectName}`);
    }
    return new Response(render404ProjectPage(projectName), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const html = renderResponsePage(
    entry.project,
    entry.summary,
    entry.fullResponse,
    entry.metadata,
    entry.createdAt,
    entry.id,
    !!entry.audioPath,
    entry.userPrompt
  );

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, max-age=60', // Shorter cache for "latest"
    },
  });
}
