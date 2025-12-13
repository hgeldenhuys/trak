/**
 * Sample Board Fixtures for E2E Testing
 *
 * Provides utility functions to create sample data for testing
 * full agent workflows and data integrity scenarios.
 */

import {
  featureRepository,
  storyRepository,
  taskRepository,
  acceptanceCriteriaRepository,
} from '../../src/repositories';
import type { Feature, Story, Task, AcceptanceCriteria } from '../../src/types';
import { Priority } from '../../src/types';

export interface SampleBoard {
  feature: Feature;
  story: Story;
  tasks: Task[];
  acceptanceCriteria: AcceptanceCriteria[];
}

/**
 * Create a sample board with feature, story, acceptance criteria, and tasks
 * Simulates a typical notification system feature setup
 */
export function createSampleBoard(): SampleBoard {
  // Create feature
  const feature = featureRepository.create({
    code: 'NOTIFY',
    name: 'Notification System',
    description: 'Handle all notification types',
  });

  // Create story
  const story = storyRepository.create({
    featureId: feature.id,
    title: 'Email notification system',
    description: 'Implement email notifications for users',
    why: 'Users need to receive important updates via email',
    status: 'draft',
    priority: Priority.P1,
  });

  // Create acceptance criteria
  const ac1 = acceptanceCriteriaRepository.create({
    storyId: story.id,
    code: 'AC-001',
    description: 'Users can configure email preferences',
  });

  const ac2 = acceptanceCriteriaRepository.create({
    storyId: story.id,
    code: 'AC-002',
    description: 'Emails are sent within 5 seconds of trigger',
  });

  // Create tasks
  const tasks = [
    taskRepository.create({
      storyId: story.id,
      title: 'Design email templates',
      description: 'Create HTML email templates',
      status: 'pending',
      priority: Priority.P1,
      assignedTo: 'frontend-dev',
    }),
    taskRepository.create({
      storyId: story.id,
      title: 'Implement email service',
      description: 'Create email sending service with queue',
      status: 'pending',
      priority: Priority.P0,
      assignedTo: 'backend-dev',
    }),
    taskRepository.create({
      storyId: story.id,
      title: 'Write integration tests',
      description: 'Test email delivery',
      status: 'pending',
      priority: Priority.P1,
      assignedTo: 'qa-engineer',
    }),
  ];

  return {
    feature,
    story,
    tasks,
    acceptanceCriteria: [ac1, ac2],
  };
}

export interface MultiFeatureBoard {
  features: Feature[];
  stories: Story[];
  tasks: Task[];
}

/**
 * Create multiple features for testing cross-feature scenarios
 * Creates NOTIFY, AUTH, and BILLING features with stories and tasks
 */
export function createMultiFeatureBoard(): MultiFeatureBoard {
  const features: Feature[] = [];
  const stories: Story[] = [];
  const tasks: Task[] = [];

  // NOTIFY feature
  const notifyFeature = featureRepository.create({
    code: 'NOTIFY',
    name: 'Notification System',
    description: 'Handle all notification types',
  });
  features.push(notifyFeature);

  const notifyStory = storyRepository.create({
    featureId: notifyFeature.id,
    title: 'Push notifications',
    description: 'Implement push notifications',
    why: 'Users need real-time alerts',
    status: 'draft',
    priority: Priority.P1,
  });
  stories.push(notifyStory);

  tasks.push(
    taskRepository.create({
      storyId: notifyStory.id,
      title: 'Setup push service',
      description: 'Configure Firebase Cloud Messaging',
      status: 'pending',
      assignedTo: 'backend-dev',
    })
  );

  // AUTH feature
  const authFeature = featureRepository.create({
    code: 'AUTH',
    name: 'Authentication',
    description: 'User authentication and authorization',
  });
  features.push(authFeature);

  const authStory = storyRepository.create({
    featureId: authFeature.id,
    title: 'OAuth integration',
    description: 'Add Google and GitHub OAuth',
    why: 'Users want social login options',
    status: 'planned',
    priority: Priority.P0,
  });
  stories.push(authStory);

  tasks.push(
    taskRepository.create({
      storyId: authStory.id,
      title: 'Google OAuth setup',
      description: 'Configure Google OAuth credentials',
      status: 'pending',
      assignedTo: 'backend-dev',
    }),
    taskRepository.create({
      storyId: authStory.id,
      title: 'GitHub OAuth setup',
      description: 'Configure GitHub OAuth credentials',
      status: 'pending',
      assignedTo: 'backend-dev',
    })
  );

  // BILLING feature
  const billingFeature = featureRepository.create({
    code: 'BILLING',
    name: 'Billing System',
    description: 'Handle payments and subscriptions',
  });
  features.push(billingFeature);

  const billingStory = storyRepository.create({
    featureId: billingFeature.id,
    title: 'Stripe integration',
    description: 'Integrate Stripe for payments',
    why: 'Need to accept payments for premium features',
    status: 'draft',
    priority: Priority.P2,
  });
  stories.push(billingStory);

  tasks.push(
    taskRepository.create({
      storyId: billingStory.id,
      title: 'Stripe SDK setup',
      description: 'Install and configure Stripe SDK',
      status: 'pending',
      assignedTo: 'backend-dev',
    })
  );

  return { features, stories, tasks };
}

/**
 * Create a minimal board with just a feature and story
 * Useful for simple test cases
 */
export function createMinimalBoard(): { feature: Feature; story: Story } {
  const feature = featureRepository.create({
    code: 'TEST',
    name: 'Test Feature',
    description: 'A minimal test feature',
  });

  const story = storyRepository.create({
    featureId: feature.id,
    title: 'Test Story',
    description: 'A minimal test story',
    why: 'For testing purposes',
  });

  return { feature, story };
}

/**
 * Create a board with many tasks for pagination and performance testing
 * @param taskCount - Number of tasks to create (default 25)
 */
export function createBoardWithManyTasks(taskCount: number = 25): SampleBoard {
  const feature = featureRepository.create({
    code: 'PERF',
    name: 'Performance Test',
    description: 'Feature for performance testing',
  });

  const story = storyRepository.create({
    featureId: feature.id,
    title: 'Large task set',
    description: 'Story with many tasks',
    why: 'To test performance with many tasks',
    status: 'in_progress',
  });

  const tasks: Task[] = [];
  for (let i = 0; i < taskCount; i++) {
    const task = taskRepository.create({
      storyId: story.id,
      title: `Task ${i + 1}`,
      description: `Task number ${i + 1} for testing`,
      status: 'pending',
      priority: i % 4 === 0 ? Priority.P0 : i % 3 === 0 ? Priority.P1 : Priority.P2,
    });
    tasks.push(task);
  }

  const ac = acceptanceCriteriaRepository.create({
    storyId: story.id,
    code: 'AC-001',
    description: 'All tasks should be completable',
  });

  return {
    feature,
    story,
    tasks,
    acceptanceCriteria: [ac],
  };
}
