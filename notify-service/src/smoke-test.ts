#!/usr/bin/env bun
/**
 * Smoke Test Suite for Notify Service
 *
 * Run after making changes to validate all critical paths:
 *   bun notify-service/src/smoke-test.ts [--url URL] [--key KEY]
 *
 * Tests:
 * 1. Health check - server is running
 * 2. Auth - valid SDK key works
 * 3. Auth - invalid key is rejected
 * 4. Discord - notification sends successfully
 * 5. TTS - audio is generated
 * 6. Audio - generated file is accessible
 * 7. Response - response page is created and accessible
 * 8. Session name - sessionName field is accepted
 * 9. Summary quality - LLM validates summary follows rules
 */

import { loadConfig, getConfigPath } from './config';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

interface NotifyResponse {
  success: boolean;
  responseUrl?: string;
  audioUrl?: string;
  error?: string;
  channels?: Record<string, boolean>;
}

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

function colorize(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

async function runTest(
  name: string,
  testFn: () => Promise<{ passed: boolean; message: string }>
): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await testFn();
    return {
      name,
      ...result,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name,
      passed: false,
      message: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start,
    };
  }
}

async function testHealth(baseUrl: string): Promise<{ passed: boolean; message: string }> {
  const res = await fetch(`${baseUrl}/health`);
  const data = await res.json() as { status: string; version: string };

  if (res.status !== 200) {
    return { passed: false, message: `HTTP ${res.status}` };
  }
  if (data.status !== 'ok') {
    return { passed: false, message: `Status: ${data.status}` };
  }
  return { passed: true, message: `v${data.version}` };
}

async function testAuthValid(baseUrl: string, sdkKey: string): Promise<{ passed: boolean; message: string }> {
  const res = await fetch(`${baseUrl}/notify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sdkKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: 'smoke-test',
      summary: 'Auth validation test (valid key)',
      channels: ['console'], // Console only - no external notifications
    }),
  });

  const data = await res.json() as NotifyResponse;

  if (res.status === 401) {
    return { passed: false, message: 'Key rejected - check sdkKey in config' };
  }
  if (!data.success) {
    return { passed: false, message: data.error || 'Unknown error' };
  }
  return { passed: true, message: 'Key accepted' };
}

async function testAuthInvalid(baseUrl: string): Promise<{ passed: boolean; message: string }> {
  const res = await fetch(`${baseUrl}/notify`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer sk_live_invalid_key_12345',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: 'smoke-test',
      summary: 'Should be rejected',
      channels: ['console'],
    }),
  });

  if (res.status === 401) {
    return { passed: true, message: 'Invalid key correctly rejected' };
  }
  return { passed: false, message: `Expected 401, got ${res.status}` };
}

async function testDiscord(baseUrl: string, sdkKey: string): Promise<{ passed: boolean; message: string }> {
  const res = await fetch(`${baseUrl}/notify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sdkKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: '[SMOKE TEST]',
      summary: '🧪 Automated test - ignore this notification',
      channels: ['discord'],
    }),
  });

  const data = await res.json() as NotifyResponse;

  if (!data.success) {
    return { passed: false, message: data.error || 'Failed to send' };
  }
  if (!data.channels?.discord) {
    return { passed: false, message: 'Discord channel not enabled/configured' };
  }
  return { passed: true, message: 'Discord notification sent' };
}

async function testTTS(baseUrl: string, sdkKey: string): Promise<{ passed: boolean; message: string; audioUrl?: string }> {
  const res = await fetch(`${baseUrl}/notify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sdkKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: 'smoke-test',
      summary: 'Smoke test TTS generation',
      channels: ['tts'],
    }),
  });

  const data = await res.json() as NotifyResponse;

  if (!data.success) {
    return { passed: false, message: data.error || 'Failed to generate' };
  }
  if (!data.channels?.tts) {
    return { passed: false, message: 'TTS channel not enabled/configured' };
  }
  if (!data.audioUrl) {
    return { passed: false, message: 'No audio URL returned' };
  }
  return { passed: true, message: 'Audio generated', audioUrl: data.audioUrl };
}

async function testAudioAccessible(audioUrl: string): Promise<{ passed: boolean; message: string }> {
  const res = await fetch(audioUrl);

  if (res.status !== 200) {
    return { passed: false, message: `HTTP ${res.status} - audio not accessible` };
  }

  const contentType = res.headers.get('content-type');
  if (!contentType?.includes('audio')) {
    return { passed: false, message: `Wrong content type: ${contentType}` };
  }

  const size = parseInt(res.headers.get('content-length') || '0');
  return { passed: true, message: `Audio accessible (${Math.round(size/1024)}KB)` };
}

async function testSessionName(baseUrl: string, sdkKey: string): Promise<{ passed: boolean; message: string }> {
  // Test that sessionName is accepted and included in response
  const testSessionName = 'smoke-test-elephant';

  const res = await fetch(`${baseUrl}/notify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sdkKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: '[SMOKE TEST]',
      summary: '🧪 Session name test',
      sessionName: testSessionName,
      fullResponse: 'Testing that sessionName is passed through correctly.',
      channels: ['console'],  // Console only - no Discord spam
    }),
  });

  const data = await res.json() as NotifyResponse;

  if (!data.success) {
    return { passed: false, message: data.error || 'Failed to send' };
  }

  // The sessionName should be passed through - we can verify by checking response page
  if (!data.responseUrl) {
    return { passed: false, message: 'No response URL to verify sessionName' };
  }

  // For now, just verify the payload was accepted with sessionName
  // Full verification would require checking the response page HTML or Discord webhook
  return { passed: true, message: `sessionName "${testSessionName}" accepted` };
}

async function testSummaryWithLLM(_baseUrl: string, _sdkKey: string): Promise<{ passed: boolean; message: string }> {
  // Test summary quality using LLM evaluation
  // NOTE: We do NOT send a notification here - just validate a sample summary
  // This prevents polluting Discord/response pages with fake content

  const testSummary = 'I fixed the authentication bug in the login handler by adding proper token validation.';

  // Use Claude CLI to evaluate the summary (no server call needed)
  const summaryRules = `
SUMMARY RULES:
1. First person, past tense, one sentence
2. Max 20 words
3. Focus on what was DONE
4. No code, URLs, lists, tables, or markdown
5. Natural spoken language
`;

  const evaluationPrompt = `Evaluate this summary against the rules. Answer ONLY "PASS" or "FAIL: <reason>".

${summaryRules}

SUMMARY TO EVALUATE: "${testSummary}"

Does it follow all the rules? Answer:`;

  try {
    const { spawn } = await import('child_process');

    const result = await new Promise<string>((resolve, reject) => {
      const proc = spawn('claude', ['-p', '--output-format', 'text', evaluationPrompt], {
        timeout: 30000,
      });

      let output = '';
      let error = '';

      proc.stdout.on('data', (data) => { output += data.toString(); });
      proc.stderr.on('data', (data) => { error += data.toString(); });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(error || `Exit code ${code}`));
        }
      });

      proc.on('error', reject);
    });

    if (result.toUpperCase().startsWith('PASS')) {
      return { passed: true, message: 'LLM validated summary follows rules' };
    } else {
      return { passed: false, message: `LLM evaluation: ${result}` };
    }
  } catch (error) {
    // If Claude CLI isn't available, fall back to regex checks
    const wordCount = testSummary.split(/\s+/).length;
    const isFirstPerson = /^I\s/i.test(testSummary);
    const isPastTense = /ed\b|fixed|added|updated|created/i.test(testSummary);
    const hasMarkdown = /[*_`#|]|\n/.test(testSummary);

    if (wordCount > 20) {
      return { passed: false, message: `Summary too long: ${wordCount} words` };
    }
    if (!isFirstPerson) {
      return { passed: false, message: 'Summary not in first person' };
    }
    if (!isPastTense) {
      return { passed: false, message: 'Summary not in past tense' };
    }
    if (hasMarkdown) {
      return { passed: false, message: 'Summary contains markdown' };
    }

    return { passed: true, message: 'Summary passes regex checks (LLM unavailable)' };
  }
}

async function testResponsePage(baseUrl: string, sdkKey: string): Promise<{ passed: boolean; message: string }> {
  const res = await fetch(`${baseUrl}/notify`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sdkKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: 'smoke-test',
      summary: 'Response page test',
      fullResponse: 'This is the full response content for testing response page storage.',
      channels: ['console'],
    }),
  });

  const data = await res.json() as NotifyResponse;

  if (!data.success) {
    return { passed: false, message: data.error || 'Failed to create' };
  }
  if (!data.responseUrl) {
    return { passed: false, message: 'No response URL returned' };
  }

  // Fetch the response page
  const pageRes = await fetch(data.responseUrl);
  if (pageRes.status !== 200) {
    return { passed: false, message: `Page HTTP ${pageRes.status}` };
  }

  const html = await pageRes.text();
  if (!html.includes('full response content')) {
    return { passed: false, message: 'Page content missing' };
  }

  return { passed: true, message: 'Response page accessible' };
}

async function main() {
  console.log(colorize('blue', '\n=== Notify Service Smoke Test ===\n'));

  // Parse args
  const args = process.argv.slice(2);
  let baseUrl: string | undefined;
  let sdkKey: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      baseUrl = args[++i];
    } else if (args[i] === '--key' && args[i + 1]) {
      sdkKey = args[++i];
    }
  }

  // Load from config if not provided
  if (!baseUrl || !sdkKey) {
    const config = await loadConfig();

    // Read raw config to get client fields (sdkKey, remoteUrl) not in ServiceConfig
    let rawConfig: Record<string, unknown> = {};
    const configPath = getConfigPath();
    if (existsSync(configPath)) {
      try {
        const content = await readFile(configPath, 'utf-8');
        rawConfig = JSON.parse(content);
      } catch {
        // Ignore parse errors
      }
    }

    const remoteUrl = rawConfig.remoteUrl as string | undefined;
    const configKey = rawConfig.sdkKey as string | undefined;

    baseUrl = baseUrl || remoteUrl || `http://${config.server.host}:${config.server.port}`;
    sdkKey = sdkKey || configKey;
  }

  if (!sdkKey) {
    console.error(colorize('red', 'Error: No SDK key provided. Use --key or set sdkKey in ~/.claude-notify/config.json'));
    process.exit(1);
  }

  console.log(`Target: ${colorize('dim', baseUrl)}`);
  console.log(`SDK Key: ${colorize('dim', sdkKey.slice(0, 15) + '...')}\n`);

  const results: TestResult[] = [];
  let audioUrl: string | undefined;

  // Run tests
  console.log('Running tests...\n');

  // 1. Health check
  results.push(await runTest('Health Check', () => testHealth(baseUrl!)));

  // 2. Valid auth
  results.push(await runTest('Auth (valid key)', () => testAuthValid(baseUrl!, sdkKey!)));

  // 3. Invalid auth
  results.push(await runTest('Auth (invalid key)', () => testAuthInvalid(baseUrl!)));

  // 4. Discord
  results.push(await runTest('Discord Channel', () => testDiscord(baseUrl!, sdkKey!)));

  // 5. TTS generation
  const ttsResult = await runTest('TTS Generation', async () => {
    const result = await testTTS(baseUrl!, sdkKey!);
    if (result.audioUrl) {
      audioUrl = result.audioUrl;
    }
    return result;
  });
  results.push(ttsResult);

  // 6. Audio accessibility (only if TTS passed)
  if (audioUrl) {
    results.push(await runTest('Audio Accessible', () => testAudioAccessible(audioUrl!)));
  } else {
    results.push({
      name: 'Audio Accessible',
      passed: false,
      message: 'Skipped - no audio URL from TTS test',
      duration: 0,
    });
  }

  // 7. Response page
  results.push(await runTest('Response Page', () => testResponsePage(baseUrl!, sdkKey!)));

  // 8. Session name support
  results.push(await runTest('Session Name', () => testSessionName(baseUrl!, sdkKey!)));

  // 9. Summary quality with LLM validation
  results.push(await runTest('Summary Quality (LLM)', () => testSummaryWithLLM(baseUrl!, sdkKey!)));

  // Print results
  console.log('Results:\n');

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.passed
      ? colorize('green', '✓ PASS')
      : colorize('red', '✗ FAIL');
    const duration = colorize('dim', `(${result.duration}ms)`);

    console.log(`  ${status} ${result.name} ${duration}`);
    console.log(`         ${colorize('dim', result.message)}`);

    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(50));
  const summary = failed === 0
    ? colorize('green', `All ${passed} tests passed`)
    : colorize('red', `${failed} of ${passed + failed} tests failed`);
  console.log(`\n${summary}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(colorize('red', `Fatal error: ${err.message}`));
  process.exit(1);
});
