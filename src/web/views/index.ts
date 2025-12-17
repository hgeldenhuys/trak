/**
 * Web Views Module
 *
 * Exports all HTML view rendering functions for the web server.
 */

export { renderHome } from './home';
export type { HomeViewData } from './home';

export { renderBoard } from './board';
export type { BoardViewData } from './board';

export { renderStoryDetail, renderStoryNotFound } from './story-detail';
export type { StoryDetailViewData } from './story-detail';

export { renderList } from './list';
export type { ListViewData } from './list';

export { renderBlocked } from './blocked';
export type { BlockedViewData } from './blocked';

export { renderRetros } from './retros';
export type { RetrosViewData } from './retros';

export { renderSystemInfo } from './system';
export type { SystemInfoData } from './system';

export { renderAgents } from './agents';
export type { AgentsViewData } from './agents';

export { renderLayout, escapeHtml, formatRelativeTime, truncate } from './layout';
export { styles } from './styles';
