/**
 * AgentsView - Agent definitions and learnings display
 *
 * Shows agent definitions table with name, version, role, specialization,
 * success/failure counts. Also displays learnings grouped by role.
 *
 * IMPORTANT OpenTUI notes:
 * - Use `fg` for text color, not `color`
 * - Use `border={true}` with `borderStyle` for boxes
 * - `<text>` cannot have nested JSX - build complete strings
 * - Use `backgroundColor` for box background colors
 * - Use `attributes={TextAttributes.BOLD}` for bold, not `bold`
 */

import React, { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';
import { agentDefinitionRepository, agentLearningRepository } from '../../repositories';
import type { AgentDefinition, AgentLearning } from '../../types';

/**
 * Props for AgentsView component
 */
export interface AgentsViewProps {
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

/**
 * AgentsView component
 *
 * Displays agent definitions and their learnings in two sections:
 * 1. Agent definitions table with stats
 * 2. Learnings grouped by role
 *
 * @param props - Component props
 * @returns AgentsView JSX
 *
 * @example
 * ```tsx
 * <AgentsView
 *   onEscape={() => setView('board')}
 * />
 * ```
 */
export function AgentsView({
  onEscape,
}: AgentsViewProps) {
  const [selectedTab, setSelectedTab] = useState<'definitions' | 'learnings'>('definitions');

  // Keyboard handler
  useKeyboard((event: KeyEvent) => {
    if (event.name === 'escape') {
      if (onEscape) {
        onEscape();
      }
    }
    // Tab switching with left/right arrows
    if (event.name === 'left' || event.name === 'right') {
      setSelectedTab(prev => prev === 'definitions' ? 'learnings' : 'definitions');
    }
  });

  // Fetch agent definitions
  let agentDefinitions: AgentDefinition[] = [];
  try {
    agentDefinitions = agentDefinitionRepository.findAll();
  } catch {
    // Database might not be initialized
  }

  // Fetch learnings
  let learnings: AgentLearning[] = [];
  try {
    learnings = agentLearningRepository.findAll();
  } catch {
    // Database might not be initialized
  }

  // Group learnings by role
  const learningsByRole = new Map<string, AgentLearning[]>();
  for (const learning of learnings) {
    const role = learning.role;
    if (!learningsByRole.has(role)) {
      learningsByRole.set(role, []);
    }
    learningsByRole.get(role)!.push(learning);
  }

  // Format confidence as percentage
  const formatConfidence = (confidence: number): string => {
    return `${Math.round(confidence * 100)}%`;
  };

  // Truncate text to fit column
  const truncate = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  };

  return (
    <box flexDirection="column" width="100%" height="100%" padding={1}>
      {/* Header */}
      <box marginBottom={1}>
        <text fg="cyan" attributes={TextAttributes.BOLD}>
          Agents
        </text>
      </box>

      {/* Tab selector */}
      <box flexDirection="row" marginBottom={1} gap={2}>
        <text
          fg={selectedTab === 'definitions' ? 'cyan' : 'gray'}
          attributes={selectedTab === 'definitions' ? TextAttributes.BOLD : undefined}
        >
          {`[<-] Definitions (${agentDefinitions.length})`}
        </text>
        <text
          fg={selectedTab === 'learnings' ? 'cyan' : 'gray'}
          attributes={selectedTab === 'learnings' ? TextAttributes.BOLD : undefined}
        >
          {`[->] Learnings (${learnings.length})`}
        </text>
      </box>

      {/* Content area */}
      <box
        flexDirection="column"
        border={true}
        borderStyle="single"
        padding={1}
        flexGrow={1}
      >
        {selectedTab === 'definitions' ? (
          // Agent definitions table
          <>
            {agentDefinitions.length === 0 ? (
              <text fg="gray">No agent definitions found.</text>
            ) : (
              <>
                {/* Table header */}
                <box flexDirection="row" marginBottom={1}>
                  <box width={20}>
                    <text fg="yellow" attributes={TextAttributes.BOLD}>Name</text>
                  </box>
                  <box width={6}>
                    <text fg="yellow" attributes={TextAttributes.BOLD}>Ver</text>
                  </box>
                  <box width={16}>
                    <text fg="yellow" attributes={TextAttributes.BOLD}>Role</text>
                  </box>
                  <box width={20}>
                    <text fg="yellow" attributes={TextAttributes.BOLD}>Specialization</text>
                  </box>
                  <box width={8}>
                    <text fg="yellow" attributes={TextAttributes.BOLD}>Success</text>
                  </box>
                  <box width={8}>
                    <text fg="yellow" attributes={TextAttributes.BOLD}>Fail</text>
                  </box>
                </box>

                {/* Table rows */}
                {agentDefinitions.map((agent, index) => (
                  <box key={agent.id} flexDirection="row" marginBottom={index < agentDefinitions.length - 1 ? 0 : 0}>
                    <box width={20}>
                      <text fg="white">{truncate(agent.name, 18)}</text>
                    </box>
                    <box width={6}>
                      <text fg="gray">{`v${agent.version}`}</text>
                    </box>
                    <box width={16}>
                      <text fg="cyan">{truncate(agent.role, 14)}</text>
                    </box>
                    <box width={20}>
                      <text fg="gray">{agent.specialization ? truncate(agent.specialization, 18) : '-'}</text>
                    </box>
                    <box width={8}>
                      <text fg="green">{agent.successCount}</text>
                    </box>
                    <box width={8}>
                      <text fg={agent.failureCount > 0 ? 'red' : 'gray'}>{agent.failureCount}</text>
                    </box>
                  </box>
                ))}
              </>
            )}
          </>
        ) : (
          // Learnings grouped by role
          <>
            {learningsByRole.size === 0 ? (
              <text fg="gray">No agent learnings found.</text>
            ) : (
              <>
                {Array.from(learningsByRole.entries()).map(([role, roleLearnings], roleIndex) => (
                  <box key={role} flexDirection="column" marginBottom={roleIndex < learningsByRole.size - 1 ? 1 : 0}>
                    {/* Role header */}
                    <box marginBottom={0}>
                      <text fg="cyan" attributes={TextAttributes.BOLD}>
                        {`${role} (${roleLearnings.length} learnings)`}
                      </text>
                    </box>

                    {/* Learnings for this role */}
                    {roleLearnings.slice(0, 5).map((learning, index) => (
                      <box key={learning.id} flexDirection="row" paddingLeft={2}>
                        <box width={12}>
                          <text fg="yellow">{`[${learning.category}]`}</text>
                        </box>
                        <box width={6}>
                          <text fg={learning.confidence >= 0.7 ? 'green' : learning.confidence >= 0.4 ? 'yellow' : 'red'}>
                            {formatConfidence(learning.confidence)}
                          </text>
                        </box>
                        <box flexGrow={1}>
                          <text fg="white">{truncate(learning.learning, 60)}</text>
                        </box>
                      </box>
                    ))}

                    {roleLearnings.length > 5 && (
                      <box paddingLeft={2}>
                        <text fg="gray">{`... and ${roleLearnings.length - 5} more`}</text>
                      </box>
                    )}
                  </box>
                ))}
              </>
            )}
          </>
        )}
      </box>

      {/* Footer with help */}
      <box marginTop={1}>
        <text fg="gray">
          LEFT/RIGHT: switch tabs  ESC: back to board
        </text>
      </box>
    </box>
  );
}
