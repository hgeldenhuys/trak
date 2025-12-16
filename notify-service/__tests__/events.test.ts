/**
 * Event Flow Integration Tests (NOTIFY-012)
 *
 * Tests for the new direct POST event architecture:
 * - POST /events endpoint validation and storage
 * - Transaction tracking across events
 * - Duration calculation and notification triggering
 * - SSE endpoint event streaming
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  initDatabase,
  insertEvent,
  getEventsBySession,
  getRecentEventsByName,
  getEventById,
  closeDatabase,
  getDatabase,
} from '../src/db';
import {
  initTransactionTracker,
  getTransactionTracker,
  type CompletedTransaction,
} from '../src/transaction-tracker';
import type { EventPayload } from '../src/types';
import { isEventPayload } from '../src/types';
import { unlinkSync, existsSync } from 'fs';
import path from 'path';

// Test database path
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-events.db');

// Sample events for testing
function createSessionStartEvent(projectId: string, sessionId: string): EventPayload {
  return {
    eventType: 'SessionStart',
    sessionId,
    sessionName: 'test-session',
    projectId,
    projectName: 'test-project',
    timestamp: new Date().toISOString(),
    cwd: '/test/path',
  };
}

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

function createPostToolUseEvent(projectId: string, sessionId: string, toolName: string, filePath?: string): EventPayload {
  return {
    eventType: 'PostToolUse',
    sessionId,
    sessionName: 'test-session',
    projectId,
    projectName: 'test-project',
    timestamp: new Date().toISOString(),
    toolName,
    toolInput: filePath ? { file_path: filePath } : undefined,
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

describe('EventPayload Type Guard', () => {
  test('validates correct SessionStart event', () => {
    const event = createSessionStartEvent('proj-123', 'sess-456');
    expect(isEventPayload(event)).toBe(true);
  });

  test('validates correct UserPromptSubmit event', () => {
    const event = createUserPromptEvent('proj-123', 'sess-456', 'Test prompt');
    expect(isEventPayload(event)).toBe(true);
  });

  test('validates correct PostToolUse event', () => {
    const event = createPostToolUseEvent('proj-123', 'sess-456', 'Edit', '/test/file.ts');
    expect(isEventPayload(event)).toBe(true);
  });

  test('validates correct Stop event', () => {
    const event = createStopEvent('proj-123', 'sess-456', ['file.ts'], ['Edit']);
    expect(isEventPayload(event)).toBe(true);
  });

  test('rejects invalid event types', () => {
    expect(isEventPayload(null)).toBe(false);
    expect(isEventPayload(undefined)).toBe(false);
    expect(isEventPayload({})).toBe(false);
    expect(isEventPayload({ eventType: 'Invalid' })).toBe(false);
    expect(isEventPayload({ eventType: 'Stop' })).toBe(false); // Missing required fields
  });

  test('rejects events missing required fields', () => {
    expect(isEventPayload({
      eventType: 'Stop',
      sessionId: 'sess-123',
      // Missing projectId, projectName, timestamp
    })).toBe(false);
  });
});

describe('SQLite Database', () => {
  // Use unique IDs for each test to avoid cross-test pollution
  let testId: string;

  beforeEach(() => {
    testId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Initialize database if not already done
    process.env.NOTIFY_SERVICE_DATA_DIR = path.dirname(TEST_DB_PATH);
    try {
      initDatabase();
    } catch (e) {
      // May already be initialized
    }
  });

  afterEach(() => {
    // Don't close database between tests - just use unique IDs
  });

  test('inserts event and returns ID', () => {
    const event = createUserPromptEvent(`proj-${testId}`, `sess-${testId}`, 'Test prompt');
    const eventId = insertEvent(event);
    expect(eventId).toBeGreaterThan(0);
  });

  test('retrieves event by ID', () => {
    const event = createUserPromptEvent(`proj-${testId}`, `sess-${testId}`, 'Test prompt');
    const eventId = insertEvent(event);

    const retrieved = getEventById(eventId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.eventType).toBe('UserPromptSubmit');
    expect(retrieved?.projectId).toBe(`proj-${testId}`);
    expect(retrieved?.sessionId).toBe(`sess-${testId}`);
    expect(retrieved?.promptText).toBe('Test prompt');
  });

  test('retrieves events by session', () => {
    const projectId = `proj-${testId}`;
    const sessionId = `sess-${testId}`;

    // Add events with sequential timestamps to ensure order
    const baseTime = Date.now();
    const e1 = createUserPromptEvent(projectId, sessionId, 'Prompt 1');
    e1.timestamp = new Date(baseTime).toISOString();
    const e2 = createPostToolUseEvent(projectId, sessionId, 'Edit', 'file1.ts');
    e2.timestamp = new Date(baseTime + 100).toISOString();
    const e3 = createPostToolUseEvent(projectId, sessionId, 'Write', 'file2.ts');
    e3.timestamp = new Date(baseTime + 200).toISOString();
    const e4 = createStopEvent(projectId, sessionId, ['file1.ts', 'file2.ts'], ['Edit', 'Write']);
    e4.timestamp = new Date(baseTime + 300).toISOString();

    insertEvent(e1);
    insertEvent(e2);
    insertEvent(e3);
    insertEvent(e4);

    const events = getEventsBySession(projectId, sessionId);
    expect(events.length).toBe(4);
    expect(events[0].eventType).toBe('UserPromptSubmit');
    expect(events[3].eventType).toBe('Stop');
  });

  test('retrieves recent events by project name', () => {
    // Use a unique project name for this test
    const uniqueProjectName = `test-project-${testId}`;
    const makeEvent = (projectId: string, sessionId: string, promptText: string): EventPayload => ({
      eventType: 'UserPromptSubmit',
      sessionId,
      sessionName: 'test-session',
      projectId,
      projectName: uniqueProjectName,
      timestamp: new Date().toISOString(),
      transcriptPath: '/test/transcript.jsonl',
      cwd: '/test/path',
      promptText,
    });

    const makeStopEvent = (projectId: string, sessionId: string): EventPayload => ({
      eventType: 'Stop',
      sessionId,
      sessionName: 'test-session',
      projectId,
      projectName: uniqueProjectName,
      timestamp: new Date().toISOString(),
      transcriptPath: '/test/transcript.jsonl',
      filesModified: [],
      toolsUsed: [],
    });

    insertEvent(makeEvent('proj-1', 'sess-1', 'Prompt 1'));
    insertEvent(makeEvent('proj-2', 'sess-2', 'Prompt 2'));
    insertEvent(makeStopEvent('proj-1', 'sess-1'));

    const events = getRecentEventsByName(uniqueProjectName, 10);
    expect(events.length).toBe(3);
  });

  test('stores JSON fields correctly', () => {
    const event = createStopEvent(`proj-${testId}`, `sess-${testId}`, ['a.ts', 'b.ts'], ['Edit', 'Read']);
    event.git = { branch: 'main', commit: 'abc123', dirty: false };
    event.usage = { inputTokens: 1000, outputTokens: 500 };

    const eventId = insertEvent(event);
    const retrieved = getEventById(eventId);

    expect(retrieved?.filesModified).toEqual(['a.ts', 'b.ts']);
    expect(retrieved?.toolsUsed).toEqual(['Edit', 'Read']);
    expect(retrieved?.git?.branch).toBe('main');
    expect(retrieved?.usage?.inputTokens).toBe(1000);
  });
});

describe('Transaction Tracker', () => {
  let tracker: ReturnType<typeof getTransactionTracker>;

  beforeEach(() => {
    tracker = initTransactionTracker({ durationThresholdMs: 5000 });
  });

  test('starts transaction on UserPromptSubmit', () => {
    const event = createUserPromptEvent('proj-123', 'sess-456', 'Test prompt');
    tracker.processEvent(event);

    const state = tracker.getActiveTransaction('proj-123', 'sess-456');
    expect(state).not.toBeUndefined();
    expect(state?.promptText).toBe('Test prompt');
    expect(state?.filesModified).toEqual([]);
    expect(state?.toolsUsed).toEqual([]);
  });

  test('accumulates tools and files on PostToolUse', () => {
    tracker.processEvent(createUserPromptEvent('proj-123', 'sess-456', 'Test prompt'));
    tracker.processEvent(createPostToolUseEvent('proj-123', 'sess-456', 'Edit', 'file1.ts'));
    tracker.processEvent(createPostToolUseEvent('proj-123', 'sess-456', 'Write', 'file2.ts'));
    tracker.processEvent(createPostToolUseEvent('proj-123', 'sess-456', 'Read')); // No file

    const state = tracker.getActiveTransaction('proj-123', 'sess-456');
    expect(state?.toolsUsed).toContain('Edit');
    expect(state?.toolsUsed).toContain('Write');
    expect(state?.toolsUsed).toContain('Read');
    expect(state?.filesModified).toContain('file1.ts');
    expect(state?.filesModified).toContain('file2.ts');
    expect(state?.filesModified.length).toBe(2);
  });

  test('completes transaction on Stop', () => {
    // Start transaction
    const startTime = new Date();
    const startEvent = createUserPromptEvent('proj-123', 'sess-456', 'Test prompt');
    startEvent.timestamp = startTime.toISOString();
    tracker.processEvent(startEvent);

    // Add some tools
    tracker.processEvent(createPostToolUseEvent('proj-123', 'sess-456', 'Edit', 'file.ts'));

    // Stop after 100ms (simulated)
    const stopEvent = createStopEvent('proj-123', 'sess-456', ['file.ts'], ['Edit']);
    stopEvent.timestamp = new Date(startTime.getTime() + 100).toISOString();

    const completed = tracker.processEvent(stopEvent);

    expect(completed).not.toBeNull();
    expect(completed?.durationMs).toBeGreaterThanOrEqual(100);
    expect(completed?.toolsUsed).toContain('Edit');
    expect(completed?.filesModified).toContain('file.ts');

    // Transaction should be removed
    expect(tracker.getActiveTransaction('proj-123', 'sess-456')).toBeUndefined();
  });

  test('emits transaction:completed event', (done) => {
    tracker.on('transaction:completed', (completed: CompletedTransaction, shouldNotify: boolean) => {
      expect(completed.projectId).toBe('proj-123');
      expect(shouldNotify).toBe(false); // Duration too short
      done();
    });

    tracker.processEvent(createUserPromptEvent('proj-123', 'sess-456', 'Test'));
    tracker.processEvent(createStopEvent('proj-123', 'sess-456', [], []));
  });

  test('triggers notification when duration exceeds threshold', (done) => {
    tracker.on('notification:triggered', (completed: CompletedTransaction) => {
      expect(completed.durationMs).toBeGreaterThanOrEqual(5000);
      done();
    });

    // Start transaction
    const startTime = new Date();
    const startEvent = createUserPromptEvent('proj-123', 'sess-456', 'Test');
    startEvent.timestamp = startTime.toISOString();
    tracker.processEvent(startEvent);

    // Stop after 6 seconds (simulated)
    const stopEvent = createStopEvent('proj-123', 'sess-456', [], []);
    stopEvent.timestamp = new Date(startTime.getTime() + 6000).toISOString();
    tracker.processEvent(stopEvent);
  });

  test('handles Stop without active transaction gracefully', () => {
    // Stop event without prior UserPromptSubmit
    const completed = tracker.processEvent(
      createStopEvent('proj-123', 'sess-456', ['file.ts'], ['Edit'])
    );

    expect(completed).not.toBeNull();
    expect(completed?.durationMs).toBeLessThanOrEqual(100); // Unknown/minimal duration
    expect(completed?.filesModified).toEqual(['file.ts']);
  });

  test('clears stale transactions', () => {
    // Create an old transaction (simulated)
    const oldStartTime = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
    const startEvent = createUserPromptEvent('proj-123', 'sess-old', 'Old prompt');
    startEvent.timestamp = oldStartTime.toISOString();

    // Manually set the start time in the tracker
    tracker.processEvent(startEvent);
    const state = tracker.getActiveTransaction('proj-123', 'sess-old');
    if (state) {
      (state as any).startTime = oldStartTime;
    }

    // Create a recent transaction
    tracker.processEvent(createUserPromptEvent('proj-123', 'sess-new', 'New prompt'));

    // Clear stale (older than 10 minutes)
    // Note: Returns count from both in-memory (1) and SQLite (1) = 2 total
    // since NOTIFY-002 added SQLite persistence for transactions
    const cleared = tracker.clearStaleTransactions(10 * 60 * 1000);

    expect(cleared).toBeGreaterThanOrEqual(1); // At least in-memory cleared
    expect(tracker.getActiveTransaction('proj-123', 'sess-old')).toBeUndefined();
    expect(tracker.getActiveTransaction('proj-123', 'sess-new')).not.toBeUndefined();
  });
});
