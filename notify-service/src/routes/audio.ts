/**
 * Audio Endpoint
 *
 * GET /audio/{id} - Serves the audio file associated with a response or directly by filename
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { getResponse } from '../response-store';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

// TTS cache directory (same as in channels/tts.ts)
const TTS_CACHE_DIR = path.join(os.homedir(), '.claude-notify', 'cache', 'tts');

/**
 * Handle GET /audio/:id request
 * Serves the MP3 audio file for a given response ID or directly by filename
 */
export async function handleAudio(id: string): Promise<Response> {
  if (DEBUG) {
    console.error(`[audio] Fetching audio for: ${id}`);
  }

  // If ID looks like a filename (ends in .mp3), serve directly from cache
  if (id.endsWith('.mp3')) {
    // Validate filename to prevent directory traversal
    const sanitized = path.basename(id);
    if (sanitized !== id || id.includes('..')) {
      return new Response(
        JSON.stringify({ error: 'Invalid audio file name' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const audioPath = path.join(TTS_CACHE_DIR, sanitized);

    if (!existsSync(audioPath)) {
      if (DEBUG) {
        console.error(`[audio] File not found: ${audioPath}`);
      }
      return new Response(
        JSON.stringify({ error: 'Audio file not found or expired' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      const audioData = await readFile(audioPath);
      if (DEBUG) {
        console.error(`[audio] Serving file: ${audioPath} (${audioData.length} bytes)`);
      }
      return new Response(audioData, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioData.length.toString(),
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch (error) {
      console.error(`[audio] Error reading file:`, error);
      return new Response(
        JSON.stringify({ error: 'Failed to read audio file' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Otherwise treat as response ID and look up audio path
  const entry = getResponse(id);

  if (!entry) {
    if (DEBUG) {
      console.error(`[audio] Response not found: ${id}`);
    }
    return new Response(
      JSON.stringify({ error: 'Response not found or expired' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!entry.audioPath) {
    if (DEBUG) {
      console.error(`[audio] No audio for response: ${id}`);
    }
    return new Response(
      JSON.stringify({ error: 'No audio available for this response' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!existsSync(entry.audioPath)) {
    if (DEBUG) {
      console.error(`[audio] Audio file not found: ${entry.audioPath}`);
    }
    return new Response(
      JSON.stringify({ error: 'Audio file no longer available' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const audioData = await readFile(entry.audioPath);

    if (DEBUG) {
      console.error(`[audio] Serving audio: ${entry.audioPath} (${audioData.length} bytes)`);
    }

    return new Response(audioData, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioData.length.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error(`[audio] Error reading audio file:`, error);
    return new Response(
      JSON.stringify({ error: 'Failed to read audio file' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
