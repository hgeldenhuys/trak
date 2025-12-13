/**
 * Server-Side Summarizer Tests (AC-002)
 *
 * Tests for the server-side summarization module.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { join } from 'path';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';

// Import summarizer functions
import {
  validateTranscriptPath,
  extractAIResponse,
  extractFullAIResponse,
  extractWorkContent,
  calculateContextUsage,
} from '../src/summarizer';

describe('Server-Side Summarizer', () => {
  // Use /tmp directly for path validation tests (macOS tmpdir() returns /var/folders/...)
  const testDir = '/tmp/summarizer-tests-' + Date.now();
  const homeDir = process.env.HOME || '/home';

  beforeEach(() => {
    // Clean up test directory if it exists
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
    mkdirSync(testDir, { recursive: true });
  });

  describe('validateTranscriptPath', () => {
    it('should reject relative paths', () => {
      const result = validateTranscriptPath('relative/path/transcript.jsonl');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('absolute');
    });

    it('should reject paths outside allowed directories', () => {
      const result = validateTranscriptPath('/etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('allowed directory');
    });

    it('should reject non-jsonl files', () => {
      const result = validateTranscriptPath(join(homeDir, '.claude/test.txt'));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('.jsonl');
    });

    it('should accept valid paths in ~/.claude', () => {
      const result = validateTranscriptPath(join(homeDir, '.claude/projects/test/transcript.jsonl'));
      expect(result.valid).toBe(true);
    });

    it('should accept valid paths in /tmp', () => {
      const result = validateTranscriptPath('/tmp/test-transcript.jsonl');
      expect(result.valid).toBe(true);
    });

    it('should detect path traversal attacks', () => {
      // Test basic traversal
      const result1 = validateTranscriptPath(join(homeDir, '.claude/../../../etc/passwd'));
      expect(result1.valid).toBe(false);

      // Test double-encoded traversal (normalized path differs from original)
      const traversalPath = join(homeDir, '.claude/projects/../../..');
      const result2 = validateTranscriptPath(traversalPath + '/test.jsonl');
      expect(result2.valid).toBe(false);
    });
  });

  describe('calculateContextUsage', () => {
    it('should return 0 for undefined usage', () => {
      expect(calculateContextUsage(undefined)).toBe(0);
    });

    it('should return 0 for zero tokens', () => {
      expect(calculateContextUsage({
        input_tokens: 0,
        output_tokens: 0,
      })).toBe(0);
    });

    it('should calculate percentage based on 200k context window', () => {
      const usage = {
        input_tokens: 100000,
        output_tokens: 0,
      };
      // 100000 / 200000 = 50%
      expect(calculateContextUsage(usage)).toBe(50);
    });

    it('should include all token types', () => {
      const usage = {
        input_tokens: 50000,
        output_tokens: 25000,
        cache_read_input_tokens: 12500,
        cache_creation_input_tokens: 12500,
      };
      // Total: 100000 / 200000 = 50%
      expect(calculateContextUsage(usage)).toBe(50);
    });

    it('should cap at 100%', () => {
      const usage = {
        input_tokens: 300000,
        output_tokens: 0,
      };
      expect(calculateContextUsage(usage)).toBe(100);
    });
  });

  describe('extractAIResponse', () => {
    it('should return null for non-existent file', async () => {
      const result = await extractAIResponse('/tmp/non-existent.jsonl');
      expect(result).toBeNull();
    });

    it('should extract text from assistant message', async () => {
      const testFile = join(testDir, 'test-transcript.jsonl');
      const transcript = [
        JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Hello' }] } }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'I completed the task.' },
              { type: 'text', text: ' Here are the details.' },
            ],
          },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractAIResponse(testFile);
      expect(result).toContain('I completed the task.');
      expect(result).toContain('Here are the details.');
    });

    it('should return last assistant message', async () => {
      const testFile = join(testDir, 'multi-message.jsonl');
      const transcript = [
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'First response' }] } }),
        JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Continue' }] } }),
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Final response' }] } }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractAIResponse(testFile);
      expect(result).toBe('Final response');
    });

    it('should truncate long responses by default', async () => {
      const testFile = join(testDir, 'long-response.jsonl');
      const longText = 'A'.repeat(3000);
      const transcript = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: longText }] },
      });

      writeFileSync(testFile, transcript);

      const result = await extractAIResponse(testFile);
      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThan(3000);
      expect(result).toContain('[truncated]');
    });
  });

  describe('extractFullAIResponse', () => {
    it('should not truncate long responses', async () => {
      const testFile = join(testDir, 'full-response.jsonl');
      const longText = 'A'.repeat(3000);
      const transcript = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: longText }] },
      });

      writeFileSync(testFile, transcript);

      const result = await extractFullAIResponse(testFile);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(3000);
    });
  });

  describe('extractWorkContent', () => {
    it('should return null for non-existent file', async () => {
      const result = await extractWorkContent('/tmp/non-existent.jsonl');
      expect(result).toBeNull();
    });

    it('should handle empty transcript file', async () => {
      const testFile = join(testDir, 'empty-transcript.jsonl');
      writeFileSync(testFile, '');

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      expect(result!.hasSubstantiveWork).toBe(false);
      expect(result!.filesModified.length).toBe(0);
      expect(result!.actionsPerformed.length).toBe(0);
      expect(result!.toolsUsed.length).toBe(0);
    });

    it('should handle malformed JSON lines gracefully', async () => {
      const testFile = join(testDir, 'malformed-transcript.jsonl');
      const transcript = [
        'not valid json at all',
        '{"type": "assistant", "message": {"content": [{"type": "broken',
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/src/valid.ts', old_string: 'a', new_string: 'b' } },
            ],
          },
        }),
        '{"incomplete": true',
      ].join('\n');

      writeFileSync(testFile, transcript);

      // Should skip malformed lines and still extract valid content
      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      expect(result!.hasSubstantiveWork).toBe(true);
      expect(result!.filesModified).toContain('/src/valid.ts');
      expect(result!.actionsPerformed).toContain('Edited valid.ts');
    });

    it('should handle transcript with only whitespace lines', async () => {
      const testFile = join(testDir, 'whitespace-transcript.jsonl');
      writeFileSync(testFile, '   \n\n  \n');

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      expect(result!.hasSubstantiveWork).toBe(false);
      expect(result!.filesModified.length).toBe(0);
    });

    it('should handle transcript with only conversational messages (no tools)', async () => {
      const testFile = join(testDir, 'conversational-transcript.jsonl');
      const transcript = [
        JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Hello Claude!' }] } }),
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello! How can I help you today?' }] } }),
        JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Thanks, goodbye!' }] } }),
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Goodbye! Let me know if you need anything else!' }] } }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      expect(result!.hasSubstantiveWork).toBe(false);
      expect(result!.toolsUsed.length).toBe(0);
      expect(result!.filesModified.length).toBe(0);
      expect(result!.actionsPerformed.length).toBe(0);
    });

    it('should extract Edit tool file modifications', async () => {
      const testFile = join(testDir, 'edit-work.jsonl');
      const transcript = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'I will edit the file.' },
              {
                type: 'tool_use',
                id: 'toolu_123',
                name: 'Edit',
                input: { file_path: '/src/components/Button.tsx', old_string: 'foo', new_string: 'bar' },
              },
            ],
          },
        }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ tool_use_id: 'toolu_123', type: 'tool_result', content: 'File edited' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Let me know if you need anything!' }] },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      expect(result!.hasSubstantiveWork).toBe(true);
      expect(result!.filesModified).toContain('/src/components/Button.tsx');
      expect(result!.actionsPerformed).toContain('Edited Button.tsx');
      expect(result!.toolsUsed).toContain('Edit');
    });

    it('should extract Write tool file creations', async () => {
      const testFile = join(testDir, 'write-work.jsonl');
      const transcript = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'toolu_456',
                name: 'Write',
                input: { file_path: '/src/utils/helper.ts', content: 'export function helper() {}' },
              },
            ],
          },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      expect(result!.hasSubstantiveWork).toBe(true);
      expect(result!.filesModified).toContain('/src/utils/helper.ts');
      expect(result!.actionsPerformed).toContain('Wrote helper.ts');
    });

    it('should extract Bash commands with descriptions', async () => {
      const testFile = join(testDir, 'bash-work.jsonl');
      const transcript = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'toolu_789',
                name: 'Bash',
                input: { command: 'npm test', description: 'Run unit tests' },
              },
            ],
          },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      expect(result!.hasSubstantiveWork).toBe(true);
      expect(result!.actionsPerformed).toContain('Run unit tests');
      expect(result!.toolsUsed).toContain('Bash');
    });

    it('should not mark read-only operations as substantive work', async () => {
      const testFile = join(testDir, 'readonly-work.jsonl');
      const transcript = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'toolu_read',
                name: 'Read',
                input: { file_path: '/src/index.ts' },
              },
              {
                type: 'tool_use',
                id: 'toolu_glob',
                name: 'Glob',
                input: { pattern: '**/*.ts' },
              },
            ],
          },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      expect(result!.hasSubstantiveWork).toBe(false);
      expect(result!.filesModified.length).toBe(0);
      expect(result!.actionsPerformed.length).toBe(0);
      expect(result!.toolsUsed).toContain('Read');
      expect(result!.toolsUsed).toContain('Glob');
    });

    it('should handle multiple tool uses across messages', async () => {
      const testFile = join(testDir, 'multi-tool-work.jsonl');
      const transcript = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/src/a.ts' } },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: '/src/a.ts', old_string: 'x', new_string: 'y' } },
              { type: 'tool_use', id: 't3', name: 'Edit', input: { file_path: '/src/b.ts', old_string: 'a', new_string: 'b' } },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 't4', name: 'Bash', input: { command: 'bun test', description: 'Run tests' } },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'All done! Let me know if you need anything else.' }] },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      expect(result!.hasSubstantiveWork).toBe(true);
      expect(result!.filesModified.length).toBe(2);
      expect(result!.actionsPerformed).toContain('Edited a.ts');
      expect(result!.actionsPerformed).toContain('Edited b.ts');
      expect(result!.actionsPerformed).toContain('Run tests');
    });

    it('should deduplicate repeated actions', async () => {
      const testFile = join(testDir, 'duplicate-work.jsonl');
      const transcript = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/src/file.ts', old_string: 'a', new_string: 'b' } },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: '/src/file.ts', old_string: 'b', new_string: 'c' } },
            ],
          },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      // Should only have one "Edited file.ts" action, not two
      const editActions = result!.actionsPerformed.filter(a => a === 'Edited file.ts');
      expect(editActions.length).toBe(1);
    });

    it('should extract Bash commands without descriptions', async () => {
      const testFile = join(testDir, 'bash-no-desc.jsonl');
      const transcript = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              {
                type: 'tool_use',
                id: 'toolu_bash1',
                name: 'Bash',
                input: { command: 'npm install lodash' },
              },
              {
                type: 'tool_use',
                id: 'toolu_bash2',
                name: 'Bash',
                input: { command: 'git commit -m "feat: add feature"' },
              },
            ],
          },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      expect(result!.hasSubstantiveWork).toBe(true);
      expect(result!.actionsPerformed).toContain('Ran npm install');
      expect(result!.actionsPerformed).toContain('Ran git commit');
    });

    it('should handle tool_use blocks with missing input', async () => {
      const testFile = join(testDir, 'missing-input.jsonl');
      const transcript = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 't1', name: 'Edit' }, // Missing input
              { type: 'tool_use', id: 't2', name: 'Write', input: {} }, // Empty input
              { type: 'tool_use', id: 't3', name: 'Edit', input: { file_path: '/valid.ts', old_string: 'a', new_string: 'b' } },
            ],
          },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const result = await extractWorkContent(testFile);
      expect(result).not.toBeNull();
      // Should still extract the valid Edit operation
      expect(result!.filesModified).toContain('/valid.ts');
      expect(result!.toolsUsed).toContain('Edit');
    });
  });

  describe('generateSummary fallback behavior (AC-002, AC-006)', () => {
    // These tests verify generateSummary produces work-focused summaries
    // and falls back sensibly when API is unavailable or content is empty

    it('should generate fallback summary from work content when API unavailable', async () => {
      // This test uses a real transcript file but expects fallback because no API key
      const testFile = join(testDir, 'work-content-fallback.jsonl');
      const transcript = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/src/components/Header.tsx', old_string: 'old', new_string: 'new' } },
              { type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: '/src/components/Footer.tsx', old_string: 'a', new_string: 'b' } },
              { type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'bun test', description: 'Run tests' } },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Let me know if you need anything else!' }] },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      // Import generateSummary dynamically to avoid config issues
      const { generateSummary } = await import('../src/summarizer');

      const result = await generateSummary({
        transcriptPath: testFile,
        durationMs: 30000,
        filesModified: [],
        toolsUsed: [],
        promptText: 'Update header and footer components',
      });

      // Should produce work-focused summary, NOT "Let me know if you need anything else!"
      expect(result.taskCompleted).not.toContain('Let me know');
      expect(result.taskCompleted).not.toContain('anything else');
      // Should mention actual work done
      expect(result.taskCompleted).toMatch(/Edit|Header|Footer|Run tests|file/i);
    });

    it('should use promptText as fallback when no substantive work', async () => {
      const testFile = join(testDir, 'no-work-fallback.jsonl');
      const transcript = [
        JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'What is TypeScript?' }] } }),
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'TypeScript is a typed superset of JavaScript.' }] } }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const { generateSummary } = await import('../src/summarizer');

      const result = await generateSummary({
        transcriptPath: testFile,
        durationMs: 5000,
        filesModified: [],
        toolsUsed: [],
        promptText: 'Explain TypeScript basics',
      });

      // Should use prompt text or AI response as fallback
      expect(result.taskCompleted).toBeTruthy();
      expect(result.projectName).toBe('Claude Code');
    });

    it('should provide default summary for missing transcript', async () => {
      const { generateSummary } = await import('../src/summarizer');

      const result = await generateSummary({
        transcriptPath: '/tmp/definitely-does-not-exist-12345.jsonl',
        durationMs: 10000,
        filesModified: ['src/index.ts', 'src/utils.ts'],
        toolsUsed: ['Edit'],
        promptText: 'Fix import errors',
      });

      // Should produce some fallback summary
      expect(result.taskCompleted).toBeTruthy();
      expect(result.taskCompleted.length).toBeGreaterThan(0);
    });

    it('should include duration in keyOutcomes', async () => {
      const testFile = join(testDir, 'duration-test.jsonl');
      writeFileSync(testFile, JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Done!' }] },
      }));

      const { generateSummary } = await import('../src/summarizer');

      // Test with 90 seconds (should show minutes)
      const result = await generateSummary({
        transcriptPath: testFile,
        durationMs: 90000,
        filesModified: [],
        toolsUsed: [],
      });

      // keyOutcomes should include duration
      expect(result.keyOutcomes.some(o => o.includes('1m 30s'))).toBe(true);
    });

    it('should include file count in keyOutcomes when files modified', async () => {
      const testFile = join(testDir, 'files-count-test.jsonl');
      const transcript = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/a.ts', old_string: 'x', new_string: 'y' } },
              { type: 'tool_use', id: 't2', name: 'Edit', input: { file_path: '/b.ts', old_string: 'x', new_string: 'y' } },
              { type: 'tool_use', id: 't3', name: 'Write', input: { file_path: '/c.ts', content: 'new file' } },
            ],
          },
        }),
      ].join('\n');

      writeFileSync(testFile, transcript);

      const { generateSummary } = await import('../src/summarizer');

      const result = await generateSummary({
        transcriptPath: testFile,
        durationMs: 30000,
        filesModified: [],
        toolsUsed: [],
      });

      // Should detect 3 files from work content
      expect(result.keyOutcomes.some(o => o.includes('3 files'))).toBe(true);
    });

    it('should calculate context usage percentage', async () => {
      const testFile = join(testDir, 'context-usage-test.jsonl');
      writeFileSync(testFile, JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Task done.' }] },
      }));

      const { generateSummary } = await import('../src/summarizer');

      const result = await generateSummary({
        transcriptPath: testFile,
        durationMs: 10000,
        filesModified: [],
        toolsUsed: [],
        usage: {
          input_tokens: 50000,
          output_tokens: 10000,
        },
      });

      // (50000 + 10000) / 200000 = 30%
      expect(result.contextUsagePercent).toBe(30);
    });
  });
});
