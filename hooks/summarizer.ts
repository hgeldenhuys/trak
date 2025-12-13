#!/usr/bin/env bun
/**
 * LLM Summarizer
 *
 * Generates intelligent summaries of completed tasks using OpenAI-compatible API.
 *
 * Configuration (env vars):
 * - SUMMARY_API_URL: API base URL (default: https://api.openai.com/v1)
 * - SUMMARY_API_KEY: API key (required)
 * - SUMMARY_MODEL: Model to use (default: gpt-4o-mini)
 *
 * Output format:
 * {
 *   "taskCompleted": string,
 *   "projectName": string,
 *   "contextUsagePercent": number,
 *   "keyOutcomes": string[]
 * }
 */

import { readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

// Configuration
const DEBUG = process.env.NOTIFICATION_DEBUG === 'true';
// Last updated: 2025-12-08 - Removed files/tools from summary (per-turn tracking not available)
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const PROMPT_FILE = path.join(PROJECT_DIR, 'hooks/prompts/summary-prompt.md');
const CONFIG_FILE = path.join(PROJECT_DIR, '.agent/loom/notification-config.json');
const WIZARD_CONFIG_FILE = path.join(process.env.HOME || '', '.claude-notify/config.json');

// Load wizard config if exists (from setup-wizard.ts)
interface WizardConfig {
  summary?: {
    apiUrl?: string;
    apiKey?: string;
    model?: string;
  };
}

function loadWizardConfig(): WizardConfig | null {
  try {
    if (existsSync(WIZARD_CONFIG_FILE)) {
      const content = readFileSync(WIZARD_CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    if (DEBUG) console.error('[summarizer] Error reading wizard config:', e);
  }
  return null;
}

const wizardConfig = loadWizardConfig();

// LLM API Configuration (prefer env vars, fallback to wizard config)
const API_URL = process.env.SUMMARY_API_URL || wizardConfig?.summary?.apiUrl || 'https://api.openai.com/v1';
const API_KEY = process.env.SUMMARY_API_KEY || wizardConfig?.summary?.apiKey || process.env.OPENAI_API_KEY;
const MODEL = process.env.SUMMARY_MODEL || wizardConfig?.summary?.model || 'gpt-4o-mini';
const TIMEOUT_MS = 15000; // 15 second timeout

// Types
export interface SummaryInput {
  promptText?: string;
  sessionName?: string;
  transcriptPath?: string;
  durationMs: number;
  filesModified: string[];
  toolsUsed: string[];
  stopPayload: Record<string, unknown>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: string;
}

export interface SummaryOutput {
  taskCompleted: string;
  projectName: string;
  contextUsagePercent: number;
  keyOutcomes: string[];
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Calculate context usage percentage from token usage
 * Claude models have ~200k token context window
 */
function calculateContextUsage(usage?: SummaryInput['usage']): number {
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

  return Math.min(percent, 100);  // Cap at 100%
}

/**
 * Extract the last AI response from the transcript file
 * @param transcriptPath Path to the JSONL transcript
 * @param truncate If true, truncates to 2000 chars for summarization (default: true)
 */
async function extractAIResponseInternal(transcriptPath: string, truncate: boolean = true): Promise<string | null> {
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
 * Extract the full AI response without truncation (for response pages)
 */
export async function extractFullAIResponse(transcriptPath: string): Promise<string | null> {
  return extractAIResponseInternal(transcriptPath, false);
}

/**
 * Extract AI response for summarization (truncated to 2000 chars)
 */
async function extractAIResponse(transcriptPath: string): Promise<string | null> {
  return extractAIResponseInternal(transcriptPath, true);
}

/**
 * Extract tool usage stats from transcript JSONL
 * Parses tool_use blocks to extract unique tool names and modified files
 */
export interface TranscriptToolStats {
  toolsUsed: string[];
  filesModified: string[];
}

export async function extractToolUsageFromTranscript(transcriptPath: string): Promise<TranscriptToolStats> {
  const result: TranscriptToolStats = {
    toolsUsed: [],
    filesModified: [],
  };

  try {
    if (!existsSync(transcriptPath)) {
      return result;
    }

    const content = await readFile(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');
    const toolSet = new Set<string>();
    const fileSet = new Set<string>();

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        // Look for assistant messages with tool_use blocks
        if (record.type === 'assistant' && record.message?.content) {
          for (const block of record.message.content) {
            if (block.type === 'tool_use' && block.name) {
              toolSet.add(block.name);
              // Extract file paths from tool input
              const input = block.input;
              if (input) {
                const filePath = input.file_path || input.path || input.filePath;
                if (filePath && typeof filePath === 'string') {
                  // Only track files that were modified (Edit, Write tools)
                  if (['Edit', 'Write', 'NotebookEdit'].includes(block.name)) {
                    fileSet.add(filePath);
                  }
                }
              }
            }
          }
        }
      } catch {
        continue;
      }
    }

    result.toolsUsed = Array.from(toolSet);
    result.filesModified = Array.from(fileSet);

    if (DEBUG) {
      console.error(`[summarizer] Extracted from transcript: ${result.toolsUsed.length} tools, ${result.filesModified.length} files`);
    }
  } catch (error) {
    if (DEBUG) {
      console.error('[summarizer] Error extracting tool usage:', error);
    }
  }

  return result;
}

/**
 * Load custom prompt from config if available
 */
function loadCustomPromptFromConfig(): string | null {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      const config = JSON.parse(content);
      if (config.customSystemPrompt?.trim()) {
        return config.customSystemPrompt;
      }
    }
  } catch {}
  return null;
}

/**
 * Load the summary prompt template
 */
async function loadPromptTemplate(): Promise<string> {
  const customPrompt = loadCustomPromptFromConfig();
  if (customPrompt) return customPrompt;

  if (existsSync(PROMPT_FILE)) {
    return readFile(PROMPT_FILE, 'utf-8');
  }

  return `You are a concise task summarizer. Summarize the AI's response in 1-2 sentences that capture the key outcome. Focus on WHAT was accomplished, not the process.

Output JSON:
{
  "taskCompleted": "Brief summary of what was done",
  "projectName": "Project name",
  "contextUsagePercent": 0,
  "keyOutcomes": ["outcome1", "outcome2"]
}`;
}

/**
 * Call OpenAI-compatible chat completion API
 */
async function callLLM(messages: ChatMessage[]): Promise<string> {
  if (!API_KEY) {
    throw new Error('SUMMARY_API_KEY or OPENAI_API_KEY not set');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 300,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data = await response.json() as ChatCompletionResponse;
    return data.choices[0]?.message?.content || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`API timeout after ${TIMEOUT_MS}ms`);
    }
    throw error;
  }
}

/**
 * Generate summary using Claude headless (when no API key configured)
 */
async function generateSummaryWithClaude(
  aiResponse: string | null,
  promptText: string | undefined,
  input: SummaryInput
): Promise<SummaryOutput | null> {
  try {
    const { execSync } = await import('child_process');
    const { writeFileSync, unlinkSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');

    // Clean the response - strip only problematic chars, keep readable content
    const cleanResponse = (aiResponse || 'No response')
      .replace(/```[\s\S]*?```/g, '[code block]') // Summarize code blocks
      .replace(/https?:\/\/[^\s]+/g, '[URL]') // Replace URLs
      .replace(/^\|.*\|$/gm, '') // Remove markdown table rows (full lines)
      .replace(/\|[-:]+\|/g, '') // Remove table separators
      .replace(/\|/g, ',') // Convert remaining pipes to commas
      .replace(/[*_`]/g, '') // Remove only formatting chars, keep content
      .replace(/^#+\s*/gm, '') // Remove heading markers
      .replace(/✓/g, 'yes') // Convert checkmarks to words
      .replace(/\s+/g, ' ') // Normalize whitespace
      .substring(0, 500)
      .trim();

    const cleanPrompt = (promptText || 'Unknown task')
      .replace(/[#*_`|]/g, '')
      .substring(0, 100);

    const prompt = `Rewrite this as a spoken notification. Output ONLY the rewritten sentence, nothing else.

User asked: ${cleanPrompt}
AI response: ${cleanResponse}

REWRITE RULES (must follow):
1. Convert camelCase to words: durationThresholdMs → "duration threshold"
2. Convert ms to seconds: 5000 → "5 seconds", 6000 → "6 seconds"
3. First person, past tense
4. One sentence only

EXAMPLES:
- "Done. Changed durationThresholdMs from 5000 to 6000" → "I changed the duration threshold from 5 to 6 seconds."
- "Fixed the userId validation bug" → "I fixed the user ID validation bug."
- "Added error handling to fetchData" → "I added error handling to the fetch data function."

NOW REWRITE:`;

    // Write prompt to temp file to avoid shell escaping issues
    const tmpFile = join(tmpdir(), `claude-summary-${Date.now()}.txt`);
    writeFileSync(tmpFile, prompt, 'utf-8');

    try {
      const result = execSync(
        `cat "${tmpFile}" | claude --print 2>/dev/null`,
        {
          encoding: 'utf-8',
          timeout: 30000,
          maxBuffer: 1024 * 1024
        }
      ).trim();

      // Clean the result - remove quotes if Claude wrapped it
      const cleanResult = result.replace(/^["']|["']$/g, '').trim();

      if (cleanResult && cleanResult.length > 10 && cleanResult.length < 200) {
        if (DEBUG) {
          console.error(`[summarizer] Claude generated: ${cleanResult}`);
        }
        return {
          taskCompleted: cleanResult,
          projectName: getProjectName(input.filesModified),
          contextUsagePercent: calculateContextUsage(input.usage),
          keyOutcomes: [
            input.filesModified.length > 0
              ? `${input.filesModified.length} file${input.filesModified.length > 1 ? 's' : ''} modified`
              : 'Task completed',
          ],
        };
      }
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  } catch (error) {
    if (DEBUG) {
      console.error('[summarizer] Claude headless failed:', error);
    }
  }
  return null;
}

/**
 * Generate summary using LLM API
 */
export async function generateSummary(input: SummaryInput): Promise<SummaryOutput> {
  const { promptText, transcriptPath } = input;

  if (DEBUG) {
    console.error(`[summarizer] Generating summary (model: ${MODEL})`);
  }

  // Extract AI response from transcript
  let aiResponse: string | null = null;
  if (transcriptPath) {
    aiResponse = await extractAIResponse(transcriptPath);
    if (DEBUG) {
      console.error(`[summarizer] Extracted AI response: ${aiResponse?.substring(0, 100)}...`);
    }
  }

  // If no API key, try Claude headless, then fallback
  if (!API_KEY) {
    if (DEBUG) {
      console.error('[summarizer] No API key configured, trying Claude headless');
    }
    const claudeSummary = await generateSummaryWithClaude(aiResponse, promptText, input);
    if (claudeSummary) {
      return claudeSummary;
    }
    return createFallbackSummary(input, aiResponse);
  }

  try {
    // Clean the response for the prompt
    const cleanResponse = (aiResponse || 'No response')
      .replace(/```[\s\S]*?```/g, '[code block]')
      .replace(/https?:\/\/[^\s]+/g, '[URL]')
      .replace(/^\|.*\|$/gm, '')
      .replace(/\|[-:]+\|/g, '')
      .replace(/\|/g, ',')
      .replace(/[*_`]/g, '')
      .replace(/^#+\s*/gm, '')
      .replace(/✓/g, 'yes')
      .replace(/\s+/g, ' ')
      .substring(0, 500)
      .trim();

    const cleanPrompt = (promptText || 'Unknown task')
      .replace(/[#*_`|]/g, '')
      .substring(0, 100);

    const systemPrompt = `Rewrite AI responses as spoken notifications. Output ONLY the rewritten sentence.

RULES:
1. Convert camelCase to words: durationThresholdMs → "duration threshold"
2. Convert ms to seconds: 5000 → "5 seconds"
3. First person, past tense, one sentence
4. No code, no URLs, no lists`;

    const userMessage = `User asked: ${cleanPrompt}
AI response: ${cleanResponse}

REWRITE:`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const result = await callLLM(messages);
    const taskCompleted = result.trim().replace(/^["']|["']$/g, '');

    if (DEBUG) {
      console.error('[summarizer] Summary generated:', taskCompleted);
    }

    return {
      taskCompleted,
      projectName: getProjectName(input.filesModified),
      contextUsagePercent: calculateContextUsage(input.usage),
      keyOutcomes: [
        input.filesModified.length > 0
          ? `${input.filesModified.length} file${input.filesModified.length > 1 ? 's' : ''} modified`
          : 'Task completed',
      ],
    };
  } catch (error) {
    if (DEBUG) {
      console.error('[summarizer] Error generating summary:', error);
    }
    return createFallbackSummary(input, aiResponse, input.usage);
  }
}

/**
 * Check if a sentence is forward-looking (future tense / aspirational)
 * These should be deprioritized in favor of past-tense action statements
 */
function isForwardLooking(text: string): boolean {
  return /\b(will|should|going to|next|can now|you can)\b/i.test(text);
}

/**
 * Check if a sentence describes a completed action (past tense)
 */
function isCompletedAction(text: string): boolean {
  return /\b(fixed|added|updated|removed|modified|improved|implemented|created|extracted|configured|enabled|disabled|changed|corrected|resolved)\b/i.test(text);
}

/**
 * Extract a meaningful summary from AI response text
 * Goal: Generate a SHORT, ACTION-FOCUSED summary like:
 * - "Fixed per-turn file tracking in notifications"
 * - "Added Discord webhook integration"
 * - "Refactored authentication flow"
 *
 * NOT verbose explanations or first paragraphs.
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

  // STRATEGY 1: Look for explicit "Done." or "Fixed:" style summaries at the start
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

  // STRATEGY 2: Find SHORT sentences with action verbs (prefer < 80 chars)
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const actionVerbs = /^(Fixed|Added|Updated|Removed|Implemented|Created|Configured|Enabled|Disabled|Refactored|Resolved|Changed|Modified|Improved|Restored|Extracted|Built|Set up|Integrated)/i;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    // Skip very short or very long sentences
    if (trimmed.length < 15 || trimmed.length > 120) continue;
    // Skip questions
    if (trimmed.endsWith('?')) continue;
    // Skip forward-looking
    if (isForwardLooking(trimmed)) continue;
    // Skip verbose intros
    if (/^(The |This |I |We |It |Here|Now |So )/i.test(trimmed)) continue;

    // If it starts with an action verb, use it!
    if (actionVerbs.test(trimmed)) {
      if (trimmed.length <= maxLength) return trimmed;
      return trimmed.substring(0, maxLength - 3) + '...';
    }
  }

  // STRATEGY 3: Extract action from longer sentences
  // Look for "verb + object" patterns anywhere
  const actionPatterns = [
    /(Fixed\s+(?:the\s+)?[^,.]{5,50})/i,
    /(Added\s+(?:the\s+)?[^,.]{5,50})/i,
    /(Updated\s+(?:the\s+)?[^,.]{5,50})/i,
    /(Removed\s+(?:the\s+)?[^,.]{5,50})/i,
    /(Implemented\s+(?:the\s+)?[^,.]{5,50})/i,
    /(Configured\s+(?:the\s+)?[^,.]{5,50})/i,
    /(Enabled\s+(?:the\s+)?[^,.]{5,50})/i,
    /(Restored\s+(?:the\s+)?[^,.]{5,50})/i,
    /(Refactored\s+(?:the\s+)?[^,.]{5,50})/i,
  ];

  for (const pattern of actionPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const result = match[1].trim();
      if (result.length >= 15 && !isForwardLooking(result)) {
        if (result.length <= maxLength) return result;
        return result.substring(0, maxLength - 3) + '...';
      }
    }
  }

  // STRATEGY 4: Extract bullet points that describe actions
  const bulletPattern = /[-*•]\s+([^-*•\n]{15,80})/g;
  const bullets: string[] = [];
  let bulletMatch;
  while ((bulletMatch = bulletPattern.exec(text)) !== null) {
    const bullet = cleanText(bulletMatch[1]);
    if (isCompletedAction(bullet) && !isForwardLooking(bullet)) {
      bullets.push(bullet);
    }
  }

  if (bullets.length > 0) {
    // Return first good bullet, or combine up to 2
    if (bullets[0].length <= maxLength) return bullets[0];
    if (bullets.length >= 2) {
      const combined = bullets.slice(0, 2).join('; ');
      if (combined.length <= maxLength) return combined;
    }
    return bullets[0].substring(0, maxLength - 3) + '...';
  }

  // STRATEGY 5: Last resort - first short sentence that's not fluff
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length >= 20 && trimmed.length <= maxLength) {
      // Skip obvious fluff
      if (/^(The notification|The system|The architecture|This response)/i.test(trimmed)) continue;
      if (/working|functioning|operating/i.test(trimmed) && !/fixed|added|updated/i.test(trimmed)) continue;
      return trimmed;
    }
  }

  // Absolute fallback
  if (cleaned.length > maxLength) {
    return cleaned.substring(0, maxLength - 3) + '...';
  }
  return cleaned || 'Task completed';
}

/**
 * Get project name from environment or derive from path
 */
function getProjectName(filesModified: string[]): string {
  // Priority 1: CLAUDE_PROJECT_DIR environment variable
  const projectDir = process.env.CLAUDE_PROJECT_DIR;
  if (projectDir) {
    const parts = projectDir.split('/');
    const name = parts[parts.length - 1];
    if (name && !name.startsWith('.')) {
      return name;
    }
  }

  // Priority 2: Derive from modified files
  if (filesModified.length > 0) {
    const firstFile = filesModified[0];
    const parts = firstFile.split('/');
    // Find meaningful project folder name
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part && !part.startsWith('.') &&
          !['src', 'lib', 'app', 'hooks', 'components', 'utils', 'node_modules'].includes(part)) {
        return part;
      }
    }
  }

  // Priority 3: Current working directory
  const cwd = process.cwd();
  const cwdParts = cwd.split('/');
  const cwdName = cwdParts[cwdParts.length - 1];
  if (cwdName && !cwdName.startsWith('.')) {
    return cwdName;
  }

  return 'Claude Code';
}

/**
 * Create a fallback summary when API is unavailable
 */
function createFallbackSummary(input: SummaryInput, aiResponse?: string | null, usage?: SummaryInput['usage']): SummaryOutput {
  // Get project name from environment or files
  const projectName = getProjectName(input.filesModified);

  // Create task description - prioritize AI response, then prompt
  let taskCompleted = '';

  if (aiResponse) {
    taskCompleted = extractMeaningfulSummary(aiResponse, 200);
  }

  // Fallback to prompt if no good summary from response
  if (!taskCompleted && input.promptText) {
    const promptClean = input.promptText.replace(/\n+/g, ' ').trim();
    if (promptClean.length <= 150) {
      taskCompleted = `Processed: ${promptClean}`;
    } else {
      taskCompleted = `Processed: ${promptClean.substring(0, 147)}...`;
    }
  }

  // Final fallback
  if (!taskCompleted) {
    if (input.filesModified.length > 0) {
      const fileNames = input.filesModified.slice(0, 3).map(f => f.split('/').pop()).join(', ');
      taskCompleted = `Modified ${fileNames}${input.filesModified.length > 3 ? ' and more' : ''}`;
    } else {
      taskCompleted = 'Task completed successfully';
    }
  }

  // Generate outcomes - keep summary clean, files/tools go in detailed report only
  const keyOutcomes: string[] = [];

  // Just show counts, not full lists (details are in the full report)
  if (input.filesModified.length > 0) {
    keyOutcomes.push(`${input.filesModified.length} file${input.filesModified.length > 1 ? 's' : ''} modified`);
  }

  // Duration
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
    contextUsagePercent: calculateContextUsage(usage),
    keyOutcomes,
  };
}

/**
 * Check if LLM API is configured
 */
export function isLLMConfigured(): boolean {
  return !!API_KEY;
}

// CLI entry point for testing
if (import.meta.main) {
  console.log('=== LLM Summarizer Test ===');
  console.log(`API URL: ${API_URL}`);
  console.log(`Model: ${MODEL}`);
  console.log(`API Key: ${API_KEY ? 'configured' : 'NOT SET'}`);
  console.log('');

  if (!API_KEY) {
    console.log('Set SUMMARY_API_KEY or OPENAI_API_KEY to test');
    process.exit(1);
  }

  const testInput: SummaryInput = {
    promptText: 'Add notification system with TTS and Discord integration',
    durationMs: 45000,
    filesModified: [
      'hooks/notification-hook.ts',
      'hooks/audio-queue.ts',
      'hooks/summarizer.ts',
    ],
    toolsUsed: ['Read', 'Write', 'Bash'],
    stopPayload: {
      usage: { input_tokens: 50000, output_tokens: 10000 },
    },
  };

  console.log('Testing with sample input...');
  const summary = await generateSummary(testInput);
  console.log('Summary:', JSON.stringify(summary, null, 2));
}
