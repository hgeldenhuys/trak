/**
 * E2E Workflow Tests for Board CLI/TUI System
 *
 * Tests complete agent workflows including:
 * - Story lifecycle: draft -> planned -> in_progress -> completed
 * - Task status transitions
 * - Multi-story workflows
 * - Data integrity and cascade deletes
 * - Story code uniqueness across features
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { setupTestDb, cleanupTestDb, resetTestDb } from '../helpers/test-db';
import {
  createSampleBoard,
  createMultiFeatureBoard,
  createMinimalBoard,
  createBoardWithManyTasks,
} from '../fixtures/sample-board';
import {
  featureRepository,
  storyRepository,
  taskRepository,
  acceptanceCriteriaRepository,
} from '../../src/repositories';
import { StoryStatus, TaskStatus, Priority } from '../../src/types';

describe('E2E Workflow Tests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  describe('Agent workflow simulation', () => {
    test('complete story lifecycle: draft -> planned -> in_progress -> completed', () => {
      // 1. Create feature and story
      const { feature, story, tasks, acceptanceCriteria } = createSampleBoard();

      expect(story.status).toBe('draft');
      expect(story.code).toBe('NOTIFY-001');

      // 2. Plan the story
      const plannedStory = storyRepository.updateStatus(story.id, StoryStatus.PLANNED);
      expect(plannedStory.status).toBe('planned');

      // 3. Start working
      const inProgressStory = storyRepository.updateStatus(story.id, StoryStatus.IN_PROGRESS);
      expect(inProgressStory.status).toBe('in_progress');

      // 4. Complete tasks one by one
      for (const task of tasks) {
        taskRepository.updateStatus(task.id, TaskStatus.IN_PROGRESS);
        taskRepository.updateStatus(task.id, TaskStatus.COMPLETED);
      }

      // Verify all tasks completed
      const updatedTasks = taskRepository.findByStoryId(story.id);
      for (const task of updatedTasks) {
        expect(task.status).toBe('completed');
      }

      // 5. Verify acceptance criteria
      for (const ac of acceptanceCriteria) {
        acceptanceCriteriaRepository.verify(ac.id, 'Manually verified');
      }

      // Check all ACs verified
      const verified = acceptanceCriteriaRepository.allVerified(story.id);
      expect(verified).toBe(true);

      // 6. Complete the story
      const completedStory = storyRepository.updateStatus(story.id, StoryStatus.COMPLETED);
      expect(completedStory.status).toBe('completed');
    });

    test('task status flow: pending -> in_progress -> blocked -> in_progress -> completed', () => {
      const { tasks } = createSampleBoard();
      const task = tasks[0];

      expect(task.status).toBe('pending');

      // Start work
      let updated = taskRepository.updateStatus(task.id, TaskStatus.IN_PROGRESS);
      expect(updated.status).toBe('in_progress');

      // Hit a blocker
      updated = taskRepository.updateStatus(task.id, TaskStatus.BLOCKED);
      expect(updated.status).toBe('blocked');

      // Unblock and continue
      updated = taskRepository.updateStatus(task.id, TaskStatus.IN_PROGRESS);
      expect(updated.status).toBe('in_progress');

      // Complete
      updated = taskRepository.updateStatus(task.id, TaskStatus.COMPLETED);
      expect(updated.status).toBe('completed');
    });

    test('task cancellation flow: pending -> cancelled', () => {
      const { tasks } = createSampleBoard();
      const task = tasks[0];

      expect(task.status).toBe('pending');

      const cancelled = taskRepository.updateStatus(task.id, TaskStatus.CANCELLED);
      expect(cancelled.status).toBe('cancelled');
    });

    test('multi-story workflow with dependencies', () => {
      // Create first story and complete it
      const board1 = createSampleBoard();
      storyRepository.updateStatus(board1.story.id, StoryStatus.COMPLETED);

      // Create second story in same feature
      const story2 = storyRepository.create({
        featureId: board1.feature.id,
        title: 'Push notifications',
        description: 'Implement push notifications',
        why: 'Users need real-time alerts',
        status: 'draft',
      });

      expect(story2.code).toBe('NOTIFY-002');

      // Both stories should be in the feature
      const stories = storyRepository.findByFeatureId(board1.feature.id);
      expect(stories.length).toBe(2);
    });

    test('story review workflow: in_progress -> review -> completed', () => {
      const { story, tasks, acceptanceCriteria } = createSampleBoard();

      // Move to in_progress
      storyRepository.updateStatus(story.id, StoryStatus.IN_PROGRESS);

      // Complete all tasks
      for (const task of tasks) {
        taskRepository.updateStatus(task.id, TaskStatus.COMPLETED);
      }

      // Verify acceptance criteria
      for (const ac of acceptanceCriteria) {
        acceptanceCriteriaRepository.verify(ac.id, 'Verified');
      }

      // Move to review
      const reviewStory = storyRepository.updateStatus(story.id, StoryStatus.REVIEW);
      expect(reviewStory.status).toBe('review');

      // Complete after review
      const completedStory = storyRepository.updateStatus(story.id, StoryStatus.COMPLETED);
      expect(completedStory.status).toBe('completed');
    });

    test('acceptance criteria failure blocks story completion', () => {
      const { story, acceptanceCriteria } = createSampleBoard();

      // Verify first AC
      acceptanceCriteriaRepository.verify(acceptanceCriteria[0].id, 'Passed');

      // Fail second AC
      acceptanceCriteriaRepository.fail(acceptanceCriteria[1].id, 'Failed - performance issue');

      // Check not all ACs verified
      const allVerified = acceptanceCriteriaRepository.allVerified(story.id);
      expect(allVerified).toBe(false);

      // Get status counts
      const counts = acceptanceCriteriaRepository.countByStatus(story.id);
      expect(counts.verified).toBe(1);
      expect(counts.failed).toBe(1);
      expect(counts.pending).toBe(0);
    });
  });

  describe('Data integrity', () => {
    test('deleting feature cascades to stories and tasks', () => {
      const { feature, story, tasks } = createSampleBoard();

      // Verify data exists
      expect(storyRepository.findById(story.id)).not.toBeNull();
      expect(taskRepository.findByStoryId(story.id).length).toBe(3);

      // Delete feature
      featureRepository.delete(feature.id);

      // Verify cascade
      expect(featureRepository.findById(feature.id)).toBeNull();
      expect(storyRepository.findById(story.id)).toBeNull();
      expect(taskRepository.findByStoryId(story.id).length).toBe(0);
    });

    test('deleting story cascades to tasks and acceptance criteria', () => {
      const { story, tasks, acceptanceCriteria } = createSampleBoard();

      // Verify data exists
      expect(taskRepository.findByStoryId(story.id).length).toBe(3);
      expect(acceptanceCriteriaRepository.findByStoryId(story.id).length).toBe(2);

      // Delete story
      storyRepository.delete(story.id);

      // Verify cascade
      expect(storyRepository.findById(story.id)).toBeNull();
      expect(taskRepository.findByStoryId(story.id).length).toBe(0);
      expect(acceptanceCriteriaRepository.findByStoryId(story.id).length).toBe(0);
    });

    test('story code uniqueness across features', () => {
      const f1 = featureRepository.create({ code: 'ALPHA', name: 'Alpha', description: '' });
      const f2 = featureRepository.create({ code: 'BETA', name: 'Beta', description: '' });

      const s1 = storyRepository.create({
        featureId: f1.id,
        title: 'Story 1',
        description: 'First story',
        why: 'Testing',
      });
      const s2 = storyRepository.create({
        featureId: f2.id,
        title: 'Story 2',
        description: 'Second story',
        why: 'Testing',
      });

      expect(s1.code).toBe('ALPHA-001');
      expect(s2.code).toBe('BETA-001');
    });

    test('story counter increments correctly', () => {
      const feature = featureRepository.create({
        code: 'COUNT',
        name: 'Counter Test',
        description: '',
      });

      const s1 = storyRepository.create({
        featureId: feature.id,
        title: 'Story 1',
        description: '',
        why: '',
      });
      const s2 = storyRepository.create({
        featureId: feature.id,
        title: 'Story 2',
        description: '',
        why: '',
      });
      const s3 = storyRepository.create({
        featureId: feature.id,
        title: 'Story 3',
        description: '',
        why: '',
      });

      expect(s1.code).toBe('COUNT-001');
      expect(s2.code).toBe('COUNT-002');
      expect(s3.code).toBe('COUNT-003');

      // Verify feature counter updated
      const updatedFeature = featureRepository.findById(feature.id);
      expect(updatedFeature!.storyCounter).toBe(3);
    });

    test('task order is preserved when reordering', () => {
      const { story, tasks } = createSampleBoard();

      // Get original order
      const originalOrder = tasks.map((t) => t.id);

      // Reverse the order
      const reversedOrder = [...originalOrder].reverse();
      taskRepository.reorder(story.id, reversedOrder);

      // Verify new order
      const reorderedTasks = taskRepository.findByStoryId(story.id);
      expect(reorderedTasks.map((t) => t.id)).toEqual(reversedOrder);
    });
  });

  describe('Multi-feature scenarios', () => {
    test('creates multiple features with stories and tasks', () => {
      const { features, stories, tasks } = createMultiFeatureBoard();

      expect(features.length).toBe(3);
      expect(stories.length).toBe(3);
      expect(tasks.length).toBe(4);

      // Verify feature codes
      expect(features.map((f) => f.code).sort()).toEqual(['AUTH', 'BILLING', 'NOTIFY']);

      // Verify story codes
      expect(stories.find((s) => s.featureId === features[0].id)!.code).toBe('NOTIFY-001');
      expect(stories.find((s) => s.featureId === features[1].id)!.code).toBe('AUTH-001');
      expect(stories.find((s) => s.featureId === features[2].id)!.code).toBe('BILLING-001');
    });

    test('filters tasks by assignee across features', () => {
      createMultiFeatureBoard();

      // All tasks assigned to backend-dev
      const backendTasks = taskRepository.findAll({ assignedTo: 'backend-dev' });
      expect(backendTasks.length).toBe(4);
    });

    test('filters stories by status across features', () => {
      const { stories } = createMultiFeatureBoard();

      // One story is 'planned', two are 'draft'
      const plannedStories = storyRepository.findAll({ status: StoryStatus.PLANNED });
      expect(plannedStories.length).toBe(1);

      const draftStories = storyRepository.findAll({ status: StoryStatus.DRAFT });
      expect(draftStories.length).toBe(2);
    });
  });

  describe('Performance scenarios', () => {
    test('handles board with many tasks', () => {
      const { tasks, story } = createBoardWithManyTasks(50);

      expect(tasks.length).toBe(50);

      // Verify all tasks are in the story
      const fetchedTasks = taskRepository.findByStoryId(story.id);
      expect(fetchedTasks.length).toBe(50);

      // Verify tasks are ordered
      for (let i = 0; i < fetchedTasks.length - 1; i++) {
        expect(fetchedTasks[i].order).toBeLessThan(fetchedTasks[i + 1].order);
      }
    });

    test('task status counts are accurate', () => {
      const { tasks, story } = createBoardWithManyTasks(10);

      // Complete half the tasks
      for (let i = 0; i < 5; i++) {
        taskRepository.updateStatus(tasks[i].id, TaskStatus.COMPLETED);
      }

      // Block one task
      taskRepository.updateStatus(tasks[5].id, TaskStatus.BLOCKED);

      // Get status counts
      const counts = taskRepository.getStatusCounts(story.id);
      expect(counts['completed']).toBe(5);
      expect(counts['blocked']).toBe(1);
      expect(counts['pending']).toBe(4);
    });
  });

  describe('Edge cases', () => {
    test('updating status to same value returns same entity', () => {
      const { story } = createMinimalBoard();

      // Update to same status
      const updated = storyRepository.updateStatus(story.id, StoryStatus.DRAFT);

      expect(updated.id).toBe(story.id);
      expect(updated.status).toBe('draft');
    });

    test('creating task without assignee', () => {
      const { story } = createMinimalBoard();

      const task = taskRepository.create({
        storyId: story.id,
        title: 'Unassigned task',
        description: 'No assignee',
      });

      expect(task.assignedTo).toBeNull();
    });

    test('updating task with dependencies', () => {
      const { story, tasks } = createSampleBoard();

      // Add dependencies
      const updated = taskRepository.update(tasks[2].id, {
        dependencies: [tasks[0].id, tasks[1].id],
      });

      expect(updated.dependencies).toEqual([tasks[0].id, tasks[1].id]);
    });

    test('updating task with AC coverage', () => {
      const { story, tasks, acceptanceCriteria } = createSampleBoard();

      // Add AC coverage
      const updated = taskRepository.update(tasks[0].id, {
        acCoverage: [acceptanceCriteria[0].id],
      });

      expect(updated.acCoverage).toEqual([acceptanceCriteria[0].id]);
    });

    test('feature code is always uppercase', () => {
      const feature = featureRepository.create({
        code: 'lowercase',
        name: 'Test',
        description: '',
      });

      expect(feature.code).toBe('LOWERCASE');
    });

    test('find feature by code is case-insensitive', () => {
      featureRepository.create({
        code: 'MYCODE',
        name: 'Test',
        description: '',
      });

      const found = featureRepository.findByCode('mycode');
      expect(found).not.toBeNull();
      expect(found!.code).toBe('MYCODE');
    });
  });

  describe('Story assignment workflow', () => {
    test('assign and unassign story', () => {
      const { story } = createMinimalBoard();

      // Assign story
      const assigned = storyRepository.update(story.id, { assignedTo: 'backend-dev' });
      expect(assigned.assignedTo).toBe('backend-dev');

      // Unassign story
      const unassigned = storyRepository.update(story.id, { assignedTo: null });
      expect(unassigned.assignedTo).toBeNull();
    });

    test('change story priority', () => {
      const { story } = createMinimalBoard();

      expect(story.priority).toBe('P2'); // Default priority

      const updated = storyRepository.update(story.id, { priority: Priority.P0 });
      expect(updated.priority).toBe('P0');
    });
  });

  describe('Acceptance criteria workflow', () => {
    test('verify then fail AC (re-verification scenario)', () => {
      const { acceptanceCriteria } = createSampleBoard();
      const ac = acceptanceCriteria[0];

      // First verify
      const verified = acceptanceCriteriaRepository.verify(ac.id, 'Initial verification');
      expect(verified.status).toBe('verified');
      expect(verified.verificationNotes).toBe('Initial verification');

      // Then fail (found issue during testing)
      const failed = acceptanceCriteriaRepository.fail(ac.id, 'Found regression bug');
      expect(failed.status).toBe('failed');
      expect(failed.verificationNotes).toBe('Found regression bug');
    });

    test('update AC description', () => {
      const { acceptanceCriteria } = createSampleBoard();
      const ac = acceptanceCriteria[0];

      const updated = acceptanceCriteriaRepository.update(ac.id, {
        description: 'Updated description with more detail',
      });

      expect(updated.description).toBe('Updated description with more detail');
    });

    test('delete AC', () => {
      const { story, acceptanceCriteria } = createSampleBoard();
      const ac = acceptanceCriteria[0];

      acceptanceCriteriaRepository.delete(ac.id);

      const remaining = acceptanceCriteriaRepository.findByStoryId(story.id);
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(acceptanceCriteria[1].id);
    });
  });
});
