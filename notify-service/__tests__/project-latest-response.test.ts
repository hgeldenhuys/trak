/**
 * Tests for Project Latest Response Route (NOTIFY-005)
 *
 * Tests the /project/:projectId/latest-response endpoint
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  addResponse,
  getLatestResponseByProject,
  getResponseStore,
} from '../src/response-store';

describe('Project Latest Response', () => {
  beforeEach(() => {
    // Reset the store before each test
    getResponseStore().clear();
  });

  afterEach(() => {
    getResponseStore().clear();
  });

  describe('ResponseStore.getLatestByProject', () => {
    it('should return null when no responses exist for project', () => {
      const result = getLatestResponseByProject('non-existent-project');
      expect(result).toBeNull();
    });

    it('should return the only response when one exists', () => {
      addResponse(
        'test-project',
        'Test summary',
        '# Test Response',
        { durationMs: 1000 }
      );

      const result = getLatestResponseByProject('test-project');
      expect(result).not.toBeNull();
      expect(result?.project).toBe('test-project');
      expect(result?.summary).toBe('Test summary');
    });

    it('should return the most recent response when multiple exist', async () => {
      // Add first response
      addResponse(
        'test-project',
        'First summary',
        '# First Response',
        { durationMs: 1000 }
      );

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Add second response
      addResponse(
        'test-project',
        'Second summary',
        '# Second Response',
        { durationMs: 2000 }
      );

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 10));

      // Add third response
      addResponse(
        'test-project',
        'Third summary',
        '# Third Response',
        { durationMs: 3000 }
      );

      const result = getLatestResponseByProject('test-project');
      expect(result).not.toBeNull();
      expect(result?.summary).toBe('Third summary');
    });

    it('should be case-sensitive for project names', () => {
      addResponse(
        'Test-Project',
        'Uppercase summary',
        '# Uppercase',
        { durationMs: 1000 }
      );

      // Different case should not match
      const lowerResult = getLatestResponseByProject('test-project');
      expect(lowerResult).toBeNull();

      // Exact case should match
      const exactResult = getLatestResponseByProject('Test-Project');
      expect(exactResult).not.toBeNull();
      expect(exactResult?.project).toBe('Test-Project');
    });

    it('should only return responses for the specified project', () => {
      addResponse('project-a', 'A summary', '# A', { durationMs: 1000 });
      addResponse('project-b', 'B summary', '# B', { durationMs: 1000 });
      addResponse('project-c', 'C summary', '# C', { durationMs: 1000 });

      const resultA = getLatestResponseByProject('project-a');
      expect(resultA?.project).toBe('project-a');
      expect(resultA?.summary).toBe('A summary');

      const resultB = getLatestResponseByProject('project-b');
      expect(resultB?.project).toBe('project-b');
      expect(resultB?.summary).toBe('B summary');
    });

    it('should handle project names with special characters', () => {
      const specialName = 'my-project/sub-module';
      addResponse(
        specialName,
        'Special summary',
        '# Special',
        { durationMs: 1000 }
      );

      const result = getLatestResponseByProject(specialName);
      expect(result).not.toBeNull();
      expect(result?.project).toBe(specialName);
    });

    it('should handle project names with spaces', () => {
      const spaceName = 'My Project Name';
      addResponse(
        spaceName,
        'Space summary',
        '# Space',
        { durationMs: 1000 }
      );

      const result = getLatestResponseByProject(spaceName);
      expect(result).not.toBeNull();
      expect(result?.project).toBe(spaceName);
    });
  });

  describe('Route Handler', () => {
    // These tests would require the server to be running
    // For unit testing, we test the store methods above
    // Integration tests would hit the actual endpoint

    it('should have the handler exported', async () => {
      const { handleProjectLatestResponse } = await import('../src/routes/response');
      expect(typeof handleProjectLatestResponse).toBe('function');
    });

    it('should return 404 Response for non-existent project', async () => {
      const { handleProjectLatestResponse } = await import('../src/routes/response');

      const response = handleProjectLatestResponse('non-existent');
      expect(response.status).toBe(404);

      const html = await response.text();
      expect(html).toContain('404');
      expect(html).toContain('non-existent');
      expect(html).toContain('No responses found');
    });

    it('should return 200 Response with HTML for existing project', async () => {
      const { handleProjectLatestResponse } = await import('../src/routes/response');

      // Add a response first
      addResponse(
        'existing-project',
        'Test summary for handler',
        '# Handler Test\n\nThis is the full response.',
        { durationMs: 5000, filesModified: 3 }
      );

      const response = handleProjectLatestResponse('existing-project');
      expect(response.status).toBe(200);

      const html = await response.text();
      expect(html).toContain('existing-project');
      expect(html).toContain('Test summary for handler');
      expect(html).toContain('Handler Test');
    });

    it('should include correct Content-Type header', async () => {
      const { handleProjectLatestResponse } = await import('../src/routes/response');

      addResponse('header-test', 'Summary', '# Content', {});

      const response = handleProjectLatestResponse('header-test');
      expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    });

    it('should have shorter cache for latest responses', async () => {
      const { handleProjectLatestResponse } = await import('../src/routes/response');

      addResponse('cache-test', 'Summary', '# Content', {});

      const response = handleProjectLatestResponse('cache-test');
      const cacheControl = response.headers.get('Cache-Control');
      expect(cacheControl).toContain('max-age=60');
    });
  });
});
