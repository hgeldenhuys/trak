#!/usr/bin/env bun
/**
 * ElevenLabs TTS Integration
 *
 * Converts text summaries to speech using ElevenLabs API.
 * Saves MP3 to temp file and enqueues in audio queue.
 *
 * Features:
 * - ElevenLabs API integration with configurable voice
 * - Temp file management for audio output
 * - Integration with audio queue for playback
 * - Fallback to local notification sound on API failure
 *
 * Environment variables:
 * - ELEVENLABS_API_KEY: Required for TTS
 * - ELEVENLABS_VOICE_ID: Optional voice ID (defaults to "Rachel")
 */

import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getAudioQueue, playAudioDirect } from './audio-queue';

// Configuration
const DEBUG = process.env.NOTIFICATION_DEBUG === 'true';
const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel voice
const MODEL_ID = 'eleven_turbo_v2_5'; // Fast model for notifications
const API_URL = 'https://api.elevenlabs.io/v1';

// Temp directory for audio files
const TEMP_DIR = path.join(
  process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  '.claude/cache/tts'
);

// Fallback notification sound (system sound on macOS)
const FALLBACK_SOUND = '/System/Library/Sounds/Glass.aiff';

// Types
export interface TTSOptions {
  stability?: number; // 0-1, default 0.5
  similarityBoost?: number; // 0-1, default 0.75
  style?: number; // 0-1, default 0
  useSpeakerBoost?: boolean;
}

export interface TTSResult {
  success: boolean;
  audioPath?: string;
  error?: string;
  duration?: number;
}

/**
 * Ensure temp directory exists
 */
async function ensureTempDir(): Promise<void> {
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true });
  }
}

/**
 * Generate a unique filename for the audio file
 */
function generateAudioFilename(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return path.join(TEMP_DIR, `notification-${timestamp}-${random}.mp3`);
}

/**
 * Convert text to speech using ElevenLabs API
 */
export async function textToSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<TTSResult> {
  if (!API_KEY) {
    if (DEBUG) {
      console.error('[tts] No ELEVENLABS_API_KEY set, using fallback');
    }
    return playFallbackSound();
  }

  await ensureTempDir();

  const startTime = Date.now();

  try {
    const response = await fetch(
      `${API_URL}/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: {
            stability: options.stability ?? 0.5,
            similarity_boost: options.similarityBoost ?? 0.75,
            style: options.style ?? 0,
            use_speaker_boost: options.useSpeakerBoost ?? true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Get audio data
    const audioBuffer = await response.arrayBuffer();

    // Save to temp file
    const audioPath = generateAudioFilename();
    await writeFile(audioPath, Buffer.from(audioBuffer));

    const duration = Date.now() - startTime;

    if (DEBUG) {
      console.error(`[tts] Generated audio in ${duration}ms: ${audioPath}`);
    }

    return {
      success: true,
      audioPath,
      duration,
    };
  } catch (error) {
    if (DEBUG) {
      console.error('[tts] ElevenLabs error:', error);
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Play fallback notification sound
 */
async function playFallbackSound(): Promise<TTSResult> {
  if (existsSync(FALLBACK_SOUND)) {
    const result = await playAudioDirect(FALLBACK_SOUND);
    return {
      success: result.success,
      error: result.error,
      duration: result.duration,
    };
  }

  return {
    success: false,
    error: 'No fallback sound available',
  };
}

/**
 * Generate TTS and enqueue for playback
 */
export async function speakNotification(text: string): Promise<TTSResult> {
  const result = await textToSpeech(text);

  if (result.success && result.audioPath) {
    // Enqueue the audio for playback
    const queue = getAudioQueue();
    queue.enqueue(result.audioPath);

    // Schedule cleanup after a delay (allow time for playback)
    scheduleCleanup(result.audioPath, 60000); // 1 minute
  } else if (!result.success) {
    // Try fallback sound
    return playFallbackSound();
  }

  return result;
}

/**
 * Schedule deletion of temp audio file
 */
function scheduleCleanup(audioPath: string, delayMs: number): void {
  setTimeout(async () => {
    try {
      if (existsSync(audioPath)) {
        await unlink(audioPath);
        if (DEBUG) {
          console.error(`[tts] Cleaned up: ${audioPath}`);
        }
      }
    } catch (error) {
      if (DEBUG) {
        console.error(`[tts] Cleanup error:`, error);
      }
    }
  }, delayMs);
}

/**
 * Format summary for speech
 */
export function formatForSpeech(summary: {
  taskCompleted: string;
  projectName: string;
  contextUsagePercent: number;
  keyOutcomes: string[];
}): string {
  // Just speak the task summary - keep it simple and focused
  return summary.taskCompleted;
}

/**
 * Check if ElevenLabs is configured
 */
export function isConfigured(): boolean {
  return !!API_KEY;
}

/**
 * Get available voices (for configuration)
 */
export async function getVoices(): Promise<
  Array<{ voice_id: string; name: string }> | null
> {
  if (!API_KEY) {
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/voices`, {
      headers: {
        'xi-api-key': API_KEY,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      voices: Array<{ voice_id: string; name: string }>;
    };
    return data.voices;
  } catch {
    return null;
  }
}

// CLI entry point for testing
if (import.meta.main) {
  const testText = process.argv[2] || 'Notification system implementation complete. Created 5 files including hook event logger, audio queue, and TTS integration.';

  console.log('Testing ElevenLabs TTS...');
  console.log('API Key configured:', isConfigured());
  console.log('Text:', testText);
  console.log('');

  if (isConfigured()) {
    console.log('Available voices:');
    const voices = await getVoices();
    if (voices) {
      for (const voice of voices.slice(0, 5)) {
        console.log(`  - ${voice.name} (${voice.voice_id})`);
      }
    }
    console.log('');
  }

  console.log('Generating speech...');
  const result = await speakNotification(testText);
  console.log('Result:', JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('Audio enqueued for playback');
    // Wait for playback
    const queue = getAudioQueue();
    await queue.waitForDrain();
  }
}
