/**
 * WorkChart - Clean ASCII bar chart component
 *
 * Displays data as a simple, readable bar chart using block characters.
 * Inspired by Claude Code's token usage display.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - `<text>` cannot have nested JSX - build complete strings
 */

import React, { useMemo } from 'react';
import { TextAttributes } from '@opentui/core';

/**
 * Data point for the chart
 */
export interface DataPoint {
  /** Label for the x-axis (e.g., date string) */
  date: string;
  /** Value for the y-axis */
  value: number;
}

/**
 * Props for WorkChart component
 */
export interface WorkChartProps {
  /** Data points to display */
  data: DataPoint[];
  /** Chart title */
  title: string;
  /** Chart height in rows (default: 8) */
  height?: number;
  /** Color for the bars (default: cyan) */
  color?: string;
  /** Show value labels on bars */
  showValues?: boolean;
}

/**
 * Block characters for drawing bars (from bottom to top fill levels)
 */
const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Format date as short label (e.g., "Mon", "Tue" or "12/10")
 */
function formatDateShort(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  } catch {
    return dateStr.slice(5, 10); // MM-DD fallback
  }
}

/**
 * Get the appropriate block character for a fractional fill
 */
function getBlockChar(fraction: number): string {
  if (fraction <= 0) return ' ';
  if (fraction >= 1) return '█';
  const index = Math.floor(fraction * BLOCKS.length);
  return BLOCKS[Math.min(index, BLOCKS.length - 1)];
}

/**
 * WorkChart component
 *
 * Renders a clean ASCII bar chart with vertical bars.
 *
 * @example
 * ```tsx
 * <WorkChart
 *   data={[
 *     { date: '2025-12-10', value: 3 },
 *     { date: '2025-12-11', value: 7 },
 *   ]}
 *   title="Tasks Completed"
 *   height={6}
 *   color="cyan"
 * />
 * ```
 */
export function WorkChart({
  data,
  title,
  height = 8,
  color = 'cyan',
  showValues = true,
}: WorkChartProps) {
  // Calculate max value for scaling
  const maxValue = useMemo(() => {
    if (data.length === 0) return 1;
    const max = Math.max(...data.map((d) => d.value));
    return max > 0 ? max : 1;
  }, [data]);

  // Calculate bar heights as fractions of max
  const barData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      fraction: d.value / maxValue,
      label: formatDateShort(d.date),
    }));
  }, [data, maxValue]);

  // Empty data state
  if (data.length === 0) {
    return (
      <box flexDirection="column">
        <text fg={color} attributes={TextAttributes.BOLD}>
          {title}
        </text>
        <box marginTop={1}>
          <text fg="gray">No data available</text>
        </box>
      </box>
    );
  }

  // Build chart rows from top to bottom
  const rows: string[] = [];

  // Value labels row (optional)
  if (showValues) {
    let valueRow = '     '; // Left padding for Y-axis
    for (const bar of barData) {
      const valStr = bar.value.toString();
      valueRow += valStr.padStart(4, ' ') + ' ';
    }
    rows.push(valueRow);
  }

  // Chart body rows
  for (let row = height - 1; row >= 0; row--) {
    const rowThreshold = row / height;
    const nextThreshold = (row + 1) / height;

    // Y-axis label (only on specific rows)
    let yLabel = '     ';
    if (row === height - 1) {
      yLabel = maxValue.toString().padStart(4, ' ') + ' ';
    } else if (row === 0) {
      yLabel = '   0 ';
    } else if (row === Math.floor(height / 2)) {
      yLabel = Math.round(maxValue / 2).toString().padStart(4, ' ') + ' ';
    }

    let rowStr = yLabel;

    for (const bar of barData) {
      if (bar.fraction >= nextThreshold) {
        // Full block
        rowStr += ' ██ ';
      } else if (bar.fraction > rowThreshold) {
        // Partial block at top of bar
        const partialFraction = (bar.fraction - rowThreshold) / (1 / height);
        const blockChar = getBlockChar(partialFraction);
        rowStr += ` ${blockChar}${blockChar} `;
      } else {
        // Empty
        rowStr += '    ';
      }
      rowStr += ' ';
    }

    rows.push(rowStr);
  }

  // X-axis line
  let axisLine = '     ';
  for (let i = 0; i < barData.length; i++) {
    axisLine += '─────';
  }
  rows.push(axisLine);

  // Date labels
  let dateRow = '     ';
  for (const bar of barData) {
    dateRow += bar.label.padStart(4, ' ') + ' ';
  }
  rows.push(dateRow);

  return (
    <box flexDirection="column">
      {/* Title */}
      <text fg={color} attributes={TextAttributes.BOLD}>
        {title}
      </text>

      <box marginTop={1} />

      {/* Chart rows */}
      {rows.map((row, idx) => {
        // Color the bar characters, gray for axis/labels
        const isAxisOrLabel = idx >= rows.length - 2;
        const isValueRow = showValues && idx === 0;

        return (
          <text
            key={idx}
            fg={isAxisOrLabel ? 'gray' : (isValueRow ? 'white' : color)}
          >
            {row}
          </text>
        );
      })}
    </box>
  );
}
