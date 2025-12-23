/**
 * ArchitectureDocsView - View for architecture documentation from librarian shards
 *
 * Displays domains and layers from the librarian catalog with file details.
 * Similar to RetrospectivesView in navigation and expansion behavior.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `backgroundColor` for box background colors
 * - Use `attributes={TextAttributes.BOLD}` for bold, not `bold`
 */

import React, { useState, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Props for ArchitectureDocsView component
 */
export interface ArchitectureDocsViewProps {
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

/**
 * Catalog structure from catalog.json
 */
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

/**
 * File entry from shard files
 */
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

interface ShardData {
  domain?: string;
  layer?: string;
  fileCount: number;
  files: FileEntry[];
}

/**
 * Display item for the list
 */
interface DisplayItem {
  type: 'domain' | 'layer';
  name: string;
  fileCount: number;
  shardPath: string;
}

/**
 * Get complexity color
 */
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

/**
 * Get importance color
 */
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

/**
 * ArchitectureDocsView component
 *
 * Displays architecture documentation from librarian shards.
 *
 * @param props - Component props
 * @returns ArchitectureDocsView JSX
 *
 * @example
 * ```tsx
 * <ArchitectureDocsView
 *   onEscape={() => setView('board')}
 * />
 * ```
 */
export function ArchitectureDocsView({
  onEscape,
}: ArchitectureDocsViewProps) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [shardData, setShardData] = useState<ShardData | null>(null);
  const [viewMode, setViewMode] = useState<'domains' | 'layers'>('domains');
  const [fileSelectedIndex, setFileSelectedIndex] = useState(0);

  // Load catalog on mount
  useEffect(() => {
    try {
      const catalogPath = join(process.cwd(), '.agent/librarian/shards/catalog.json');
      if (!existsSync(catalogPath)) {
        setError('Librarian catalog not found. Run /librarian:index first.');
        setIsLoading(false);
        return;
      }

      const catalogContent = readFileSync(catalogPath, 'utf-8');
      const data = JSON.parse(catalogContent) as Catalog;
      setCatalog(data);
      setIsLoading(false);
    } catch (err) {
      setError(`Failed to load catalog: ${err instanceof Error ? err.message : String(err)}`);
      setIsLoading(false);
    }
  }, []);

  // Load shard data when expanded
  useEffect(() => {
    if (!expandedItem || !catalog) {
      setShardData(null);
      return;
    }

    try {
      const items = viewMode === 'domains' ? catalog.domains : catalog.layers;
      const item = items.find((i) =>
        viewMode === 'domains' ? i.domain === expandedItem : i.layer === expandedItem
      );

      if (!item) {
        setShardData(null);
        return;
      }

      const shardPath = join(process.cwd(), '.agent/librarian', item.shard);
      if (!existsSync(shardPath)) {
        setShardData(null);
        return;
      }

      const shardContent = readFileSync(shardPath, 'utf-8');
      const data = JSON.parse(shardContent) as ShardData;
      setShardData(data);
      setFileSelectedIndex(0);
    } catch {
      setShardData(null);
    }
  }, [expandedItem, catalog, viewMode]);

  // Build display items
  const displayItems: DisplayItem[] = [];
  if (catalog) {
    const items = viewMode === 'domains' ? catalog.domains : catalog.layers;
    for (const item of items) {
      displayItems.push({
        type: viewMode === 'domains' ? 'domain' : 'layer',
        name: (viewMode === 'domains' ? item.domain : item.layer) || '',
        fileCount: item.fileCount,
        shardPath: item.shard,
      });
    }
  }

  // Keyboard handler
  useKeyboard((event: KeyEvent) => {
    // Navigate up
    if (event.name === 'up' || event.name === 'k') {
      if (expandedItem && shardData) {
        // Navigate within files when expanded
        setFileSelectedIndex((i) => Math.max(0, i - 1));
      } else {
        setSelectedIndex((i) => Math.max(0, i - 1));
      }
      return;
    }

    // Navigate down
    if (event.name === 'down' || event.name === 'j') {
      if (expandedItem && shardData) {
        // Navigate within files when expanded
        setFileSelectedIndex((i) => Math.min(shardData.files.length - 1, i + 1));
      } else {
        setSelectedIndex((i) => Math.min(displayItems.length - 1, i + 1));
      }
      return;
    }

    // Toggle expand with Enter
    if (event.name === 'return') {
      const item = displayItems[selectedIndex];
      if (item) {
        if (expandedItem === item.name) {
          // Collapse
          setExpandedItem(null);
        } else {
          // Expand
          setExpandedItem(item.name);
        }
      }
      return;
    }

    // Collapse with space
    if (event.name === 'space') {
      setExpandedItem(null);
      return;
    }

    // Toggle view mode with 'd' for domains, 'l' for layers
    if (event.name === 'd') {
      setViewMode('domains');
      setSelectedIndex(0);
      setExpandedItem(null);
      return;
    }

    if (event.name === 'l') {
      setViewMode('layers');
      setSelectedIndex(0);
      setExpandedItem(null);
      return;
    }

    // Go back with Escape
    if (event.name === 'escape') {
      if (expandedItem) {
        setExpandedItem(null);
      } else if (onEscape) {
        onEscape();
      }
      return;
    }

    // Jump to top with g
    if (event.name === 'g') {
      if (expandedItem && shardData) {
        setFileSelectedIndex(0);
      } else {
        setSelectedIndex(0);
      }
      return;
    }

    // Jump to bottom with G (shift+g)
    if (event.name === 'G') {
      if (expandedItem && shardData) {
        setFileSelectedIndex(Math.max(0, shardData.files.length - 1));
      } else {
        setSelectedIndex(Math.max(0, displayItems.length - 1));
      }
      return;
    }
  });

  // Loading state
  if (isLoading) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        alignItems="center"
        justifyContent="center"
      >
        <text fg="yellow">Loading architecture docs...</text>
      </box>
    );
  }

  // Error state
  if (error) {
    return (
      <box flexDirection="column" width="100%" padding={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Architecture Docs
        </text>
        <box marginTop={1}>
          <text fg="red">{error}</text>
        </box>
        <box marginTop={2}>
          <text fg="gray">ESC: back to board</text>
        </box>
      </box>
    );
  }

  // Empty state
  if (!catalog || displayItems.length === 0) {
    return (
      <box flexDirection="column" width="100%" padding={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Architecture Docs
        </text>
        <box marginTop={1}>
          <text fg="gray">No architecture documentation found</text>
        </box>
        <box marginTop={1}>
          <text fg="gray">Run /librarian:index to generate architecture docs.</text>
        </box>
        <box marginTop={2}>
          <text fg="gray">ESC: back to board</text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" width="100%" height="100%" padding={1}>
      {/* Header */}
      <box flexDirection="row" marginBottom={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Architecture Docs
        </text>
        <text fg="gray">{` (${catalog.totalFiles} files, ${catalog.domains.length} domains, ${catalog.layers.length} layers)`}</text>
      </box>

      {/* View mode tabs */}
      <box flexDirection="row" marginBottom={1}>
        <text
          fg={viewMode === 'domains' ? 'cyan' : 'gray'}
          attributes={viewMode === 'domains' ? TextAttributes.BOLD : undefined}
        >
          [d] Domains
        </text>
        <text fg="gray">{`  `}</text>
        <text
          fg={viewMode === 'layers' ? 'cyan' : 'gray'}
          attributes={viewMode === 'layers' ? TextAttributes.BOLD : undefined}
        >
          [l] Layers
        </text>
      </box>

      {/* Scrollable list */}
      <scrollbox flexGrow={1}>
        <box flexDirection="column">
          {displayItems.map((item, index) => {
            const isFocused = index === selectedIndex;
            const isExpanded = expandedItem === item.name;

            return (
              <box key={item.name} flexDirection="column" marginBottom={1}>
                {/* Item row */}
                <box
                  flexDirection="row"
                  backgroundColor={isFocused ? 'blue' : undefined}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <box width={3}>
                    <text fg={isFocused ? 'white' : 'gray'}>
                      {isExpanded ? 'v' : '>'}
                    </text>
                  </box>
                  <box width={40}>
                    <text fg={isFocused ? 'white' : 'cyan'}>{item.name}</text>
                  </box>
                  <box width={15}>
                    <text fg={isFocused ? 'white' : 'yellow'}>
                      {`${item.fileCount} files`}
                    </text>
                  </box>
                  <box>
                    <text fg={isFocused ? 'white' : 'gray'}>
                      {item.type}
                    </text>
                  </box>
                </box>

                {/* Expanded files section */}
                {isExpanded && shardData && shardData.files.length > 0 && (
                  <box
                    flexDirection="column"
                    marginLeft={2}
                    marginTop={1}
                    marginBottom={1}
                    border={true}
                    borderStyle="single"
                    borderColor="gray"
                    padding={1}
                  >
                    <text fg="magenta" attributes={TextAttributes.BOLD}>
                      {`Files (${shardData.files.length}):`}
                    </text>
                    <scrollbox maxHeight={15}>
                      <box flexDirection="column">
                        {shardData.files.map((file, fileIndex) => {
                          const isFileFocused = fileIndex === fileSelectedIndex;

                          // Truncate path for display
                          const maxPathLen = 60;
                          const displayPath =
                            file.path.length > maxPathLen
                              ? '...' + file.path.slice(-(maxPathLen - 3))
                              : file.path;

                          return (
                            <box
                              key={file.path}
                              flexDirection="column"
                              marginTop={fileIndex === 0 ? 1 : 0}
                              marginBottom={1}
                              backgroundColor={isFileFocused ? 'gray' : undefined}
                              paddingLeft={1}
                            >
                              <box flexDirection="row">
                                <text fg={isFileFocused ? 'white' : 'green'}>{displayPath}</text>
                              </box>
                              <box flexDirection="row" marginLeft={2}>
                                <text fg="gray">{`Purpose: `}</text>
                                <text fg="white">{file.purpose || 'N/A'}</text>
                              </box>
                              <box flexDirection="row" marginLeft={2}>
                                <text fg="gray">{`Layer: `}</text>
                                <text fg="cyan">{file.layer}</text>
                                <text fg="gray">{`  Complexity: `}</text>
                                <text fg={getComplexityColor(file.complexity)}>{file.complexity}</text>
                                <text fg="gray">{`  Importance: `}</text>
                                <text fg={getImportanceColor(file.importance)}>{file.importance}</text>
                              </box>
                              {file.keyConcepts.length > 0 && (
                                <box flexDirection="row" marginLeft={2}>
                                  <text fg="gray">{`Concepts: `}</text>
                                  <text fg="yellow">{file.keyConcepts.join(', ')}</text>
                                </box>
                              )}
                              {file.architecturalPatterns.length > 0 && (
                                <box flexDirection="row" marginLeft={2}>
                                  <text fg="gray">{`Patterns: `}</text>
                                  <text fg="magenta">{file.architecturalPatterns.join(', ')}</text>
                                </box>
                              )}
                            </box>
                          );
                        })}
                      </box>
                    </scrollbox>
                  </box>
                )}

                {/* Expanded but no files */}
                {isExpanded && shardData && shardData.files.length === 0 && (
                  <box marginLeft={2} marginTop={1} marginBottom={1}>
                    <text fg="gray">No files in this {item.type}</text>
                  </box>
                )}

                {/* Loading shard data */}
                {isExpanded && !shardData && (
                  <box marginLeft={2} marginTop={1} marginBottom={1}>
                    <text fg="yellow">Loading...</text>
                  </box>
                )}
              </box>
            );
          })}
        </box>
      </scrollbox>

      {/* Footer with navigation hint */}
      <box marginTop={1}>
        <text fg="gray">
          j/k: navigate  Enter: expand  Space: collapse  d/l: domains/layers  g/G: top/bottom  ESC: back
        </text>
      </box>
    </box>
  );
}
