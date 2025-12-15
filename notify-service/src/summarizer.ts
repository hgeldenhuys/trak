#!/usr/bin/env bun
/**
 * Server-Side Summarizer (AC-002)
 *
 * Generates intelligent summaries of completed tasks using the Anthropic API.
 * This module mirrors hooks/summarizer.ts but runs server-side, reading
 * configuration from ServiceConfig (not environment variables per AC-001).
 *
 * Key differences from hooks/summarizer.ts:
 * - API key comes from ServiceConfig.summarization.apiKey (not env vars)
 * - Reads transcript files from paths provided in RawEventPayload
 * - Used by the /notify endpoint when receiving raw event data
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getConfig } from './config';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

// Types

/**
 * Structured work content extracted from transcript
 * Represents actual modifications made during the session
 */
export interface WorkContent {
  /** Files that were edited or written */
  filesModified: string[];
  /** Human-readable actions performed ("Edited src/foo.ts", "Ran npm test") */
  actionsPerformed: string[];
  /** Tool names used (Edit, Write, Bash, etc.) */
  toolsUsed: string[];
  /** True if any substantive work (Edit/Write/Bash) was done */
  hasSubstantiveWork: boolean;
}

export interface SummaryInput {
  /** Path to the transcript JSONL file */
  transcriptPath: string;
  /** Duration of the task in milliseconds */
  durationMs: number;
  /** Array of file paths that were modified */
  filesModified: string[];
  /** Array of tool names that were used */
  toolsUsed: string[];
  /** Optional user prompt text */
  promptText?: string;
  /** Token usage statistics */
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  /** Model used for the task */
  model?: string;
  /** Project name */
  project?: string;
  /** Session name */
  sessionName?: string;
}

export interface SummaryOutput {
  taskCompleted: string;
  projectName: string;
  contextUsagePercent: number;
  keyOutcomes: string[];
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

/**
 * Calculate context usage percentage from token usage
 * Claude models have ~200k token context window
 */
export function calculateContextUsage(usage?: SummaryInput['usage']): number {
  if (!usage) return 0;

  // Total tokens used = input + cache_read + cache_creation + output
  const totalTokens =
    (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    (usage.output_tokens || 0);

  if (totalTokens === 0) return 0;

  // Claude Opus 4.5 and Sonnet 4 have 200k context window
  const contextWindow = 200000;
  const percent = Math.round((totalTokens / contextWindow) * 100);

  return Math.min(percent, 100); // Cap at 100%
}

/**
 * Validate transcript path to prevent directory traversal attacks
 */
export function validateTranscriptPath(transcriptPath: string): { valid: boolean; error?: string } {
  // Must be absolute path
  if (!path.isAbsolute(transcriptPath)) {
    return { valid: false, error: 'Transcript path must be absolute' };
  }

  // Normalize and check for traversal
  const normalized = path.normalize(transcriptPath);
  if (normalized !== transcriptPath && normalized !== transcriptPath.replace(/\/$/, '')) {
    return { valid: false, error: 'Path traversal detected' };
  }

  // Must be in allowed directories (home dir .claude or /tmp)
  const homeDir = process.env.HOME || '/home';
  const allowedPrefixes = [
    path.join(homeDir, '.claude'),
    '/tmp',
    '/var/tmp',
  ];

  const isAllowed = allowedPrefixes.some(prefix => normalized.startsWith(prefix));
  if (!isAllowed) {
    return { valid: false, error: `Transcript path must be in allowed directory (${allowedPrefixes.join(', ')})` };
  }

  // Must end with .jsonl
  if (!normalized.endsWith('.jsonl')) {
    return { valid: false, error: 'Transcript path must end with .jsonl' };
  }

  return { valid: true };
}

/**
 * Extract the last AI response from the transcript file
 */
export async function extractAIResponse(transcriptPath: string, truncate: boolean = true): Promise<string | null> {
  try {
    if (!existsSync(transcriptPath)) {
      if (DEBUG) {
        console.error('[summarizer] Transcript file not found:', transcriptPath);
      }
      return null;
    }

    const content = await readFile(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    // Find the last assistant message (read backwards for efficiency)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const record = JSON.parse(lines[i]);
        if (record.type === 'assistant' && record.message?.content) {
          // Extract text from content blocks
          const textContent: string[] = [];
          for (const block of record.message.content) {
            if (block.type === 'text' && block.text) {
              textContent.push(block.text);
            }
          }
          if (textContent.length > 0) {
            const fullResponse = textContent.join('\n');
            // Truncate for summary generation, but allow full extraction
            if (truncate && fullResponse.length > 2000) {
              return fullResponse.substring(0, 2000) + '... [truncated]';
            }
            return fullResponse;
          }
        }
      } catch {
        continue;
      }
    }

    if (DEBUG) {
      console.error('[summarizer] No assistant message found in transcript');
    }
    return null;
  } catch (error) {
    if (DEBUG) {
      console.error('[summarizer] Error reading transcript:', error);
    }
    return null;
  }
}

/**
 * Extract full AI response without truncation (for response pages)
 */
export async function extractFullAIResponse(transcriptPath: string): Promise<string | null> {
  return extractAIResponse(transcriptPath, false);
}

/**
 * Extract actual work content from transcript
 * Parses tool_use blocks to identify files modified and actions performed
 * This provides more accurate summaries than extracting the last conversational message
 */
export async function extractWorkContent(transcriptPath: string): Promise<WorkContent | null> {
  try {
    if (!existsSync(transcriptPath)) {
      if (DEBUG) {
        console.error('[summarizer] Transcript file not found:', transcriptPath);
      }
      return null;
    }

    const content = await readFile(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    const filesModified: Set<string> = new Set();
    const actionsPerformed: string[] = [];
    const toolsUsed: Set<string> = new Set();

    // Read-only tools that don't constitute substantive work
    const readOnlyTools = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);
    // Tools that modify files or execute commands
    const substantiveTools = new Set(['Edit', 'Write', 'Bash', 'NotebookEdit']);

    for (const line of lines) {
      try {
        const record = JSON.parse(line);

        // Look for assistant messages with tool_use blocks
        if (record.type === 'assistant' && record.message?.content) {
          for (const block of record.message.content) {
            if (block.type === 'tool_use' && block.name && block.input) {
              const toolName = block.name;
              toolsUsed.add(toolName);

              // Skip read-only operations for action tracking
              if (readOnlyTools.has(toolName)) {
                continue;
              }

              // Extract file paths and actions based on tool type
              if (toolName === 'Edit' || toolName === 'Write') {
                const filePath = block.input.file_path;
                if (filePath) {
                  // Extract just the filename for readability
                  const fileName = path.basename(filePath);
                  filesModified.add(filePath);
                  const action = toolName === 'Edit' ? 'Edited' : 'Wrote';
                  actionsPerformed.push(`${action} ${fileName}`);
                }
              } else if (toolName === 'NotebookEdit') {
                const notebookPath = block.input.notebook_path;
                if (notebookPath) {
                  const fileName = path.basename(notebookPath);
                  filesModified.add(notebookPath);
                  actionsPerformed.push(`Modified notebook ${fileName}`);
                }
              } else if (toolName === 'Bash') {
                // Only track Bash commands that actually modify state
                // Skip investigative/read-only commands (ls, cat, grep, etc.)
                const command = block.input.command;
                if (command) {
                  const cmdParts = command.split(' ');
                  const cmdName = cmdParts[0];

                  // Commands that modify state and are worth summarizing
                  const modifyingCommands = ['npm', 'bun', 'yarn', 'pnpm', 'git', 'mkdir', 'rm', 'mv', 'cp', 'touch', 'chmod', 'docker', 'make'];
                  const gitModifyingSubcommands = ['commit', 'push', 'pull', 'merge', 'rebase', 'checkout', 'branch', 'stash', 'reset', 'add'];
                  const packageSubcommands = ['install', 'add', 'remove', 'update', 'build', 'test', 'run'];

                  if (modifyingCommands.includes(cmdName)) {
                    const subCmd = cmdParts[1] || '';

                    if (['npm', 'bun', 'yarn', 'pnpm'].includes(cmdName) && packageSubcommands.includes(subCmd)) {
                      actionsPerformed.push(`Ran ${cmdName} ${subCmd}`);
                    } else if (cmdName === 'git' && gitModifyingSubcommands.includes(subCmd)) {
                      actionsPerformed.push(`Ran git ${subCmd}`);
                    } else if (['mkdir', 'rm', 'mv', 'cp', 'touch', 'chmod'].includes(cmdName)) {
                      actionsPerformed.push(`${cmdName} operation`);
                    } else if (cmdName === 'docker') {
                      actionsPerformed.push(`Docker ${subCmd || 'operation'}`);
                    } else if (cmdName === 'make') {
                      actionsPerformed.push(`Make ${subCmd || 'build'}`);
                    }
                  }
                  // Note: We intentionally skip investigative commands like ls, cat, grep, curl, sqlite3, etc.
                  // These don't represent "work done" - they're just information gathering
                }
              }
            }
          }
        }
      } catch {
        // Skip malformed lines
        continue;
      }
    }

    // Determine if substantive work was done
    const hasSubstantiveWork = [...toolsUsed].some(tool => substantiveTools.has(tool));

    // Deduplicate actions while preserving order
    const uniqueActions = [...new Set(actionsPerformed)];

    if (DEBUG) {
      console.error('[summarizer] Extracted work content:', {
        filesModified: [...filesModified],
        actionsPerformed: uniqueActions,
        toolsUsed: [...toolsUsed],
        hasSubstantiveWork,
      });
    }

    return {
      filesModified: [...filesModified],
      actionsPerformed: uniqueActions,
      toolsUsed: [...toolsUsed],
      hasSubstantiveWork,
    };
  } catch (error) {
    if (DEBUG) {
      console.error('[summarizer] Error extracting work content:', error);
    }
    return null;
  }
}

/**
 * Call LLM API for summarization
 * Supports both Anthropic direct API and OpenRouter
 */
async function callAnthropicAPI(messages: AnthropicMessage[], systemPrompt: string): Promise<string> {
  const config = getConfig();

  if (!config?.summarization?.apiKey) {
    throw new Error('API key not configured in ServiceConfig.summarization.apiKey');
  }

  const apiUrl = config.summarization.apiUrl || 'https://api.anthropic.com';
  const model = config.summarization.model || 'claude-3-haiku-20240307';
  const timeout = 15000; // 15 second timeout
  const isOpenRouter = apiUrl.includes('openrouter.ai');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Build endpoint URL - OpenRouter already has /api/v1, Anthropic needs /v1/messages
    const endpoint = isOpenRouter
      ? `${apiUrl}/chat/completions`  // OpenRouter uses OpenAI-compatible endpoint
      : `${apiUrl}/v1/messages`;

    // Build headers based on provider
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (isOpenRouter) {
      headers['Authorization'] = `Bearer ${config.summarization.apiKey}`;
      headers['HTTP-Referer'] = 'https://github.com/hgeldenhuys/trak-project';
      headers['X-Title'] = 'Claude Code Notifications';
    } else {
      headers['x-api-key'] = config.summarization.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    // Build request body based on provider
    const body = isOpenRouter
      ? {
          model,
          max_tokens: 300,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
        }
      : {
          model,
          max_tokens: 300,
          system: systemPrompt,
          messages,
        };

    if (DEBUG) {
      console.error(`[summarizer] Calling ${isOpenRouter ? 'OpenRouter' : 'Anthropic'} API: ${endpoint}`);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // Parse response based on provider format
    if (isOpenRouter) {
      // OpenAI-compatible format
      return data.choices?.[0]?.message?.content || '';
    } else {
      // Anthropic format
      return (data as AnthropicResponse).content[0]?.text || '';
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`API timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Extract a meaningful summary from AI response text
 */
function extractMeaningfulSummary(text: string, maxLength: number = 100): string {
  // Clean markdown and normalize whitespace
  const cleanText = (t: string) => t
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Keep link text
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markers
    .replace(/`([^`]+)`/g, '$1') // Remove backticks
    .replace(/^#{1,6}\s+/gm, '') // Remove header markers
    .replace(/\s+/g, ' ')
    .trim();

  const cleaned = cleanText(text);

  // Look for explicit "Done." or "Fixed:" style summaries at the start
  const donePatterns = [
    /^Done[.!:]\s*(.{10,80})/i,
    /^Fixed[.!:]\s*(.{10,80})/i,
    /^Added[.!:]\s*(.{10,80})/i,
    /^Updated[.!:]\s*(.{10,80})/i,
    /^Completed[.!:]\s*(.{10,80})/i,
  ];

  for (const pattern of donePatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const result = match[1].split(/[.!?\n]/)[0].trim();
      if (result.length >= 15 && result.length <= maxLength) {
        return result;
      }
    }
  }

  // Find short sentences with action verbs
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const actionVerbs = /^(Fixed|Added|Updated|Removed|Implemented|Created|Configured|Enabled|Disabled|Refactored|Resolved|Changed|Modified|Improved|Restored|Extracted|Built|Set up|Integrated)/i;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 15 || trimmed.length > 120) continue;
    if (trimmed.endsWith('?')) continue;
    if (/\b(will|should|going to|next|can now|you can)\b/i.test(trimmed)) continue;
    if (/^(The |This |I |We |It |Here|Now |So )/i.test(trimmed)) continue;

    if (actionVerbs.test(trimmed)) {
      if (trimmed.length <= maxLength) return trimmed;
      return trimmed.substring(0, maxLength - 3) + '...';
    }
  }

  // Absolute fallback
  if (cleaned.length > maxLength) {
    return cleaned.substring(0, maxLength - 3) + '...';
  }
  return cleaned || 'Task completed';
}

/**
 * Create a fallback summary when API is unavailable
 * Now prioritizes work content over AI response for more accurate summaries
 */
function createFallbackSummary(
  input: SummaryInput,
  aiResponse?: string | null,
  workContent?: WorkContent | null
): SummaryOutput {
  const projectName = input.project || 'Claude Code';
  let taskCompleted = '';

  // PRIORITY 1: Use work content if substantive work was done
  // This ensures we summarize actual work, not conversational endings
  if (workContent?.hasSubstantiveWork && workContent.filesModified.length > 0) {
    const fileCount = workContent.filesModified.length;
    const fileNames = workContent.filesModified.slice(0, 2).map(f => path.basename(f)).join(', ');
    taskCompleted = `Modified ${fileNames}${fileCount > 2 ? ` and ${fileCount - 2} more files` : ''}`;
  } else if (workContent?.actionsPerformed.length > 0) {
    // Only include meaningful actions (the extraction now filters these)
    const topActions = workContent.actionsPerformed.slice(0, 2);
    taskCompleted = topActions.join(', ');
    if (workContent.actionsPerformed.length > 2) {
      taskCompleted += ` and ${workContent.actionsPerformed.length - 2} more`;
    }
  }

  // PRIORITY 2: Try to extract meaningful summary from AI response
  if (!taskCompleted && aiResponse) {
    taskCompleted = extractMeaningfulSummary(aiResponse, 200);
  }

  // PRIORITY 3: Use prompt text
  if (!taskCompleted && input.promptText) {
    const promptClean = input.promptText.replace(/\n+/g, ' ').trim();
    if (promptClean.length <= 150) {
      taskCompleted = `Processed: ${promptClean}`;
    } else {
      taskCompleted = `Processed: ${promptClean.substring(0, 147)}...`;
    }
  }

  // PRIORITY 4: Use files modified from work content or input
  if (!taskCompleted) {
    const files = workContent?.filesModified || input.filesModified;
    if (files.length > 0) {
      const fileNames = files.slice(0, 3).map(f => f.split('/').pop()).join(', ');
      taskCompleted = `Modified ${fileNames}${files.length > 3 ? ' and more' : ''}`;
    } else {
      taskCompleted = 'Task completed successfully';
    }
  }

  // Build key outcomes
  const keyOutcomes: string[] = [];
  const filesModifiedCount = workContent?.filesModified.length || input.filesModified.length;
  if (filesModifiedCount > 0) {
    keyOutcomes.push(`${filesModifiedCount} file${filesModifiedCount > 1 ? 's' : ''} modified`);
  }

  const seconds = Math.round(input.durationMs / 1000);
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    keyOutcomes.push(`${mins}m ${secs}s`);
  } else {
    keyOutcomes.push(`${seconds}s`);
  }

  return {
    taskCompleted,
    projectName,
    contextUsagePercent: calculateContextUsage(input.usage),
    keyOutcomes,
  };
}

/**
 * Generate summary using Anthropic API (server-side)
 * Now prioritizes work content (files modified, actions performed) over last message
 */
export async function generateSummary(input: SummaryInput): Promise<SummaryOutput> {
  const config = getConfig();
  const { transcriptPath, promptText } = input;

  if (DEBUG) {
    console.error(`[summarizer] Generating summary (model: ${config?.summarization?.model || 'not configured'})`);
  }

  // Validate transcript path for security
  const pathValidation = validateTranscriptPath(transcriptPath);
  if (!pathValidation.valid) {
    console.error(`[summarizer] Invalid transcript path: ${pathValidation.error}`);
    return createFallbackSummary(input, null);
  }

  // FIRST: Extract actual work content from tool_use blocks
  // This gives us files modified and actions performed - much better than last message
  const workContent = await extractWorkContent(transcriptPath);

  if (DEBUG && workContent) {
    console.error('[summarizer] Work content found:', {
      filesModified: workContent.filesModified.length,
      actionsPerformed: workContent.actionsPerformed.length,
      hasSubstantiveWork: workContent.hasSubstantiveWork,
    });
  }

  // Extract AI response as fallback (still useful for response pages)
  const aiResponse = await extractAIResponse(transcriptPath);
  if (DEBUG) {
    console.error(`[summarizer] Extracted AI response: ${aiResponse?.substring(0, 100)}...`);
  }

  // If no API key configured, use fallback based on work content
  if (!config?.summarization?.apiKey) {
    if (DEBUG) {
      console.error('[summarizer] No Anthropic API key configured, using fallback');
    }
    return createFallbackSummary(input, aiResponse, workContent);
  }

  try {
    // Build summary content based on what was actually done
    let workDescription: string;
    let summaryContext: 'work' | 'response' | 'prompt' = 'prompt';

    if (workContent?.hasSubstantiveWork && workContent.actionsPerformed.length > 0) {
      // Use actual work actions for summary
      const topActions = workContent.actionsPerformed.slice(0, 5);
      workDescription = `Actions performed: ${topActions.join(', ')}`;

      if (workContent.filesModified.length > 0) {
        const fileCount = workContent.filesModified.length;
        const fileNames = workContent.filesModified.slice(0, 3).map(f => path.basename(f)).join(', ');
        workDescription += `. Files modified: ${fileNames}${fileCount > 3 ? ` and ${fileCount - 3} more` : ''}.`;
      }
      summaryContext = 'work';
    } else if (aiResponse && aiResponse.length > 50) {
      // Use AI response when no substantive file work was done
      // This handles investigative/conversational sessions
      workDescription = (aiResponse || 'No response')
        .replace(/```[\s\S]*?```/g, '[code block]')
        .replace(/https?:\/\/[^\s]+/g, '[URL]')
        .replace(/^\|.*\|$/gm, '')
        .replace(/\|[-:]+\|/g, '')
        .replace(/\|/g, ',')
        .replace(/[*_`]/g, '')
        .replace(/^#+\s*/gm, '')
        .replace(/\s+/g, ' ')
        .substring(0, 800)
        .trim();
      summaryContext = 'response';
    } else {
      // Last resort: summarize based on prompt
      workDescription = `Responded to user request about: ${(promptText || 'their question').substring(0, 200)}`;
      summaryContext = 'prompt';
    }

    const cleanPrompt = (promptText || 'Unknown task')
      .replace(/[#*_`|]/g, '')
      .substring(0, 150);

    // Tailor system prompt based on what content we're summarizing
    let systemPrompt: string;
    if (summaryContext === 'work') {
      systemPrompt = `Summarize coding work as a spoken notification. Output ONLY the summary sentence.

RULES:
1. Focus on what was DONE (files edited, commands run)
2. Convert file operations to natural language: "Edited foo.ts" -> "edited the foo file"
3. First person, past tense, one sentence
4. Be concise: max 20 words
5. No code, no URLs, no lists, no tables, no markdown formatting`;
    } else {
      systemPrompt = `Summarize what Claude explained or answered. Output ONLY the summary sentence.

CRITICAL: NO files were modified in this session. Do NOT mention editing files, Dockerfiles, configs, or any code changes.

RULES:
1. This was a Q&A or research session - summarize what was EXPLAINED or ANSWERED
2. First person, past tense, one sentence (e.g., "I explained...", "I answered...", "I researched...")
3. Be concise: max 20 words
4. Focus on the topic discussed, not fictional work
5. No code, no URLs, no lists, no tables, no markdown formatting`;
    }

    const userMessage = `User asked: ${cleanPrompt}

Claude's work: ${workDescription}

SUMMARIZE as a natural spoken notification (one sentence):`;

    const messages: AnthropicMessage[] = [
      { role: 'user', content: userMessage },
    ];

    const result = await callAnthropicAPI(messages, systemPrompt);
    const taskCompleted = result.trim().replace(/^["']|["']$/g, '');

    if (DEBUG) {
      console.error('[summarizer] Summary generated:', taskCompleted);
    }

    // Use file count from work content if available, otherwise from input
    const filesModifiedCount = workContent?.filesModified.length || input.filesModified.length;

    return {
      taskCompleted,
      projectName: input.project || 'Claude Code',
      contextUsagePercent: calculateContextUsage(input.usage),
      keyOutcomes: [
        filesModifiedCount > 0
          ? `${filesModifiedCount} file${filesModifiedCount > 1 ? 's' : ''} modified`
          : 'Task completed',
      ],
    };
  } catch (error) {
    if (DEBUG) {
      console.error('[summarizer] Error generating summary:', error);
    }
    return createFallbackSummary(input, aiResponse, workContent);
  }
}

/**
 * Check if server-side summarization is configured
 */
export function isSummarizationConfigured(): boolean {
  const config = getConfig();
  return !!(config?.summarization?.enabled && config?.summarization?.apiKey);
}

// CLI entry point for testing
if (import.meta.main) {
  console.log('=== Server-Side Summarizer Test ===');

  const config = getConfig();
  console.log(`Summarization enabled: ${config?.summarization?.enabled ?? false}`);
  console.log(`API key configured: ${config?.summarization?.apiKey ? 'yes' : 'no'}`);
  console.log(`Model: ${config?.summarization?.model || 'not set'}`);
  console.log('');

  if (!config?.summarization?.apiKey) {
    console.log('Set summarization.apiKey in ~/.claude-notify/config.json to test');
    process.exit(1);
  }

  const testInput: SummaryInput = {
    transcriptPath: '/tmp/test-transcript.jsonl',
    promptText: 'Add notification system with TTS and Discord integration',
    durationMs: 45000,
    filesModified: [
      'hooks/notification-hook.ts',
      'hooks/audio-queue.ts',
      'hooks/summarizer.ts',
    ],
    toolsUsed: ['Read', 'Write', 'Bash'],
    project: 'Test Project',
  };

  console.log('Testing with sample input (will fail if transcript does not exist)...');
  const summary = await generateSummary(testInput);
  console.log('Summary:', JSON.stringify(summary, null, 2));
}
