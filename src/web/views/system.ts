/**
 * System Info View - System information display
 *
 * Shows database path, schema version, project configuration,
 * and other system details for debugging.
 */

import { renderLayout, escapeHtml } from './layout';

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
  `;

  return renderLayout({
    title: 'System Info',
    currentPath: '/system',
    content,
  });
}
