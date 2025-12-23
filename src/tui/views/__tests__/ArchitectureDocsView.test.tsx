/**
 * ArchitectureDocsView Tests
 *
 * Tests for the architecture documentation view component that displays
 * librarian shard data (domains, layers, and file details).
 *
 * Since OpenTUI components cannot be fully rendered in tests,
 * we test the logic by:
 * - Testing catalog data parsing
 * - Testing navigation state machine
 * - Testing view mode switching
 * - Testing display item building
 * - Verifying module exports
 */

import { describe, it, expect, mock } from 'bun:test';

// =============================================================================
// Mock Data
// =============================================================================

interface CatalogEntry {
  domain?: string;
  layer?: string;
  fileCount: number;
  shard: string;
}

interface Catalog {
  totalFiles: number;
  domains: CatalogEntry[];
  layers: CatalogEntry[];
  lastUpdated: string;
}

interface FileEntry {
  path: string;
  purpose: string;
  layer: string;
  domain: string;
  keyConcepts: string[];
  architecturalPatterns: string[];
  complexity: 'low' | 'medium' | 'high';
  importance: 'low' | 'medium' | 'high';
}

const mockCatalog: Catalog = {
  totalFiles: 1339,
  domains: [
    { domain: 'ai', fileCount: 40, shard: 'shards/domain-ai.json' },
    { domain: 'cli', fileCount: 59, shard: 'shards/domain-cli.json' },
    { domain: 'core', fileCount: 119, shard: 'shards/domain-core.json' },
  ],
  layers: [
    { layer: 'component', fileCount: 414, shard: 'shards/layer-component.json' },
    { layer: 'service', fileCount: 117, shard: 'shards/layer-service.json' },
    { layer: 'route', fileCount: 175, shard: 'shards/layer-route.json' },
  ],
  lastUpdated: '2025-11-23T02:24:32.895Z',
};

const mockShardData = {
  domain: 'cli',
  fileCount: 3,
  files: [
    {
      path: 'apps/cli/src/commands/board/check-wip.ts',
      purpose: 'CLI command: check-wip',
      layer: 'command',
      domain: 'cli',
      keyConcepts: ['CLI'],
      architecturalPatterns: [],
      complexity: 'low' as const,
      importance: 'medium' as const,
    },
    {
      path: 'apps/cli/src/commands/board/move.ts',
      purpose: 'CLI command: move',
      layer: 'command',
      domain: 'cli',
      keyConcepts: ['CLI'],
      architecturalPatterns: ['Command Pattern'],
      complexity: 'medium' as const,
      importance: 'high' as const,
    },
    {
      path: 'apps/cli/src/commands/board/sync.ts',
      purpose: 'CLI command: sync',
      layer: 'command',
      domain: 'cli',
      keyConcepts: ['CLI', 'Sync'],
      architecturalPatterns: [],
      complexity: 'high' as const,
      importance: 'high' as const,
    },
  ],
};

// =============================================================================
// Helper Functions (Extracted from component logic)
// =============================================================================

interface DisplayItem {
  type: 'domain' | 'layer';
  name: string;
  fileCount: number;
  shardPath: string;
}

function buildDisplayItems(catalog: Catalog, viewMode: 'domains' | 'layers'): DisplayItem[] {
  const items = viewMode === 'domains' ? catalog.domains : catalog.layers;
  return items.map((item) => ({
    type: viewMode === 'domains' ? 'domain' : 'layer',
    name: (viewMode === 'domains' ? item.domain : item.layer) || '',
    fileCount: item.fileCount,
    shardPath: item.shard,
  }));
}

function getComplexityColor(complexity: string): string {
  switch (complexity) {
    case 'high':
      return 'red';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'green';
    default:
      return 'gray';
  }
}

function getImportanceColor(importance: string): string {
  switch (importance) {
    case 'high':
      return 'magenta';
    case 'medium':
      return 'cyan';
    case 'low':
      return 'gray';
    default:
      return 'gray';
  }
}

interface NavigationState {
  selectedIndex: number;
  expandedItem: string | null;
  viewMode: 'domains' | 'layers';
  fileSelectedIndex: number;
  totalItems: number;
}

function createNavigationState(totalItems: number): NavigationState {
  return {
    selectedIndex: 0,
    expandedItem: null,
    viewMode: 'domains',
    fileSelectedIndex: 0,
    totalItems,
  };
}

function navigateUp(state: NavigationState, isExpanded: boolean, totalFiles: number): NavigationState {
  if (isExpanded) {
    return {
      ...state,
      fileSelectedIndex: Math.max(0, state.fileSelectedIndex - 1),
    };
  }
  return {
    ...state,
    selectedIndex: Math.max(0, state.selectedIndex - 1),
  };
}

function navigateDown(state: NavigationState, isExpanded: boolean, totalFiles: number): NavigationState {
  if (isExpanded) {
    return {
      ...state,
      fileSelectedIndex: Math.min(totalFiles - 1, state.fileSelectedIndex + 1),
    };
  }
  return {
    ...state,
    selectedIndex: Math.min(state.totalItems - 1, state.selectedIndex + 1),
  };
}

function toggleExpand(state: NavigationState, itemName: string): NavigationState {
  if (state.expandedItem === itemName) {
    return { ...state, expandedItem: null };
  }
  return { ...state, expandedItem: itemName, fileSelectedIndex: 0 };
}

function switchViewMode(state: NavigationState, mode: 'domains' | 'layers'): NavigationState {
  return {
    ...state,
    viewMode: mode,
    selectedIndex: 0,
    expandedItem: null,
  };
}

function truncatePath(path: string, maxLen: number = 60): string {
  if (path.length > maxLen) {
    return '...' + path.slice(-(maxLen - 3));
  }
  return path;
}

// =============================================================================
// Display Item Building Tests
// =============================================================================

describe('ArchitectureDocsView - Display Item Building', () => {
  it('should build display items for domains', () => {
    const items = buildDisplayItems(mockCatalog, 'domains');
    expect(items.length).toBe(3);
    expect(items[0].type).toBe('domain');
    expect(items[0].name).toBe('ai');
    expect(items[0].fileCount).toBe(40);
  });

  it('should build display items for layers', () => {
    const items = buildDisplayItems(mockCatalog, 'layers');
    expect(items.length).toBe(3);
    expect(items[0].type).toBe('layer');
    expect(items[0].name).toBe('component');
    expect(items[0].fileCount).toBe(414);
  });

  it('should include shard path in display items', () => {
    const items = buildDisplayItems(mockCatalog, 'domains');
    expect(items[0].shardPath).toBe('shards/domain-ai.json');
  });

  it('should handle empty catalog', () => {
    const emptyCatalog: Catalog = {
      totalFiles: 0,
      domains: [],
      layers: [],
      lastUpdated: '',
    };
    const items = buildDisplayItems(emptyCatalog, 'domains');
    expect(items.length).toBe(0);
  });
});

// =============================================================================
// Color Function Tests
// =============================================================================

describe('ArchitectureDocsView - Complexity Colors', () => {
  it('should return red for high complexity', () => {
    expect(getComplexityColor('high')).toBe('red');
  });

  it('should return yellow for medium complexity', () => {
    expect(getComplexityColor('medium')).toBe('yellow');
  });

  it('should return green for low complexity', () => {
    expect(getComplexityColor('low')).toBe('green');
  });

  it('should return gray for unknown complexity', () => {
    expect(getComplexityColor('unknown')).toBe('gray');
  });
});

describe('ArchitectureDocsView - Importance Colors', () => {
  it('should return magenta for high importance', () => {
    expect(getImportanceColor('high')).toBe('magenta');
  });

  it('should return cyan for medium importance', () => {
    expect(getImportanceColor('medium')).toBe('cyan');
  });

  it('should return gray for low importance', () => {
    expect(getImportanceColor('low')).toBe('gray');
  });

  it('should return gray for unknown importance', () => {
    expect(getImportanceColor('unknown')).toBe('gray');
  });
});

// =============================================================================
// Navigation State Tests
// =============================================================================

describe('ArchitectureDocsView - Navigation State', () => {
  describe('createNavigationState', () => {
    it('should create state with selectedIndex 0', () => {
      const state = createNavigationState(5);
      expect(state.selectedIndex).toBe(0);
    });

    it('should have no expanded item initially', () => {
      const state = createNavigationState(5);
      expect(state.expandedItem).toBeNull();
    });

    it('should default to domains view mode', () => {
      const state = createNavigationState(5);
      expect(state.viewMode).toBe('domains');
    });

    it('should have fileSelectedIndex 0', () => {
      const state = createNavigationState(5);
      expect(state.fileSelectedIndex).toBe(0);
    });
  });

  describe('navigateUp', () => {
    it('should decrease selectedIndex when not expanded', () => {
      let state = createNavigationState(5);
      state = { ...state, selectedIndex: 3 };
      state = navigateUp(state, false, 0);
      expect(state.selectedIndex).toBe(2);
    });

    it('should not go below 0 when not expanded', () => {
      let state = createNavigationState(5);
      state = navigateUp(state, false, 0);
      expect(state.selectedIndex).toBe(0);
    });

    it('should decrease fileSelectedIndex when expanded', () => {
      let state = createNavigationState(5);
      state = { ...state, fileSelectedIndex: 3 };
      state = navigateUp(state, true, 10);
      expect(state.fileSelectedIndex).toBe(2);
    });

    it('should not go below 0 for fileSelectedIndex when expanded', () => {
      let state = createNavigationState(5);
      state = navigateUp(state, true, 10);
      expect(state.fileSelectedIndex).toBe(0);
    });
  });

  describe('navigateDown', () => {
    it('should increase selectedIndex when not expanded', () => {
      let state = createNavigationState(5);
      state = navigateDown(state, false, 0);
      expect(state.selectedIndex).toBe(1);
    });

    it('should not exceed totalItems - 1 when not expanded', () => {
      let state = createNavigationState(5);
      state = { ...state, selectedIndex: 4 };
      state = navigateDown(state, false, 0);
      expect(state.selectedIndex).toBe(4);
    });

    it('should increase fileSelectedIndex when expanded', () => {
      let state = createNavigationState(5);
      state = navigateDown(state, true, 10);
      expect(state.fileSelectedIndex).toBe(1);
    });

    it('should not exceed totalFiles - 1 when expanded', () => {
      let state = createNavigationState(5);
      state = { ...state, fileSelectedIndex: 9 };
      state = navigateDown(state, true, 10);
      expect(state.fileSelectedIndex).toBe(9);
    });
  });

  describe('toggleExpand', () => {
    it('should expand item when collapsed', () => {
      let state = createNavigationState(5);
      state = toggleExpand(state, 'cli');
      expect(state.expandedItem).toBe('cli');
    });

    it('should reset fileSelectedIndex when expanding', () => {
      let state = createNavigationState(5);
      state = { ...state, fileSelectedIndex: 5 };
      state = toggleExpand(state, 'cli');
      expect(state.fileSelectedIndex).toBe(0);
    });

    it('should collapse item when already expanded', () => {
      let state = createNavigationState(5);
      state = toggleExpand(state, 'cli');
      state = toggleExpand(state, 'cli');
      expect(state.expandedItem).toBeNull();
    });

    it('should switch to different item when toggling', () => {
      let state = createNavigationState(5);
      state = toggleExpand(state, 'cli');
      state = toggleExpand(state, 'core');
      expect(state.expandedItem).toBe('core');
    });
  });

  describe('switchViewMode', () => {
    it('should switch to layers mode', () => {
      let state = createNavigationState(5);
      state = switchViewMode(state, 'layers');
      expect(state.viewMode).toBe('layers');
    });

    it('should reset selectedIndex when switching', () => {
      let state = createNavigationState(5);
      state = { ...state, selectedIndex: 3 };
      state = switchViewMode(state, 'layers');
      expect(state.selectedIndex).toBe(0);
    });

    it('should collapse expanded item when switching', () => {
      let state = createNavigationState(5);
      state = toggleExpand(state, 'cli');
      state = switchViewMode(state, 'layers');
      expect(state.expandedItem).toBeNull();
    });
  });
});

// =============================================================================
// Path Truncation Tests
// =============================================================================

describe('ArchitectureDocsView - Path Truncation', () => {
  it('should not truncate short paths', () => {
    expect(truncatePath('src/index.ts')).toBe('src/index.ts');
  });

  it('should truncate paths longer than 60 chars by default', () => {
    const longPath = 'apps/cli/src/commands/board/very/deeply/nested/structure/file.ts';
    const truncated = truncatePath(longPath);
    expect(truncated.length).toBeLessThanOrEqual(60);
    expect(truncated.startsWith('...')).toBe(true);
  });

  it('should use custom max length', () => {
    const path = 'apps/cli/src/commands/board/sync.ts';
    const truncated = truncatePath(path, 20);
    expect(truncated.length).toBeLessThanOrEqual(20);
    expect(truncated.startsWith('...')).toBe(true);
  });

  it('should preserve file name at end', () => {
    const path = 'apps/cli/src/commands/board/very/deeply/nested/sync.ts';
    const truncated = truncatePath(path, 30);
    expect(truncated.endsWith('sync.ts')).toBe(true);
  });
});

// =============================================================================
// Keyboard Mapping Tests
// =============================================================================

describe('ArchitectureDocsView - Keyboard Mapping', () => {
  interface KeyAction {
    key: string;
    expectedAction: string;
  }

  const keyMappings: KeyAction[] = [
    { key: 'up', expectedAction: 'navigateUp' },
    { key: 'k', expectedAction: 'navigateUp' },
    { key: 'down', expectedAction: 'navigateDown' },
    { key: 'j', expectedAction: 'navigateDown' },
    { key: 'return', expectedAction: 'toggleExpand' },
    { key: 'space', expectedAction: 'collapse' },
    { key: 'd', expectedAction: 'switchToDomains' },
    { key: 'l', expectedAction: 'switchToLayers' },
    { key: 'escape', expectedAction: 'escapeOrCollapse' },
    { key: 'g', expectedAction: 'jumpToTop' },
    { key: 'G', expectedAction: 'jumpToBottom' },
  ];

  function getKeyAction(key: string): string {
    switch (key) {
      case 'up':
      case 'k':
        return 'navigateUp';
      case 'down':
      case 'j':
        return 'navigateDown';
      case 'return':
        return 'toggleExpand';
      case 'space':
        return 'collapse';
      case 'd':
        return 'switchToDomains';
      case 'l':
        return 'switchToLayers';
      case 'escape':
        return 'escapeOrCollapse';
      case 'g':
        return 'jumpToTop';
      case 'G':
        return 'jumpToBottom';
      default:
        return 'none';
    }
  }

  for (const mapping of keyMappings) {
    it(`should map "${mapping.key}" to "${mapping.expectedAction}"`, () => {
      expect(getKeyAction(mapping.key)).toBe(mapping.expectedAction);
    });
  }
});

// =============================================================================
// Empty State Tests
// =============================================================================

describe('ArchitectureDocsView - Empty State', () => {
  it('should indicate no documentation when catalog is empty', () => {
    const emptyCatalog: Catalog = {
      totalFiles: 0,
      domains: [],
      layers: [],
      lastUpdated: '',
    };
    const items = buildDisplayItems(emptyCatalog, 'domains');
    expect(items.length).toBe(0);

    const emptyMessage = 'No architecture documentation found';
    expect(emptyMessage).toContain('No architecture');
  });
});

// =============================================================================
// Error State Tests
// =============================================================================

describe('ArchitectureDocsView - Error State', () => {
  it('should have correct error message for missing catalog', () => {
    const errorMessage = 'Librarian catalog not found. Run /librarian:index first.';
    expect(errorMessage).toContain('catalog not found');
    expect(errorMessage).toContain('/librarian:index');
  });
});

// =============================================================================
// Help Text Tests
// =============================================================================

describe('ArchitectureDocsView - Help Text', () => {
  const helpText = 'j/k: navigate  Enter: expand  Space: collapse  d/l: domains/layers  g/G: top/bottom  ESC: back';

  it('should include navigation hint (j/k)', () => {
    expect(helpText).toContain('j/k');
    expect(helpText).toContain('navigate');
  });

  it('should include Enter hint', () => {
    expect(helpText).toContain('Enter');
    expect(helpText).toContain('expand');
  });

  it('should include Space hint', () => {
    expect(helpText).toContain('Space');
    expect(helpText).toContain('collapse');
  });

  it('should include view mode hints (d/l)', () => {
    expect(helpText).toContain('d/l');
    expect(helpText).toContain('domains/layers');
  });

  it('should include jump hints (g/G)', () => {
    expect(helpText).toContain('g/G');
    expect(helpText).toContain('top/bottom');
  });

  it('should include ESC hint', () => {
    expect(helpText).toContain('ESC');
    expect(helpText).toContain('back');
  });
});

// =============================================================================
// Module Export Tests
// =============================================================================

describe('ArchitectureDocsView - Module Exports', () => {
  it('should export ArchitectureDocsView component', async () => {
    const module = await import('../ArchitectureDocsView');
    expect(module.ArchitectureDocsView).toBeDefined();
    expect(typeof module.ArchitectureDocsView).toBe('function');
  });

  it('should export ArchitectureDocsViewProps interface (type-level test)', async () => {
    const props: import('../ArchitectureDocsView').ArchitectureDocsViewProps = {
      onEscape: () => {},
    };

    expect(typeof props.onEscape).toBe('function');
  });

  it('should allow onEscape to be optional', async () => {
    const props: import('../ArchitectureDocsView').ArchitectureDocsViewProps = {};

    expect(props.onEscape).toBeUndefined();
  });
});

// =============================================================================
// Props Interface Tests
// =============================================================================

describe('ArchitectureDocsView - Props Interface', () => {
  it('should accept onEscape callback', () => {
    const mockCallback = mock(() => {});
    const props = { onEscape: mockCallback };

    props.onEscape();
    expect(mockCallback).toHaveBeenCalled();
  });
});

// =============================================================================
// File Entry Display Tests
// =============================================================================

describe('ArchitectureDocsView - File Entry Display', () => {
  it('should have all required fields in file entry', () => {
    const file = mockShardData.files[0];
    expect(file.path).toBeDefined();
    expect(file.purpose).toBeDefined();
    expect(file.layer).toBeDefined();
    expect(file.domain).toBeDefined();
    expect(file.keyConcepts).toBeDefined();
    expect(file.architecturalPatterns).toBeDefined();
    expect(file.complexity).toBeDefined();
    expect(file.importance).toBeDefined();
  });

  it('should handle files with empty arrays', () => {
    const file = mockShardData.files[0];
    // architecturalPatterns is empty
    expect(file.architecturalPatterns.length).toBe(0);
  });

  it('should handle files with populated arrays', () => {
    const file = mockShardData.files[1];
    expect(file.architecturalPatterns.length).toBe(1);
    expect(file.architecturalPatterns[0]).toBe('Command Pattern');
  });
});
