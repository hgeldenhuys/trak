/**
 * Console Channel - Terminal Output
 *
 * Outputs notification summary to console for debugging and local visibility.
 */

import { getConfig } from '../config';
import type { NotificationMetadata } from '../types';

/**
 * Dispatch notification to console
 */
export function dispatchConsole(
  project: string,
  summary: string,
  metadata?: NotificationMetadata
): void {
  const config = getConfig();
  if (!config?.channels.console.enabled) {
    return;
  }

  console.log('');
  console.log('========================================');
  console.log(`Task Complete: ${project}`);
  console.log('========================================');
  console.log(summary);
  console.log('');

  if (metadata?.keyOutcomes && metadata.keyOutcomes.length > 0) {
    console.log('Key Outcomes:');
    for (const outcome of metadata.keyOutcomes) {
      console.log(`  - ${outcome}`);
    }
    console.log('');
  }

  if (metadata?.durationMs) {
    const seconds = Math.round(metadata.durationMs / 1000);
    console.log(`Duration: ${seconds}s`);
  }

  if (metadata?.contextUsagePercent !== undefined) {
    console.log(`Context Usage: ${metadata.contextUsagePercent}%`);
  }

  if (metadata?.filesModified !== undefined) {
    console.log(`Files Modified: ${metadata.filesModified}`);
  }

  console.log('========================================');
  console.log('');
}
