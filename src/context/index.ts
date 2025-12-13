/**
 * Application Context - Global state for the board system
 *
 * Provides thread-local-like context for:
 * - Current actor (who is making changes)
 * - Active session (current work session)
 *
 * This enables automatic history logging and session tracking
 * without passing actor/session through every function call.
 */

/**
 * Current actor making changes
 * Defaults to 'system' if not set
 */
let currentActor: string = 'system';

/**
 * Active session ID (if any)
 */
let activeSessionId: string | null = null;

/**
 * Set the current actor for all subsequent operations
 * @param actor - Actor identifier (e.g., 'backend-dev', 'ci-bot', 'alice')
 */
export function setActor(actor: string): void {
  currentActor = actor;
}

/**
 * Get the current actor
 * @returns Current actor or 'system' if not set
 */
export function getActor(): string {
  return currentActor || 'system';
}

/**
 * Set the active session ID
 * @param sessionId - Session UUID or null to clear
 */
export function setActiveSession(sessionId: string | null): void {
  activeSessionId = sessionId;
}

/**
 * Get the active session ID
 * @returns Active session ID or null
 */
export function getActiveSession(): string | null {
  return activeSessionId;
}

/**
 * Initialize context from environment variables
 * Called at startup to pick up BOARD_ACTOR env var
 */
export function initContextFromEnv(): void {
  const envActor = process.env.BOARD_ACTOR;
  if (envActor) {
    setActor(envActor);
  }
}

/**
 * Reset context to defaults (useful for testing)
 */
export function resetContext(): void {
  currentActor = 'system';
  activeSessionId = null;
}
