/**
 * StoryDetailView - Detailed view of a single story with vim-style edit mode
 *
 * Shows full story information including:
 * - Story code, title, and status
 * - Priority and assignee
 * - Full description and why
 * - Acceptance criteria with status
 * - Tasks with status
 *
 * Edit mode features:
 * - Press 'e' to enter edit mode, ESC to exit
 * - Navigate between fields with j/k
 * - Editable fields: title, description, why, status, priority, assignedTo
 * - Non-editable fields: code, createdAt, tasks, acceptance criteria
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `backgroundColor` for box background colors
 * - Use `attributes={TextAttributes.BOLD}` for bold, not `bold`
 */

import React, { useState, useCallback, useEffect } from 'react';
import { TextAttributes } from '@opentui/core';
import { useKeyboard } from '@opentui/react';
import type { KeyEvent } from '@opentui/core';
import { useStory, useTasksByStory, useEditMode } from '../hooks';
import { InlineTextInput, StatusSelector, PrioritySelector } from '../components';
import { acceptanceCriteriaRepository, storyRepository, noteRepository } from '../../repositories';
import type { AcceptanceCriteria, Story, UpdateStoryInput, Note } from '../../types';
import { StoryStatus, Priority, EntityType } from '../../types';

/**
 * Props for StoryDetailView component
 */
export interface StoryDetailViewProps {
  /** ID of the story to display */
  storyId: string;
  /** Callback when back is requested (ESC pressed) */
  onBack?: () => void;
  /** Callback when a task is selected */
  onSelectTask?: (taskId: string) => void;
}

/**
 * Map story status to display color
 */
const STATUS_COLORS: Record<string, string> = {
  draft: 'gray',
  planned: 'blue',
  in_progress: 'yellow',
  review: 'magenta',
  completed: 'green',
  cancelled: 'red',
  archived: 'gray',
};

/**
 * Map priority to display color
 */
const PRIORITY_COLORS: Record<string, string> = {
  P0: 'red',
  P1: 'yellow',
  P2: 'blue',
  P3: 'gray',
};

/**
 * Editable field types
 */
type FieldType = 'text' | 'status' | 'priority';

/**
 * Editable field definition
 */
interface EditableField {
  name: keyof StoryDraft;
  type: FieldType;
  label: string;
}

/**
 * Editable fields for the story detail view
 * Order determines navigation order with j/k keys
 */
const EDITABLE_FIELDS: EditableField[] = [
  { name: 'title', type: 'text', label: 'Title' },
  { name: 'description', type: 'text', label: 'Description' },
  { name: 'why', type: 'text', label: 'Why' },
  { name: 'status', type: 'status', label: 'Status' },
  { name: 'priority', type: 'priority', label: 'Priority' },
  { name: 'assignedTo', type: 'text', label: 'Assigned To' },
];

/**
 * Draft state type for story edits
 */
interface StoryDraft {
  title: string;
  description: string;
  why: string;
  status: StoryStatus;
  priority: Priority;
  assignedTo: string;
}

/**
 * StoryDetailView component
 *
 * Displays comprehensive story information including
 * acceptance criteria and tasks.
 *
 * @param props - Component props
 * @returns StoryDetailView JSX
 *
 * @example
 * ```tsx
 * <StoryDetailView
 *   storyId="story-123"
 *   onBack={() => setView('list')}
 *   onSelectTask={(taskId) => handleSelectTask(taskId)}
 * />
 * ```
 */
export function StoryDetailView({
  storyId,
  onBack,
  onSelectTask,
}: StoryDetailViewProps) {
  const { data: story, isLoading: storyLoading, refetch } = useStory(storyId);
  const { data: tasks, isLoading: tasksLoading } = useTasksByStory(storyId);

  // Draft state for edits (clone of story data)
  const [draft, setDraft] = useState<StoryDraft | null>(null);

  // Track which text field is actively being edited (has focus for typing)
  const [activeTextFieldIndex, setActiveTextFieldIndex] = useState<number | null>(null);

  // Spec visibility toggle (keyboard shortcut 's')
  const [showSpec, setShowSpec] = useState(false);

  // Fetch spec note for this story
  const [specNote, setSpecNote] = useState<Note | null>(null);
  useEffect(() => {
    if (storyId) {
      const specNotes = noteRepository.findByEntityAndType(EntityType.STORY, storyId, 'spec');
      setSpecNote(specNotes.length > 0 ? specNotes[0] : null);
    }
  }, [storyId]);

  // Initialize draft when entering edit mode
  const handleEnterEdit = useCallback(() => {
    if (!story) return;
    setDraft({
      title: story.title,
      description: story.description,
      why: story.why,
      status: story.status,
      priority: story.priority,
      assignedTo: story.assignedTo || '',
    });
    setActiveTextFieldIndex(null);
  }, [story]);

  // Handle exit edit mode - save changes if draft differs from story
  const handleExitEdit = useCallback(() => {
    if (!story || !draft) {
      setDraft(null);
      setActiveTextFieldIndex(null);
      return;
    }

    // Build update input with changed fields
    const updates: UpdateStoryInput = {};
    if (draft.title !== story.title) updates.title = draft.title;
    if (draft.description !== story.description) updates.description = draft.description;
    if (draft.why !== story.why) updates.why = draft.why;
    if (draft.status !== story.status) updates.status = draft.status;
    if (draft.priority !== story.priority) updates.priority = draft.priority;
    const draftAssignee = draft.assignedTo || null;
    if (draftAssignee !== story.assignedTo) updates.assignedTo = draftAssignee;

    // Only update if there are changes
    if (Object.keys(updates).length > 0) {
      storyRepository.update(story.id, updates);
      refetch();
    }

    setDraft(null);
    setActiveTextFieldIndex(null);
  }, [story, draft, refetch]);

  // Handle field confirmation (Enter key on a field)
  const handleFieldConfirm = useCallback((fieldIndex: number) => {
    const field = EDITABLE_FIELDS[fieldIndex];
    if (field.type === 'text') {
      // For text fields, if actively typing, confirm and close editor
      if (activeTextFieldIndex === fieldIndex) {
        setActiveTextFieldIndex(null);
      } else {
        // Open text editor for this field
        setActiveTextFieldIndex(fieldIndex);
      }
    }
    // For cycle selectors, they handle their own cycling on Enter
  }, [activeTextFieldIndex]);

  // Use edit mode hook
  const [editState, editActions] = useEditMode({
    totalFields: EDITABLE_FIELDS.length,
    onEnterEdit: handleEnterEdit,
    onExitEdit: handleExitEdit,
    onConfirm: handleFieldConfirm,
    enabled: !!story,
  });

  // Keyboard handler for spec toggle ('s' key)
  useKeyboard((event: KeyEvent) => {
    // Only handle 's' in view mode (not editing)
    if (!editState.isEditing && event.name === 's') {
      setShowSpec((prev) => !prev);
    }
  });

  // Handle canceling text input
  const handleTextCancel = useCallback(() => {
    if (!story || !draft) return;
    // Restore the original value for the current field
    const field = EDITABLE_FIELDS[editState.focusedFieldIndex];
    if (field && field.type === 'text') {
      setDraft((prev) => {
        if (!prev) return prev;
        const storyValue = story[field.name as keyof Story];
        return {
          ...prev,
          [field.name]: typeof storyValue === 'string' ? storyValue : (storyValue || ''),
        };
      });
    }
    setActiveTextFieldIndex(null);
  }, [story, draft, editState.focusedFieldIndex]);

  // Update draft field value
  const updateDraftField = useCallback((fieldName: keyof StoryDraft, value: string | StoryStatus | Priority) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, [fieldName]: value };
    });
  }, []);

  // Fetch acceptance criteria (synchronous repository call)
  const criteria: AcceptanceCriteria[] = storyId
    ? acceptanceCriteriaRepository.findByStoryId(storyId)
    : [];

  // Loading state
  if (storyLoading || tasksLoading) {
    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        alignItems="center"
        justifyContent="center"
      >
        <text fg="yellow">Loading story...</text>
      </box>
    );
  }

  // Not found state
  if (!story) {
    return (
      <box flexDirection="column" width="100%" padding={1}>
        <text fg="red">Story not found: {storyId}</text>
        <text fg="gray">Press ESC to go back</text>
      </box>
    );
  }

  // Get colors for display
  const statusColor = STATUS_COLORS[story.status] || 'white';
  const priorityColor = PRIORITY_COLORS[story.priority] || 'white';

  // Count acceptance criteria by status
  let verifiedCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  for (const ac of criteria) {
    if (ac.status === 'verified') verifiedCount++;
    else if (ac.status === 'failed') failedCount++;
    else pendingCount++;
  }

  // Count tasks by status
  let tasksCompleted = 0;
  let tasksInProgress = 0;
  let tasksPending = 0;
  for (const task of tasks) {
    if (task.status === 'completed') tasksCompleted++;
    else if (task.status === 'in_progress') tasksInProgress++;
    else tasksPending++;
  }

  // Helper to get field value (from draft if editing, otherwise from story)
  const getFieldValue = (fieldName: keyof StoryDraft): string | StoryStatus | Priority => {
    if (draft) {
      return draft[fieldName];
    }
    const storyValue = story[fieldName as keyof Story];
    if (fieldName === 'assignedTo') {
      return (storyValue as string | null) || '';
    }
    return storyValue as string | StoryStatus | Priority;
  };

  // Render an editable field
  const renderEditableField = (field: EditableField, fieldIndex: number) => {
    const isFocused = editState.isEditing && editState.focusedFieldIndex === fieldIndex;
    const isTextEditing = activeTextFieldIndex === fieldIndex;
    const value = getFieldValue(field.name);

    // Text field rendering
    if (field.type === 'text') {
      if (isTextEditing && draft) {
        return (
          <InlineTextInput
            value={String(value)}
            onChange={(val) => updateDraftField(field.name, val)}
            onConfirm={() => setActiveTextFieldIndex(null)}
            onCancel={handleTextCancel}
            focused={true}
            placeholder={`Enter ${field.label.toLowerCase()}...`}
          />
        );
      }
      // View mode for text field
      const displayValue = String(value) || `(no ${field.label.toLowerCase()})`;
      const textColor = value ? 'white' : 'gray';
      return <text fg={textColor}>{displayValue}</text>;
    }

    // Status field rendering
    if (field.type === 'status' && draft) {
      return (
        <StatusSelector
          value={draft.status}
          onChange={(val) => updateDraftField('status', val)}
          focused={isFocused}
          showAdjacent={isFocused}
        />
      );
    }
    if (field.type === 'status' && !draft) {
      return <text fg={statusColor}>{story.status}</text>;
    }

    // Priority field rendering
    if (field.type === 'priority' && draft) {
      return (
        <PrioritySelector
          value={draft.priority}
          onChange={(val) => updateDraftField('priority', val)}
          focused={isFocused}
          showAdjacent={isFocused}
        />
      );
    }
    if (field.type === 'priority' && !draft) {
      return <text fg={priorityColor}>{story.priority}</text>;
    }

    return <text fg="gray">{String(value)}</text>;
  };

  // Render a field row with label and value
  const renderFieldRow = (field: EditableField, fieldIndex: number) => {
    const isFocused = editState.isEditing && editState.focusedFieldIndex === fieldIndex;

    return (
      <box
        key={field.name}
        flexDirection="row"
        backgroundColor={isFocused ? 'blue' : undefined}
        paddingLeft={1}
        paddingRight={1}
        marginBottom={field.name === 'why' ? 1 : 0}
      >
        <box width={14}>
          <text fg={isFocused ? 'white' : 'gray'} attributes={TextAttributes.BOLD}>
            {`${field.label}:`}
          </text>
        </box>
        <box flexGrow={1}>
          {renderEditableField(field, fieldIndex)}
        </box>
      </box>
    );
  };

  // Build header text
  const headerText = editState.isEditing
    ? `${story.code} [EDIT]`
    : story.code;

  // Build footer help text
  const footerText = editState.isEditing
    ? activeTextFieldIndex !== null
      ? 'Enter: confirm  ESC: cancel edit'
      : 'j/k: navigate  Enter: edit field  ESC: save & exit'
    : 'e: edit  s: spec  ESC: back  Enter: select task  j/k: scroll';

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Scrollable content area */}
      <scrollbox
        flexGrow={1}
        focused={!editState.isEditing}
        style={{
          scrollbarOptions: {
            showArrows: false,
            trackOptions: {
              foregroundColor: '#7aa2f7',
              backgroundColor: '#1a1b26',
            },
          },
        }}
      >
        <box flexDirection="column" padding={1}>
          {/* Header with code and edit mode indicator */}
          <box flexDirection="row" marginBottom={1}>
            <text fg="cyan" attributes={TextAttributes.BOLD}>
              {headerText}
            </text>
            {!editState.isEditing && (
              <>
                <text fg="white"> - </text>
                <text fg="white" attributes={TextAttributes.BOLD}>
                  {story.title}
                </text>
              </>
            )}
          </box>

          {/* Editable fields section */}
          <box flexDirection="column" marginBottom={1}>
            {EDITABLE_FIELDS.map((field, index) => renderFieldRow(field, index))}
          </box>

          {/* Non-editable info (code, createdAt) */}
          <box
            flexDirection="column"
            marginBottom={1}
            border={true}
            borderStyle="single"
            padding={1}
          >
            <text fg="gray" attributes={TextAttributes.BOLD}>
              Info (read-only)
            </text>
            <box flexDirection="row" marginTop={1}>
              <box width={14}>
                <text fg="gray">Code:</text>
              </box>
              <text fg="gray">{story.code}</text>
            </box>
            <box flexDirection="row">
              <box width={14}>
                <text fg="gray">Created:</text>
              </box>
              <text fg="gray">{new Date(story.createdAt).toLocaleDateString()}</text>
            </box>
            <box flexDirection="row">
              <box width={14}>
                <text fg="gray">Updated:</text>
              </box>
              <text fg="gray">{new Date(story.updatedAt).toLocaleDateString()}</text>
            </box>
          </box>

          {/* Specification section (collapsible with 's' key) */}
          <box marginTop={1} flexDirection="column">
            <text fg="magenta" attributes={TextAttributes.BOLD}>
              {showSpec ? 'Specification [-]' : `Specification [+] (press 's' to ${specNote ? 'expand' : 'toggle'})`}
            </text>
            {showSpec && (
              <box
                flexDirection="column"
                border={true}
                borderStyle="single"
                padding={1}
                marginTop={1}
              >
                {specNote ? (
                  specNote.content.split('\n').map((line, index) => (
                    <text key={index} fg="white">
                      {line || ' '}
                    </text>
                  ))
                ) : (
                  <text fg="gray">No specification available</text>
                )}
              </box>
            )}
          </box>

          {/* Acceptance Criteria section (non-editable) */}
          <box marginTop={1} flexDirection="column">
            <text fg="cyan" attributes={TextAttributes.BOLD}>
              {`Acceptance Criteria (${verifiedCount}/${criteria.length} verified)`}
            </text>
            {criteria.length === 0 ? (
              <text fg="gray">  No acceptance criteria defined</text>
            ) : (
              criteria.map((ac) => {
                const icon =
                  ac.status === 'verified'
                    ? '[x]'
                    : ac.status === 'failed'
                      ? '[!]'
                      : '[ ]';
                const color =
                  ac.status === 'verified'
                    ? 'green'
                    : ac.status === 'failed'
                      ? 'red'
                      : 'gray';
                return (
                  <text key={ac.id} fg={color}>
                    {`  ${icon} ${ac.code}: ${ac.description}`}
                  </text>
                );
              })
            )}
          </box>

          {/* Tasks section (non-editable) */}
          <box marginTop={1} flexDirection="column">
            <text fg="cyan" attributes={TextAttributes.BOLD}>
              {`Tasks (${tasksCompleted}/${tasks.length} completed)`}
            </text>
            {tasks.length === 0 ? (
              <text fg="gray">  No tasks defined</text>
            ) : (
              tasks.map((task) => {
                const statusIcon =
                  task.status === 'completed'
                    ? '[x]'
                    : task.status === 'in_progress'
                      ? '[>]'
                      : task.status === 'blocked'
                        ? '[!]'
                        : '[ ]';
                const color =
                  task.status === 'completed'
                    ? 'green'
                    : task.status === 'in_progress'
                      ? 'yellow'
                      : task.status === 'blocked'
                        ? 'red'
                        : 'gray';
                const assignee = task.assignedTo ? ` (${task.assignedTo})` : '';
                return (
                  <text key={task.id} fg={color}>
                    {`  ${statusIcon} ${task.title}${assignee}`}
                  </text>
                );
              })
            )}
          </box>

          {/* Bottom padding to ensure last items are visible */}
          <box height={3}><text> </text></box>
        </box>
      </scrollbox>

      {/* Footer with help - fixed at bottom */}
      <box border={['top']} paddingLeft={1}>
        <text fg="gray">{footerText}</text>
      </box>
    </box>
  );
}
