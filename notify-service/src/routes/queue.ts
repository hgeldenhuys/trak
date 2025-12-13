/**
 * Queue Status Endpoint
 *
 * GET /queue - Returns current audio queue status
 */

import type { QueueStatusResponse } from '../types';
import { getAudioQueue } from '../audio-queue';

/**
 * Handle queue status request
 */
export function handleQueueStatus(): Response {
  const queue = getAudioQueue();
  const status = queue.getStatus();

  const response: QueueStatusResponse = {
    queueLength: status.queueLength,
    isPlaying: status.isPlaying,
    items: status.items.map((item, index) => ({
      project: item.project,
      addedAt: item.addedAt.toISOString(),
      position: index + 1,
    })),
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
