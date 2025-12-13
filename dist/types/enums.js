/**
 * Enums for Board CLI/TUI System
 *
 * These enums define the possible states and priority levels
 * for tasks and stories in the board system.
 */
/**
 * Status values for tasks
 */
export var TaskStatus;
(function (TaskStatus) {
    TaskStatus["PENDING"] = "pending";
    TaskStatus["IN_PROGRESS"] = "in_progress";
    TaskStatus["BLOCKED"] = "blocked";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["CANCELLED"] = "cancelled";
})(TaskStatus || (TaskStatus = {}));
/**
 * Status values for stories
 */
export var StoryStatus;
(function (StoryStatus) {
    StoryStatus["DRAFT"] = "draft";
    StoryStatus["PLANNED"] = "planned";
    StoryStatus["IN_PROGRESS"] = "in_progress";
    StoryStatus["REVIEW"] = "review";
    StoryStatus["COMPLETED"] = "completed";
    StoryStatus["CANCELLED"] = "cancelled";
})(StoryStatus || (StoryStatus = {}));
/**
 * Priority levels for stories and tasks
 * P0 = Critical/Urgent
 * P1 = High priority
 * P2 = Medium priority
 * P3 = Low priority
 */
export var Priority;
(function (Priority) {
    Priority["P0"] = "P0";
    Priority["P1"] = "P1";
    Priority["P2"] = "P2";
    Priority["P3"] = "P3";
})(Priority || (Priority = {}));
/**
 * Types of history actions that can be recorded
 */
export var HistoryAction;
(function (HistoryAction) {
    HistoryAction["CREATED"] = "created";
    HistoryAction["UPDATED"] = "updated";
    HistoryAction["STATUS_CHANGED"] = "status_changed";
    HistoryAction["DELETED"] = "deleted";
    HistoryAction["ASSIGNED"] = "assigned";
    HistoryAction["COMMENT_ADDED"] = "comment_added";
})(HistoryAction || (HistoryAction = {}));
/**
 * Entity types for history tracking
 */
export var EntityType;
(function (EntityType) {
    EntityType["FEATURE"] = "feature";
    EntityType["STORY"] = "story";
    EntityType["TASK"] = "task";
    EntityType["ACCEPTANCE_CRITERIA"] = "acceptance_criteria";
    EntityType["SESSION"] = "session";
})(EntityType || (EntityType = {}));
