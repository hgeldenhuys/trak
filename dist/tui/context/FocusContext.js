import { jsx as _jsx } from "@opentui/react/jsx-runtime";
/**
 * FocusContext - Global focus management for TUI
 *
 * Provides a context for managing which element is focused
 * across the entire TUI application. Useful for complex
 * focus management scenarios where multiple components
 * need to coordinate focus state.
 */
import { createContext, useContext, useState, useCallback, useMemo } from 'react';
/**
 * Internal context - null when not provided
 */
const FocusContext = createContext(null);
/**
 * Provider component for focus context
 *
 * Wrap your app or a section with this provider to enable
 * focus management within that tree.
 *
 * @example
 * ```tsx
 * <FocusProvider initialElement="board">
 *   <App />
 * </FocusProvider>
 * ```
 */
export function FocusProvider({ children, initialElement = null, initialIndex = 0, initialSecondaryIndex = 0, }) {
    const [state, setState] = useState({
        focusedElement: initialElement,
        focusedIndex: initialIndex,
        focusedSecondaryIndex: initialSecondaryIndex,
    });
    // Track registered elements and their bounds
    const [elements, setElements] = useState(new Map());
    // Set focus to a specific element and optionally index
    const setFocus = useCallback((element, index = 0, secondaryIndex = 0) => {
        setState({
            focusedElement: element,
            focusedIndex: index,
            focusedSecondaryIndex: secondaryIndex,
        });
    }, []);
    // Clear focus
    const clearFocus = useCallback(() => {
        setState({
            focusedElement: null,
            focusedIndex: 0,
            focusedSecondaryIndex: 0,
        });
    }, []);
    // Check if a specific position is focused
    const isFocused = useCallback((element, index, secondaryIndex) => {
        if (state.focusedElement !== element)
            return false;
        if (index !== undefined && state.focusedIndex !== index)
            return false;
        if (secondaryIndex !== undefined && state.focusedSecondaryIndex !== secondaryIndex)
            return false;
        return true;
    }, [state.focusedElement, state.focusedIndex, state.focusedSecondaryIndex]);
    // Check if an element (regardless of index) is focused
    const isElementFocused = useCallback((element) => {
        return state.focusedElement === element;
    }, [state.focusedElement]);
    // Move focus index within current element
    const moveFocusIndex = useCallback((delta) => {
        setState((prev) => {
            if (!prev.focusedElement)
                return prev;
            const elementInfo = elements.get(prev.focusedElement);
            const maxIndex = elementInfo?.maxIndex ?? Infinity;
            const newIndex = Math.max(0, Math.min(maxIndex, prev.focusedIndex + delta));
            return { ...prev, focusedIndex: newIndex };
        });
    }, [elements]);
    // Move focus secondary index
    const moveFocusSecondaryIndex = useCallback((delta) => {
        setState((prev) => {
            if (!prev.focusedElement)
                return prev;
            const elementInfo = elements.get(prev.focusedElement);
            const maxSecondaryIndex = elementInfo?.maxSecondaryIndex ?? Infinity;
            const newIndex = Math.max(0, Math.min(maxSecondaryIndex, prev.focusedSecondaryIndex + delta));
            return { ...prev, focusedSecondaryIndex: newIndex };
        });
    }, [elements]);
    // Register a focusable element
    const registerElement = useCallback((element, maxIndex, maxSecondaryIndex = 0) => {
        setElements((prev) => {
            const next = new Map(prev);
            next.set(element, { maxIndex, maxSecondaryIndex });
            return next;
        });
    }, []);
    // Unregister a focusable element
    const unregisterElement = useCallback((element) => {
        setElements((prev) => {
            const next = new Map(prev);
            next.delete(element);
            return next;
        });
    }, []);
    // Memoize context value to prevent unnecessary rerenders
    const contextValue = useMemo(() => ({
        state,
        setFocus,
        clearFocus,
        isFocused,
        isElementFocused,
        moveFocusIndex,
        moveFocusSecondaryIndex,
        registerElement,
        unregisterElement,
    }), [
        state,
        setFocus,
        clearFocus,
        isFocused,
        isElementFocused,
        moveFocusIndex,
        moveFocusSecondaryIndex,
        registerElement,
        unregisterElement,
    ]);
    return _jsx(FocusContext.Provider, { value: contextValue, children: children });
}
/**
 * Hook to access focus context
 *
 * Must be used within a FocusProvider.
 *
 * @throws Error if used outside FocusProvider
 * @returns Focus context value
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { state, setFocus, isFocused } = useFocus();
 *
 *   return (
 *     <box border={isFocused('my-component') ? 'double' : 'single'}>
 *       <text>Focused: {state.focusedElement}</text>
 *     </box>
 *   );
 * }
 * ```
 */
export function useFocus() {
    const context = useContext(FocusContext);
    if (!context) {
        throw new Error('useFocus must be used within a FocusProvider');
    }
    return context;
}
/**
 * Hook to check if the current component is focused
 *
 * Convenience hook for components that only need to check
 * their own focus state.
 *
 * @param elementId - ID of the element to check
 * @returns Whether the element is focused
 *
 * @example
 * ```tsx
 * function TaskCard({ id }: { id: string }) {
 *   const isFocused = useFocusCheck(`task-${id}`);
 *   return <box border={isFocused ? 'double' : 'single'}>...</box>;
 * }
 * ```
 */
export function useFocusCheck(elementId) {
    const { isElementFocused } = useFocus();
    return isElementFocused(elementId);
}
// Export context for advanced use cases
export { FocusContext };
