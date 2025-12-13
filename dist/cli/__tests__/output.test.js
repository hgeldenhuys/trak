/**
 * Tests for CLI output utilities
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { formatTable, formatJson, setOutputOptions, getOutputFormat, isVerbose, formatStatus, formatPriority, } from '../utils/output';
describe('Output Utilities', () => {
    beforeEach(() => {
        // Reset to defaults
        setOutputOptions({ json: false, verbose: false });
    });
    describe('formatJson', () => {
        it('should format data as pretty JSON', () => {
            const data = { name: 'test', value: 123 };
            const result = formatJson(data);
            expect(result).toBe(JSON.stringify(data, null, 2));
        });
        it('should handle arrays', () => {
            const data = [1, 2, 3];
            const result = formatJson(data);
            expect(result).toContain('[');
            expect(result).toContain('1');
        });
        it('should handle null', () => {
            expect(formatJson(null)).toBe('null');
        });
    });
    describe('formatTable', () => {
        it('should format array of objects as table', () => {
            const rows = [
                { id: '1', name: 'Story A', status: 'done' },
                { id: '2', name: 'Story B', status: 'in-progress' },
            ];
            const columns = ['id', 'name', 'status'];
            const result = formatTable(rows, columns);
            expect(result).toContain('ID');
            expect(result).toContain('NAME');
            expect(result).toContain('STATUS');
            expect(result).toContain('Story A');
            expect(result).toContain('Story B');
        });
        it('should return "(no results)" for empty array', () => {
            const result = formatTable([], ['id', 'name']);
            expect(result).toBe('(no results)');
        });
        it('should use custom headers when provided', () => {
            const rows = [{ code: 'ABC', title: 'Test' }];
            const columns = ['code', 'title'];
            const result = formatTable(rows, columns, {
                headers: { code: 'Feature Code', title: 'Feature Title' },
            });
            expect(result).toContain('Feature Code');
            expect(result).toContain('Feature Title');
        });
        it('should truncate long values', () => {
            const rows = [{ name: 'This is a very long name that should be truncated' }];
            const result = formatTable(rows, ['name'], { maxWidth: 20 });
            expect(result).toContain('...');
        });
        it('should handle null values', () => {
            const rows = [{ id: '1', name: null }];
            const result = formatTable(rows, ['id', 'name']);
            expect(result).toContain('1');
            // null should be converted to empty string
            expect(result).not.toContain('null');
        });
    });
    describe('setOutputOptions / getOutputFormat', () => {
        it('should return "table" by default', () => {
            expect(getOutputFormat()).toBe('table');
        });
        it('should return "json" when json option is set', () => {
            setOutputOptions({ json: true, verbose: false });
            expect(getOutputFormat()).toBe('json');
        });
    });
    describe('isVerbose', () => {
        it('should return false by default', () => {
            expect(isVerbose()).toBe(false);
        });
        it('should return true when verbose option is set', () => {
            setOutputOptions({ json: false, verbose: true });
            expect(isVerbose()).toBe(true);
        });
    });
    describe('formatStatus', () => {
        it('should format story statuses with colors', () => {
            const statuses = ['backlog', 'ready', 'in-progress', 'review', 'done', 'blocked'];
            for (const status of statuses) {
                const result = formatStatus(status);
                expect(result).toContain(status);
                // Should contain ANSI color codes
                expect(result).toContain('\x1b[');
            }
        });
        it('should format task statuses with colors', () => {
            const statuses = ['pending', 'active', 'completed', 'skipped'];
            for (const status of statuses) {
                const result = formatStatus(status);
                expect(result).toContain(status);
            }
        });
    });
    describe('formatPriority', () => {
        it('should format priorities with colors', () => {
            const priorities = ['critical', 'high', 'medium', 'low'];
            for (const priority of priorities) {
                const result = formatPriority(priority);
                expect(result).toContain(priority);
                // Should contain ANSI color codes
                expect(result).toContain('\x1b[');
            }
        });
    });
});
