/**
 * Webhook URL Validator (NOTIFY-003)
 *
 * Validates Discord webhook URLs to prevent SSRF attacks.
 * Only allows known Discord webhook domains.
 */

/**
 * Result of webhook URL validation
 */
export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Allowed Discord webhook domains (SSRF prevention - AC-006)
 */
const ALLOWED_DISCORD_DOMAINS = [
  'discord.com',
  'discordapp.com',
];

/**
 * Validate a Discord webhook URL
 *
 * Security checks:
 * 1. Must be a valid URL
 * 2. Must use HTTPS protocol
 * 3. Host must be in allowlist (discord.com, discordapp.com)
 * 4. Path must start with /api/webhooks/
 *
 * @param url - The webhook URL to validate
 * @returns Validation result with success or error message
 */
export function validateDiscordWebhookUrl(url: string): WebhookValidationResult {
  // Empty or whitespace-only URLs are invalid
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return { valid: false, error: 'Webhook URL is empty or invalid' };
  }

  // Parse the URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Malformed URL' };
  }

  // Must use HTTPS
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Webhook URL must use HTTPS' };
  }

  // Extract hostname (normalize to lowercase)
  const hostname = parsed.hostname.toLowerCase();

  // Check against allowlist (SSRF prevention)
  const isAllowedDomain = ALLOWED_DISCORD_DOMAINS.some(domain => {
    // Match exact domain or subdomain
    return hostname === domain || hostname.endsWith(`.${domain}`);
  });

  if (!isAllowedDomain) {
    return {
      valid: false,
      error: `Domain not allowed: ${hostname}. Only discord.com and discordapp.com are permitted`,
    };
  }

  // Validate webhook path format
  if (!parsed.pathname.startsWith('/api/webhooks/')) {
    return {
      valid: false,
      error: 'Invalid Discord webhook path. Expected /api/webhooks/...',
    };
  }

  return { valid: true };
}
