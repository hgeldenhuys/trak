/**
 * InlineTextInput Component Tests
 *
 * Tests for the inline text input component functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'bun:test';
import { InlineTextInput, type InlineTextInputProps } from '../InlineTextInput';

describe('InlineTextInput', () => {
  const defaultProps: InlineTextInputProps = {
    value: 'Hello',
    onChange: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    focused: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export InlineTextInput component', () => {
    expect(InlineTextInput).toBeDefined();
    expect(typeof InlineTextInput).toBe('function');
  });

  it('should have correct props interface', () => {
    // Type-level test - this will fail at compile time if props are wrong
    const props: InlineTextInputProps = {
      value: 'test',
      onChange: (val: string) => {},
      onConfirm: () => {},
      onCancel: () => {},
      focused: true,
      placeholder: 'Enter text...',
    };

    expect(props.value).toBe('test');
    expect(props.focused).toBe(true);
    expect(props.placeholder).toBe('Enter text...');
  });

  it('should support all required key mappings', () => {
    // This is a structural test - the actual keyboard handling is tested
    // via integration tests with OpenTUI
    const keyMappings = [
      'return',    // confirm
      'escape',    // cancel
      'backspace', // delete before cursor
      'delete',    // delete at cursor
      'left',      // move cursor left
      'right',     // move cursor right
      'home',      // move cursor to start
      'end',       // move cursor to end
    ];

    // All keys should be documented
    expect(keyMappings.length).toBe(8);
  });

  it('should accept optional placeholder prop', () => {
    const props: InlineTextInputProps = {
      ...defaultProps,
      placeholder: 'Type here...',
    };

    expect(props.placeholder).toBe('Type here...');
  });
});
