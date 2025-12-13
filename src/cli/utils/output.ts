/**
 * Output formatting utilities for Board CLI
 *
 * Provides consistent output formatting for table display,
 * JSON output, and colored terminal messages.
 */

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
} as const;

/**
 * Global output options set by the CLI
 */
let globalOutputOptions: OutputOptions = {
  json: false,
  verbose: false,
};

/**
 * Output options interface
 */
export interface OutputOptions {
  json: boolean;
  verbose: boolean;
}

/**
 * Set global output options from CLI flags
 */
export function setOutputOptions(options: OutputOptions): void {
  globalOutputOptions = { ...options };
}

/**
 * Get the current output format based on global options
 */
export function getOutputFormat(): 'json' | 'table' {
  return globalOutputOptions.json ? 'json' : 'table';
}

/**
 * Check if verbose mode is enabled
 */
export function isVerbose(): boolean {
  return globalOutputOptions.verbose;
}

/**
 * Format data as a pretty-printed JSON string
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Calculate the display width of a string (handling ANSI codes)
 */
function getDisplayWidth(str: string): number {
  // Remove ANSI escape codes for width calculation
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  return stripped.length;
}

/**
 * Pad a string to a specific width (handling ANSI codes)
 */
function padString(str: string, width: number): string {
  const currentWidth = getDisplayWidth(str);
  if (currentWidth >= width) {
    return str;
  }
  return str + ' '.repeat(width - currentWidth);
}

/**
 * Truncate a string to max width with ellipsis
 */
function truncate(str: string, maxWidth: number): string {
  if (str.length <= maxWidth) {
    return str;
  }
  return str.slice(0, maxWidth - 3) + '...';
}

/**
 * Format an array of objects as an ASCII table
 *
 * @param rows - Array of objects to display
 * @param columns - Column names to display (object keys)
 * @param options - Optional formatting options
 * @returns Formatted ASCII table string
 */
export function formatTable(
  rows: Record<string, unknown>[],
  columns: string[],
  options: {
    maxWidth?: number;
    headers?: Record<string, string>;
  } = {}
): string {
  const { maxWidth = 40, headers = {} } = options;

  if (rows.length === 0) {
    return '(no results)';
  }

  // Calculate column widths
  const columnWidths: Record<string, number> = {};

  for (const col of columns) {
    const headerLabel = headers[col] || col.toUpperCase();
    columnWidths[col] = Math.min(headerLabel.length, maxWidth);
  }

  // Check all rows for max width
  for (const row of rows) {
    for (const col of columns) {
      const value = String(row[col] ?? '');
      const width = Math.min(value.length, maxWidth);
      if (width > columnWidths[col]) {
        columnWidths[col] = width;
      }
    }
  }

  // Build the table
  const lines: string[] = [];

  // Header row
  const headerCells: string[] = [];
  for (const col of columns) {
    const label = headers[col] || col.toUpperCase();
    headerCells.push(padString(COLORS.bold + label + COLORS.reset, columnWidths[col] + COLORS.bold.length + COLORS.reset.length));
  }
  lines.push(headerCells.join('  '));

  // Separator
  const separatorCells: string[] = [];
  for (const col of columns) {
    separatorCells.push('-'.repeat(columnWidths[col]));
  }
  lines.push(COLORS.dim + separatorCells.join('  ') + COLORS.reset);

  // Data rows
  for (const row of rows) {
    const cells: string[] = [];
    for (const col of columns) {
      const value = truncate(String(row[col] ?? ''), maxWidth);
      cells.push(padString(value, columnWidths[col]));
    }
    lines.push(cells.join('  '));
  }

  return lines.join('\n');
}

/**
 * Output a success message in green
 */
export function success(message: string): void {
  console.log(`${COLORS.green}${message}${COLORS.reset}`);
}

/**
 * Output an error message in red
 */
export function error(message: string): void {
  console.error(`${COLORS.red}Error: ${message}${COLORS.reset}`);
}

/**
 * Output an info message in blue
 */
export function info(message: string): void {
  console.log(`${COLORS.blue}${message}${COLORS.reset}`);
}

/**
 * Output a warning message in yellow
 */
export function warn(message: string): void {
  console.log(`${COLORS.yellow}Warning: ${message}${COLORS.reset}`);
}

/**
 * Output a verbose/debug message in gray (only if verbose mode is enabled)
 */
export function verbose(message: string): void {
  if (globalOutputOptions.verbose) {
    console.log(`${COLORS.gray}[verbose] ${message}${COLORS.reset}`);
  }
}

/**
 * Output data in the appropriate format (JSON or table)
 *
 * @param data - Data to output
 * @param columns - Columns for table format (required if data is array)
 * @param tableOptions - Options for table formatting
 */
export function output(
  data: unknown,
  columns?: string[],
  tableOptions?: { maxWidth?: number; headers?: Record<string, string> }
): void {
  if (globalOutputOptions.json) {
    console.log(formatJson(data));
    return;
  }

  if (Array.isArray(data) && columns) {
    console.log(formatTable(data as Record<string, unknown>[], columns, tableOptions));
  } else if (typeof data === 'object' && data !== null) {
    // Single object - format as key: value pairs
    const obj = data as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      console.log(`${COLORS.bold}${key}:${COLORS.reset} ${obj[key]}`);
    }
  } else {
    console.log(String(data));
  }
}

/**
 * Format a status value with appropriate color
 */
export function formatStatus(status: string): string {
  const statusColors: Record<string, string> = {
    // Story statuses
    backlog: COLORS.gray,
    ready: COLORS.cyan,
    'in-progress': COLORS.yellow,
    review: COLORS.magenta,
    done: COLORS.green,
    blocked: COLORS.red,

    // Task statuses
    pending: COLORS.gray,
    active: COLORS.yellow,
    completed: COLORS.green,
    skipped: COLORS.dim,
  };

  const color = statusColors[status] || COLORS.reset;
  return `${color}${status}${COLORS.reset}`;
}

/**
 * Format a priority value with appropriate color
 */
export function formatPriority(priority: string): string {
  const priorityColors: Record<string, string> = {
    critical: COLORS.red,
    high: COLORS.yellow,
    medium: COLORS.cyan,
    low: COLORS.gray,
  };

  const color = priorityColors[priority] || COLORS.reset;
  return `${color}${priority}${COLORS.reset}`;
}
