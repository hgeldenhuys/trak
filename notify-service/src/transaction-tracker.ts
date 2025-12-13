/**
 * Transaction State Tracker (NOTIFY-012)
 *
 * Server-side in-memory tracker for managing transaction state across events.
 * Unlike the file-watching approach, this tracker receives events directly via HTTP
 * and maintains state reliably.
 *
 * State is kept in-memory but server persistence (via SQLite) ensures we can
 * recover context from stored events if needed.
 *
 * Features:
 * - Track transaction start time (from UserPromptSubmit)
 * - Accumulate files/tools (from PostToolUse events)
 * - Calculate duration and trigger notifications (on Stop)
 * - EventEmitter for real-time SSE streaming
 */

import { EventEmitter } from 'events';
import type { EventPayload, StoredEvent } from './types';
import {
  saveTransaction,
  getTransaction,
  markTransactionCompleted,
  getPendingTransactions,
  clearStaleTransactionsFromDb,
} from './db';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

/**
 * In-memory state for an active transaction
 */
export interface TransactionState {
  projectId: string;
  projectName: string;
  sessionId: string;
  sessionName?: string;
  transcriptPath?: string;
  startTime: Date;
  promptText?: string;
  filesModified: string[];
  toolsUsed: string[];
  eventCount: number;
  // Per-project channel overrides (NOTIFY-003, NOTIFY-004)
  discordWebhookUrl?: string;
  voiceId?: string;
}

/**
 * Completed transaction ready for notification
 */
export interface CompletedTransaction {
  projectId: string;
  projectName: string;
  sessionId: string;
  sessionName?: string;
  transcriptPath?: string;
  durationMs: number;
  promptText?: string;
  filesModified: string[];
  toolsUsed: string[];
  usage?: EventPayload['usage'];
  model?: string;
  stopReason?: string;
  // Raw transcript data from hook (for server-side processing)
  aiResponse?: string;
  userPrompt?: string;
  toolCalls?: Array<{ tool: string; input: Record<string, unknown> }>;
  // Per-project channel overrides (NOTIFY-003, NOTIFY-004)
  discordWebhookUrl?: string;
  voiceId?: string;
}

/**
 * Event types emitted by the tracker
 */
export interface TrackerEvents {
  'event:received': (event: StoredEvent) => void;
  'transaction:started': (state: TransactionState) => void;
  'transaction:completed': (completed: CompletedTransaction, shouldNotify: boolean) => void;
  'notification:triggered': (completed: CompletedTransaction) => void;
}

/**
 * TransactionTracker - Manages in-memory transaction state
 */
class TransactionTracker extends EventEmitter {
  private activeTransactions = new Map<string, TransactionState>();

  constructor() {
    super();
  }

  /**
   * Get the composite key for a transaction (projectId + sessionId)
   */
  private getKey(projectId: string, sessionId: string): string {
    return `${projectId}:${sessionId}`;
  }

  /**
   * Process an incoming event and update transaction state
   * Returns the CompletedTransaction if a Stop event triggered completion
   */
  processEvent(event: EventPayload): CompletedTransaction | null {
    const key = this.getKey(event.projectId, event.sessionId);

    switch (event.eventType) {
      case 'SessionStart': {
        // SessionStart doesn't start a transaction - we wait for UserPromptSubmit
        if (DEBUG) {
          console.error(`[tracker] SessionStart: ${event.projectName}/${event.sessionId.slice(0, 8)}`);
        }
        break;
      }

      case 'UserPromptSubmit': {
        // Start a new transaction
        const state: TransactionState = {
          projectId: event.projectId,
          projectName: event.projectName,
          sessionId: event.sessionId,
          sessionName: event.sessionName,
          transcriptPath: event.transcriptPath,
          startTime: new Date(event.timestamp),
          promptText: event.promptText,
          filesModified: [],
          toolsUsed: [],
          eventCount: 1,
          // Per-project channel overrides (NOTIFY-003, NOTIFY-004)
          discordWebhookUrl: event.discordWebhookUrl,
          voiceId: event.voiceId,
        };

        this.activeTransactions.set(key, state);

        // Persist to SQLite (fire-and-forget for performance)
        try {
          saveTransaction(state);
        } catch (err) {
          console.error('[tracker] Failed to persist transaction to SQLite:', err);
        }

        this.emit('transaction:started', state);

        if (DEBUG) {
          console.error(`[tracker] Transaction started: ${event.sessionName || event.sessionId.slice(0, 8)}`);
        }
        break;
      }

      case 'PostToolUse': {
        // Accumulate tool/file info
        const state = this.activeTransactions.get(key);
        if (state) {
          state.eventCount++;

          // Track tool used
          if (event.toolName && !state.toolsUsed.includes(event.toolName)) {
            state.toolsUsed.push(event.toolName);
          }

          // Track files from tool input (ONLY for Edit, Write - not Read!)
          const isWriteOperation = ['Edit', 'Write', 'NotebookEdit'].includes(event.toolName || '');
          if (isWriteOperation && event.toolInput) {
            const filePath = (event.toolInput.file_path || event.toolInput.notebook_path) as string | undefined;
            if (filePath && !state.filesModified.includes(filePath)) {
              state.filesModified.push(filePath);
            }
          }

          if (DEBUG) {
            console.error(`[tracker] PostToolUse: ${event.toolName} (${state.toolsUsed.length} tools, ${state.filesModified.length} files)`);
          }
        }
        break;
      }

      case 'Stop': {
        let state = this.activeTransactions.get(key);

        // If no in-memory transaction, try to recover from SQLite
        if (!state) {
          if (DEBUG) {
            console.error(`[tracker] Stop without in-memory transaction, checking SQLite: ${event.sessionId.slice(0, 8)}`);
          }

          // Try to recover from SQLite (handles server restart case)
          const recoveredState = getTransaction(event.projectId, event.sessionId);

          if (recoveredState) {
            if (DEBUG) {
              console.error(`[tracker] Recovered transaction from SQLite: ${recoveredState.sessionName || recoveredState.sessionId.slice(0, 8)}`);
            }
            state = recoveredState;
          } else {
            // No transaction found anywhere - create minimal completion info
            if (DEBUG) {
              console.error(`[tracker] Stop without any transaction record: ${event.sessionId.slice(0, 8)}`);
            }

            // Create minimal completed transaction from Stop event data
            const completed: CompletedTransaction = {
              projectId: event.projectId,
              projectName: event.projectName,
              sessionId: event.sessionId,
              sessionName: event.sessionName,
              transcriptPath: event.transcriptPath,
              durationMs: 0, // Unknown duration
              filesModified: event.filesModified || [],
              toolsUsed: event.toolsUsed || [],
              usage: event.usage,
              model: event.model,
              stopReason: event.stopReason,
              // Raw transcript data from hook
              aiResponse: event.aiResponse,
              userPrompt: event.userPrompt,
              toolCalls: event.toolCalls,
              // Per-project channel overrides (NOTIFY-003, NOTIFY-004)
              discordWebhookUrl: event.discordWebhookUrl,
              voiceId: event.voiceId,
            };

            // Don't trigger notification for transactions with unknown duration
            this.emit('transaction:completed', completed, false);
            return completed;
          }
        }

        // Calculate duration
        const stopTime = new Date(event.timestamp);
        const durationMs = stopTime.getTime() - state.startTime.getTime();

        // Merge files/tools from Stop event with accumulated state
        const filesModified = [...new Set([
          ...state.filesModified,
          ...(event.filesModified || [])
        ])];
        const toolsUsed = [...new Set([
          ...state.toolsUsed,
          ...(event.toolsUsed || [])
        ])];

        const completed: CompletedTransaction = {
          projectId: state.projectId,
          projectName: state.projectName,
          sessionId: state.sessionId,
          sessionName: state.sessionName || event.sessionName,
          transcriptPath: state.transcriptPath || event.transcriptPath,
          durationMs,
          promptText: state.promptText,
          filesModified,
          toolsUsed,
          usage: event.usage,
          model: event.model,
          stopReason: event.stopReason,
          // Raw transcript data from hook
          aiResponse: event.aiResponse,
          userPrompt: event.userPrompt,
          toolCalls: event.toolCalls,
          // Per-project channel overrides (NOTIFY-003, NOTIFY-004) - prefer Stop event, fallback to state
          discordWebhookUrl: event.discordWebhookUrl || state.discordWebhookUrl,
          voiceId: event.voiceId || state.voiceId,
        };

        // Remove from active transactions (in-memory)
        this.activeTransactions.delete(key);

        // Mark completed in SQLite
        try {
          markTransactionCompleted(event.projectId, event.sessionId, durationMs);
        } catch (err) {
          console.error('[tracker] Failed to mark transaction completed in SQLite:', err);
        }

        if (DEBUG) {
          const durationSec = (durationMs / 1000).toFixed(1);
          console.error(`[tracker] Transaction completed: ${durationSec}s`);
        }

        this.emit('transaction:completed', completed, true);
        this.emit('notification:triggered', completed);

        return completed;
      }
    }

    return null;
  }

  /**
   * Get active transaction state (for debugging)
   */
  getActiveTransaction(projectId: string, sessionId: string): TransactionState | undefined {
    return this.activeTransactions.get(this.getKey(projectId, sessionId));
  }

  /**
   * Get all active transactions (for debugging)
   */
  getAllActiveTransactions(): TransactionState[] {
    return Array.from(this.activeTransactions.values());
  }

  /**
   * Clear stale transactions (older than maxAge)
   * Clears from both in-memory Map and SQLite storage.
   * Default maxAge is 1 hour (60 * 60 * 1000 ms).
   */
  clearStaleTransactions(maxAgeMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let clearedMemory = 0;

    // Clear from in-memory Map
    for (const [key, state] of this.activeTransactions) {
      if (now - state.startTime.getTime() > maxAgeMs) {
        this.activeTransactions.delete(key);
        clearedMemory++;
      }
    }

    // Clear from SQLite
    let clearedDb = 0;
    try {
      clearedDb = clearStaleTransactionsFromDb(maxAgeMs);
    } catch (err) {
      console.error('[tracker] Failed to clear stale transactions from SQLite:', err);
    }

    const totalCleared = clearedMemory + clearedDb;

    if (DEBUG && totalCleared > 0) {
      console.error(`[tracker] Cleared ${clearedMemory} stale in-memory transactions, ${clearedDb} from SQLite`);
    }

    return totalCleared;
  }

}

// Singleton instance
let tracker: TransactionTracker | null = null;

/**
 * Get the global TransactionTracker instance
 * On first call, loads pending transactions from SQLite for recovery.
 */
export function getTransactionTracker(): TransactionTracker {
  if (!tracker) {
    tracker = new TransactionTracker();

    // Load pending transactions from SQLite for recovery after server restart
    try {
      const pendingTransactions = getPendingTransactions();
      if (pendingTransactions.length > 0) {
        for (const state of pendingTransactions) {
          const key = `${state.projectId}:${state.sessionId}`;
          tracker['activeTransactions'].set(key, state);
        }
        console.error(`[tracker] Recovered ${pendingTransactions.length} pending transaction(s) from SQLite`);
      }
    } catch (err) {
      console.error('[tracker] Failed to recover pending transactions from SQLite:', err);
    }
  }
  return tracker;
}
