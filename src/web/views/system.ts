/**
 * System Info View - System information display
 *
 * Shows database path, schema version, project configuration,
 * connected adapters, and other system details for debugging.
 */

import { renderLayout, escapeHtml, formatRelativeTime } from './layout';
import type { AdapterInfo } from '../../adapters';

export interface SystemInfoData {
  dbPath: string | null;
  dbInitialized: boolean;
  schemaVersion: number;
  projectName: string;
  configLocation: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  cwd: string;
  adapters: AdapterInfo[];
}

/**
 * Get the appropriate status badge class and color for an adapter status
 */
function getStatusBadge(status: AdapterInfo['status']): { class: string; color: string } {
  switch (status) {
    case 'online':
      return { class: 'online', color: 'var(--accent-green)' };
    case 'offline':
      return { class: 'offline', color: 'var(--accent-red)' };
    case 'error':
      return { class: 'error', color: 'var(--accent-yellow)' };
  }
}

/**
 * Format uptime in human-readable form
 */
function formatUptime(seconds: number | undefined): string {
  if (seconds === undefined) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/**
 * Render a single adapter card
 */
function renderAdapterCard(adapter: AdapterInfo): string {
  const statusBadge = getStatusBadge(adapter.status);

  // Build sync stats if available
  let syncStatsHtml = '';
  if (adapter.sync) {
    const lastSync = adapter.sync.lastInboundSync || adapter.sync.lastOutboundSync;
    syncStatsHtml = `
      <div class="adapter-sync">
        <div class="sync-stat">
          <span class="label">Last Sync:</span>
          <span class="value">${lastSync ? formatRelativeTime(lastSync) : 'Never'}</span>
        </div>
        <div class="sync-stat">
          <span class="label">Inbound:</span>
          <span class="value">${adapter.sync.inboundCount ?? 0}</span>
        </div>
        <div class="sync-stat">
          <span class="label">Outbound:</span>
          <span class="value">${adapter.sync.outboundCount ?? 0}</span>
        </div>
        ${adapter.sync.errorCount ? `
        <div class="sync-stat error">
          <span class="label">Errors:</span>
          <span class="value" style="color: var(--accent-red);">${adapter.sync.errorCount}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  // Build config info if available
  let configHtml = '';
  if (adapter.config && (adapter.config.org || adapter.config.project)) {
    configHtml = `
      <div class="adapter-config">
        ${adapter.config.org ? `<span class="config-item">Org: ${escapeHtml(adapter.config.org)}</span>` : ''}
        ${adapter.config.project ? `<span class="config-item">Project: ${escapeHtml(adapter.config.project)}</span>` : ''}
      </div>
    `;
  }

  return `
    <div class="adapter-card ${adapter.status}">
      <div class="adapter-header">
        <div class="adapter-name">${escapeHtml(adapter.displayName)}</div>
        <span class="adapter-status-badge" style="background-color: ${statusBadge.color};">${adapter.status}</span>
      </div>
      <div class="adapter-details">
        <div class="adapter-info-row">
          <span class="label">Port:</span>
          <span class="value">${adapter.port}</span>
        </div>
        ${adapter.status === 'online' ? `
        <div class="adapter-info-row">
          <span class="label">Version:</span>
          <span class="value">${escapeHtml(adapter.version)}</span>
        </div>
        <div class="adapter-info-row">
          <span class="label">Uptime:</span>
          <span class="value">${formatUptime(adapter.health?.uptime)}</span>
        </div>
        ` : ''}
        ${configHtml}
        ${syncStatsHtml}
      </div>
    </div>
  `;
}

/**
 * Render the adapters section
 */
function renderAdaptersSection(adapters: AdapterInfo[]): string {
  if (adapters.length === 0) {
    return `
      <div class="system-info" style="margin-top: 1.5rem;">
        <h2>Connected Adapters</h2>
        <div class="empty-state" style="padding: 1.5rem;">
          <p style="color: var(--text-muted);">No adapters detected</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="system-info" style="margin-top: 1.5rem;">
      <h2>Connected Adapters</h2>
      <div class="adapters-grid">
        ${adapters.map(renderAdapterCard).join('')}
      </div>
    </div>
    <style>
      .adapters-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }
      .adapter-card {
        background-color: var(--bg-tertiary);
        border-radius: 8px;
        padding: 1rem;
        border-left: 4px solid var(--accent-gray);
      }
      .adapter-card.online {
        border-left-color: var(--accent-green);
      }
      .adapter-card.offline {
        border-left-color: var(--accent-red);
      }
      .adapter-card.error {
        border-left-color: var(--accent-yellow);
      }
      .adapter-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--border-color);
      }
      .adapter-name {
        font-weight: 600;
        color: var(--text-primary);
      }
      .adapter-status-badge {
        display: inline-block;
        padding: 0.125rem 0.5rem;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--bg-primary);
      }
      .adapter-details {
        font-size: 0.875rem;
      }
      .adapter-info-row {
        display: flex;
        justify-content: space-between;
        padding: 0.25rem 0;
      }
      .adapter-info-row .label {
        color: var(--text-muted);
      }
      .adapter-info-row .value {
        color: var(--text-primary);
      }
      .adapter-config {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid var(--border-color);
      }
      .adapter-config .config-item {
        display: block;
        font-size: 0.75rem;
        color: var(--text-secondary);
      }
      .adapter-sync {
        margin-top: 0.5rem;
        padding-top: 0.5rem;
        border-top: 1px solid var(--border-color);
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.25rem;
      }
      .adapter-sync .sync-stat {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
      }
      .adapter-sync .sync-stat .label {
        color: var(--text-muted);
      }
      .adapter-sync .sync-stat .value {
        color: var(--text-secondary);
      }
    </style>
  `;
}

/**
 * Render the system info view
 */
export function renderSystemInfo(data: SystemInfoData): string {
  const {
    dbPath,
    dbInitialized,
    schemaVersion,
    projectName,
    configLocation,
    nodeVersion,
    platform,
    arch,
    cwd,
    adapters,
  } = data;

  const infoItems = [
    { label: 'Project Name', value: projectName, color: 'var(--accent-cyan)' },
    { label: 'Database Path', value: dbPath || 'not initialized', color: 'var(--text-primary)' },
    { label: 'Schema Version', value: String(schemaVersion), color: 'var(--accent-yellow)' },
    { label: 'Config Location', value: configLocation, color: 'var(--text-primary)' },
    {
      label: 'DB Initialized',
      value: dbInitialized ? 'Yes' : 'No',
      color: dbInitialized ? 'var(--accent-green)' : 'var(--accent-red)',
    },
    { label: 'Bun/Node Version', value: nodeVersion, color: 'var(--text-muted)' },
    { label: 'Platform', value: `${platform} (${arch})`, color: 'var(--text-muted)' },
    { label: 'Working Directory', value: cwd, color: 'var(--text-muted)' },
  ];

  const content = `
    <div class="system-info">
      <h2>System Information</h2>
      <div class="system-info-grid">
        ${infoItems.map((item) => `
          <div class="system-info-row">
            <span class="label">${escapeHtml(item.label)}</span>
            <span class="value" style="color: ${item.color};">${escapeHtml(item.value)}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="system-info" style="margin-top: 1.5rem;">
      <h2>Environment</h2>
      <div class="system-info-grid">
        <div class="system-info-row">
          <span class="label">WEB_PORT</span>
          <span class="value">${escapeHtml(process.env.WEB_PORT || '3345 (default)')}</span>
        </div>
        <div class="system-info-row">
          <span class="label">BOARD_DB_PATH</span>
          <span class="value">${escapeHtml(process.env.BOARD_DB_PATH || '(not set)')}</span>
        </div>
      </div>
    </div>

    ${renderAdaptersSection(adapters)}
  `;

  return renderLayout({
    title: 'System Info',
    currentPath: '/system',
    content,
  });
}
