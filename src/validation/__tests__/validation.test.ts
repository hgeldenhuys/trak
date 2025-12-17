/**
 * Unit Tests for Validation Utilities (LOOM-003)
 *
 * Tests the validation utilities:
 * - isVersionedAgentName()
 * - isGenericRole()
 * - validateVersionedAssignee()
 * - ValidationError class
 * - formatValidationError()
 *
 * AC Coverage: AC-002 (versioned agent validation), AC-005 (validation logging)
 */

import { describe, test, expect } from 'bun:test';
import {
  isVersionedAgentName,
  isGenericRole,
  validateVersionedAssignee,
  ValidationError,
  formatValidationError,
} from '../index';

describe('Validation Utilities (LOOM-003)', () => {
  describe('isVersionedAgentName', () => {
    test('should return true for valid versioned agent names', () => {
      // Standard format
      expect(isVersionedAgentName('backend-dev-session-001-v1')).toBe(true);
      expect(isVersionedAgentName('qa-engineer-loom-003-v2')).toBe(true);
      expect(isVersionedAgentName('frontend-dev-auth-feature-v10')).toBe(true);
      expect(isVersionedAgentName('cli-dev-prod-001-v1')).toBe(true);

      // Single word roles
      expect(isVersionedAgentName('architect-design-v1')).toBe(true);
      expect(isVersionedAgentName('devops-infra-setup-v3')).toBe(true);

      // Longer context parts
      expect(isVersionedAgentName('backend-dev-user-authentication-flow-v1')).toBe(true);
    });

    test('should return false for generic role names', () => {
      expect(isVersionedAgentName('backend-dev')).toBe(false);
      expect(isVersionedAgentName('frontend-dev')).toBe(false);
      expect(isVersionedAgentName('qa-engineer')).toBe(false);
      expect(isVersionedAgentName('cli-dev')).toBe(false);
      expect(isVersionedAgentName('devops')).toBe(false);
      expect(isVersionedAgentName('architect')).toBe(false);
    });

    test('should return false for invalid formats', () => {
      // Missing version
      expect(isVersionedAgentName('backend-dev-session-001')).toBe(false);

      // Invalid version format
      expect(isVersionedAgentName('backend-dev-session-001-v')).toBe(false);
      expect(isVersionedAgentName('backend-dev-session-001-1')).toBe(false);

      // Uppercase characters
      expect(isVersionedAgentName('Backend-dev-session-001-v1')).toBe(false);
      expect(isVersionedAgentName('backend-dev-SESSION-001-v1')).toBe(false);

      // Empty string
      expect(isVersionedAgentName('')).toBe(false);

      // Random strings
      expect(isVersionedAgentName('john-doe')).toBe(false);
      expect(isVersionedAgentName('some-random-string')).toBe(false);
    });
  });

  describe('isGenericRole', () => {
    test('should return true for known generic roles', () => {
      expect(isGenericRole('backend-dev')).toBe(true);
      expect(isGenericRole('frontend-dev')).toBe(true);
      expect(isGenericRole('qa-engineer')).toBe(true);
      expect(isGenericRole('cli-dev')).toBe(true);
      expect(isGenericRole('devops')).toBe(true);
      expect(isGenericRole('architect')).toBe(true);
      expect(isGenericRole('tech-writer')).toBe(true);
    });

    test('should return false for versioned agent names', () => {
      expect(isGenericRole('backend-dev-session-001-v1')).toBe(false);
      expect(isGenericRole('qa-engineer-loom-003-v2')).toBe(false);
    });

    test('should return false for unknown roles', () => {
      expect(isGenericRole('unknown-role')).toBe(false);
      expect(isGenericRole('custom-specialist')).toBe(false);
      expect(isGenericRole('')).toBe(false);
    });
  });

  describe('validateVersionedAssignee', () => {
    test('should not throw for valid versioned agent names', () => {
      expect(() => validateVersionedAssignee('backend-dev-session-001-v1')).not.toThrow();
      expect(() => validateVersionedAssignee('qa-engineer-loom-003-v2')).not.toThrow();
      expect(() => validateVersionedAssignee('frontend-dev-auth-v1')).not.toThrow();
    });

    test('should throw ValidationError for generic roles', () => {
      expect(() => validateVersionedAssignee('backend-dev')).toThrow(ValidationError);
      expect(() => validateVersionedAssignee('qa-engineer')).toThrow(ValidationError);
      expect(() => validateVersionedAssignee('frontend-dev')).toThrow(ValidationError);
    });

    test('should throw ValidationError with correct type for generic roles', () => {
      try {
        validateVersionedAssignee('backend-dev');
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const validationErr = err as ValidationError;
        expect(validationErr.type).toBe('generic-role-assignment');
        expect(validationErr.details.assignee).toBe('backend-dev');
        expect(validationErr.remediation).toContain('board agent create');
      }
    });

    test('should throw ValidationError for invalid format', () => {
      expect(() => validateVersionedAssignee('invalid-name')).toThrow(ValidationError);
      expect(() => validateVersionedAssignee('just-a-random-string')).toThrow(ValidationError);
    });

    test('should throw ValidationError with correct type for invalid format', () => {
      try {
        validateVersionedAssignee('invalid-format-name');
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const validationErr = err as ValidationError;
        expect(validationErr.type).toBe('invalid-agent-format');
      }
    });

    test('should include storyId in error when provided', () => {
      try {
        validateVersionedAssignee('backend-dev', 'TEST-001');
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const validationErr = err as ValidationError;
        expect(validationErr.storyId).toBe('TEST-001');
      }
    });
  });

  describe('ValidationError', () => {
    test('should create error with all properties', () => {
      const error = new ValidationError(
        'Test error message',
        'generic-role-assignment',
        { assignee: 'backend-dev' },
        'Create a versioned agent',
        'TEST-001'
      );

      expect(error.message).toBe('Test error message');
      expect(error.type).toBe('generic-role-assignment');
      expect(error.details.assignee).toBe('backend-dev');
      expect(error.remediation).toBe('Create a versioned agent');
      expect(error.storyId).toBe('TEST-001');
      expect(error.name).toBe('ValidationError');
    });

    test('should work with minimal properties', () => {
      const error = new ValidationError(
        'Simple error',
        'invalid-agent-format'
      );

      expect(error.message).toBe('Simple error');
      expect(error.type).toBe('invalid-agent-format');
      expect(error.details).toEqual({});
      expect(error.remediation).toBeUndefined();
      expect(error.storyId).toBeUndefined();
    });

    test('should be instance of Error', () => {
      const error = new ValidationError('Test', 'generic-role-assignment');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
    });
  });

  describe('formatValidationError', () => {
    test('should format error with all fields', () => {
      const error = new ValidationError(
        'Cannot assign to generic role',
        'generic-role-assignment',
        { assignee: 'backend-dev' },
        'Use versioned agent name',
        'TEST-001'
      );

      const formatted = formatValidationError(error);

      expect(formatted).toContain('Validation Error: Cannot assign to generic role');
      expect(formatted).toContain('Type: generic-role-assignment');
      expect(formatted).toContain('Story: TEST-001');
      expect(formatted).toContain('Remediation:');
      expect(formatted).toContain('Use versioned agent name');
    });

    test('should format error without optional fields', () => {
      const error = new ValidationError(
        'Simple error',
        'invalid-agent-format'
      );

      const formatted = formatValidationError(error);

      expect(formatted).toContain('Validation Error: Simple error');
      expect(formatted).toContain('Type: invalid-agent-format');
      expect(formatted).not.toContain('Story:');
      expect(formatted).not.toContain('Remediation:');
    });
  });
});
