/**
 * Unit Tests for FieldMapper
 *
 * Tests bidirectional field mapping between ADO work items and trak stories.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  FieldMapper,
  createDefaultFieldMapper,
  createFieldMapper,
  transformFunctions,
  type TrakStory,
  type TrakStoryStatus,
  type TrakPriority,
} from '../mapping';
import type { ADOWorkItem, FieldMappingConfig } from '../types';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockADOWorkItem(overrides: Partial<ADOWorkItem> = {}): ADOWorkItem {
  return {
    id: 12345,
    rev: 5,
    url: 'https://dev.azure.com/ively/ively.core/_apis/wit/workItems/12345',
    fields: {
      'System.Id': 12345,
      'System.Title': 'Test Work Item',
      'System.Description': '<p>This is a <strong>test</strong> description.</p>',
      'System.State': 'New',
      'System.WorkItemType': 'User Story',
      'System.AreaPath': 'ively.core',
      'System.IterationPath': 'ively.core\\Sprint 1',
      'System.CreatedDate': '2025-01-15T10:30:00Z',
      'System.CreatedBy': {
        displayName: 'John Doe',
        url: 'https://dev.azure.com/ively/_apis/identities/abc123',
        id: 'abc123',
        uniqueName: 'john.doe@ively.com',
      },
      'System.ChangedDate': '2025-01-16T14:00:00Z',
      'System.ChangedBy': {
        displayName: 'Jane Smith',
        url: 'https://dev.azure.com/ively/_apis/identities/def456',
        id: 'def456',
        uniqueName: 'jane.smith@ively.com',
      },
      'System.Rev': 5,
      'System.Tags': 'frontend;urgent',
      'Microsoft.VSTS.Common.Priority': 2,
      'Microsoft.VSTS.Common.AcceptanceCriteria': '<div>User can see the dashboard</div>',
      ...(overrides.fields || {}),
    },
    _links: {
      self: { href: 'https://dev.azure.com/ively/ively.core/_apis/wit/workItems/12345' },
    },
    ...overrides,
  };
}

function createMockTrakStory(overrides: Partial<TrakStory> = {}): TrakStory {
  return {
    id: 'uuid-story-001',
    code: 'TEST-001',
    featureId: 'uuid-feature-001',
    title: 'Test Story',
    description: 'This is a test story description.',
    why: 'To verify the field mapper works correctly.',
    status: 'draft',
    priority: 'P1',
    assignedTo: 'John Doe',
    estimatedComplexity: 'medium',
    createdAt: '2025-01-15T10:30:00Z',
    updatedAt: '2025-01-16T14:00:00Z',
    extensions: {
      adoWorkItemId: 12345,
      adoWorkItemUrl: 'https://dev.azure.com/ively/ively.core/_apis/wit/workItems/12345',
      adoLastSyncAt: '2025-01-16T14:00:00Z',
      adoRevision: 5,
      adoWorkItemType: 'User Story',
    },
    ...overrides,
  };
}

// =============================================================================
// FieldMapper Tests
// =============================================================================

describe('FieldMapper', () => {
  let mapper: FieldMapper;

  beforeEach(() => {
    mapper = createDefaultFieldMapper();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('creates mapper with default configuration', () => {
      const defaultMapper = new FieldMapper();

      expect(defaultMapper.getSupportedWorkItemTypes()).toContain('User Story');
      expect(defaultMapper.getSupportedWorkItemTypes()).toContain('Bug');
    });

    it('accepts custom configuration', () => {
      const customConfig: Partial<FieldMappingConfig> = {
        workItemTypes: ['Task', 'Epic'],
        states: {
          inbound: { 'New': 'planned', 'Active': 'in_progress' },
          outbound: { 'planned': 'New', 'in_progress': 'Active' },
        },
      };

      const customMapper = createFieldMapper(customConfig);

      expect(customMapper.getSupportedWorkItemTypes()).toContain('Task');
      expect(customMapper.getSupportedWorkItemTypes()).toContain('Epic');
      expect(customMapper.getSupportedWorkItemTypes()).not.toContain('User Story');
    });
  });

  // ===========================================================================
  // ADO -> Trak Mapping Tests
  // ===========================================================================

  describe('adoToTrak', () => {
    it('maps basic work item fields to story fields', () => {
      const workItem = createMockADOWorkItem();
      const result = mapper.adoToTrak(workItem);

      expect(result.title).toBe('Test Work Item');
      expect(result.adoWorkItemId).toBe(12345);
      expect(result.extensions?.adoWorkItemId).toBe(12345);
      expect(result.extensions?.adoRevision).toBe(5);
    });

    it('strips HTML from description', () => {
      const workItem = createMockADOWorkItem();
      const result = mapper.adoToTrak(workItem);

      expect(result.description).toBe('This is a test description.');
      expect(result.description).not.toContain('<p>');
      expect(result.description).not.toContain('<strong>');
    });

    it('strips HTML from acceptance criteria (why field)', () => {
      const workItem = createMockADOWorkItem();
      const result = mapper.adoToTrak(workItem);

      expect(result.why).toBe('User can see the dashboard');
      expect(result.why).not.toContain('<div>');
    });

    it('extracts assigned user display name', () => {
      const workItem = createMockADOWorkItem({
        fields: {
          ...createMockADOWorkItem().fields,
          'System.AssignedTo': {
            displayName: 'Bob Builder',
            url: 'https://dev.azure.com/ively/_apis/identities/bob123',
            id: 'bob123',
            uniqueName: 'bob@ively.com',
          },
        },
      });

      const result = mapper.adoToTrak(workItem);
      expect(result.assignedTo).toBe('Bob Builder');
    });

    it('handles missing assigned user', () => {
      const workItem = createMockADOWorkItem({
        fields: {
          ...createMockADOWorkItem().fields,
          'System.AssignedTo': undefined,
        },
      });

      const result = mapper.adoToTrak(workItem);
      expect(result.assignedTo).toBeNull();
    });

    it('handles missing description', () => {
      const workItem = createMockADOWorkItem({
        fields: {
          ...createMockADOWorkItem().fields,
          'System.Description': undefined,
        },
      });

      const result = mapper.adoToTrak(workItem);
      expect(result.description).toBe('');
    });

    it('handles missing acceptance criteria', () => {
      const workItem = createMockADOWorkItem({
        fields: {
          ...createMockADOWorkItem().fields,
          'Microsoft.VSTS.Common.AcceptanceCriteria': undefined,
        },
      });

      const result = mapper.adoToTrak(workItem);
      expect(result.why).toBe('');
    });
  });

  // ===========================================================================
  // State Mapping Tests
  // ===========================================================================

  describe('adoStateToTrakStatus', () => {
    it('maps New to draft', () => {
      expect(mapper.adoStateToTrakStatus('New')).toBe('draft');
    });

    it('maps Active to in_progress', () => {
      expect(mapper.adoStateToTrakStatus('Active')).toBe('in_progress');
    });

    it('maps Resolved to review', () => {
      expect(mapper.adoStateToTrakStatus('Resolved')).toBe('review');
    });

    it('maps Closed to completed', () => {
      expect(mapper.adoStateToTrakStatus('Closed')).toBe('completed');
    });

    it('maps Removed to cancelled', () => {
      expect(mapper.adoStateToTrakStatus('Removed')).toBe('cancelled');
    });

    it('defaults unknown states to draft', () => {
      expect(mapper.adoStateToTrakStatus('UnknownState')).toBe('draft');
    });
  });

  describe('trakStatusToAdoState', () => {
    it('maps draft to New', () => {
      expect(mapper.trakStatusToAdoState('draft')).toBe('New');
    });

    it('maps planned to Approved (for Scrum process)', () => {
      expect(mapper.trakStatusToAdoState('planned')).toBe('Approved');
    });

    it('maps in_progress to Active', () => {
      expect(mapper.trakStatusToAdoState('in_progress')).toBe('Active');
    });

    it('maps review to Resolved', () => {
      expect(mapper.trakStatusToAdoState('review')).toBe('Resolved');
    });

    it('maps completed to Closed', () => {
      expect(mapper.trakStatusToAdoState('completed')).toBe('Closed');
    });

    it('maps cancelled to Removed', () => {
      expect(mapper.trakStatusToAdoState('cancelled')).toBe('Removed');
    });

    it('defaults unknown status to New', () => {
      expect(mapper.trakStatusToAdoState('unknown_status' as TrakStoryStatus)).toBe('New');
    });
  });

  // ===========================================================================
  // Priority Mapping Tests
  // ===========================================================================

  describe('adoPriorityToTrakPriority', () => {
    it('maps priority 1 to P0', () => {
      expect(mapper.adoPriorityToTrakPriority(1)).toBe('P0');
    });

    it('maps priority 2 to P1', () => {
      expect(mapper.adoPriorityToTrakPriority(2)).toBe('P1');
    });

    it('maps priority 3 to P2', () => {
      expect(mapper.adoPriorityToTrakPriority(3)).toBe('P2');
    });

    it('maps priority 4 to P3', () => {
      expect(mapper.adoPriorityToTrakPriority(4)).toBe('P3');
    });

    it('defaults undefined priority to P2', () => {
      expect(mapper.adoPriorityToTrakPriority(undefined)).toBe('P2');
    });

    it('clamps priority 0 to P0', () => {
      expect(mapper.adoPriorityToTrakPriority(0)).toBe('P0');
    });

    it('clamps priority 5 to P3', () => {
      expect(mapper.adoPriorityToTrakPriority(5)).toBe('P3');
    });
  });

  describe('trakPriorityToAdoPriority', () => {
    it('maps P0 to 1', () => {
      expect(mapper.trakPriorityToAdoPriority('P0')).toBe(1);
    });

    it('maps P1 to 2', () => {
      expect(mapper.trakPriorityToAdoPriority('P1')).toBe(2);
    });

    it('maps P2 to 3', () => {
      expect(mapper.trakPriorityToAdoPriority('P2')).toBe(3);
    });

    it('maps P3 to 4', () => {
      expect(mapper.trakPriorityToAdoPriority('P3')).toBe(4);
    });

    it('defaults unknown priority to 3', () => {
      expect(mapper.trakPriorityToAdoPriority('PX' as TrakPriority)).toBe(3);
    });
  });

  // ===========================================================================
  // trakToAdoFields Tests
  // ===========================================================================

  describe('trakToAdoFields', () => {
    it('maps title correctly', () => {
      const story = createMockTrakStory({ title: 'My Test Story' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['System.Title']).toBe('My Test Story');
    });

    it('uses "Untitled" for empty title', () => {
      const story = createMockTrakStory({ title: '' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['System.Title']).toBe('Untitled');
    });

    it('maps description and wraps in HTML', () => {
      const story = createMockTrakStory({ description: 'This is a test description.' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['System.Description']).toBe('<div>This is a test description.</div>');
    });

    it('converts newlines to br tags in description', () => {
      const story = createMockTrakStory({ description: 'Line 1\nLine 2\nLine 3' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['System.Description']).toBe('<div>Line 1<br>Line 2<br>Line 3</div>');
    });

    it('escapes HTML special characters in description', () => {
      const story = createMockTrakStory({ description: '<script>alert("xss")</script>' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['System.Description']).toBe('<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>');
    });

    it('omits description field when empty', () => {
      const story = createMockTrakStory({ description: '' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['System.Description']).toBeUndefined();
    });

    it('maps priority P0 to ADO priority 1', () => {
      const story = createMockTrakStory({ priority: 'P0' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['Microsoft.VSTS.Common.Priority']).toBe(1);
    });

    it('maps priority P1 to ADO priority 2', () => {
      const story = createMockTrakStory({ priority: 'P1' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['Microsoft.VSTS.Common.Priority']).toBe(2);
    });

    it('maps priority P2 to ADO priority 3', () => {
      const story = createMockTrakStory({ priority: 'P2' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['Microsoft.VSTS.Common.Priority']).toBe(3);
    });

    it('maps priority P3 to ADO priority 4', () => {
      const story = createMockTrakStory({ priority: 'P3' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['Microsoft.VSTS.Common.Priority']).toBe(4);
    });

    it('maps why field to AcceptanceCriteria with HTML wrapping', () => {
      const story = createMockTrakStory({ why: 'To verify the feature works.' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['Microsoft.VSTS.Common.AcceptanceCriteria']).toBe('<div>To verify the feature works.</div>');
    });

    it('omits AcceptanceCriteria when why is empty', () => {
      const story = createMockTrakStory({ why: '' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['Microsoft.VSTS.Common.AcceptanceCriteria']).toBeUndefined();
    });

    it('always sets initial state to New', () => {
      const draftStory = createMockTrakStory({ status: 'draft' });
      const inProgressStory = createMockTrakStory({ status: 'in_progress' });

      const draftFields = mapper.trakToAdoFields(draftStory);
      const inProgressFields = mapper.trakToAdoFields(inProgressStory);

      expect(draftFields['System.State']).toBe('New');
      expect(inProgressFields['System.State']).toBe('New');
    });

    it('includes assignedTo when present', () => {
      const story = createMockTrakStory({ assignedTo: 'John Doe' });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['System.AssignedTo']).toBe('John Doe');
    });

    it('omits assignedTo when null', () => {
      const story = createMockTrakStory({ assignedTo: null });
      const fields = mapper.trakToAdoFields(story);

      expect(fields['System.AssignedTo']).toBeUndefined();
    });

    it('handles story with all fields populated', () => {
      const story = createMockTrakStory({
        title: 'Full Story',
        description: 'Complete description',
        why: 'Full acceptance criteria',
        priority: 'P1',
        assignedTo: 'Jane Smith',
        status: 'in_progress',
      });

      const fields = mapper.trakToAdoFields(story);

      expect(fields['System.Title']).toBe('Full Story');
      expect(fields['System.Description']).toBe('<div>Complete description</div>');
      expect(fields['Microsoft.VSTS.Common.AcceptanceCriteria']).toBe('<div>Full acceptance criteria</div>');
      expect(fields['Microsoft.VSTS.Common.Priority']).toBe(2);
      expect(fields['System.AssignedTo']).toBe('Jane Smith');
      expect(fields['System.State']).toBe('New');
    });

    it('handles minimal story with only required fields', () => {
      const story = createMockTrakStory({
        title: 'Minimal Story',
        description: '',
        why: '',
        assignedTo: null,
      });

      const fields = mapper.trakToAdoFields(story);

      expect(fields['System.Title']).toBe('Minimal Story');
      expect(fields['System.State']).toBe('New');
      expect(fields['Microsoft.VSTS.Common.Priority']).toBeDefined();
      expect(fields['System.Description']).toBeUndefined();
      expect(fields['Microsoft.VSTS.Common.AcceptanceCriteria']).toBeUndefined();
      expect(fields['System.AssignedTo']).toBeUndefined();
    });
  });

  // ===========================================================================
  // Patch Operations Tests
  // ===========================================================================

  describe('getAdoUpdates', () => {
    it('returns empty array when stories are identical', () => {
      const story = createMockTrakStory();
      const updates = mapper.getAdoUpdates(story, { ...story });

      expect(updates).toHaveLength(0);
    });

    it('detects status change', () => {
      const before = createMockTrakStory({ status: 'draft' });
      const after = createMockTrakStory({ status: 'in_progress' });

      const updates = mapper.getAdoUpdates(before, after);

      expect(updates).toHaveLength(1);
      expect(updates[0].op).toBe('replace');
      expect(updates[0].path).toBe('/fields/System.State');
      expect(updates[0].value).toBe('Active');
    });

    it('detects priority change', () => {
      const before = createMockTrakStory({ priority: 'P1' });
      const after = createMockTrakStory({ priority: 'P0' });

      const updates = mapper.getAdoUpdates(before, after);

      expect(updates).toHaveLength(1);
      expect(updates[0].op).toBe('replace');
      expect(updates[0].path).toBe('/fields/Microsoft.VSTS.Common.Priority');
      expect(updates[0].value).toBe(1);
    });

    it('detects title change', () => {
      const before = createMockTrakStory({ title: 'Old Title' });
      const after = createMockTrakStory({ title: 'New Title' });

      const updates = mapper.getAdoUpdates(before, after);

      expect(updates).toHaveLength(1);
      expect(updates[0].op).toBe('replace');
      expect(updates[0].path).toBe('/fields/System.Title');
      expect(updates[0].value).toBe('New Title');
    });

    it('detects description change', () => {
      const before = createMockTrakStory({ description: 'Old description' });
      const after = createMockTrakStory({ description: 'New description' });

      const updates = mapper.getAdoUpdates(before, after);

      expect(updates).toHaveLength(1);
      expect(updates[0].op).toBe('replace');
      expect(updates[0].path).toBe('/fields/System.Description');
      expect(updates[0].value).toBe('New description');
    });

    it('detects why/acceptance criteria change', () => {
      const before = createMockTrakStory({ why: 'Old reason' });
      const after = createMockTrakStory({ why: 'New reason' });

      const updates = mapper.getAdoUpdates(before, after);

      expect(updates).toHaveLength(1);
      expect(updates[0].op).toBe('replace');
      expect(updates[0].path).toBe('/fields/Microsoft.VSTS.Common.AcceptanceCriteria');
      expect(updates[0].value).toBe('New reason');
    });

    it('detects assignee change', () => {
      const before = createMockTrakStory({ assignedTo: 'John Doe' });
      const after = createMockTrakStory({ assignedTo: 'Jane Smith' });

      const updates = mapper.getAdoUpdates(before, after);

      expect(updates).toHaveLength(1);
      expect(updates[0].op).toBe('replace');
      expect(updates[0].path).toBe('/fields/System.AssignedTo');
      expect(updates[0].value).toBe('Jane Smith');
    });

    it('removes assignee when set to null', () => {
      const before = createMockTrakStory({ assignedTo: 'John Doe' });
      const after = createMockTrakStory({ assignedTo: null });

      const updates = mapper.getAdoUpdates(before, after);

      expect(updates).toHaveLength(1);
      expect(updates[0].op).toBe('remove');
      expect(updates[0].path).toBe('/fields/System.AssignedTo');
    });

    it('detects multiple changes', () => {
      const before = createMockTrakStory({
        title: 'Old Title',
        status: 'draft',
        priority: 'P2',
      });
      const after = createMockTrakStory({
        title: 'New Title',
        status: 'in_progress',
        priority: 'P0',
      });

      const updates = mapper.getAdoUpdates(before, after);

      expect(updates).toHaveLength(3);

      const paths = updates.map((u) => u.path);
      expect(paths).toContain('/fields/System.State');
      expect(paths).toContain('/fields/Microsoft.VSTS.Common.Priority');
      expect(paths).toContain('/fields/System.Title');
    });
  });

  describe('createStateUpdatePatch', () => {
    it('creates a single state update patch', () => {
      const patches = mapper.createStateUpdatePatch('Active');

      expect(patches).toHaveLength(1);
      expect(patches[0].op).toBe('replace');
      expect(patches[0].path).toBe('/fields/System.State');
      expect(patches[0].value).toBe('Active');
    });
  });

  // ===========================================================================
  // Utility Method Tests
  // ===========================================================================

  describe('isWorkItemTypeSupported', () => {
    it('returns true for User Story', () => {
      expect(mapper.isWorkItemTypeSupported('User Story')).toBe(true);
    });

    it('returns true for Bug', () => {
      expect(mapper.isWorkItemTypeSupported('Bug')).toBe(true);
    });

    it('returns false for unsupported type', () => {
      expect(mapper.isWorkItemTypeSupported('Test Case')).toBe(false);
    });
  });

  describe('applyTransform', () => {
    it('applies extractDisplayName transform', () => {
      const identity = {
        displayName: 'Test User',
        uniqueName: 'test@example.com',
        id: '123',
        url: 'https://example.com',
      };

      const result = mapper.applyTransform('extractDisplayName', identity);
      expect(result).toBe('Test User');
    });

    it('applies stripHtml transform', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const result = mapper.applyTransform('stripHtml', html);
      expect(result).toBe('Hello World');
    });

    it('returns original value for unknown transform', () => {
      const value = 'test value';
      const result = mapper.applyTransform('unknownTransform', value);
      expect(result).toBe(value);
    });
  });

  describe('inspection methods', () => {
    it('getStateMapping returns a copy of state mapping', () => {
      const mapping = mapper.getStateMapping();
      expect(mapping.inbound['New']).toBe('draft');
      expect(mapping.outbound['draft']).toBe('New');
    });

    it('getPriorityMapping returns a copy of priority mapping', () => {
      const mapping = mapper.getPriorityMapping();
      expect(mapping.inbound[1]).toBe('P0');
      expect(mapping.outbound['P0']).toBe(1);
    });

    it('getFieldMappings returns a copy of field mappings', () => {
      const mappings = mapper.getFieldMappings();
      expect(mappings.length).toBeGreaterThan(0);
      expect(mappings.some((m) => m.trakField === 'title')).toBe(true);
    });
  });
});

// =============================================================================
// Transform Function Tests
// =============================================================================

describe('transformFunctions', () => {
  describe('extractDisplayName', () => {
    it('extracts displayName from identity ref', () => {
      const identity = {
        displayName: 'John Doe',
        uniqueName: 'john@example.com',
        id: '123',
        url: 'https://example.com',
      };

      expect(transformFunctions.extractDisplayName(identity)).toBe('John Doe');
    });

    it('falls back to uniqueName', () => {
      const identity = {
        displayName: '',
        uniqueName: 'john@example.com',
        id: '123',
        url: 'https://example.com',
      };

      expect(transformFunctions.extractDisplayName(identity)).toBe('john@example.com');
    });

    it('returns null for null input', () => {
      expect(transformFunctions.extractDisplayName(null)).toBeNull();
    });

    it('returns string as-is', () => {
      expect(transformFunctions.extractDisplayName('John Doe')).toBe('John Doe');
    });
  });

  describe('stripHtml', () => {
    it('removes basic HTML tags', () => {
      expect(transformFunctions.stripHtml('<p>Hello</p>')).toBe('Hello');
    });

    it('converts br tags to newlines', () => {
      expect(transformFunctions.stripHtml('Line 1<br>Line 2')).toBe('Line 1\nLine 2');
    });

    it('converts p tags to double newlines', () => {
      expect(transformFunctions.stripHtml('<p>Para 1</p><p>Para 2</p>')).toBe('Para 1\n\nPara 2');
    });

    it('decodes HTML entities', () => {
      expect(transformFunctions.stripHtml('&lt;tag&gt; &amp; &quot;quote&quot;')).toBe(
        '<tag> & "quote"'
      );
    });

    it('returns empty string for null input', () => {
      expect(transformFunctions.stripHtml(null)).toBe('');
    });
  });

  describe('keepHtml', () => {
    it('keeps HTML as-is', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      expect(transformFunctions.keepHtml(html)).toBe(html);
    });

    it('returns empty string for null input', () => {
      expect(transformFunctions.keepHtml(null)).toBe('');
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Factory Functions', () => {
  describe('createDefaultFieldMapper', () => {
    it('creates a mapper with default configuration', () => {
      const mapper = createDefaultFieldMapper();

      expect(mapper.getSupportedWorkItemTypes()).toContain('User Story');
      expect(mapper.adoStateToTrakStatus('New')).toBe('draft');
    });
  });

  describe('createFieldMapper', () => {
    it('creates a mapper with custom configuration', () => {
      const mapper = createFieldMapper({
        states: {
          inbound: { 'Custom': 'review' },
          outbound: { 'review': 'Custom' },
        },
      });

      expect(mapper.adoStateToTrakStatus('Custom')).toBe('review');
      expect(mapper.trakStatusToAdoState('review')).toBe('Custom');
    });
  });
});
