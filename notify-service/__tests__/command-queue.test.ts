/**
 * Command Queue Tests (AC-004)
 *
 * Tests for FIFO command queue with position tracking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  CommandQueue,
  initQueue,
  getQueue,
  resetQueue,
} from '../src/discord-bot/command-queue';
import type { QueueItem, QueueItemInput } from '../src/discord-bot/types';

/**
 * Helper to create a valid QueueItemInput
 */
function createInput(overrides: Partial<QueueItemInput> = {}): QueueItemInput {
  return {
    prompt: overrides.prompt ?? 'test prompt',
    sessionId: overrides.sessionId ?? 'session-123',
    sessionName: overrides.sessionName ?? 'test-session',
    userId: overrides.userId ?? 'user1',
    username: overrides.username ?? 'TestUser',
    channelId: overrides.channelId,
    messageId: overrides.messageId,
  };
}

describe('CommandQueue', () => {
  let queue: CommandQueue;

  beforeEach(() => {
    queue = new CommandQueue({ maxSize: 5, timeoutMs: 5000 });
  });

  afterEach(() => {
    queue.stopProcessing();
  });

  describe('enqueue', () => {
    it('should add item to queue with correct position', () => {
      const result = queue.enqueue(createInput());

      expect(result.queued).toBe(true);
      if (result.queued) {
        expect(result.position).toBe(1);
        expect(result.id).toMatch(/^q-\d+-[a-z0-9]+$/);
        expect(result.estimatedWaitMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should assign sequential positions to multiple items', () => {
      const result1 = queue.enqueue(createInput({ userId: 'user1', username: 'User1' }));
      const result2 = queue.enqueue(createInput({ userId: 'user2', username: 'User2' }));
      const result3 = queue.enqueue(createInput({ userId: 'user3', username: 'User3' }));

      expect(result1.queued && result1.position).toBe(1);
      expect(result2.queued && result2.position).toBe(2);
      expect(result3.queued && result3.position).toBe(3);
    });

    it('should reject when queue is full', () => {
      // Fill the queue (max 5)
      for (let i = 0; i < 5; i++) {
        queue.enqueue(createInput({
          prompt: `prompt ${i}`,
          userId: `user${i}`,
          username: `User${i}`,
        }));
      }

      const result = queue.enqueue(createInput({
        prompt: 'overflow',
        userId: 'user5',
        username: 'User5',
      }));

      expect(result.queued).toBe(false);
      if (!result.queued) {
        expect(result.reason).toContain('Queue is full');
      }
    });

    it('should reject duplicate user submissions', () => {
      queue.enqueue(createInput({
        prompt: 'first prompt',
        userId: 'user1',
        username: 'User1',
      }));

      const result = queue.enqueue(createInput({
        prompt: 'second prompt',
        userId: 'user1',
        username: 'User1',
      }));

      expect(result.queued).toBe(false);
      if (!result.queued) {
        expect(result.reason).toContain('already have a command queued');
      }
    });
  });

  describe('dequeue', () => {
    it('should return null for empty queue', () => {
      const item = queue.dequeue();
      expect(item).toBeNull();
    });

    it('should return items in FIFO order', () => {
      queue.enqueue(createInput({
        prompt: 'first',
        userId: 'user1',
        username: 'User1',
      }));

      queue.enqueue(createInput({
        prompt: 'second',
        userId: 'user2',
        username: 'User2',
      }));

      const first = queue.dequeue();
      const second = queue.dequeue();

      expect(first?.prompt).toBe('first');
      expect(second?.prompt).toBe('second');
    });

    it('should reindex remaining items after dequeue', () => {
      queue.enqueue(createInput({
        prompt: 'first',
        userId: 'user1',
        username: 'User1',
      }));

      queue.enqueue(createInput({
        prompt: 'second',
        userId: 'user2',
        username: 'User2',
      }));

      queue.enqueue(createInput({
        prompt: 'third',
        userId: 'user3',
        username: 'User3',
      }));

      queue.dequeue(); // Remove first

      const status = queue.getStatus();
      expect(status.items[0].position).toBe(1);
      expect(status.items[1].position).toBe(2);
    });
  });

  describe('getPosition', () => {
    it('should return correct position for queued item', () => {
      const result = queue.enqueue(createInput({
        userId: 'user1',
        username: 'User1',
      }));

      if (result.queued) {
        const position = queue.getPosition(result.id);
        expect(position).toBe(1);
      }
    });

    it('should return -1 for non-existent item', () => {
      const position = queue.getPosition('non-existent-id');
      expect(position).toBe(-1);
    });
  });

  describe('cancel', () => {
    it('should cancel item by ID', () => {
      const result = queue.enqueue(createInput({
        prompt: 'to cancel',
        userId: 'user1',
        username: 'User1',
      }));

      if (result.queued) {
        const cancelled = queue.cancel(result.id);
        expect(cancelled).toBe(true);
        expect(queue.getPosition(result.id)).toBe(-1);
        expect(queue.getDepth()).toBe(0);
      }
    });

    it('should return false for non-existent item', () => {
      const cancelled = queue.cancel('non-existent');
      expect(cancelled).toBe(false);
    });

    it('should reindex remaining items after cancel', () => {
      const result1 = queue.enqueue(createInput({
        prompt: 'first',
        userId: 'user1',
        username: 'User1',
      }));

      queue.enqueue(createInput({
        prompt: 'second',
        userId: 'user2',
        username: 'User2',
      }));

      queue.enqueue(createInput({
        prompt: 'third',
        userId: 'user3',
        username: 'User3',
      }));

      if (result1.queued) {
        queue.cancel(result1.id);
      }

      const status = queue.getStatus();
      expect(status.items[0].position).toBe(1);
      expect(status.items[0].prompt).toBe('second');
      expect(status.items[1].position).toBe(2);
      expect(status.items[1].prompt).toBe('third');
    });
  });

  describe('cancelByUser', () => {
    it('should cancel all items for a user', () => {
      // Queue allows one per user, so we need to test this differently
      // First enqueue and dequeue to allow user to enqueue again
      queue.enqueue(createInput({
        prompt: 'item 1',
        userId: 'user1',
        username: 'User1',
      }));

      queue.enqueue(createInput({
        prompt: 'item 2',
        userId: 'user2',
        username: 'User2',
      }));

      const cancelled = queue.cancelByUser('user1');
      expect(cancelled).toBe(1);
      expect(queue.getDepth()).toBe(1);
    });

    it('should return 0 if user has no items', () => {
      const cancelled = queue.cancelByUser('non-existent-user');
      expect(cancelled).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return correct status for empty queue', () => {
      const status = queue.getStatus();
      expect(status.depth).toBe(0);
      expect(status.items).toHaveLength(0);
      expect(status.currentItem).toBeNull();
      expect(status.isProcessing).toBe(false);
    });

    it('should return correct status for populated queue', () => {
      queue.enqueue(createInput({
        prompt: 'test prompt that is really long and should be truncated at some point in the display for brevity purposes',
        userId: 'user1',
        username: 'User1',
      }));

      queue.enqueue(createInput({
        prompt: 'short',
        userId: 'user2',
        username: 'User2',
      }));

      const status = queue.getStatus();
      expect(status.depth).toBe(2);
      expect(status.items).toHaveLength(2);
      expect(status.items[0].position).toBe(1);
      expect(status.items[0].username).toBe('User1');
      expect(status.items[1].position).toBe(2);
      expect(status.items[1].prompt).toBe('short');
    });

    it('should truncate long prompts in status', () => {
      const longPrompt = 'a'.repeat(150);
      queue.enqueue(createInput({
        prompt: longPrompt,
        userId: 'user1',
        username: 'User1',
      }));

      const status = queue.getStatus();
      expect(status.items[0].prompt.length).toBeLessThanOrEqual(100);
      expect(status.items[0].prompt.endsWith('...')).toBe(true);
    });
  });

  describe('hasUserItem', () => {
    it('should return true if user has item in queue', () => {
      queue.enqueue(createInput({
        userId: 'user1',
        username: 'User1',
      }));

      expect(queue.hasUserItem('user1')).toBe(true);
      expect(queue.hasUserItem('user2')).toBe(false);
    });
  });

  describe('execution time tracking', () => {
    it('should return default average for no recorded times', () => {
      const avgQueue = new CommandQueue({ avgExecutionMs: 30000 });
      expect(avgQueue.getAverageExecutionTime()).toBe(30000);
    });

    it('should calculate average from recorded times', () => {
      queue.recordExecutionTime(10000);
      queue.recordExecutionTime(20000);
      queue.recordExecutionTime(30000);

      expect(queue.getAverageExecutionTime()).toBe(20000);
    });

    it('should limit samples to maxExecutionSamples', () => {
      // Record 15 times (max is 10)
      for (let i = 0; i < 15; i++) {
        queue.recordExecutionTime(1000 * (i + 1));
      }

      // Should only keep last 10 (6000 through 15000)
      // Average: (6+7+8+9+10+11+12+13+14+15) * 1000 / 10 = 10500
      expect(queue.getAverageExecutionTime()).toBe(10500);
    });
  });

  describe('processing', () => {
    it('should process items with callback', async () => {
      const processed: string[] = [];

      queue.setProcessor(async (item: QueueItem) => {
        processed.push(item.prompt);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      queue.enqueue(createInput({
        prompt: 'first',
        userId: 'user1',
        username: 'User1',
      }));

      queue.enqueue(createInput({
        prompt: 'second',
        userId: 'user2',
        username: 'User2',
      }));

      queue.startProcessing();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      queue.stopProcessing();

      expect(processed).toContain('first');
      expect(processed).toContain('second');
    });

    it('should handle processor errors gracefully', async () => {
      queue.setProcessor(async (item: QueueItem) => {
        if (item.prompt === 'fail') {
          throw new Error('Test error');
        }
      });

      queue.enqueue(createInput({
        prompt: 'fail',
        userId: 'user1',
        username: 'User1',
      }));

      queue.startProcessing();

      await new Promise((resolve) => setTimeout(resolve, 50));

      queue.stopProcessing();

      // Queue should continue running after error
      expect(queue.getDepth()).toBe(0);
    });

    it('should not start multiple processing loops', () => {
      queue.startProcessing();
      queue.startProcessing();
      queue.startProcessing();

      // Should still only have one loop
      const status = queue.getStatus();
      expect(status.isProcessing).toBe(true);

      queue.stopProcessing();
    });
  });
});

describe('Singleton management', () => {
  beforeEach(() => {
    resetQueue();
  });

  afterEach(() => {
    resetQueue();
  });

  it('should throw when getting queue before init', () => {
    expect(() => getQueue()).toThrow('CommandQueue not initialized');
  });

  it('should return same instance after init', () => {
    const queue1 = initQueue({ maxSize: 5 });
    const queue2 = initQueue({ maxSize: 10 }); // Different options
    const queue3 = getQueue();

    expect(queue1).toBe(queue2);
    expect(queue2).toBe(queue3);
  });

  it('should reset queue properly', () => {
    initQueue();
    const queue = getQueue();
    queue.enqueue(createInput({
      userId: 'user1',
      username: 'User1',
    }));

    resetQueue();

    expect(() => getQueue()).toThrow('CommandQueue not initialized');
  });
});

describe('Wait time estimation', () => {
  it('should estimate wait based on position', () => {
    const queue = new CommandQueue({ avgExecutionMs: 10000 });

    queue.enqueue(createInput({
      prompt: 'first',
      userId: 'user1',
      username: 'User1',
    }));

    const result = queue.enqueue(createInput({
      prompt: 'second',
      userId: 'user2',
      username: 'User2',
    }));

    if (result.queued) {
      // Second position, one item ahead, should wait ~10000ms
      expect(result.estimatedWaitMs).toBe(10000);
    }
  });

  it('should update estimates based on actual execution times', async () => {
    const queue = new CommandQueue({ avgExecutionMs: 60000 });

    // Record some fast executions
    queue.recordExecutionTime(5000);
    queue.recordExecutionTime(5000);
    queue.recordExecutionTime(5000);

    queue.enqueue(createInput({
      prompt: 'first',
      userId: 'user1',
      username: 'User1',
    }));

    const result = queue.enqueue(createInput({
      prompt: 'second',
      userId: 'user2',
      username: 'User2',
    }));

    if (result.queued) {
      // Should now estimate based on 5000ms average
      expect(result.estimatedWaitMs).toBe(5000);
    }
  });
});
