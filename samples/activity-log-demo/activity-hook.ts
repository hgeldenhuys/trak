#!/usr/bin/env bun
/**
 * Activity Log Hook - TypeScript version
 *
 * Logs task status transitions for real-time monitoring in the TUI.
 *
 * Usage:
 *   bun activity-hook.ts start TASK-ID
 *   bun activity-hook.ts complete TASK-ID
 *   bun activity-hook.ts error TASK-ID "Error message"
 *   bun activity-hook.ts heartbeat "Message"
 */

import { $ } from 'bun';

const SOURCE = 'activity-hook';

interface Task {
  id: string;
  title: string;
  storyId?: string;
}

interface Story {
  code: string;
}

/**
 * Run a board CLI command and return JSON output
 */
async function runBoard(args: string[]): Promise<string> {
  const proc = Bun.spawn(['bun', 'board', ...args, '--json'], {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: process.cwd(),
  });

  const stdout = await new Response(proc.stdout).text();
  await proc.exited;

  return stdout.trim();
}

/**
 * Get task details
 */
async function getTask(taskId: string): Promise<Task | null> {
  try {
    const output = await runBoard(['task', 'show', taskId]);
    return JSON.parse(output);
  } catch {
    return null;
  }
}

/**
 * Get story code from story ID
 */
async function getStoryCode(storyId: string): Promise<string | null> {
  try {
    const output = await runBoard(['story', 'show', storyId]);
    const story: Story = JSON.parse(output);
    return story.code;
  } catch {
    return null;
  }
}

/**
 * Add a log entry
 */
async function addLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  storyCode?: string
): Promise<void> {
  const args = ['log', 'add', '-s', SOURCE, '-l', level, '-m', message];
  if (storyCode) {
    args.push('-S', storyCode);
  }
  await runBoard(args);
}

/**
 * Handle start command
 */
async function handleStart(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) {
    console.error(`Error: Task not found: ${taskId}`);
    process.exit(1);
  }

  let storyCode: string | null = null;
  if (task.storyId) {
    storyCode = await getStoryCode(task.storyId);
  }

  await addLog('info', `Task started: ${task.title}`, storyCode ?? undefined);
  console.log(`Logged: Task started - ${task.title}`);
}

/**
 * Handle complete command
 */
async function handleComplete(taskId: string): Promise<void> {
  const task = await getTask(taskId);
  if (!task) {
    console.error(`Error: Task not found: ${taskId}`);
    process.exit(1);
  }

  let storyCode: string | null = null;
  if (task.storyId) {
    storyCode = await getStoryCode(task.storyId);
  }

  await addLog('info', `Task completed: ${task.title}`, storyCode ?? undefined);
  console.log(`Logged: Task completed - ${task.title}`);
}

/**
 * Handle error command
 */
async function handleError(
  taskId: string,
  errorMessage: string,
  storyCodeArg?: string
): Promise<void> {
  const task = await getTask(taskId);
  const taskTitle = task?.title ?? 'Unknown task';

  let storyCode = storyCodeArg;
  if (!storyCode && task?.storyId) {
    storyCode = (await getStoryCode(task.storyId)) ?? undefined;
  }

  await addLog('error', `Task error (${taskTitle}): ${errorMessage}`, storyCode);
  console.log(`Logged: Task error - ${taskTitle}: ${errorMessage}`);
}

/**
 * Handle heartbeat command
 */
async function handleHeartbeat(message: string, storyCode?: string): Promise<void> {
  await addLog('info', message, storyCode);
  console.log(`Logged: ${message}`);
}

/**
 * Print usage and exit
 */
function printUsage(): void {
  console.log(`Activity Log Hook

Usage:
  bun activity-hook.ts start TASK-ID              Log task started
  bun activity-hook.ts complete TASK-ID           Log task completed
  bun activity-hook.ts error TASK-ID 'message'    Log task error
  bun activity-hook.ts heartbeat 'message'        Log heartbeat

Examples:
  bun activity-hook.ts start abc123
  bun activity-hook.ts complete abc123
  bun activity-hook.ts error abc123 'Database connection failed'
  bun activity-hook.ts heartbeat 'Processing batch 5/10'
`);
}

// Main
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'start':
    if (!args[1]) {
      console.error('Error: Task ID required');
      process.exit(1);
    }
    await handleStart(args[1]);
    break;

  case 'complete':
    if (!args[1]) {
      console.error('Error: Task ID required');
      process.exit(1);
    }
    await handleComplete(args[1]);
    break;

  case 'error':
    if (!args[1]) {
      console.error('Error: Task ID required');
      process.exit(1);
    }
    await handleError(args[1], args[2] ?? 'Unknown error', args[3]);
    break;

  case 'heartbeat':
    await handleHeartbeat(args[1] ?? 'Agent is alive', args[2]);
    break;

  default:
    printUsage();
    process.exit(1);
}
