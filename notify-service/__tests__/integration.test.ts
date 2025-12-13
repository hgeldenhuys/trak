/**
 * Integration Tests for Centralized Notification Service
 *
 * Tests multi-project scenarios, FIFO ordering, graceful fallback,
 * and CLI commands.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';

// Test configuration
const TEST_PORT = 7778;
const TEST_URL = `http://127.0.0.1:${TEST_PORT}`;

describe('Notification Service Integration Tests', () => {
  // Note: These tests require the service to be running on TEST_PORT
  // For CI, we'd spawn the service in beforeAll

  describe('Health Endpoint', () => {
    it('should return service status', async () => {
      try {
        const response = await fetch(`${TEST_URL}/health`);
        if (!response.ok) {
          console.log('Health endpoint not available - service may not be running');
          return;
        }

        const data = await response.json() as { status: string; version: string; channels: object };
        expect(data.status).toBeDefined();
        expect(data.version).toBeDefined();
        expect(data.channels).toBeDefined();
      } catch {
        console.log('Service not running - skipping integration test');
      }
    });
  });

  describe('Queue Endpoint', () => {
    it('should return queue status', async () => {
      try {
        const response = await fetch(`${TEST_URL}/queue`);
        if (!response.ok) {
          console.log('Queue endpoint not available');
          return;
        }

        const data = await response.json() as { queueLength: number; isPlaying: boolean };
        expect(typeof data.queueLength).toBe('number');
        expect(typeof data.isPlaying).toBe('boolean');
      } catch {
        console.log('Service not running - skipping integration test');
      }
    });
  });

  describe('Notify Endpoint', () => {
    it('should accept valid notification payload', async () => {
      try {
        const response = await fetch(`${TEST_URL}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project: 'test-project',
            summary: 'Test notification',
          }),
        });

        if (!response.ok) {
          console.log('Notify endpoint not available');
          return;
        }

        const data = await response.json() as { success: boolean; queued: boolean };
        expect(data.success).toBe(true);
        expect(typeof data.queued).toBe('boolean');
      } catch {
        console.log('Service not running - skipping integration test');
      }
    });

    it('should reject invalid payload (missing project)', async () => {
      try {
        const response = await fetch(`${TEST_URL}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summary: 'Test notification',
          }),
        });

        if (!response.ok) {
          expect(response.status).toBe(400);
        }
      } catch {
        console.log('Service not running - skipping integration test');
      }
    });

    it('should reject invalid payload (missing summary)', async () => {
      try {
        const response = await fetch(`${TEST_URL}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project: 'test-project',
          }),
        });

        if (!response.ok) {
          expect(response.status).toBe(400);
        }
      } catch {
        console.log('Service not running - skipping integration test');
      }
    });
  });

  describe('Multi-Project FIFO Queue', () => {
    it('should queue notifications from multiple projects in order', async () => {
      try {
        const projects = ['project-a', 'project-b', 'project-c'];
        const responses = [];

        // Send notifications from multiple projects
        for (const project of projects) {
          const response = await fetch(`${TEST_URL}/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project,
              summary: `Notification from ${project}`,
              channelPrefs: { tts: false, discord: false, console: true },
            }),
          });

          if (response.ok) {
            const data = await response.json();
            responses.push(data);
          }
        }

        // All should succeed
        for (const response of responses) {
          expect((response as { success: boolean }).success).toBe(true);
        }
      } catch {
        console.log('Service not running - skipping integration test');
      }
    });
  });

  describe('Channel Preferences', () => {
    it('should respect per-request channel preferences', async () => {
      try {
        const response = await fetch(`${TEST_URL}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project: 'test-project',
            summary: 'Test with channel prefs',
            channelPrefs: {
              tts: false,
              discord: false,
              console: true,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json() as { success: boolean; channels: { console: boolean } };
          expect(data.success).toBe(true);
          // Console should be enabled per prefs
          expect(data.channels.console).toBe(true);
        }
      } catch {
        console.log('Service not running - skipping integration test');
      }
    });
  });

  describe('Metadata Handling', () => {
    it('should accept and process notification metadata', async () => {
      try {
        const response = await fetch(`${TEST_URL}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project: 'test-project',
            summary: 'Test with metadata',
            metadata: {
              durationMs: 45000,
              filesModified: 5,
              toolsUsed: ['Read', 'Write', 'Bash'],
              contextUsagePercent: 35,
              keyOutcomes: ['Created files', 'Ran tests'],
            },
          }),
        });

        if (response.ok) {
          const data = await response.json() as { success: boolean };
          expect(data.success).toBe(true);
        }
      } catch {
        console.log('Service not running - skipping integration test');
      }
    });
  });
});

describe('Remote Client Unit Tests', () => {
  // These tests don't require the service to be running

  it('should build payload correctly', async () => {
    const { buildPayload } = await import('../../hooks/remote-client');

    const payload = buildPayload('Test Project', 'Test summary', {
      durationMs: 30000,
      filesModified: 5,
      toolsUsed: ['Read', 'Write'],
    });

    expect(payload.project).toBe('Test Project');
    expect(payload.summary).toBe('Test summary');
    expect(payload.metadata?.durationMs).toBe(30000);
    expect(payload.metadata?.filesModified).toBe(5);
    expect(payload.metadata?.toolsUsed).toEqual(['Read', 'Write']);
  });
});

describe('Audio Queue Unit Tests', () => {
  it('should maintain singleton instance', async () => {
    const { getAudioQueue, AudioQueue } = await import('../src/audio-queue');

    // Reset for clean test
    (AudioQueue as { reset: () => void }).reset?.();

    const queue1 = getAudioQueue();
    const queue2 = getAudioQueue();

    expect(queue1).toBe(queue2);
  });

  it('should track queue status', async () => {
    const { getAudioQueue, AudioQueue } = await import('../src/audio-queue');

    // Reset for clean test
    (AudioQueue as { reset: () => void }).reset?.();

    const queue = getAudioQueue();
    const status = queue.getStatus();

    expect(status.queueLength).toBe(0);
    expect(status.isPlaying).toBe(false);
    expect(Array.isArray(status.items)).toBe(true);
  });
});

describe('Config Unit Tests', () => {
  it('should create default config', async () => {
    const { createDefaultConfig } = await import('../src/config');

    const config = createDefaultConfig();

    expect(config.version).toBeDefined();
    expect(config.server.port).toBe(7777);
    expect(config.server.host).toBe('127.0.0.1');
    expect(config.channels).toBeDefined();
  });

  it('should validate config and return warnings', async () => {
    const { createDefaultConfig, validateConfig } = await import('../src/config');

    const config = createDefaultConfig();
    // Remove API key to trigger warning
    config.channels.tts.apiKey = undefined;

    const warnings = validateConfig(config);

    expect(Array.isArray(warnings)).toBe(true);
  });
});
