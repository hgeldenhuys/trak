/**
 * Tests for formatRelativeTime utility
 *
 * Tests various time ranges:
 * - just now (< 60 seconds)
 * - minutes (1-59 minutes)
 * - hours (1-23 hours)
 * - days (1-6 days)
 * - weeks (1+ weeks)
 *
 * Also tests edge cases:
 * - null/undefined input
 * - invalid dates
 * - future dates
 * - string dates (ISO format)
 */

import { describe, it, expect } from 'bun:test';
import { formatRelativeTime } from '../formatRelativeTime';

describe('formatRelativeTime', () => {
  // Helper to create a date relative to actual "now"
  function createPastDate(offsetMs: number): Date {
    return new Date(Date.now() - offsetMs);
  }

  // Helper to create ISO string relative to actual "now"
  function createPastISOString(offsetMs: number): string {
    return new Date(Date.now() - offsetMs).toISOString();
  }

  // =============================================================================
  // Null/Undefined Input Tests
  // =============================================================================

  describe('null/undefined input', () => {
    it('should return "-" for null input', () => {
      expect(formatRelativeTime(null)).toBe('-');
    });

    it('should return "-" for undefined input', () => {
      expect(formatRelativeTime(undefined as any)).toBe('-');
    });
  });

  // =============================================================================
  // Invalid Date Tests
  // =============================================================================

  describe('invalid dates', () => {
    it('should return "-" for invalid date string', () => {
      expect(formatRelativeTime('not-a-date')).toBe('-');
    });

    it('should return "-" for empty string', () => {
      expect(formatRelativeTime('')).toBe('-');
    });

    it('should return "-" for invalid Date object', () => {
      expect(formatRelativeTime(new Date('invalid'))).toBe('-');
    });
  });

  // =============================================================================
  // Future Date Tests
  // =============================================================================

  describe('future dates', () => {
    it('should return "just now" for dates in the future', () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute in future
      expect(formatRelativeTime(futureDate)).toBe('just now');
    });

    it('should return "just now" for dates 1 hour in the future', () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour in future
      expect(formatRelativeTime(futureDate)).toBe('just now');
    });
  });

  // =============================================================================
  // "Just Now" Tests (< 60 seconds)
  // =============================================================================

  describe('just now (< 60 seconds)', () => {
    it('should return "just now" for current time', () => {
      const date = new Date();
      expect(formatRelativeTime(date)).toBe('just now');
    });

    it('should return "just now" for 1 second ago', () => {
      const date = createPastDate(1000);
      expect(formatRelativeTime(date)).toBe('just now');
    });

    it('should return "just now" for 30 seconds ago', () => {
      const date = createPastDate(30000);
      expect(formatRelativeTime(date)).toBe('just now');
    });

    it('should return "just now" for 59 seconds ago', () => {
      const date = createPastDate(59000);
      expect(formatRelativeTime(date)).toBe('just now');
    });
  });

  // =============================================================================
  // Minutes Tests (1-59 minutes)
  // =============================================================================

  describe('minutes (1-59 minutes)', () => {
    it('should return "1m ago" for 60 seconds ago', () => {
      const date = createPastDate(60 * 1000);
      expect(formatRelativeTime(date)).toBe('1m ago');
    });

    it('should return "1m ago" for 90 seconds ago', () => {
      const date = createPastDate(90 * 1000);
      expect(formatRelativeTime(date)).toBe('1m ago');
    });

    it('should return "2m ago" for 2 minutes ago', () => {
      const date = createPastDate(2 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('2m ago');
    });

    it('should return "5m ago" for 5 minutes ago', () => {
      const date = createPastDate(5 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('5m ago');
    });

    it('should return "30m ago" for 30 minutes ago', () => {
      const date = createPastDate(30 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('30m ago');
    });

    it('should return "59m ago" for 59 minutes ago', () => {
      const date = createPastDate(59 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('59m ago');
    });
  });

  // =============================================================================
  // Hours Tests (1-23 hours)
  // =============================================================================

  describe('hours (1-23 hours)', () => {
    it('should return "1h ago" for 60 minutes ago', () => {
      const date = createPastDate(60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('1h ago');
    });

    it('should return "1h ago" for 90 minutes ago', () => {
      const date = createPastDate(90 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('1h ago');
    });

    it('should return "2h ago" for 2 hours ago', () => {
      const date = createPastDate(2 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('2h ago');
    });

    it('should return "12h ago" for 12 hours ago', () => {
      const date = createPastDate(12 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('12h ago');
    });

    it('should return "23h ago" for 23 hours ago', () => {
      const date = createPastDate(23 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('23h ago');
    });
  });

  // =============================================================================
  // Days Tests (1-6 days)
  // =============================================================================

  describe('days (1-6 days)', () => {
    it('should return "1d ago" for 24 hours ago', () => {
      const date = createPastDate(24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('1d ago');
    });

    it('should return "1d ago" for 36 hours ago', () => {
      const date = createPastDate(36 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('1d ago');
    });

    it('should return "2d ago" for 2 days ago', () => {
      const date = createPastDate(2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('2d ago');
    });

    it('should return "3d ago" for 3 days ago', () => {
      const date = createPastDate(3 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('3d ago');
    });

    it('should return "6d ago" for 6 days ago', () => {
      const date = createPastDate(6 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('6d ago');
    });
  });

  // =============================================================================
  // Weeks Tests (1+ weeks)
  // =============================================================================

  describe('weeks (1+ weeks)', () => {
    it('should return "1w ago" for 7 days ago', () => {
      const date = createPastDate(7 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('1w ago');
    });

    it('should return "1w ago" for 10 days ago', () => {
      const date = createPastDate(10 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('1w ago');
    });

    it('should return "2w ago" for 14 days ago', () => {
      const date = createPastDate(14 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('2w ago');
    });

    it('should return "4w ago" for 30 days ago', () => {
      const date = createPastDate(30 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('4w ago');
    });

    it('should return "52w ago" for ~1 year ago', () => {
      const date = createPastDate(365 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(date)).toBe('52w ago');
    });
  });

  // =============================================================================
  // String Date Input Tests
  // =============================================================================

  describe('string date input (ISO format)', () => {
    it('should parse ISO date string from 5 minutes ago', () => {
      const isoString = createPastISOString(5 * 60 * 1000);
      expect(formatRelativeTime(isoString)).toBe('5m ago');
    });

    it('should parse ISO date string from 2 hours ago', () => {
      const isoString = createPastISOString(2 * 60 * 60 * 1000);
      expect(formatRelativeTime(isoString)).toBe('2h ago');
    });

    it('should parse ISO date string from 1 day ago', () => {
      const isoString = createPastISOString(24 * 60 * 60 * 1000);
      expect(formatRelativeTime(isoString)).toBe('1d ago');
    });

    it('should parse ISO date string from 2 weeks ago', () => {
      const isoString = createPastISOString(14 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(isoString)).toBe('2w ago');
    });
  });

  // =============================================================================
  // Boundary Tests
  // =============================================================================

  describe('boundary conditions', () => {
    it('should transition from "just now" to "1m ago" at exactly 60 seconds', () => {
      // 59 seconds = just now
      expect(formatRelativeTime(createPastDate(59 * 1000))).toBe('just now');
      // 60 seconds = 1m ago
      expect(formatRelativeTime(createPastDate(60 * 1000))).toBe('1m ago');
    });

    it('should transition from "59m ago" to "1h ago" at exactly 60 minutes', () => {
      // 59 minutes = 59m ago
      expect(formatRelativeTime(createPastDate(59 * 60 * 1000))).toBe('59m ago');
      // 60 minutes = 1h ago
      expect(formatRelativeTime(createPastDate(60 * 60 * 1000))).toBe('1h ago');
    });

    it('should transition from "23h ago" to "1d ago" at exactly 24 hours', () => {
      // 23 hours = 23h ago
      expect(formatRelativeTime(createPastDate(23 * 60 * 60 * 1000))).toBe('23h ago');
      // 24 hours = 1d ago
      expect(formatRelativeTime(createPastDate(24 * 60 * 60 * 1000))).toBe('1d ago');
    });

    it('should transition from "6d ago" to "1w ago" at exactly 7 days', () => {
      // 6 days = 6d ago
      expect(formatRelativeTime(createPastDate(6 * 24 * 60 * 60 * 1000))).toBe('6d ago');
      // 7 days = 1w ago
      expect(formatRelativeTime(createPastDate(7 * 24 * 60 * 60 * 1000))).toBe('1w ago');
    });
  });

  // =============================================================================
  // Module Export Tests
  // =============================================================================

  describe('module exports', () => {
    it('should export formatRelativeTime function', async () => {
      const module = await import('../formatRelativeTime');
      expect(module.formatRelativeTime).toBeDefined();
      expect(typeof module.formatRelativeTime).toBe('function');
    });
  });
});
