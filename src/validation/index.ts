/**
 * Validation Utilities Module - LOOM-003
 *
 * Provides validation utilities for the dynamic agent workflow enforcement:
 * - isVersionedAgentName(): Validates versioned agent name pattern
 * - logValidationFailure(): Logs validation failures to metrics
 * - ValidationError: Custom error class for validation failures
 *
 * AC Coverage: AC-002 (versioned agent validation), AC-005 (validation logging)
 */

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Pattern for versioned agent names
 * Format: {role}-{story-id-lowercase}-v{N}
 * Examples: backend-dev-session-001-v1, qa-engineer-loom-003-v2
 *
 * Breakdown:
 * - ^[a-z]+(-[a-z]+)*  - role part (lowercase with dashes, e.g., backend-dev, qa-engineer)
 * - -[a-z0-9-]+        - story/context part (lowercase alphanumeric with dashes)
 * - -v\d+$             - version suffix (v1, v2, etc.)
 */
const VERSIONED_AGENT_PATTERN = /^[a-z]+(-[a-z]+)*-[a-z0-9-]+-v\d+$/;

/**
 * Generic role names that should NOT be used for task assignments
 * These are valid for finding agent definitions by role, but not for assigning tasks
 */
const GENERIC_ROLES = [
  'backend-dev',
  'frontend-dev',
  'qa-engineer',
  'cli-dev',
  'devops',
  'architect',
  'tech-writer',
];

/**
 * Check if a name is a versioned agent name (e.g., backend-dev-session-001-v1)
 *
 * @param name - The agent name to validate
 * @returns true if name matches versioned pattern
 *
 * AC Coverage: AC-002
 */
export function isVersionedAgentName(name: string): boolean {
  return VERSIONED_AGENT_PATTERN.test(name);
}

/**
 * Check if a name is a generic role (non-versioned)
 *
 * @param name - The name to check
 * @returns true if name is a generic role
 */
export function isGenericRole(name: string): boolean {
  return GENERIC_ROLES.includes(name);
}

/**
 * Validation failure types for logging
 */
export type ValidationFailureType =
  | 'generic-role-assignment'      // Task assigned to generic role instead of versioned agent
  | 'missing-agent-definition'     // Agent definition not found
  | 'missing-story-agents'         // Story has no agent definitions
  | 'missing-mini-retrospective'   // Task completed without mini-retro
  | 'invalid-agent-format';        // Agent name doesn't match expected format

/**
 * Validation failure log entry
 */
export interface ValidationFailureEntry {
  timestamp: string;
  storyId: string;
  type: ValidationFailureType;
  details: Record<string, unknown>;
  remediation?: string;
}

/**
 * Log a validation failure to the metrics JSONL file
 *
 * @param storyId - The story ID where validation failed
 * @param type - The type of validation failure
 * @param details - Additional context about the failure
 * @param remediation - Optional remediation steps
 *
 * AC Coverage: AC-005
 */
export function logValidationFailure(
  storyId: string,
  type: ValidationFailureType,
  details: Record<string, unknown>,
  remediation?: string
): void {
  const entry: ValidationFailureEntry = {
    timestamp: new Date().toISOString(),
    storyId,
    type,
    details,
    remediation,
  };

  // Resolve the metrics path - look for .agent/loom/metrics in cwd or parent
  const metricsPath = resolveMetricsPath();
  const filePath = join(metricsPath, 'validation-failures.jsonl');

  // Ensure directory exists
  if (!existsSync(metricsPath)) {
    mkdirSync(metricsPath, { recursive: true });
  }

  // Append to JSONL file
  appendFileSync(filePath, JSON.stringify(entry) + '\n');
}

/**
 * Resolve the metrics directory path
 * Looks for .agent/loom/metrics in current directory or parents
 */
function resolveMetricsPath(): string {
  let currentDir = process.cwd();
  const maxDepth = 10;
  let depth = 0;

  while (depth < maxDepth) {
    const agentPath = join(currentDir, '.agent', 'loom', 'metrics');
    if (existsSync(dirname(agentPath))) {
      return agentPath;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
    depth++;
  }

  // Default to cwd
  return join(process.cwd(), '.agent', 'loom', 'metrics');
}

/**
 * Custom error class for validation failures
 *
 * Extends Error with additional context for validation failures,
 * including the failure type and remediation steps.
 */
export class ValidationError extends Error {
  public readonly type: ValidationFailureType;
  public readonly storyId?: string;
  public readonly details: Record<string, unknown>;
  public readonly remediation?: string;

  constructor(
    message: string,
    type: ValidationFailureType,
    details: Record<string, unknown> = {},
    remediation?: string,
    storyId?: string
  ) {
    super(message);
    this.name = 'ValidationError';
    this.type = type;
    this.storyId = storyId;
    this.details = details;
    this.remediation = remediation;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

/**
 * Validate that an assignee is a versioned agent name
 * Throws ValidationError if validation fails
 *
 * @param assignee - The assignee to validate
 * @param storyId - Story context for error logging
 * @throws ValidationError if assignee is generic role or invalid format
 *
 * AC Coverage: AC-002
 */
export function validateVersionedAssignee(assignee: string, storyId?: string): void {
  // Check if it's a generic role
  if (isGenericRole(assignee)) {
    const remediation = `Use 'board agent create -r ${assignee} -n ${assignee}-{story-id}-v1 ...' to create a story-specific agent, then assign to that.`;

    if (storyId) {
      logValidationFailure(storyId, 'generic-role-assignment', { assignee }, remediation);
    }

    throw new ValidationError(
      `Cannot assign task to generic role '${assignee}'. Use a versioned agent name (e.g., ${assignee}-story-001-v1).`,
      'generic-role-assignment',
      { assignee },
      remediation,
      storyId
    );
  }

  // Check if it matches versioned pattern
  if (!isVersionedAgentName(assignee)) {
    const remediation = `Agent names must follow the pattern: {role}-{context}-v{N} (e.g., backend-dev-session-001-v1)`;

    if (storyId) {
      logValidationFailure(storyId, 'invalid-agent-format', { assignee }, remediation);
    }

    throw new ValidationError(
      `Invalid agent name format '${assignee}'. Expected pattern: role-context-vN (e.g., backend-dev-session-001-v1)`,
      'invalid-agent-format',
      { assignee },
      remediation,
      storyId
    );
  }
}

/**
 * Format validation errors for CLI output
 *
 * @param error - ValidationError to format
 * @returns Formatted error message with remediation
 */
export function formatValidationError(error: ValidationError): string {
  const lines = [
    `Validation Error: ${error.message}`,
    `Type: ${error.type}`,
  ];

  if (error.storyId) {
    lines.push(`Story: ${error.storyId}`);
  }

  if (error.remediation) {
    lines.push('', 'Remediation:', `  ${error.remediation}`);
  }

  return lines.join('\n');
}
