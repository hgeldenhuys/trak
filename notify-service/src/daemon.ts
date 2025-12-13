/**
 * Daemon Management
 *
 * Handles PID file management and daemon process control.
 */

import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import type { DaemonPidFile } from './types';

const CONFIG_DIR = path.join(os.homedir(), '.claude-notify');
const PID_PATH = path.join(CONFIG_DIR, 'daemon.pid');
const LOG_PATH = path.join(CONFIG_DIR, 'daemon.log');

/**
 * Ensure config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Read PID file
 */
export async function readPidFile(): Promise<DaemonPidFile | null> {
  if (!existsSync(PID_PATH)) {
    return null;
  }

  try {
    const content = await readFile(PID_PATH, 'utf-8');
    return JSON.parse(content) as DaemonPidFile;
  } catch {
    return null;
  }
}

/**
 * Write PID file
 */
export async function writePidFile(pid: number, port: number, ngrokUrl?: string): Promise<void> {
  await ensureConfigDir();

  const pidData: DaemonPidFile = {
    pid,
    port,
    startedAt: new Date().toISOString(),
    ngrokUrl,
  };

  await writeFile(PID_PATH, JSON.stringify(pidData, null, 2), 'utf-8');
}

/**
 * Update ngrok URL in existing PID file
 */
export async function updatePidFileNgrokUrl(ngrokUrl: string | undefined): Promise<void> {
  const pidFile = await readPidFile();
  if (pidFile) {
    await writePidFile(pidFile.pid, pidFile.port, ngrokUrl);
  }
}

/**
 * Remove PID file
 */
export async function removePidFile(): Promise<void> {
  if (existsSync(PID_PATH)) {
    await unlink(PID_PATH);
  }
}

/**
 * Check if process is running
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get daemon status
 */
export async function getDaemonStatus(): Promise<{
  running: boolean;
  pid?: number;
  port?: number;
  startedAt?: string;
  uptime?: number;
  ngrokUrl?: string;
}> {
  const pidFile = await readPidFile();

  if (!pidFile) {
    return { running: false };
  }

  if (!isProcessRunning(pidFile.pid)) {
    // Stale PID file, clean it up
    await removePidFile();
    return { running: false };
  }

  const startedAt = new Date(pidFile.startedAt);
  const uptime = Date.now() - startedAt.getTime();

  return {
    running: true,
    pid: pidFile.pid,
    port: pidFile.port,
    startedAt: pidFile.startedAt,
    uptime,
    ngrokUrl: pidFile.ngrokUrl,
  };
}

/**
 * Start daemon in background
 */
export async function startDaemon(port: number): Promise<{
  success: boolean;
  pid?: number;
  error?: string;
}> {
  // Check if already running
  const status = await getDaemonStatus();
  if (status.running) {
    return {
      success: false,
      error: `Daemon already running (PID ${status.pid} on port ${status.port})`,
    };
  }

  await ensureConfigDir();

  // Find the server entry point
  const serverPath = path.join(__dirname, 'server.ts');

  // Spawn detached process
  const env = {
    ...process.env,
    NOTIFY_SERVICE_PORT: port.toString(),
  };

  const logStream = Bun.file(LOG_PATH).writer();

  const child = spawn('bun', ['run', serverPath], {
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Redirect stdout/stderr to log file
  child.stdout?.on('data', (data) => {
    logStream.write(data);
  });
  child.stderr?.on('data', (data) => {
    logStream.write(data);
  });

  // Don't wait for child
  child.unref();

  // Wait a moment for process to start
  await new Promise(resolve => setTimeout(resolve, 500));

  // Verify process started
  if (child.pid && isProcessRunning(child.pid)) {
    await writePidFile(child.pid, port);
    return { success: true, pid: child.pid };
  }

  return { success: false, error: 'Failed to start daemon process' };
}

/**
 * Stop daemon
 */
export async function stopDaemon(): Promise<{
  success: boolean;
  error?: string;
}> {
  const status = await getDaemonStatus();

  if (!status.running || !status.pid) {
    return { success: false, error: 'Daemon not running' };
  }

  try {
    process.kill(status.pid, 'SIGTERM');

    // Wait for process to exit
    let attempts = 0;
    while (attempts < 10 && isProcessRunning(status.pid)) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    // Force kill if still running
    if (isProcessRunning(status.pid)) {
      process.kill(status.pid, 'SIGKILL');
    }

    await removePidFile();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop daemon',
    };
  }
}

/**
 * Send test notification to running daemon
 */
export async function sendTestNotification(port: number): Promise<{
  success: boolean;
  response?: unknown;
  error?: string;
}> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'Test',
        summary: 'This is a test notification from the CLI.',
        metadata: {
          durationMs: 30000,
          filesModified: 1,
        },
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${await response.text()}`,
      };
    }

    const data = await response.json();
    return { success: true, response: data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test notification',
    };
  }
}
