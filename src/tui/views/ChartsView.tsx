/**
 * ChartsView - Weekly work statistics view
 *
 * Displays charts showing completed tasks and stories over the last 7-14 days.
 * Uses the WorkChart component for ASCII visualization.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `backgroundColor` for box background colors
 * - Use `attributes={TextAttributes.BOLD}` for bold, not `bold`
 */

import React, { useMemo, useState } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';
import { WorkChart, type DataPoint } from '../components';
import { useTasks, useStories } from '../hooks';
import type { Task, Story } from '../../types';

/**
 * Props for ChartsView component
 */
export interface ChartsViewProps {
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

/**
 * Generate date range for the last N days
 */
function getDateRange(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }

  return dates;
}

/**
 * Count items completed per day
 */
function countCompletedPerDay<T extends { completedAt?: string | null }>(
  items: T[],
  dates: string[]
): DataPoint[] {
  const counts = new Map<string, number>();

  // Initialize all dates with 0
  for (const date of dates) {
    counts.set(date, 0);
  }

  // Count completed items per day
  for (const item of items) {
    if (item.completedAt) {
      const completedDate = item.completedAt.split('T')[0];
      if (counts.has(completedDate)) {
        counts.set(completedDate, (counts.get(completedDate) || 0) + 1);
      }
    }
  }

  // Convert to DataPoint array
  return dates.map((date) => ({
    date,
    value: counts.get(date) || 0,
  }));
}

/**
 * Count stories completed per day (by status change to completed)
 */
function countStoriesCompletedPerDay(
  stories: Story[],
  dates: string[]
): DataPoint[] {
  const counts = new Map<string, number>();

  // Initialize all dates with 0
  for (const date of dates) {
    counts.set(date, 0);
  }

  // Count stories that are completed
  // Since Story doesn't have completedAt, we use updatedAt for completed stories
  for (const story of stories) {
    if (story.status === 'completed') {
      const updatedDate = story.updatedAt.split('T')[0];
      if (counts.has(updatedDate)) {
        counts.set(updatedDate, (counts.get(updatedDate) || 0) + 1);
      }
    }
  }

  // Convert to DataPoint array
  return dates.map((date) => ({
    date,
    value: counts.get(date) || 0,
  }));
}

/**
 * Calculate summary statistics
 */
interface SummaryStats {
  totalCompleted: number;
  avgPerDay: number;
  maxInDay: number;
  trend: 'up' | 'down' | 'stable';
}

function calculateStats(data: DataPoint[]): SummaryStats {
  const values = data.map((d) => d.value);
  const total = values.reduce((a, b) => a + b, 0);
  const avg = total / values.length;
  const max = Math.max(...values);

  // Calculate trend by comparing first half average to second half average
  const midpoint = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, midpoint);
  const secondHalf = values.slice(midpoint);

  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (secondAvg > firstAvg * 1.1) {
    trend = 'up';
  } else if (secondAvg < firstAvg * 0.9) {
    trend = 'down';
  }

  return {
    totalCompleted: total,
    avgPerDay: avg,
    maxInDay: max,
    trend,
  };
}

/**
 * ChartsView component
 *
 * Displays charts and statistics for completed work over time.
 * Shows tasks completed per day and summary statistics.
 *
 * @param props - Component props
 * @returns ChartsView JSX
 *
 * @example
 * ```tsx
 * <ChartsView
 *   onEscape={() => setView('board')}
 * />
 * ```
 */
export function ChartsView({ onEscape }: ChartsViewProps) {
  const { width: terminalWidth } = useTerminalDimensions();
  const [daysToShow, setDaysToShow] = useState(14);

  // Fetch all tasks and stories
  const { data: tasks, isLoading: tasksLoading } = useTasks();
  const { data: stories, isLoading: storiesLoading } = useStories();

  // Generate date range
  const dateRange = useMemo(() => getDateRange(daysToShow), [daysToShow]);

  // Count completed tasks per day
  const taskData = useMemo(
    () => countCompletedPerDay(tasks, dateRange),
    [tasks, dateRange]
  );

  // Count completed stories per day
  const storyData = useMemo(
    () => countStoriesCompletedPerDay(stories, dateRange),
    [stories, dateRange]
  );

  // Calculate summary statistics
  const taskStats = useMemo(() => calculateStats(taskData), [taskData]);
  const storyStats = useMemo(() => calculateStats(storyData), [storyData]);

  // Keyboard handler
  useKeyboard((event: KeyEvent) => {
    if (event.name === 'escape') {
      if (onEscape) {
        onEscape();
      }
      return;
    }

    // Toggle between 7 and 14 days
    if (event.name === 't') {
      setDaysToShow((d) => (d === 7 ? 14 : 7));
      return;
    }
  });

  // Chart height (width is automatic based on data points)
  const chartHeight = 6;

  // Loading state
  if (tasksLoading || storiesLoading) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        alignItems="center"
        justifyContent="center"
      >
        <text fg="yellow">Loading chart data...</text>
      </box>
    );
  }

  // Format trend indicator
  const getTrendIndicator = (trend: 'up' | 'down' | 'stable'): { text: string; color: string } => {
    switch (trend) {
      case 'up':
        return { text: 'Trending up', color: 'green' };
      case 'down':
        return { text: 'Trending down', color: 'red' };
      default:
        return { text: 'Stable', color: 'gray' };
    }
  };

  const taskTrend = getTrendIndicator(taskStats.trend);
  const storyTrend = getTrendIndicator(storyStats.trend);

  return (
    <box flexDirection="column" width="100%" padding={1}>
      {/* Header */}
      <box flexDirection="row" marginBottom={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Work Statistics
        </text>
        <text fg="gray">{`  (Last ${daysToShow} days)`}</text>
      </box>

      {/* Tasks Chart */}
      <box
        flexDirection="column"
        border={true}
        borderStyle="single"
        padding={1}
        marginBottom={1}
      >
        <WorkChart
          data={taskData}
          title="Tasks Completed per Day"
          height={chartHeight}
          color="cyan"
        />

        {/* Task statistics */}
        <box flexDirection="row" marginTop={1} gap={4}>
          <box flexDirection="row">
            <text fg="gray">Total: </text>
            <text fg="white" attributes={TextAttributes.BOLD}>
              {taskStats.totalCompleted.toString()}
            </text>
          </box>
          <box flexDirection="row">
            <text fg="gray">Avg/day: </text>
            <text fg="white">
              {taskStats.avgPerDay.toFixed(1)}
            </text>
          </box>
          <box flexDirection="row">
            <text fg="gray">Max: </text>
            <text fg="white">
              {taskStats.maxInDay.toString()}
            </text>
          </box>
          <box flexDirection="row">
            <text fg="gray">Trend: </text>
            <text fg={taskTrend.color}>
              {taskTrend.text}
            </text>
          </box>
        </box>
      </box>

      {/* Stories Chart */}
      <box
        flexDirection="column"
        border={true}
        borderStyle="single"
        padding={1}
        marginBottom={1}
      >
        <WorkChart
          data={storyData}
          title="Stories Completed per Day"
          height={chartHeight}
          color="green"
        />

        {/* Story statistics */}
        <box flexDirection="row" marginTop={1} gap={4}>
          <box flexDirection="row">
            <text fg="gray">Total: </text>
            <text fg="white" attributes={TextAttributes.BOLD}>
              {storyStats.totalCompleted.toString()}
            </text>
          </box>
          <box flexDirection="row">
            <text fg="gray">Avg/day: </text>
            <text fg="white">
              {storyStats.avgPerDay.toFixed(1)}
            </text>
          </box>
          <box flexDirection="row">
            <text fg="gray">Max: </text>
            <text fg="white">
              {storyStats.maxInDay.toString()}
            </text>
          </box>
          <box flexDirection="row">
            <text fg="gray">Trend: </text>
            <text fg={storyTrend.color}>
              {storyTrend.text}
            </text>
          </box>
        </box>
      </box>

      {/* Footer with help */}
      <box marginTop={1}>
        <text fg="gray">
          t: toggle 7/14 days  ESC: back
        </text>
      </box>
    </box>
  );
}
