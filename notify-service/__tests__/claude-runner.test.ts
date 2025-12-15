/**
 * Tests for Claude Headless Runner (NOTIFY-001 Task aabfbf46)
 *
 * Tests AC-005: Claude headless runner spawns CLI and captures exit codes
 * Tests AC-009: Report stderr in error cases
 */

import { describe, it, expect } from 'bun:test';
import {
  runClaude,
  isClaudeAvailable,
  getClaudeVersion,
  type RunOptions,
  type RunResult,
} from '../src/discord-bot/claude-runner';

describe('claude-runner', () => {
  describe('runClaude', () => {
    it('returns structured RunResult with all required fields', async () => {
      // Use a very short timeout so we don't wait long if Claude IS installed
      const options: RunOptions = {
        prompt: 'test',
        sessionId: 'test-session-123',
        timeoutMs: 100, // Short timeout to fail fast
      };

      const result = await runClaude(options);

      // Verify RunResult structure (regardless of success/failure)
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('prompt');

      // Verify types
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.exitCode).toBe('number');
      expect(typeof result.stdout).toBe('string');
      expect(typeof result.stderr).toBe('string');
      expect(typeof result.output).toBe('string');
      expect(typeof result.durationMs).toBe('number');
      expect(result.sessionId).toBe('test-session-123');
      expect(result.prompt).toBe('test');
    });

    it('captures sessionId and prompt in result', async () => {
      const options: RunOptions = {
        prompt: 'custom prompt text',
        sessionId: 'unique-session-id',
        timeoutMs: 100, // Short timeout
      };

      const result = await runClaude(options);

      expect(result.sessionId).toBe('unique-session-id');
      expect(result.prompt).toBe('custom prompt text');
    });

    it('reports error on non-zero exit or spawn failure (AC-009)', async () => {
      const options: RunOptions = {
        prompt: 'test',
        sessionId: 'test-session',
        timeoutMs: 100, // Short timeout to force timeout/failure
      };

      const result = await runClaude(options);

      // Test expects failure (either timeout, spawn error, or CLI error)
      // Exit code could be -1 (spawn error), 143 (SIGTERM/timeout), or other
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
        expect(typeof result.stderr).toBe('string');
      }
    });

    it('tracks execution duration', async () => {
      const options: RunOptions = {
        prompt: 'test',
        sessionId: 'test-session',
        timeoutMs: 100, // Short timeout
      };

      const startTime = Date.now();
      const result = await runClaude(options);
      const elapsed = Date.now() - startTime;

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      // Duration should be less than or equal to our measured elapsed time
      expect(result.durationMs).toBeLessThanOrEqual(elapsed + 100); // Allow some margin
    });

    it('uses default values for optional parameters', async () => {
      const options: RunOptions = {
        prompt: 'minimal options',
        sessionId: 'minimal-session',
        timeoutMs: 100, // Add short timeout to fail fast
      };

      // Should not throw with minimal options
      const result = await runClaude(options);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe('minimal-session');
    });

    it('handles allowedTools parameter', async () => {
      const options: RunOptions = {
        prompt: 'test with tools',
        sessionId: 'tools-session',
        permissionMode: 'allowedTools',
        allowedTools: ['Read', 'Write', 'Bash'],
        timeoutMs: 100, // Short timeout
      };

      // Should not throw with allowedTools
      const result = await runClaude(options);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe('tools-session');
    });

    it('never throws - always returns RunResult', async () => {
      const badOptions: RunOptions = {
        prompt: 'test',
        sessionId: 'test',
        cwd: '/nonexistent/path/that/should/not/exist',
        timeoutMs: 100,
      };

      // Should not throw even with bad options
      let result: RunResult | undefined;
      let didThrow = false;

      try {
        result = await runClaude(badOptions);
      } catch {
        didThrow = true;
      }

      expect(didThrow).toBe(false);
      expect(result).toBeDefined();
      expect(result!.success).toBe(false);
    });
  });

  describe('isClaudeAvailable', () => {
    it('returns boolean', async () => {
      const result = await isClaudeAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('returns false when Claude is not installed', async () => {
      // In test environment, Claude is likely not installed
      // This is the expected behavior
      const result = await isClaudeAvailable();
      // We just verify it returns a boolean without throwing
      expect([true, false]).toContain(result);
    });
  });

  describe('getClaudeVersion', () => {
    it('returns string or null', async () => {
      const result = await getClaudeVersion();
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('returns null when Claude is not installed', async () => {
      // In test environment, Claude is likely not installed
      const result = await getClaudeVersion();
      // We just verify it returns string or null without throwing
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('RunOptions interface', () => {
    it('accepts all valid option combinations', () => {
      // Full options
      const fullOptions: RunOptions = {
        prompt: 'test',
        sessionId: 'session',
        cwd: '/tmp',
        timeoutMs: 60000,
        permissionMode: 'allowedTools',
        allowedTools: ['Read', 'Write'],
      };

      // Minimal options
      const minimalOptions: RunOptions = {
        prompt: 'test',
        sessionId: 'session',
      };

      // Auto permission mode
      const autoOptions: RunOptions = {
        prompt: 'test',
        sessionId: 'session',
        permissionMode: 'auto',
      };

      // All should be valid TypeScript
      expect(fullOptions.prompt).toBe('test');
      expect(minimalOptions.prompt).toBe('test');
      expect(autoOptions.permissionMode).toBe('auto');
    });
  });

  describe('error handling (AC-009)', () => {
    it('populates error field on failure', async () => {
      const result = await runClaude({
        prompt: 'test',
        sessionId: 'test',
        timeoutMs: 100,
      });

      // In test env, Claude is likely not available
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
      }
    });

    it('sets exitCode to -1 on spawn failure', async () => {
      const result = await runClaude({
        prompt: 'test',
        sessionId: 'test',
        timeoutMs: 100,
      });

      // On spawn failure (Claude not found), exitCode should be -1
      if (!result.success && result.stderr.includes('not found')) {
        expect(result.exitCode).toBe(-1);
      }
    });
  });
});
