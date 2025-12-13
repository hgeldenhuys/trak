/**
 * Response Storage Module
 *
 * In-memory store for AI responses with unique ID generation.
 * Responses are stored temporarily and served as HTML pages.
 */

import { getConfig } from './config';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

/**
 * Stored response entry
 */
export interface ResponseEntry {
  id: string;
  project: string;
  summary: string;
  fullResponse: string;
  audioPath?: string;  // Path to TTS audio file for playback on response page
  userPrompt?: string; // Original user prompt that triggered this response
  metadata?: {
    durationMs?: number;
    filesModified?: number;
    filesList?: string[];  // Actual file paths for table display
    toolsUsed?: string[];
    contextUsagePercent?: number;
    keyOutcomes?: string[];
  };
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Response store singleton
 */
class ResponseStore {
  private store: Map<string, ResponseEntry> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private static instance: ResponseStore | null = null;

  private constructor() {
    // Start periodic cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 5 * 60 * 1000);

    if (DEBUG) {
      console.error('[response-store] Initialized');
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ResponseStore {
    if (!ResponseStore.instance) {
      ResponseStore.instance = new ResponseStore();
    }
    return ResponseStore.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static reset(): void {
    if (ResponseStore.instance) {
      if (ResponseStore.instance.cleanupInterval) {
        clearInterval(ResponseStore.instance.cleanupInterval);
      }
      ResponseStore.instance.store.clear();
      ResponseStore.instance = null;
    }
  }

  /**
   * Generate a unique response ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * Add a new response to the store
   * @returns The unique ID for the stored response
   */
  addResponse(
    project: string,
    summary: string,
    fullResponse: string,
    metadata?: ResponseEntry['metadata'],
    audioPath?: string,
    userPrompt?: string
  ): string {
    const config = getConfig();
    const ttlMs = config?.responseStorage?.ttlMs ?? 24 * 60 * 60 * 1000;
    const maxEntries = config?.responseStorage?.maxEntries ?? 1000;

    // Enforce max entries limit by removing oldest
    if (this.store.size >= maxEntries) {
      this.removeOldest();
    }

    const id = this.generateId();
    const now = new Date();

    const entry: ResponseEntry = {
      id,
      project,
      summary,
      fullResponse,
      audioPath,
      userPrompt,
      metadata,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    };

    this.store.set(id, entry);

    if (DEBUG) {
      console.error(`[response-store] Added response ${id} for ${project} (expires: ${entry.expiresAt.toISOString()})`);
    }

    return id;
  }

  /**
   * Get a response by ID
   * @returns The response entry or null if not found/expired
   */
  getResponse(id: string): ResponseEntry | null {
    const entry = this.store.get(id);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (new Date() > entry.expiresAt) {
      this.store.delete(id);
      if (DEBUG) {
        console.error(`[response-store] Response ${id} expired, removed`);
      }
      return null;
    }

    return entry;
  }

  /**
   * Remove expired entries
   */
  cleanupExpired(): number {
    const now = new Date();
    let removedCount = 0;

    for (const [id, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(id);
        removedCount++;
      }
    }

    if (DEBUG && removedCount > 0) {
      console.error(`[response-store] Cleaned up ${removedCount} expired entries`);
    }

    return removedCount;
  }

  /**
   * Remove the oldest entry
   */
  private removeOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.store.entries()) {
      const time = entry.createdAt.getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.store.delete(oldestId);
      if (DEBUG) {
        console.error(`[response-store] Removed oldest entry ${oldestId} to make room`);
      }
    }
  }

  /**
   * Get store statistics
   */
  getStats(): { count: number; oldestEntryAge?: number } {
    if (this.store.size === 0) {
      return { count: 0 };
    }

    let oldestTime = Infinity;
    for (const entry of this.store.values()) {
      const time = entry.createdAt.getTime();
      if (time < oldestTime) {
        oldestTime = time;
      }
    }

    return {
      count: this.store.size,
      oldestEntryAge: Date.now() - oldestTime,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.store.clear();
    if (DEBUG) {
      console.error('[response-store] Cleared all entries');
    }
  }
}

// Export singleton accessor
export function getResponseStore(): ResponseStore {
  return ResponseStore.getInstance();
}

// Export for direct access to add/get responses
export function addResponse(
  project: string,
  summary: string,
  fullResponse: string,
  metadata?: ResponseEntry['metadata'],
  audioPath?: string,
  userPrompt?: string
): string {
  return getResponseStore().addResponse(project, summary, fullResponse, metadata, audioPath, userPrompt);
}

export function getResponse(id: string): ResponseEntry | null {
  return getResponseStore().getResponse(id);
}

export function getResponseStoreStats(): { count: number; oldestEntryAge?: number } {
  return getResponseStore().getStats();
}
