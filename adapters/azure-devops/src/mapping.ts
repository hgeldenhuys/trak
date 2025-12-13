/**
 * Azure DevOps Field Mapping
 *
 * This module provides bidirectional field mapping between ADO work items
 * and trak stories. Supports configurable state, priority, and field mappings.
 */

import type {
  ADOWorkItem,
  ADOWorkItemState,
  FieldMappingConfig,
  StateMapping,
  PriorityMapping,
  FieldMapping,
  ADOIdentityRef,
  ADOStoryExtensions,
} from './types';

import {
  DEFAULT_STATE_MAPPING,
  DEFAULT_PRIORITY_MAPPING,
  DEFAULT_FIELD_MAPPINGS,
  DEFAULT_WORK_ITEM_TYPES,
} from './config';

// =============================================================================
// Types for trak integration
// =============================================================================

/**
 * Trak Story Status enum values
 */
export type TrakStoryStatus =
  | 'draft'
  | 'planned'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'cancelled';

/**
 * Trak Priority enum values
 */
export type TrakPriority = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * Minimal Story interface for mapping purposes
 * This is a subset of the full trak Story type
 */
export interface TrakStory {
  id: string;
  code: string;
  featureId: string;
  title: string;
  description: string;
  why: string;
  status: TrakStoryStatus;
  priority: TrakPriority;
  assignedTo: string | null;
  estimatedComplexity: string | null;
  createdAt: string;
  updatedAt: string;
  extensions: Record<string, unknown> & ADOStoryExtensions;
}

/**
 * Input type for creating a new story from ADO work item
 */
export interface CreateStoryFromADOInput {
  featureId: string;
  title: string;
  description: string;
  why: string;
  status?: TrakStoryStatus;
  priority?: TrakPriority;
  assignedTo?: string | null;
  estimatedComplexity?: string | null;
  extensions?: Record<string, unknown> & ADOStoryExtensions;
}

/**
 * ADO Patch Operation format
 */
export interface PatchOperation {
  op: 'add' | 'remove' | 'replace' | 'copy' | 'move' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

// =============================================================================
// Transform Functions
// =============================================================================

/**
 * Registry of transform functions for field mapping
 */
const transformFunctions: Record<string, (value: unknown) => unknown> = {
  /**
   * Extract display name from ADO IdentityRef
   */
  extractDisplayName: (value: unknown): string | null => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
      const identity = value as ADOIdentityRef;
      return identity.displayName || identity.uniqueName || null;
    }
    return null;
  },

  /**
   * Convert string to ADO IdentityRef format (placeholder for outbound)
   * Note: Actual user lookup requires ADO API call
   */
  findUserByName: (value: unknown): string | null => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return null;
  },

  /**
   * Strip HTML tags from description
   */
  stripHtml: (value: unknown): string => {
    if (!value || typeof value !== 'string') return '';
    // Remove HTML tags but preserve content
    return value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  },

  /**
   * Keep HTML as-is
   */
  keepHtml: (value: unknown): string => {
    if (!value || typeof value !== 'string') return '';
    return value;
  },
};

// =============================================================================
// FieldMapper Class
// =============================================================================

/**
 * Configurable field mapper for ADO <-> trak bidirectional sync
 *
 * Handles:
 * - State mapping (ADO states to trak statuses)
 * - Priority mapping (ADO 1-4 to trak P0-P3)
 * - Field mapping (System.Title to title, etc.)
 * - Custom transform functions
 */
export class FieldMapper {
  private readonly stateMapping: StateMapping;
  private readonly priorityMapping: PriorityMapping;
  private readonly fieldMappings: FieldMapping[];
  private readonly workItemTypes: string[];

  constructor(config?: Partial<FieldMappingConfig>) {
    this.stateMapping = config?.states || DEFAULT_STATE_MAPPING;
    this.priorityMapping = config?.priorities || DEFAULT_PRIORITY_MAPPING;
    this.fieldMappings = config?.fields || DEFAULT_FIELD_MAPPINGS;
    this.workItemTypes = config?.workItemTypes || DEFAULT_WORK_ITEM_TYPES;
  }

  // ===========================================================================
  // ADO -> Trak Mapping
  // ===========================================================================

  /**
   * Map ADO work item to trak story fields
   *
   * Returns a partial story object suitable for creating or updating a trak story.
   * The adoWorkItemId is included in the extensions for tracking.
   *
   * @param workItem - ADO work item from API
   * @returns Partial story fields with ADO tracking info in extensions
   */
  adoToTrak(workItem: ADOWorkItem): CreateStoryFromADOInput & { adoWorkItemId: number } {
    const fields = workItem.fields;

    // Map status from ADO state
    const adoState = fields['System.State'];
    const status = this.adoStateToTrakStatus(adoState);

    // Map priority from ADO priority
    const adoPriority = fields['Microsoft.VSTS.Common.Priority'];
    const priority = this.adoPriorityToTrakPriority(adoPriority);

    // Extract assigned user
    const assignedTo = this.extractAssignedTo(fields['System.AssignedTo']);

    // Build the story input
    const result: CreateStoryFromADOInput & { adoWorkItemId: number } = {
      featureId: '', // Must be set by caller based on mapping rules
      title: fields['System.Title'] || 'Untitled',
      description: this.processDescription(fields['System.Description']),
      why: this.processDescription(fields['Microsoft.VSTS.Common.AcceptanceCriteria']) || '',
      status,
      priority,
      assignedTo,
      adoWorkItemId: workItem.id,
      extensions: {
        adoWorkItemId: workItem.id,
        adoWorkItemUrl: workItem.url,
        adoLastSyncAt: new Date().toISOString(),
        adoRevision: workItem.rev,
        adoWorkItemType: fields['System.WorkItemType'],
      },
    };

    return result;
  }

  /**
   * Convert ADO work item state to trak story status
   *
   * @param adoState - ADO work item state (e.g., 'New', 'Active')
   * @returns Trak story status
   */
  adoStateToTrakStatus(adoState: ADOWorkItemState): TrakStoryStatus {
    const mapped = this.stateMapping.inbound[adoState];

    if (mapped) {
      return mapped as TrakStoryStatus;
    }

    // Log warning for unknown state
    console.warn(
      `[FieldMapper] Unknown ADO state "${adoState}", defaulting to "draft"`
    );
    return 'draft';
  }

  /**
   * Convert ADO priority (1-4) to trak priority (P0-P3)
   *
   * @param adoPriority - ADO priority number (1=Critical, 4=Low)
   * @returns Trak priority string
   */
  adoPriorityToTrakPriority(adoPriority: number | undefined): TrakPriority {
    if (adoPriority === undefined || adoPriority === null) {
      return 'P2'; // Default to medium priority
    }

    const mapped = this.priorityMapping.inbound[adoPriority];

    if (mapped) {
      return mapped as TrakPriority;
    }

    // Clamp to valid range
    if (adoPriority <= 1) return 'P0';
    if (adoPriority >= 4) return 'P3';
    return 'P2';
  }

  // ===========================================================================
  // Trak -> ADO Mapping
  // ===========================================================================

  /**
   * Map trak story fields to ADO work item fields for creation
   *
   * Returns a field map suitable for ADOClient.createWorkItem().
   * Used when creating a new work item in ADO from a trak story.
   *
   * Field mappings:
   * - title -> System.Title
   * - description -> System.Description (wrapped in basic HTML)
   * - priority (P0-P3) -> Microsoft.VSTS.Common.Priority (1-4)
   * - why -> Microsoft.VSTS.Common.AcceptanceCriteria (optional)
   * - Initial state is always 'New' for newly created work items
   *
   * @param story - Trak story to map
   * @returns Record of ADO field names to values
   */
  trakToAdoFields(story: TrakStory): Record<string, unknown> {
    const fields: Record<string, unknown> = {};

    // Required: Title
    fields['System.Title'] = story.title || 'Untitled';

    // Required: Initial state for new work items
    fields['System.State'] = 'New';

    // Description - wrap in basic HTML for ADO rich text field
    if (story.description) {
      fields['System.Description'] = this.wrapInHtml(story.description);
    }

    // Priority mapping (P0-P3 -> 1-4)
    const adoPriority = this.trakPriorityToAdoPriority(story.priority);
    fields['Microsoft.VSTS.Common.Priority'] = adoPriority;

    // Acceptance Criteria (why field) - wrap in HTML if present
    if (story.why) {
      fields['Microsoft.VSTS.Common.AcceptanceCriteria'] = this.wrapInHtml(story.why);
    }

    // Assigned user (if present)
    if (story.assignedTo) {
      fields['System.AssignedTo'] = story.assignedTo;
    }

    return fields;
  }

  /**
   * Convert trak story status to ADO work item state
   *
   * @param status - Trak story status
   * @returns ADO work item state string
   */
  trakStatusToAdoState(status: TrakStoryStatus): ADOWorkItemState {
    const mapped = this.stateMapping.outbound[status];

    if (mapped) {
      return mapped;
    }

    // Log warning for unknown status
    console.warn(
      `[FieldMapper] Unknown trak status "${status}", defaulting to "New"`
    );
    return 'New';
  }

  /**
   * Convert trak priority to ADO priority number
   *
   * @param priority - Trak priority (P0-P3)
   * @returns ADO priority number (1-4)
   */
  trakPriorityToAdoPriority(priority: TrakPriority): number {
    const mapped = this.priorityMapping.outbound[priority];

    if (mapped !== undefined) {
      return mapped;
    }

    // Default to medium priority
    console.warn(
      `[FieldMapper] Unknown trak priority "${priority}", defaulting to 3`
    );
    return 3;
  }

  /**
   * Generate ADO patch operations for changes between two story versions
   *
   * Compares before and after story states and generates the minimal set
   * of patch operations needed to update the ADO work item.
   *
   * @param before - Story state before changes
   * @param after - Story state after changes
   * @returns Array of ADO patch operations
   */
  getAdoUpdates(before: TrakStory, after: TrakStory): PatchOperation[] {
    const operations: PatchOperation[] = [];

    // Check status change
    if (before.status !== after.status) {
      const newState = this.trakStatusToAdoState(after.status);
      operations.push({
        op: 'replace',
        path: '/fields/System.State',
        value: newState,
      });

      // Handle blocked status with tag
      if (after.status === 'cancelled') {
        // Blocked is mapped to Active with a 'Blocked' tag
        // Note: Actual tag handling may need separate API call
      }
    }

    // Check priority change
    if (before.priority !== after.priority) {
      const newPriority = this.trakPriorityToAdoPriority(after.priority);
      operations.push({
        op: 'replace',
        path: '/fields/Microsoft.VSTS.Common.Priority',
        value: newPriority,
      });
    }

    // Check title change
    if (before.title !== after.title) {
      operations.push({
        op: 'replace',
        path: '/fields/System.Title',
        value: after.title,
      });
    }

    // Check description change
    if (before.description !== after.description) {
      operations.push({
        op: 'replace',
        path: '/fields/System.Description',
        value: after.description,
      });
    }

    // Check why/acceptance criteria change
    if (before.why !== after.why) {
      operations.push({
        op: 'replace',
        path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
        value: after.why,
      });
    }

    // Check assigned user change
    if (before.assignedTo !== after.assignedTo) {
      if (after.assignedTo) {
        operations.push({
          op: 'replace',
          path: '/fields/System.AssignedTo',
          value: after.assignedTo,
        });
      } else {
        operations.push({
          op: 'remove',
          path: '/fields/System.AssignedTo',
        });
      }
    }

    return operations;
  }

  /**
   * Create patch operations for a specific state change
   *
   * Convenience method for updating just the state of a work item.
   *
   * @param newState - Target ADO state
   * @returns Array with single state patch operation
   */
  createStateUpdatePatch(newState: ADOWorkItemState): PatchOperation[] {
    return [
      {
        op: 'replace',
        path: '/fields/System.State',
        value: newState,
      },
    ];
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Wrap plain text in basic HTML for ADO rich text fields
   *
   * Converts plain text to HTML by:
   * - Wrapping in a div
   * - Converting newlines to <br> tags
   * - Escaping special HTML characters
   *
   * @param text - Plain text to wrap
   * @returns HTML-wrapped text
   */
  private wrapInHtml(text: string): string {
    if (!text) return '';

    // Escape HTML special characters
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // Convert newlines to <br> tags
    const withBreaks = escaped.replace(/\n/g, '<br>');

    // Wrap in div
    return `<div>${withBreaks}</div>`;
  }

  /**
   * Extract assigned user display name from ADO identity ref
   */
  private extractAssignedTo(assignedTo: ADOIdentityRef | undefined): string | null {
    if (!assignedTo) return null;
    return assignedTo.displayName || assignedTo.uniqueName || null;
  }

  /**
   * Process description field, optionally stripping HTML
   *
   * ADO descriptions often contain HTML from the rich text editor.
   * This method normalizes them for trak storage.
   */
  private processDescription(description: string | undefined): string {
    if (!description) return '';

    // By default, strip HTML for cleaner storage in trak
    // Can be configured via field mapping transform if needed
    return transformFunctions.stripHtml(description) as string;
  }

  /**
   * Check if a work item type should be synced
   */
  isWorkItemTypeSupported(workItemType: string): boolean {
    return this.workItemTypes.includes(workItemType);
  }

  /**
   * Get the list of supported work item types
   */
  getSupportedWorkItemTypes(): string[] {
    return [...this.workItemTypes];
  }

  /**
   * Apply a named transform function to a value
   */
  applyTransform(transformName: string, value: unknown): unknown {
    const fn = transformFunctions[transformName];
    if (!fn) {
      console.warn(`[FieldMapper] Unknown transform function: ${transformName}`);
      return value;
    }
    return fn(value);
  }

  /**
   * Get state mapping for inspection/debugging
   */
  getStateMapping(): StateMapping {
    return { ...this.stateMapping };
  }

  /**
   * Get priority mapping for inspection/debugging
   */
  getPriorityMapping(): PriorityMapping {
    return { ...this.priorityMapping };
  }

  /**
   * Get field mappings for inspection/debugging
   */
  getFieldMappings(): FieldMapping[] {
    return [...this.fieldMappings];
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a FieldMapper with default configuration
 */
export function createDefaultFieldMapper(): FieldMapper {
  return new FieldMapper();
}

/**
 * Create a FieldMapper with custom configuration
 */
export function createFieldMapper(config: Partial<FieldMappingConfig>): FieldMapper {
  return new FieldMapper(config);
}

// =============================================================================
// YAML Config Support (Future)
// =============================================================================

/**
 * Load field mapping configuration from YAML file
 *
 * @param filePath - Path to YAML configuration file
 * @returns FieldMappingConfig or null if file doesn't exist
 */
export async function loadMappingFromYaml(
  filePath: string
): Promise<Partial<FieldMappingConfig> | null> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      console.warn(`[FieldMapper] Mapping config file not found: ${filePath}`);
      return null;
    }

    const content = await file.text();

    // Simple YAML parsing for field mappings
    // Note: For production, consider using a proper YAML parser like yaml or js-yaml
    const config = parseSimpleYaml(content);

    return config;
  } catch (error) {
    console.error(`[FieldMapper] Error loading mapping config: ${error}`);
    return null;
  }
}

/**
 * Simple YAML parser for field mapping configuration
 *
 * Handles basic YAML structure used in mapping config files.
 * For complex YAML, use a proper parser like js-yaml.
 */
function parseSimpleYaml(content: string): Partial<FieldMappingConfig> {
  const config: Partial<FieldMappingConfig> = {};
  const lines = content.split('\n');

  let currentSection: string | null = null;
  let currentSubSection: string | null = null;
  const inbound: Record<string, string> = {};
  const outbound: Record<string, string | number> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') continue;

    // Detect section headers
    if (trimmed.endsWith(':') && !trimmed.includes(' ')) {
      const sectionName = trimmed.slice(0, -1);

      if (['states', 'priorities', 'fields', 'workItemTypes'].includes(sectionName)) {
        currentSection = sectionName;
        currentSubSection = null;
      } else if (currentSection && ['inbound', 'outbound'].includes(sectionName)) {
        currentSubSection = sectionName;
      }
      continue;
    }

    // Parse key-value pairs
    if (currentSection && currentSubSection && trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIndex).trim().replace(/['"]/g, '');
      let value = trimmed.slice(colonIndex + 1).trim().replace(/['"]/g, '');

      // Handle numeric values for priorities
      if (currentSection === 'priorities') {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue)) {
          if (currentSubSection === 'inbound') {
            inbound[key] = value;
          } else {
            outbound[key] = numValue;
          }
        } else {
          if (currentSubSection === 'inbound') {
            inbound[key] = value;
          } else {
            outbound[key] = value;
          }
        }
      } else {
        if (currentSubSection === 'inbound') {
          inbound[key] = value;
        } else {
          outbound[key] = value as string;
        }
      }
    }

    // Parse array items for workItemTypes
    if (currentSection === 'workItemTypes' && trimmed.startsWith('-')) {
      if (!config.workItemTypes) config.workItemTypes = [];
      const item = trimmed.slice(1).trim().replace(/['"]/g, '');
      config.workItemTypes.push(item);
    }
  }

  // Apply parsed mappings
  if (currentSection === 'states' && (Object.keys(inbound).length > 0 || Object.keys(outbound).length > 0)) {
    config.states = {
      inbound: inbound as Record<string, string>,
      outbound: outbound as Record<string, string>,
    };
  }

  if (currentSection === 'priorities' && (Object.keys(inbound).length > 0 || Object.keys(outbound).length > 0)) {
    config.priorities = {
      inbound: inbound as Record<number, string>,
      outbound: outbound as Record<string, number>,
    };
  }

  return config;
}

// =============================================================================
// Exports
// =============================================================================

export {
  transformFunctions,
  DEFAULT_STATE_MAPPING,
  DEFAULT_PRIORITY_MAPPING,
  DEFAULT_FIELD_MAPPINGS,
};
