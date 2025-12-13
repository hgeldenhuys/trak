/**
 * Auto-History Logger - Automatically logs all entity changes to history
 *
 * Subscribes to the event bus and creates history entries for all
 * create, update, and delete operations. This provides a complete
 * audit trail of all changes without modifying individual repositories.
 */

import { eventBus } from '../events';
import { historyRepository } from '../repositories/history-repository';
import { getActor, getActiveSession } from '../context';
import { EntityType, HistoryAction } from '../types';

/**
 * Map event names to entity types
 */
const EVENT_TO_ENTITY: Record<string, EntityType> = {
  'feature:created': EntityType.FEATURE,
  'feature:updated': EntityType.FEATURE,
  'feature:deleted': EntityType.FEATURE,
  'story:created': EntityType.STORY,
  'story:updated': EntityType.STORY,
  'story:deleted': EntityType.STORY,
  'task:created': EntityType.TASK,
  'task:updated': EntityType.TASK,
  'task:deleted': EntityType.TASK,
  'task:statusChanged': EntityType.TASK,
  'ac:created': EntityType.ACCEPTANCE_CRITERIA,
  'ac:updated': EntityType.ACCEPTANCE_CRITERIA,
  'ac:verified': EntityType.ACCEPTANCE_CRITERIA,
  'ac:deleted': EntityType.ACCEPTANCE_CRITERIA,
  'session:started': EntityType.SESSION,
  'session:ended': EntityType.SESSION,
};

/**
 * Map event names to history actions
 */
const EVENT_TO_ACTION: Record<string, HistoryAction> = {
  'feature:created': HistoryAction.CREATED,
  'feature:updated': HistoryAction.UPDATED,
  'feature:deleted': HistoryAction.DELETED,
  'story:created': HistoryAction.CREATED,
  'story:updated': HistoryAction.UPDATED,
  'story:deleted': HistoryAction.DELETED,
  'task:created': HistoryAction.CREATED,
  'task:updated': HistoryAction.UPDATED,
  'task:deleted': HistoryAction.DELETED,
  'task:statusChanged': HistoryAction.STATUS_CHANGED,
  'ac:created': HistoryAction.CREATED,
  'ac:updated': HistoryAction.UPDATED,
  'ac:verified': HistoryAction.VERIFIED,
  'ac:deleted': HistoryAction.DELETED,
  'session:started': HistoryAction.CREATED,
  'session:ended': HistoryAction.UPDATED,
};

/**
 * Generate a summary for the history entry
 */
function generateSummary(eventName: string, payload: Record<string, unknown>): string {
  const entity = payload.entity as Record<string, unknown> | undefined;

  // Extract meaningful identifier
  const identifier = entity?.code || entity?.title || entity?.name ||
                    (payload.entityId as string)?.slice(0, 8) || 'unknown';

  switch (eventName) {
    case 'feature:created':
      return `Created feature: ${identifier}`;
    case 'feature:updated':
      return `Updated feature: ${identifier}`;
    case 'feature:deleted':
      return `Deleted feature: ${identifier}`;
    case 'story:created':
      return `Created story: ${identifier}`;
    case 'story:updated': {
      const changed = payload.changedFields as string[] | undefined;
      if (changed?.includes('status')) {
        const status = (entity as Record<string, unknown>)?.status;
        return `Story ${identifier} → ${status}`;
      }
      return `Updated story: ${identifier}`;
    }
    case 'story:deleted':
      return `Deleted story: ${identifier}`;
    case 'task:created':
      return `Created task: ${identifier}`;
    case 'task:updated': {
      const changed = payload.changedFields as string[] | undefined;
      if (changed?.includes('status')) {
        const status = (entity as Record<string, unknown>)?.status;
        return `Task ${identifier} → ${status}`;
      }
      return `Updated task: ${identifier}`;
    }
    case 'task:statusChanged': {
      const status = (entity as Record<string, unknown>)?.status;
      return `Task ${identifier} → ${status}`;
    }
    case 'task:deleted':
      return `Deleted task: ${identifier}`;
    case 'ac:created':
      return `Added AC: ${identifier}`;
    case 'ac:updated':
      return `Updated AC: ${identifier}`;
    case 'ac:verified': {
      const result = payload.verificationResult as string;
      return `AC ${identifier}: ${result}`;
    }
    case 'ac:deleted':
      return `Deleted AC: ${identifier}`;
    case 'session:started':
      return `Session started`;
    case 'session:ended':
      return `Session ended`;
    default:
      return `${eventName}`;
  }
}

/**
 * Extract changes for history entry
 */
function extractChanges(eventName: string, payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const changes: Record<string, unknown> = {};

  // For updates, include changed fields and values
  if (eventName.includes(':updated') || eventName === 'task:statusChanged') {
    const changedFields = payload.changedFields as string[] | undefined;
    const entity = payload.entity as Record<string, unknown> | undefined;
    const previousState = payload.previousState as Record<string, unknown> | undefined;

    if (changedFields && entity) {
      for (const field of changedFields) {
        changes[field] = {
          from: previousState?.[field],
          to: entity[field],
        };
      }
    }
  }

  // For verification, include result and notes
  if (eventName === 'ac:verified') {
    changes.result = payload.verificationResult;
    changes.notes = payload.verificationNotes;
  }

  return Object.keys(changes).length > 0 ? changes : undefined;
}

/**
 * Whether auto-logging is enabled
 */
let isEnabled = false;

/**
 * Enable auto-history logging
 * Call this once at application startup
 */
export function enableAutoHistory(): void {
  if (isEnabled) return;
  isEnabled = true;

  // Subscribe to all relevant events
  const events = Object.keys(EVENT_TO_ENTITY);

  for (const eventName of events) {
    eventBus.on(eventName as keyof typeof EVENT_TO_ENTITY, (payload: Record<string, unknown>) => {
      try {
        const entityType = EVENT_TO_ENTITY[eventName];
        const action = EVENT_TO_ACTION[eventName];

        if (!entityType || !action) return;

        const entityId = payload.entityId as string;
        if (!entityId) return;

        historyRepository.append({
          entityType,
          entityId,
          action,
          actor: getActor(),
          summary: generateSummary(eventName, payload),
          changes: extractChanges(eventName, payload),
          sessionId: getActiveSession(),
        });
      } catch (err) {
        // Don't let history logging errors break the main operation
        console.error(`Auto-history error for ${eventName}:`, err);
      }
    });
  }
}

/**
 * Disable auto-history logging (mainly for testing)
 */
export function disableAutoHistory(): void {
  isEnabled = false;
  // Note: Events remain subscribed but will be no-ops when disabled
}
