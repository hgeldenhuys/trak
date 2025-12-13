/**
 * Tests for Discord Webhook URL Validator (NOTIFY-003)
 */

import { describe, it, expect } from 'bun:test';
import { validateDiscordWebhookUrl } from '../src/utils/webhook-validator';

describe('validateDiscordWebhookUrl', () => {
  describe('valid URLs', () => {
    it('accepts discord.com webhook URLs', () => {
      const result = validateDiscordWebhookUrl(
        'https://discord.com/api/webhooks/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts discordapp.com webhook URLs', () => {
      const result = validateDiscordWebhookUrl(
        'https://discordapp.com/api/webhooks/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts subdomains of discord.com', () => {
      const result = validateDiscordWebhookUrl(
        'https://canary.discord.com/api/webhooks/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts URLs with query parameters', () => {
      const result = validateDiscordWebhookUrl(
        'https://discord.com/api/webhooks/1234567890/abcdef123456?wait=true'
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('rejects empty URLs', () => {
      const result = validateDiscordWebhookUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Webhook URL is empty or invalid');
    });

    it('rejects whitespace-only URLs', () => {
      const result = validateDiscordWebhookUrl('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Webhook URL is empty or invalid');
    });

    it('rejects malformed URLs', () => {
      const result = validateDiscordWebhookUrl('not-a-valid-url');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Malformed URL');
    });

    it('rejects HTTP URLs (requires HTTPS)', () => {
      const result = validateDiscordWebhookUrl(
        'http://discord.com/api/webhooks/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Webhook URL must use HTTPS');
    });

    it('rejects non-Discord domains (SSRF prevention)', () => {
      const result = validateDiscordWebhookUrl(
        'https://evil.com/api/webhooks/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Domain not allowed');
    });

    it('rejects localhost URLs (SSRF prevention)', () => {
      const result = validateDiscordWebhookUrl(
        'https://localhost/api/webhooks/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Domain not allowed');
    });

    it('rejects internal IPs (SSRF prevention)', () => {
      const result = validateDiscordWebhookUrl(
        'https://192.168.1.1/api/webhooks/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Domain not allowed');
    });

    it('rejects fake Discord domains (SSRF prevention)', () => {
      const result = validateDiscordWebhookUrl(
        'https://fake-discord.com/api/webhooks/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Domain not allowed');
    });

    it('rejects non-webhook Discord paths', () => {
      const result = validateDiscordWebhookUrl(
        'https://discord.com/channels/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Discord webhook path');
    });

    it('rejects Discord main page', () => {
      const result = validateDiscordWebhookUrl('https://discord.com/');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid Discord webhook path');
    });
  });

  describe('edge cases', () => {
    it('handles uppercase domain', () => {
      const result = validateDiscordWebhookUrl(
        'https://DISCORD.COM/api/webhooks/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(true);
    });

    it('handles mixed case domain', () => {
      const result = validateDiscordWebhookUrl(
        'https://Discord.Com/api/webhooks/1234567890/abcdef123456'
      );
      expect(result.valid).toBe(true);
    });

    it('handles null-like values', () => {
      const result = validateDiscordWebhookUrl(null as unknown as string);
      expect(result.valid).toBe(false);
    });

    it('handles undefined', () => {
      const result = validateDiscordWebhookUrl(undefined as unknown as string);
      expect(result.valid).toBe(false);
    });
  });
});
