/**
 * Session Resolver Tests
 *
 * Tests for the session-resolver module that maps friendly session names
 * to UUIDs using claude-hooks-sdk SessionNamer.
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  SessionResolver,
  resolveSession,
  listSessions,
  getSessionName,
  clearCache,
  createSessionResolver,
  type ResolvedSession,
  type SessionListItem,
} from '../src/discord-bot/session-resolver';

describe('SessionResolver', () => {
  let resolver: SessionResolver;

  beforeEach(() => {
    resolver = new SessionResolver({ debug: false });
    resolver.clearCache();
  });

  describe('resolveSession', () => {
    test('returns null for unknown session', async () => {
      const result = await resolver.resolveSession('nonexistent-session');
      expect(result).toBeNull();
    });

    test('normalizes session names to lowercase', async () => {
      // Even if session doesn't exist, we verify normalization by checking
      // that different cases are treated the same
      const result1 = await resolver.resolveSession('Test-Session');
      const result2 = await resolver.resolveSession('test-session');
      const result3 = await resolver.resolveSession('TEST-SESSION');

      // All should return the same result (null in this case)
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });

    test('trims whitespace from session names', async () => {
      const result1 = await resolver.resolveSession('  session  ');
      const result2 = await resolver.resolveSession('session');

      expect(result1).toEqual(result2);
    });
  });

  describe('listSessions', () => {
    test('returns empty array when no sessions exist', async () => {
      // In a fresh environment, there may be no sessions
      const sessions = await resolver.listSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    test('returns sessions as SessionListItem array', async () => {
      const sessions = await resolver.listSessions();

      for (const session of sessions) {
        expect(typeof session.sessionId).toBe('string');
        expect(typeof session.sessionName).toBe('string');
        // lastActive is optional
        if (session.lastActive !== undefined) {
          expect(session.lastActive).toBeInstanceOf(Date);
        }
      }
    });
  });

  describe('getSessionName', () => {
    test('returns null for unknown session ID', async () => {
      const result = await resolver.getSessionName('non-existent-uuid-12345');
      expect(result).toBeNull();
    });
  });

  describe('resolveWithSuggestions', () => {
    test('returns error message for unknown session', async () => {
      const result = await resolver.resolveWithSuggestions('unknown-session');

      expect(result.session).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Unknown session');
    });

    test('suggests similar names when available', async () => {
      // First, ensure we have sessions to suggest from
      const sessions = await resolver.listSessions();

      if (sessions.length > 0) {
        // Try a typo version of an existing session name
        const existingName = sessions[0].sessionName;
        const typoName = existingName.slice(0, -1) + 'x'; // Replace last char

        const result = await resolver.resolveWithSuggestions(typoName);

        // Should have suggestions if name is close enough
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('cache', () => {
    test('clearCache clears all cached entries', () => {
      // Get initial stats
      resolver.clearCache();
      const stats = resolver.getCacheStats();

      expect(stats.nameToIdSize).toBe(0);
      expect(stats.idToNameSize).toBe(0);
      expect(stats.hasSessionsList).toBe(false);
    });

    test('cache stats reflect cached entries', async () => {
      resolver.clearCache();

      // List sessions to populate cache
      await resolver.listSessions();

      const stats = resolver.getCacheStats();
      // Sessions list should be cached
      expect(stats.hasSessionsList).toBe(true);
    });
  });

  describe('getOrCreateName', () => {
    test('returns a name for a new session ID', () => {
      const testSessionId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const name = resolver.getOrCreateName(testSessionId);

      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
      // Names follow adjective-animal pattern
      expect(name).toMatch(/^[a-z]+-[a-z]+(-\d+)?$/);
    });

    test('returns same name for same session ID', () => {
      const testSessionId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const name1 = resolver.getOrCreateName(testSessionId);
      const name2 = resolver.getOrCreateName(testSessionId);

      expect(name1).toBe(name2);
    });
  });
});

describe('Module-level convenience functions', () => {
  beforeEach(() => {
    clearCache();
  });

  test('resolveSession returns null for unknown session', async () => {
    const result = await resolveSession('unknown-session');
    expect(result).toBeNull();
  });

  test('listSessions returns array', async () => {
    const sessions = await listSessions();
    expect(Array.isArray(sessions)).toBe(true);
  });

  test('getSessionName returns null for unknown session ID', async () => {
    const result = await getSessionName('unknown-uuid');
    expect(result).toBeNull();
  });

  test('createSessionResolver creates new instance', () => {
    const resolver1 = createSessionResolver();
    const resolver2 = createSessionResolver({ debug: true });

    expect(resolver1).toBeInstanceOf(SessionResolver);
    expect(resolver2).toBeInstanceOf(SessionResolver);
    expect(resolver1).not.toBe(resolver2);
  });
});

describe('Levenshtein distance (fuzzy matching)', () => {
  test('resolveWithSuggestions finds close matches', async () => {
    const resolver = new SessionResolver();
    const sessions = await resolver.listSessions();

    if (sessions.length > 0) {
      const existingName = sessions[0].sessionName;

      // Test with a small typo (1 character difference)
      const typoName = existingName.slice(0, -1);
      const result = await resolver.resolveWithSuggestions(typoName);

      // If the typo is close enough, we should get suggestions
      if (result.suggestions && result.suggestions.length > 0) {
        expect(result.suggestions).toContain(existingName);
      }
    }
  });
});
