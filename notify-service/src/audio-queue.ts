#!/usr/bin/env bun
/**
 * Centralized FIFO Audio Queue Manager
 *
 * True singleton managed by the daemon process that ensures sequential
 * playback of notification audio files without overlap across all
 * incoming notification requests regardless of source project.
 *
 * Features:
 * - FIFO queue for ordered playback
 * - Concurrent playback prevention
 * - Project tracking for queue status
 * - Error handling for missing files
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

// Types
interface QueueItem {
  audioPath: string;
  project: string;
  addedAt: Date;
  priority?: number;
}

interface PlaybackResult {
  success: boolean;
  error?: string;
  duration?: number;
}

export interface QueueStatus {
  queueLength: number;
  isPlaying: boolean;
  items: Array<{ project: string; addedAt: Date }>;
}

/**
 * Centralized FIFO Audio Queue
 *
 * Singleton pattern ensures only one queue exists per daemon process.
 */
export class AudioQueue {
  private queue: QueueItem[] = [];
  private isPlaying = false;
  private static instance: AudioQueue | null = null;

  private constructor() {
    if (DEBUG) {
      console.error('[audio-queue] Centralized queue initialized');
    }
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): AudioQueue {
    if (!AudioQueue.instance) {
      AudioQueue.instance = new AudioQueue();
    }
    return AudioQueue.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static reset(): void {
    AudioQueue.instance = null;
  }

  /**
   * Enqueue an audio file for playback
   */
  enqueue(audioPath: string, project: string, priority = 0): boolean {
    // Validate file exists
    if (!existsSync(audioPath)) {
      if (DEBUG) {
        console.error(`[audio-queue] File not found: ${audioPath}`);
      }
      return false;
    }

    const item: QueueItem = {
      audioPath,
      project,
      addedAt: new Date(),
      priority,
    };

    // Insert by priority (higher priority = earlier in queue)
    if (priority > 0) {
      let insertIndex = -1;
      for (let i = 0; i < this.queue.length; i++) {
        if ((this.queue[i].priority || 0) < priority) {
          insertIndex = i;
          break;
        }
      }
      if (insertIndex === -1) {
        this.queue.push(item);
      } else {
        this.queue.splice(insertIndex, 0, item);
      }
    } else {
      this.queue.push(item);
    }

    if (DEBUG) {
      console.error(`[audio-queue] Enqueued from ${project}: ${audioPath} (queue size: ${this.queue.length})`);
    }

    // Start playback if not already playing
    this.processQueue();

    return true;
  }

  /**
   * Process the queue - play next item if not currently playing
   */
  private async processQueue(): Promise<void> {
    if (this.isPlaying) {
      return;
    }

    const item = this.queue.shift();
    if (!item) {
      return;
    }

    this.isPlaying = true;

    try {
      const result = await this.playAudio(item.audioPath);
      if (DEBUG) {
        if (result.success) {
          console.error(`[audio-queue] Played from ${item.project}: ${item.audioPath} (${result.duration}ms)`);
        } else {
          console.error(`[audio-queue] Playback failed: ${result.error}`);
        }
      }
    } catch (error) {
      if (DEBUG) {
        console.error(`[audio-queue] Error playing audio:`, error);
      }
    } finally {
      this.isPlaying = false;
      // Continue processing queue
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  /**
   * Play an audio file using macOS afplay
   */
  private playAudio(audioPath: string): Promise<PlaybackResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Validate file still exists
      if (!existsSync(audioPath)) {
        resolve({
          success: false,
          error: `File not found: ${audioPath}`,
        });
        return;
      }

      // Use afplay for macOS
      const player = spawn('afplay', [audioPath], {
        stdio: 'ignore',
      });

      player.on('close', (code) => {
        const duration = Date.now() - startTime;
        if (code === 0) {
          resolve({ success: true, duration });
        } else {
          resolve({
            success: false,
            error: `afplay exited with code ${code}`,
            duration,
          });
        }
      });

      player.on('error', (error) => {
        resolve({
          success: false,
          error: `Failed to spawn afplay: ${error.message}`,
        });
      });
    });
  }

  /**
   * Get current queue status
   */
  getStatus(): QueueStatus {
    return {
      queueLength: this.queue.length,
      isPlaying: this.isPlaying,
      items: this.queue.map(q => ({
        project: q.project,
        addedAt: q.addedAt,
      })),
    };
  }

  /**
   * Clear the queue (does not stop current playback)
   */
  clear(): void {
    this.queue = [];
    if (DEBUG) {
      console.error('[audio-queue] Queue cleared');
    }
  }

  /**
   * Wait for queue to drain
   */
  async waitForDrain(): Promise<void> {
    while (this.isPlaying || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Export singleton accessor
export function getAudioQueue(): AudioQueue {
  return AudioQueue.getInstance();
}

// Export for direct playback without queue
export async function playAudioDirect(audioPath: string): Promise<PlaybackResult> {
  return new Promise((resolve) => {
    if (!existsSync(audioPath)) {
      resolve({ success: false, error: `File not found: ${audioPath}` });
      return;
    }

    const startTime = Date.now();
    const player = spawn('afplay', [audioPath], { stdio: 'ignore' });

    player.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        success: code === 0,
        error: code !== 0 ? `afplay exited with code ${code}` : undefined,
        duration,
      });
    });

    player.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

// CLI entry point for testing
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: bun audio-queue.ts <audio-file> [audio-file2] ...');
    console.log('       bun audio-queue.ts --status');
    process.exit(1);
  }

  if (args[0] === '--status') {
    const queue = getAudioQueue();
    console.log(JSON.stringify(queue.getStatus(), null, 2));
    process.exit(0);
  }

  // Enqueue all provided files
  const queue = getAudioQueue();
  for (const file of args) {
    if (existsSync(file)) {
      queue.enqueue(file, 'cli-test');
    } else {
      console.error(`File not found: ${file}`);
    }
  }

  // Wait for all to finish
  await queue.waitForDrain();
  console.log('All audio files played');
}
