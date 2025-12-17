/**
 * Web Templates Module
 *
 * Exports all template functions for the web dashboard.
 */

export { layout, simpleLayout, escapeHtml } from './layout';
export type { LayoutOptions, ViewType } from './layout';

export { getClientScript, getClientScriptMinified } from './client';
