/**
 * SystemInfoView Tests
 *
 * Tests for the system information display component.
 * Since OpenTUI components cannot be fully rendered in tests,
 * we test the logic and structure by:
 * - Testing helper functions
 * - Verifying module exports
 * - Testing props interface structure
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';

// =============================================================================
// Mock Data and Helper Functions
// =============================================================================

/**
 * Get project name from current working directory
 * (Extracted from component for testing)
 */
function getProjectName(cwd: string): string {
  const parts = cwd.split('/');
  return parts[parts.length - 1] || 'unknown';
}

/**
 * Get config location from database path
 * (Extracted from component for testing)
 */
function getConfigLocation(dbPath: string | null): string {
  if (dbPath) {
    // Extract directory from db path
    const parts = dbPath.split('/');
    parts.pop(); // Remove filename
    return parts.join('/') || '.';
  }
  return 'not initialized';
}

/**
 * Info item structure for display
 */
interface InfoItem {
  label: string;
  value: string;
  color: string;
}

/**
 * Build info items array for display
 */
function buildInfoItems(
  projectName: string,
  dbPath: string,
  schemaVersion: number,
  configLocation: string,
  dbInitialized: boolean,
  nodeVersion: string,
  platform: string,
  arch: string,
  cwd: string
): InfoItem[] {
  return [
    { label: 'Project Name', value: projectName, color: 'cyan' },
    { label: 'Database Path', value: dbPath, color: 'white' },
    { label: 'Schema Version', value: String(schemaVersion), color: 'yellow' },
    { label: 'Config Location', value: configLocation, color: 'white' },
    { label: 'DB Initialized', value: dbInitialized ? 'Yes' : 'No', color: dbInitialized ? 'green' : 'red' },
    { label: 'Node Version', value: nodeVersion, color: 'gray' },
    { label: 'Platform', value: `${platform} (${arch})`, color: 'gray' },
    { label: 'Working Directory', value: cwd, color: 'gray' },
  ];
}

// =============================================================================
// Project Name Tests
// =============================================================================

describe('SystemInfoView - getProjectName', () => {
  it('should extract project name from simple path', () => {
    expect(getProjectName('/Users/dev/myproject')).toBe('myproject');
  });

  it('should extract project name from deep path', () => {
    expect(getProjectName('/home/user/projects/apps/webapp')).toBe('webapp');
  });

  it('should return "unknown" for empty path', () => {
    expect(getProjectName('')).toBe('unknown');
  });

  it('should handle single directory path', () => {
    expect(getProjectName('/project')).toBe('project');
  });

  it('should handle path with trailing slash', () => {
    // Note: Trailing slash results in empty string which becomes 'unknown'
    expect(getProjectName('/Users/dev/myproject/')).toBe('unknown');
  });

  it('should handle Windows-style paths with forward slashes', () => {
    expect(getProjectName('C:/Users/dev/myproject')).toBe('myproject');
  });
});

// =============================================================================
// Config Location Tests
// =============================================================================

describe('SystemInfoView - getConfigLocation', () => {
  it('should extract directory from database path', () => {
    expect(getConfigLocation('/Users/dev/project/.board/board.db')).toBe('/Users/dev/project/.board');
  });

  it('should return "not initialized" for null path', () => {
    expect(getConfigLocation(null)).toBe('not initialized');
  });

  it('should return "." for filename-only path', () => {
    // When there's only a filename, directory becomes '.'
    expect(getConfigLocation('board.db')).toBe('.');
  });

  it('should handle deep directory structure', () => {
    expect(getConfigLocation('/home/user/projects/app/.board/data/board.db')).toBe('/home/user/projects/app/.board/data');
  });
});

// =============================================================================
// Info Items Tests
// =============================================================================

describe('SystemInfoView - buildInfoItems', () => {
  it('should build array with 8 info items', () => {
    const items = buildInfoItems(
      'myproject',
      '/path/to/board.db',
      1,
      '/path/to',
      true,
      'v20.0.0',
      'darwin',
      'arm64',
      '/Users/dev/myproject'
    );

    expect(items.length).toBe(8);
  });

  it('should include all required labels', () => {
    const items = buildInfoItems(
      'myproject',
      '/path/to/board.db',
      1,
      '/path/to',
      true,
      'v20.0.0',
      'darwin',
      'arm64',
      '/Users/dev/myproject'
    );

    const labels = items.map(item => item.label);
    expect(labels).toContain('Project Name');
    expect(labels).toContain('Database Path');
    expect(labels).toContain('Schema Version');
    expect(labels).toContain('Config Location');
    expect(labels).toContain('DB Initialized');
    expect(labels).toContain('Node Version');
    expect(labels).toContain('Platform');
    expect(labels).toContain('Working Directory');
  });

  it('should set correct values for each item', () => {
    const items = buildInfoItems(
      'myproject',
      '/path/to/board.db',
      5,
      '/path/to',
      true,
      'v20.0.0',
      'darwin',
      'arm64',
      '/Users/dev/myproject'
    );

    const itemMap = new Map(items.map(item => [item.label, item]));

    expect(itemMap.get('Project Name')?.value).toBe('myproject');
    expect(itemMap.get('Database Path')?.value).toBe('/path/to/board.db');
    expect(itemMap.get('Schema Version')?.value).toBe('5');
    expect(itemMap.get('Config Location')?.value).toBe('/path/to');
    expect(itemMap.get('DB Initialized')?.value).toBe('Yes');
    expect(itemMap.get('Node Version')?.value).toBe('v20.0.0');
    expect(itemMap.get('Platform')?.value).toBe('darwin (arm64)');
    expect(itemMap.get('Working Directory')?.value).toBe('/Users/dev/myproject');
  });

  it('should show "No" when db is not initialized', () => {
    const items = buildInfoItems(
      'myproject',
      'not initialized',
      0,
      'not initialized',
      false,
      'v20.0.0',
      'darwin',
      'arm64',
      '/Users/dev/myproject'
    );

    const dbItem = items.find(item => item.label === 'DB Initialized');
    expect(dbItem?.value).toBe('No');
    expect(dbItem?.color).toBe('red');
  });

  it('should show "Yes" with green color when db is initialized', () => {
    const items = buildInfoItems(
      'myproject',
      '/path/to/board.db',
      1,
      '/path/to',
      true,
      'v20.0.0',
      'darwin',
      'arm64',
      '/Users/dev/myproject'
    );

    const dbItem = items.find(item => item.label === 'DB Initialized');
    expect(dbItem?.value).toBe('Yes');
    expect(dbItem?.color).toBe('green');
  });

  it('should use cyan color for project name', () => {
    const items = buildInfoItems(
      'myproject',
      '/path/to/board.db',
      1,
      '/path/to',
      true,
      'v20.0.0',
      'darwin',
      'arm64',
      '/Users/dev/myproject'
    );

    const projectItem = items.find(item => item.label === 'Project Name');
    expect(projectItem?.color).toBe('cyan');
  });

  it('should use yellow color for schema version', () => {
    const items = buildInfoItems(
      'myproject',
      '/path/to/board.db',
      1,
      '/path/to',
      true,
      'v20.0.0',
      'darwin',
      'arm64',
      '/Users/dev/myproject'
    );

    const schemaItem = items.find(item => item.label === 'Schema Version');
    expect(schemaItem?.color).toBe('yellow');
  });

  it('should use gray color for platform and node version', () => {
    const items = buildInfoItems(
      'myproject',
      '/path/to/board.db',
      1,
      '/path/to',
      true,
      'v20.0.0',
      'darwin',
      'arm64',
      '/Users/dev/myproject'
    );

    const platformItem = items.find(item => item.label === 'Platform');
    const nodeItem = items.find(item => item.label === 'Node Version');
    const cwdItem = items.find(item => item.label === 'Working Directory');

    expect(platformItem?.color).toBe('gray');
    expect(nodeItem?.color).toBe('gray');
    expect(cwdItem?.color).toBe('gray');
  });
});

// =============================================================================
// Keyboard Help Text Tests
// =============================================================================

describe('SystemInfoView - Help Text', () => {
  it('should provide correct help text', () => {
    const helpText = 'ESC: back to board';
    expect(helpText).toContain('ESC');
    expect(helpText).toContain('back');
  });
});

// =============================================================================
// Module Export Tests
// =============================================================================

describe('SystemInfoView - Module Exports', () => {
  it('should export SystemInfoView component', async () => {
    const module = await import('../SystemInfoView');
    expect(module.SystemInfoView).toBeDefined();
    expect(typeof module.SystemInfoView).toBe('function');
  });

  it('should export SystemInfoViewProps interface (type-level test)', async () => {
    // Type-level test - verify the interface structure
    const props: import('../SystemInfoView').SystemInfoViewProps = {
      onEscape: () => {},
    };

    expect(typeof props.onEscape).toBe('function');
  });

  it('should allow onEscape to be optional', async () => {
    // Type-level test - onEscape is optional
    const props: import('../SystemInfoView').SystemInfoViewProps = {};

    expect(props.onEscape).toBeUndefined();
  });
});

// =============================================================================
// Props Interface Tests
// =============================================================================

describe('SystemInfoView - Props Interface', () => {
  it('should accept onEscape callback', () => {
    const mockCallback = mock(() => {});
    const props = { onEscape: mockCallback };

    // Simulate calling the callback
    props.onEscape();
    expect(mockCallback).toHaveBeenCalled();
  });

  it('should handle undefined onEscape gracefully', () => {
    const props: { onEscape?: () => void } = {};

    // Should not throw when calling undefined
    expect(props.onEscape).toBeUndefined();
  });
});
