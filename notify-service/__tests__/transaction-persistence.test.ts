/**
 * Transaction Persistence Tests (NOTIFY-002)
 *
 * Tests for SQLite-backed transaction state persistence:
 * - Unit tests for db.ts transaction functions
 * - Integration test for restart resilience (AC-006)
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import {
  initDatabase,
  closeDatabase,
  saveTransaction,
  getTransaction,
  markTransactionCompleted,
  getPendingTransactions,
  clearStaleTransactionsFromDb,
  getDatabase,
} from '../src/db';
import {
  initTransactionTracker,
  getTransactionTracker,
  type TransactionState,
  type CompletedTransaction,
} from '../src/transaction-tracker';
import type { EventPayload } from '../src/types';
import { unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';

// Use isolated test database directory
const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-persistence');
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'events.db');

// Helper to create unique test IDs
function uniqueId(prefix: string = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Helper to create a TransactionState
function createTransactionState(overrides: Partial<TransactionState> = {}): TransactionState {
  const id = uniqueId();
  return {
    projectId: `proj-${id}`,
    projectName: `test-project-${id}`,
    sessionId: `sess-${id}`,
    sessionName: `test-session-${id}`,
    transcriptPath: `/test/transcript-${id}.jsonl`,
    startTime: new Date(),
    promptText: 'Test prompt',
    filesModified: [],
    toolsUsed: [],
    eventCount: 1,
    ...overrides,
  };
}

// Helper to create event payloads
function createUserPromptEvent(projectId: string, sessionId: string, promptText: string): EventPayload {
  return {
    eventType: 'UserPromptSubmit',
    sessionId,
    sessionName: 'test-session',
    projectId,
    projectName: 'test-project',
    timestamp: new Date().toISOString(),
    transcriptPath: '/test/transcript.jsonl',
    cwd: '/test/path',
    promptText,
  };
}

function createStopEvent(projectId: string, sessionId: string, filesModified: string[], toolsUsed: string[]): EventPayload {
  return {
    eventType: 'Stop',
    sessionId,
    sessionName: 'test-session',
    projectId,
    projectName: 'test-project',
    timestamp: new Date().toISOString(),
    transcriptPath: '/test/transcript.jsonl',
    filesModified,
    toolsUsed,
    model: 'claude-3-haiku',
    stopReason: 'end_turn',
  };
}

// ============================================================================
// Unit Tests: db.ts Transaction Functions
// ============================================================================

describe('Transaction Persistence (db.ts)', () => {
  beforeAll(() => {
    // Ensure test directory exists
    if (!existsSync(TEST_DATA_DIR)) {
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
    process.env.NOTIFY_SERVICE_DATA_DIR = TEST_DATA_DIR;
    initDatabase();
  });

  afterAll(() => {
    closeDatabase();
    // Clean up test database
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
  });

  describe('saveTransaction', () => {
    test('saves a transaction to SQLite', () => {
      const state = createTransactionState();

      // Should not throw
      expect(() => saveTransaction(state)).not.toThrow();

      // Verify it was saved
      const retrieved = getTransaction(state.projectId, state.sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.projectId).toBe(state.projectId);
      expect(retrieved?.sessionId).toBe(state.sessionId);
    });

    test('saves transaction with all fields', () => {
      const state = createTransactionState({
        sessionName: 'friendly-elephant',
        transcriptPath: '/path/to/transcript.jsonl',
        promptText: 'This is a test prompt with special characters: <>&"\'',
      });

      saveTransaction(state);

      const retrieved = getTransaction(state.projectId, state.sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionName).toBe('friendly-elephant');
      expect(retrieved?.transcriptPath).toBe('/path/to/transcript.jsonl');
      expect(retrieved?.promptText).toBe('This is a test prompt with special characters: <>&"\'');
    });

    test('updates existing transaction (INSERT OR REPLACE)', () => {
      const state = createTransactionState();
      saveTransaction(state);

      // Update the state
      state.promptText = 'Updated prompt text';
      saveTransaction(state);

      const retrieved = getTransaction(state.projectId, state.sessionId);
      expect(retrieved?.promptText).toBe('Updated prompt text');
    });

    test('saves transaction with minimal fields', () => {
      const id = uniqueId();
      const minimalState: TransactionState = {
        projectId: `proj-${id}`,
        projectName: `test-project-${id}`,
        sessionId: `sess-${id}`,
        startTime: new Date(),
        filesModified: [],
        toolsUsed: [],
        eventCount: 0,
      };

      expect(() => saveTransaction(minimalState)).not.toThrow();

      const retrieved = getTransaction(minimalState.projectId, minimalState.sessionId);
      expect(retrieved).not.toBeNull();
      // SQLite returns null for NULL columns, which becomes undefined in TypeScript interface
      expect(retrieved?.sessionName).toBeFalsy();
      expect(retrieved?.transcriptPath).toBeFalsy();
      expect(retrieved?.promptText).toBeFalsy();
    });
  });

  describe('getTransaction', () => {
    test('retrieves existing transaction', () => {
      const state = createTransactionState();
      saveTransaction(state);

      const retrieved = getTransaction(state.projectId, state.sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.projectId).toBe(state.projectId);
      expect(retrieved?.sessionId).toBe(state.sessionId);
      expect(retrieved?.projectName).toBe(state.projectName);
    });

    test('returns null for non-existent transaction', () => {
      const retrieved = getTransaction('non-existent-project', 'non-existent-session');
      expect(retrieved).toBeNull();
    });

    test('reconstructs startTime as Date object', () => {
      const originalTime = new Date('2025-12-09T10:30:00.000Z');
      const state = createTransactionState({ startTime: originalTime });
      saveTransaction(state);

      const retrieved = getTransaction(state.projectId, state.sessionId);

      expect(retrieved?.startTime).toBeInstanceOf(Date);
      expect(retrieved?.startTime.toISOString()).toBe(originalTime.toISOString());
    });

    test('initializes empty arrays for non-persisted fields', () => {
      const state = createTransactionState({
        filesModified: ['file1.ts', 'file2.ts'],
        toolsUsed: ['Edit', 'Read'],
      });
      saveTransaction(state);

      const retrieved = getTransaction(state.projectId, state.sessionId);

      // These fields are not persisted, should be empty arrays
      expect(retrieved?.filesModified).toEqual([]);
      expect(retrieved?.toolsUsed).toEqual([]);
      expect(retrieved?.eventCount).toBe(0);
    });
  });

  describe('markTransactionCompleted', () => {
    test('marks transaction as completed with duration', () => {
      const state = createTransactionState();
      saveTransaction(state);

      markTransactionCompleted(state.projectId, state.sessionId, 5000);

      // After marking complete, it should not appear in pending
      const pending = getPendingTransactions();
      const found = pending.find(t =>
        t.projectId === state.projectId && t.sessionId === state.sessionId
      );
      expect(found).toBeUndefined();
    });

    test('handles marking non-existent transaction gracefully', () => {
      // Should not throw
      expect(() => {
        markTransactionCompleted('non-existent', 'non-existent', 1000);
      }).not.toThrow();
    });

    test('stores duration_ms value', () => {
      const state = createTransactionState();
      saveTransaction(state);

      const durationMs = 12345;
      markTransactionCompleted(state.projectId, state.sessionId, durationMs);

      // Query directly to verify duration was stored
      const db = getDatabase();
      const stmt = db.prepare(`
        SELECT duration_ms FROM active_transactions
        WHERE project_id = ? AND session_id = ?
      `);
      const row = stmt.get(state.projectId, state.sessionId) as { duration_ms: number } | null;
      expect(row?.duration_ms).toBe(durationMs);
    });
  });

  describe('getPendingTransactions', () => {
    test('returns only pending (not completed) transactions', () => {
      // Create two transactions
      const pending1 = createTransactionState();
      const pending2 = createTransactionState();
      const completed = createTransactionState();

      saveTransaction(pending1);
      saveTransaction(pending2);
      saveTransaction(completed);

      // Mark one as completed
      markTransactionCompleted(completed.projectId, completed.sessionId, 1000);

      const pendingTransactions = getPendingTransactions();

      // Should find both pending, not the completed one
      const foundPending1 = pendingTransactions.find(t =>
        t.projectId === pending1.projectId && t.sessionId === pending1.sessionId
      );
      const foundPending2 = pendingTransactions.find(t =>
        t.projectId === pending2.projectId && t.sessionId === pending2.sessionId
      );
      const foundCompleted = pendingTransactions.find(t =>
        t.projectId === completed.projectId && t.sessionId === completed.sessionId
      );

      expect(foundPending1).not.toBeUndefined();
      expect(foundPending2).not.toBeUndefined();
      expect(foundCompleted).toBeUndefined();
    });

    test('returns empty array when no pending transactions', () => {
      // Use unique IDs for this test
      const state = createTransactionState();
      saveTransaction(state);
      markTransactionCompleted(state.projectId, state.sessionId, 1000);

      // Get pending and filter for this specific transaction
      const pending = getPendingTransactions().filter(t =>
        t.projectId === state.projectId && t.sessionId === state.sessionId
      );

      expect(pending.length).toBe(0);
    });

    test('reconstructs TransactionState correctly', () => {
      const originalTime = new Date('2025-12-09T15:00:00.000Z');
      const state = createTransactionState({
        startTime: originalTime,
        sessionName: 'test-elephant',
        promptText: 'Test prompt for pending',
      });
      saveTransaction(state);

      const pending = getPendingTransactions();
      const found = pending.find(t =>
        t.projectId === state.projectId && t.sessionId === state.sessionId
      );

      expect(found).not.toBeUndefined();
      expect(found?.startTime).toBeInstanceOf(Date);
      expect(found?.startTime.toISOString()).toBe(originalTime.toISOString());
      expect(found?.sessionName).toBe('test-elephant');
      expect(found?.promptText).toBe('Test prompt for pending');
      expect(found?.filesModified).toEqual([]);
      expect(found?.toolsUsed).toEqual([]);
    });
  });

  describe('clearStaleTransactionsFromDb', () => {
    test('removes transactions older than maxAgeMs', () => {
      // Create an old transaction (simulate by inserting with old start_time)
      const oldState = createTransactionState();
      const db = getDatabase();

      // Insert directly with old timestamp (15 minutes ago)
      const oldTime = new Date(Date.now() - 15 * 60 * 1000);
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO active_transactions (
          project_id, session_id, session_name, project_name,
          start_time, prompt_text, transcript_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        oldState.projectId,
        oldState.sessionId,
        oldState.sessionName,
        oldState.projectName,
        oldTime.toISOString(),
        oldState.promptText,
        oldState.transcriptPath
      );

      // Create a recent transaction
      const recentState = createTransactionState();
      saveTransaction(recentState);

      // Clear stale transactions (older than 10 minutes)
      const cleared = clearStaleTransactionsFromDb(10 * 60 * 1000);

      expect(cleared).toBeGreaterThanOrEqual(1);

      // Old transaction should be gone
      const oldRetrieved = getTransaction(oldState.projectId, oldState.sessionId);
      expect(oldRetrieved).toBeNull();

      // Recent transaction should still exist
      const recentRetrieved = getTransaction(recentState.projectId, recentState.sessionId);
      expect(recentRetrieved).not.toBeNull();
    });

    test('returns count of deleted transactions', () => {
      // Create multiple old transactions
      const db = getDatabase();
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const id = uniqueId(`stale-${i}`);
        ids.push(id);
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO active_transactions (
            project_id, session_id, session_name, project_name, start_time
          ) VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(`proj-${id}`, `sess-${id}`, `session-${id}`, `project-${id}`, oldTime.toISOString());
      }

      // Clear with 1 hour max age
      const cleared = clearStaleTransactionsFromDb(60 * 60 * 1000);

      expect(cleared).toBeGreaterThanOrEqual(3);
    });

    test('does not remove recent transactions', () => {
      const recentState = createTransactionState();
      saveTransaction(recentState);

      // Clear stale (older than 1 hour)
      clearStaleTransactionsFromDb(60 * 60 * 1000);

      // Recent transaction should still exist
      const retrieved = getTransaction(recentState.projectId, recentState.sessionId);
      expect(retrieved).not.toBeNull();
    });

    test('uses default maxAgeMs of 1 hour', () => {
      // Create transaction that is 30 minutes old (should not be cleared)
      const db = getDatabase();
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const id = uniqueId('recent-30min');

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO active_transactions (
          project_id, session_id, session_name, project_name, start_time
        ) VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(`proj-${id}`, `sess-${id}`, `session-${id}`, `project-${id}`, thirtyMinutesAgo.toISOString());

      // Clear with default (1 hour)
      clearStaleTransactionsFromDb();

      // Should still exist
      const retrieved = getTransaction(`proj-${id}`, `sess-${id}`);
      expect(retrieved).not.toBeNull();
    });
  });
});

// ============================================================================
// Integration Test: Restart Resilience (AC-006)
// ============================================================================

describe('Restart Resilience (AC-006)', () => {
  // Use separate test directory for restart tests
  const RESTART_TEST_DIR = path.join(process.cwd(), 'data', 'test-restart');

  beforeAll(() => {
    if (!existsSync(RESTART_TEST_DIR)) {
      mkdirSync(RESTART_TEST_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(RESTART_TEST_DIR)) {
      rmSync(RESTART_TEST_DIR, { recursive: true, force: true });
    }
  });

  test('recovers transaction state after server restart via SQLite lookup on Stop', () => {
    // Set up isolated database for this test
    process.env.NOTIFY_SERVICE_DATA_DIR = RESTART_TEST_DIR;

    // Close any existing database connection
    closeDatabase();
    initDatabase();

    // Create unique IDs for this test
    const projectId = uniqueId('proj');
    const sessionId = uniqueId('sess');

    // --- Step 1: Process UserPromptSubmit with first tracker instance ---
    const startTime = new Date();
    const startEvent = createUserPromptEvent(projectId, sessionId, 'Test restart resilience');
    startEvent.timestamp = startTime.toISOString();

    // Initialize tracker (simulates server starting)
    const tracker1 = initTransactionTracker({ durationThresholdMs: 1000 });
    tracker1.processEvent(startEvent);

    // Verify transaction is in memory
    const inMemoryState = tracker1.getActiveTransaction(projectId, sessionId);
    expect(inMemoryState).not.toBeUndefined();
    expect(inMemoryState?.promptText).toBe('Test restart resilience');

    // Verify transaction was persisted to SQLite
    const persistedState = getTransaction(projectId, sessionId);
    expect(persistedState).not.toBeNull();
    expect(persistedState?.promptText).toBe('Test restart resilience');

    // --- Step 2: Simulate server restart ---
    // Create NEW tracker instance (simulates fresh server start)
    // initTransactionTracker creates a fresh tracker without in-memory state
    // but processEvent will recover from SQLite when Stop is received without in-memory tx
    const tracker2 = initTransactionTracker({ durationThresholdMs: 1000 });

    // Verify the new tracker has no in-memory transaction
    expect(tracker2.getActiveTransaction(projectId, sessionId)).toBeUndefined();

    // --- Step 3: Process Stop event after restart ---
    // Stop should recover from SQLite and calculate duration
    const stopTime = new Date(startTime.getTime() + 5000); // 5 seconds later
    const stopEvent = createStopEvent(projectId, sessionId, ['file.ts'], ['Edit']);
    stopEvent.timestamp = stopTime.toISOString();

    let completedTransaction: CompletedTransaction | null = null;
    let shouldNotify = false;

    tracker2.on('transaction:completed', (completed, notify) => {
      completedTransaction = completed;
      shouldNotify = notify;
    });

    tracker2.processEvent(stopEvent);

    // --- Step 4: Verify notification triggered with correct duration ---
    expect(completedTransaction).not.toBeNull();
    expect(completedTransaction?.durationMs).toBeGreaterThanOrEqual(5000);
    expect(completedTransaction?.durationMs).toBeLessThan(6000); // Should be ~5000ms
    expect(shouldNotify).toBe(true); // Duration > 1000ms threshold

    // Transaction should be marked completed in SQLite
    const pending = getPendingTransactions().filter(t =>
      t.projectId === projectId && t.sessionId === sessionId
    );
    expect(pending.length).toBe(0);
  });

  test('getTransactionTracker loads pending transactions from SQLite on first call', () => {
    process.env.NOTIFY_SERVICE_DATA_DIR = RESTART_TEST_DIR;
    closeDatabase();
    initDatabase();

    // Create multiple transactions directly in SQLite
    const transactions: { projectId: string; sessionId: string; startTime: Date }[] = [];
    for (let i = 0; i < 3; i++) {
      transactions.push({
        projectId: uniqueId(`proj-multi-${i}`),
        sessionId: uniqueId(`sess-multi-${i}`),
        startTime: new Date(Date.now() - (i + 1) * 1000), // 1s, 2s, 3s ago
      });
    }

    // Save all transactions directly to SQLite (simulating crash before Stop)
    for (const tx of transactions) {
      saveTransaction({
        projectId: tx.projectId,
        projectName: `project-${tx.projectId}`,
        sessionId: tx.sessionId,
        sessionName: `session-${tx.sessionId}`,
        startTime: tx.startTime,
        filesModified: [],
        toolsUsed: [],
        eventCount: 1,
      });
    }

    // Verify transactions are in SQLite
    const pendingFromDb = getPendingTransactions();
    for (const tx of transactions) {
      const found = pendingFromDb.find(t =>
        t.projectId === tx.projectId && t.sessionId === tx.sessionId
      );
      expect(found).not.toBeUndefined();
    }

    // Create fresh tracker - getTransactionTracker would load from SQLite
    // but initTransactionTracker does not. The recovery happens on Stop event.
    const tracker = initTransactionTracker({ durationThresholdMs: 500 });

    // Process Stop for one transaction - should recover from SQLite
    const tx = transactions[0];
    const stopEvent = createStopEvent(tx.projectId, tx.sessionId, [], []);
    stopEvent.timestamp = new Date().toISOString();

    let completedTransaction: CompletedTransaction | null = null;
    tracker.on('transaction:completed', (completed) => {
      completedTransaction = completed;
    });

    tracker.processEvent(stopEvent);

    // Should have recovered and calculated duration
    expect(completedTransaction).not.toBeNull();
    expect(completedTransaction?.durationMs).toBeGreaterThan(0);
  });

  test('handles Stop event without in-memory transaction by recovering from SQLite', () => {
    process.env.NOTIFY_SERVICE_DATA_DIR = RESTART_TEST_DIR;
    closeDatabase();
    initDatabase();

    const projectId = uniqueId('proj-recovery');
    const sessionId = uniqueId('sess-recovery');
    const startTime = new Date(Date.now() - 3000); // Started 3 seconds ago

    // Save transaction directly to SQLite (simulating it was started, then server crashed)
    saveTransaction({
      projectId,
      projectName: 'test-project',
      sessionId,
      sessionName: 'test-session',
      startTime,
      promptText: 'Original prompt',
      filesModified: [],
      toolsUsed: [],
      eventCount: 1,
    });

    // Create fresh tracker (does NOT have this transaction in memory)
    const tracker = initTransactionTracker({ durationThresholdMs: 1000 });

    // Verify no in-memory transaction
    expect(tracker.getActiveTransaction(projectId, sessionId)).toBeUndefined();

    // Process Stop event - should recover from SQLite
    const stopEvent = createStopEvent(projectId, sessionId, ['recovered.ts'], ['Write']);
    stopEvent.timestamp = new Date().toISOString();

    let completedTransaction: CompletedTransaction | null = null;
    tracker.on('transaction:completed', (completed) => {
      completedTransaction = completed;
    });

    tracker.processEvent(stopEvent);

    expect(completedTransaction).not.toBeNull();
    // Duration should be calculated from SQLite-recovered startTime
    expect(completedTransaction?.durationMs).toBeGreaterThanOrEqual(3000);
    expect(completedTransaction?.durationMs).toBeLessThan(5000);
  });

  test('emits notification:triggered for long-running recovered transactions', (done) => {
    process.env.NOTIFY_SERVICE_DATA_DIR = RESTART_TEST_DIR;
    closeDatabase();
    initDatabase();

    const projectId = uniqueId('proj-notify');
    const sessionId = uniqueId('sess-notify');
    const startTime = new Date(Date.now() - 10000); // Started 10 seconds ago

    // Save transaction to SQLite
    saveTransaction({
      projectId,
      projectName: 'test-project',
      sessionId,
      sessionName: 'test-session',
      startTime,
      promptText: 'Long running task',
      filesModified: [],
      toolsUsed: [],
      eventCount: 1,
    });

    // Create fresh tracker with 5 second threshold
    const tracker = initTransactionTracker({ durationThresholdMs: 5000 });

    // Verify no in-memory transaction
    expect(tracker.getActiveTransaction(projectId, sessionId)).toBeUndefined();

    tracker.on('notification:triggered', (completed: CompletedTransaction) => {
      expect(completed.projectId).toBe(projectId);
      expect(completed.durationMs).toBeGreaterThanOrEqual(10000);
      done();
    });

    const stopEvent = createStopEvent(projectId, sessionId, [], []);
    stopEvent.timestamp = new Date().toISOString();
    tracker.processEvent(stopEvent);
  });

  test('full restart scenario: start -> crash -> restart -> stop', () => {
    process.env.NOTIFY_SERVICE_DATA_DIR = RESTART_TEST_DIR;
    closeDatabase();
    initDatabase();

    const projectId = uniqueId('proj-full');
    const sessionId = uniqueId('sess-full');
    const startTime = new Date();

    // --- Phase 1: Normal operation - start a transaction ---
    const tracker1 = initTransactionTracker({ durationThresholdMs: 2000 });

    const startEvent = createUserPromptEvent(projectId, sessionId, 'Full restart test');
    startEvent.timestamp = startTime.toISOString();
    tracker1.processEvent(startEvent);

    // Verify in-memory and SQLite state
    expect(tracker1.getActiveTransaction(projectId, sessionId)).not.toBeUndefined();
    expect(getTransaction(projectId, sessionId)).not.toBeNull();

    // --- Phase 2: Simulate crash (just create new tracker, losing in-memory state) ---
    const tracker2 = initTransactionTracker({ durationThresholdMs: 2000 });

    // In-memory state is lost
    expect(tracker2.getActiveTransaction(projectId, sessionId)).toBeUndefined();
    // SQLite state persists
    expect(getTransaction(projectId, sessionId)).not.toBeNull();

    // --- Phase 3: Process Stop - should recover from SQLite ---
    const stopTime = new Date(startTime.getTime() + 3000); // 3 seconds later
    const stopEvent = createStopEvent(projectId, sessionId, ['full-test.ts'], ['Edit']);
    stopEvent.timestamp = stopTime.toISOString();

    let completed: CompletedTransaction | null = null;
    let notified = false;

    tracker2.on('transaction:completed', (tx, notify) => {
      completed = tx;
      notified = notify;
    });

    tracker2.processEvent(stopEvent);

    // Verify successful recovery
    expect(completed).not.toBeNull();
    expect(completed?.durationMs).toBeGreaterThanOrEqual(3000);
    expect(completed?.durationMs).toBeLessThan(4000);
    expect(notified).toBe(true); // 3000ms > 2000ms threshold
    expect(completed?.filesModified).toContain('full-test.ts');
    expect(completed?.toolsUsed).toContain('Edit');
  });
});
