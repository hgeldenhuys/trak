/**
 * Project Identity - Persistent project identification for Claude Code hooks
 *
 * Similar to SessionNamer, this creates a persistent UUID + friendly name for each
 * project/repository. This allows filtering events by project across all sessions.
 *
 * Features:
 * - Auto-generation on first hook event
 * - Persistent storage in .claude/project-identity.json
 * - UUID (projectId) for unique identification
 * - Friendly name (projectName) derived from directory name
 * - Singleton pattern for efficient reuse
 *
 * TODO: This utility should be added to claude-hooks-sdk as "ProjectNamer"
 * See: https://github.com/hgeldenhuys/claude-hooks-sdk/issues/TBD
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface ProjectIdentity {
  projectId: string;      // UUID for unique identification
  projectName: string;    // Friendly name (e.g., "claude-loom")
  createdAt: string;      // ISO timestamp when identity was created
  directory: string;      // Full path to project directory
}

interface ProjectIdentityFile {
  version: string;
  identity: ProjectIdentity;
}

const IDENTITY_FILE = '.claude/project-identity.json';
const VERSION = '1.0';

/**
 * Derive project name from directory path
 * Falls back to 'unknown-project' if unable to determine
 */
function deriveProjectName(directory: string): string {
  const parts = directory.split(path.sep).filter(Boolean);

  // Walk backwards to find a non-hidden, non-system directory name
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part && !part.startsWith('.') && part !== 'Users' && part !== 'home') {
      return part;
    }
  }

  return 'unknown-project';
}

/**
 * Create a slug from the project name for URL-safe usage
 */
export function slugifyProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * ProjectIdentityManager - Manages project identity persistence
 */
export class ProjectIdentityManager {
  private identityPath: string;
  private directory: string;
  private cachedIdentity: ProjectIdentity | null = null;

  constructor(directory?: string) {
    this.directory = directory || process.env.CLAUDE_PROJECT_DIR || process.cwd();
    this.identityPath = path.join(this.directory, IDENTITY_FILE);
  }

  /**
   * Load identity from disk
   */
  private loadIdentity(): ProjectIdentity | null {
    try {
      if (existsSync(this.identityPath)) {
        const content = readFileSync(this.identityPath, 'utf-8');
        const file: ProjectIdentityFile = JSON.parse(content);
        return file.identity;
      }
    } catch (error) {
      // Ignore load errors, will create new identity
    }
    return null;
  }

  /**
   * Save identity to disk (atomic write)
   */
  private saveIdentity(identity: ProjectIdentity): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.identityPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const file: ProjectIdentityFile = {
        version: VERSION,
        identity,
      };

      // Atomic write (write to temp file, then rename)
      const tempPath = `${this.identityPath}.tmp`;
      writeFileSync(tempPath, JSON.stringify(file, null, 2), 'utf-8');

      // Use rename for atomic operation
      const { renameSync } = require('fs');
      renameSync(tempPath, this.identityPath);
    } catch (error) {
      console.error('[project-identity] Failed to save project-identity.json:', error);
      throw error;
    }
  }

  /**
   * Get or create project identity
   * Returns cached identity if available, otherwise loads/creates
   */
  public getOrCreateIdentity(): ProjectIdentity {
    // Return cached identity if available
    if (this.cachedIdentity) {
      return this.cachedIdentity;
    }

    // Try to load from disk
    const existing = this.loadIdentity();
    if (existing) {
      this.cachedIdentity = existing;
      return existing;
    }

    // Create new identity
    const identity: ProjectIdentity = {
      projectId: randomUUID(),
      projectName: deriveProjectName(this.directory),
      createdAt: new Date().toISOString(),
      directory: this.directory,
    };

    // Persist and cache
    this.saveIdentity(identity);
    this.cachedIdentity = identity;

    return identity;
  }

  /**
   * Get identity without creating (returns null if not exists)
   */
  public getIdentity(): ProjectIdentity | null {
    if (this.cachedIdentity) {
      return this.cachedIdentity;
    }
    const existing = this.loadIdentity();
    if (existing) {
      this.cachedIdentity = existing;
    }
    return existing;
  }

  /**
   * Get the project slug (URL-safe version of project name)
   */
  public getProjectSlug(): string {
    const identity = this.getOrCreateIdentity();
    return slugifyProjectName(identity.projectName);
  }
}

// Global instance (singleton pattern)
let globalManager: ProjectIdentityManager | null = null;

/**
 * Get the global ProjectIdentityManager instance
 */
function getManager(): ProjectIdentityManager {
  if (!globalManager) {
    globalManager = new ProjectIdentityManager();
  }
  return globalManager;
}

/**
 * Get or create project identity (convenience function)
 */
export function getOrCreateProjectIdentity(directory?: string): ProjectIdentity {
  if (directory) {
    // Use custom directory, don't cache globally
    return new ProjectIdentityManager(directory).getOrCreateIdentity();
  }
  return getManager().getOrCreateIdentity();
}

/**
 * Get project identity without creating (convenience function)
 */
export function getProjectIdentity(directory?: string): ProjectIdentity | null {
  if (directory) {
    return new ProjectIdentityManager(directory).getIdentity();
  }
  return getManager().getIdentity();
}

/**
 * Get project slug (convenience function)
 */
export function getProjectSlug(directory?: string): string {
  if (directory) {
    return new ProjectIdentityManager(directory).getProjectSlug();
  }
  return getManager().getProjectSlug();
}
