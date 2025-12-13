/**
 * Tests for SyncStatusIndicator component logic
 */

import { describe, it, expect } from 'bun:test';
import { getSyncStatus } from '../SyncStatusIndicator';
import type { Story } from '../../../types';
import { StoryStatus, Priority } from '../../../types';

/**
 * Create a mock story for testing
 */
function createMockStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'test-story-id',
    code: 'TEST-001',
    featureId: 'feature-1',
    title: 'Test Story',
    description: 'A test story',
    why: 'Testing purposes',
    status: StoryStatus.DRAFT,
    priority: Priority.P2,
    assignedTo: null,
    estimatedComplexity: 'medium',
    createdAt: '2025-12-01T10:00:00Z',
    updatedAt: '2025-12-10T10:00:00Z',
    extensions: {},
    ...overrides,
  };
}

describe('getSyncStatus', () => {
  describe('not-connected status', () => {
    it('returns not-connected when no extensions', () => {
      const story = createMockStory({ extensions: {} });
      expect(getSyncStatus(story)).toBe('not-connected');
    });

    it('returns not-connected when adoWorkItemId is missing', () => {
      const story = createMockStory({
        extensions: { someOtherField: 'value' },
      });
      expect(getSyncStatus(story)).toBe('not-connected');
    });

    it('returns not-connected when adoWorkItemId is null', () => {
      const story = createMockStory({
        extensions: { adoWorkItemId: null },
      });
      expect(getSyncStatus(story)).toBe('not-connected');
    });

    it('returns not-connected when adoWorkItemId is undefined', () => {
      const story = createMockStory({
        extensions: { adoWorkItemId: undefined },
      });
      expect(getSyncStatus(story)).toBe('not-connected');
    });
  });

  describe('pending status', () => {
    it('returns pending when adoWorkItemId exists but no lastPushedAt', () => {
      const story = createMockStory({
        extensions: { adoWorkItemId: 12345 },
      });
      expect(getSyncStatus(story)).toBe('pending');
    });

    it('returns pending when lastPushedAt is before updatedAt', () => {
      const story = createMockStory({
        updatedAt: '2025-12-10T12:00:00Z',
        extensions: {
          adoWorkItemId: 12345,
          lastPushedAt: '2025-12-10T10:00:00Z', // 2 hours before updatedAt
        },
      });
      expect(getSyncStatus(story)).toBe('pending');
    });

    it('returns pending when lastPushedAt is null', () => {
      const story = createMockStory({
        extensions: {
          adoWorkItemId: 12345,
          lastPushedAt: null,
        },
      });
      expect(getSyncStatus(story)).toBe('pending');
    });
  });

  describe('synced status', () => {
    it('returns synced when lastPushedAt equals updatedAt', () => {
      const timestamp = '2025-12-10T12:00:00Z';
      const story = createMockStory({
        updatedAt: timestamp,
        extensions: {
          adoWorkItemId: 12345,
          lastPushedAt: timestamp,
        },
      });
      expect(getSyncStatus(story)).toBe('synced');
    });

    it('returns synced when lastPushedAt is after updatedAt', () => {
      const story = createMockStory({
        updatedAt: '2025-12-10T10:00:00Z',
        extensions: {
          adoWorkItemId: 12345,
          lastPushedAt: '2025-12-10T12:00:00Z', // 2 hours after updatedAt
        },
      });
      expect(getSyncStatus(story)).toBe('synced');
    });
  });
});
