/**
 * Format Relative Time Utility
 *
 * Formats a date as a relative time string like 'just now', '5m ago', '2h ago', etc.
 */

/**
 * Format a date as a relative time string
 *
 * @param date - Date to format (Date object, ISO string, or null)
 * @returns Relative time string ('just now', 'Xm ago', 'Xh ago', 'Xd ago', 'Xw ago')
 *
 * @example
 * ```typescript
 * formatRelativeTime(new Date()); // 'just now'
 * formatRelativeTime('2025-12-14T10:00:00Z'); // '2h ago' (if now is 12:00)
 * formatRelativeTime(null); // '-'
 * ```
 */
export function formatRelativeTime(date: Date | string | null): string {
  // Handle null/undefined input
  if (date === null || date === undefined) {
    return '-';
  }

  // Parse date if string
  let dateObj: Date;
  if (typeof date === 'string') {
    dateObj = new Date(date);
  } else {
    dateObj = date;
  }

  // Handle invalid dates
  if (isNaN(dateObj.getTime())) {
    return '-';
  }

  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();

  // Handle future dates (show as 'just now')
  if (diffMs < 0) {
    return 'just now';
  }

  // Convert to seconds
  const diffSeconds = Math.floor(diffMs / 1000);

  // Just now (less than 60 seconds)
  if (diffSeconds < 60) {
    return 'just now';
  }

  // Minutes (1-59 minutes)
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  // Hours (1-23 hours)
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  // Days (1-6 days)
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  // Weeks (1+ weeks)
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w ago`;
}
