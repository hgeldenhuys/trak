/**
 * TTS Channel - ElevenLabs Integration
 *
 * Converts text summaries to speech using ElevenLabs API.
 * Saves MP3 to temp file and enqueues in centralized audio queue.
 */

import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { getConfig } from '../config';
import { getAudioQueue, playAudioDirect } from '../audio-queue';

const DEBUG = process.env.NOTIFY_SERVICE_DEBUG === 'true';

// Temp directory for audio files
const TEMP_DIR = path.join(os.homedir(), '.claude-notify', 'cache', 'tts');

// Fallback notification sound (system sound on macOS)
const FALLBACK_SOUND = '/System/Library/Sounds/Glass.aiff';

// Types
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
 * @param text Text to convert to speech
 * @param perProjectVoiceId Optional per-project voice ID (NOTIFY-004)
 */
async function textToSpeech(text: string, perProjectVoiceId?: string): Promise<TTSResult> {
  const config = getConfig();
  if (!config) {
    return { success: false, error: 'Config not loaded' };
  }

  const apiKey = config.channels.tts.apiKey;
  // Use per-project voice if provided, otherwise fall back to global config (NOTIFY-004)
  const voiceId = perProjectVoiceId || config.channels.tts.voiceId;
  const model = config.channels.tts.model;

  if (!apiKey) {
    if (DEBUG) {
      console.error('[tts] No API key configured, using fallback');
    }
    return playFallbackSound();
  }

  await ensureTempDir();

  const startTime = Date.now();
  const apiUrl = 'https://api.elevenlabs.io/v1';

  try {
    const response = await fetch(
      `${apiUrl}/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: true,
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
  const config = getConfig();
  const fallbackPath = config?.audio.fallbackSound || FALLBACK_SOUND;

  if (existsSync(fallbackPath)) {
    const result = await playAudioDirect(fallbackPath);
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
 * Dispatch notification to TTS channel
 * Generates speech and enqueues in centralized audio queue
 * @param project Project name
 * @param summary Text to speak
 * @param perProjectVoiceId Optional per-project ElevenLabs voice ID (NOTIFY-004)
 * @returns The audio path if generated, for use by other channels (e.g., Discord attachment)
 */
export async function dispatchTTS(project: string, summary: string, perProjectVoiceId?: string): Promise<string | undefined> {
  const config = getConfig();
  if (!config || !config.channels.tts.enabled) {
    return undefined;
  }

  const result = await textToSpeech(summary, perProjectVoiceId);

  if (result.success && result.audioPath) {
    // Enqueue the audio for playback with project info
    const queue = getAudioQueue();
    queue.enqueue(result.audioPath, project);

    // Schedule cleanup after a delay (allow time for playback)
    const cleanupDelay = config.audio.cleanupDelayMs || 60000;
    scheduleCleanup(result.audioPath, cleanupDelay);

    return result.audioPath;
  } else if (!result.success) {
    // Try fallback sound
    await playFallbackSound();
  }

  return undefined;
}

/**
 * Check if TTS is configured and ready
 */
export function isTTSConfigured(): boolean {
  const config = getConfig();
  return !!(config?.channels.tts.enabled && config?.channels.tts.apiKey);
}
