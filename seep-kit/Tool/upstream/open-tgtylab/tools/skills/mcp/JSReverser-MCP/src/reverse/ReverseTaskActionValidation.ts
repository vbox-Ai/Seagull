/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ReverseTaskActionValidationInput {
  action: string;
  taskId?: string;
  otherTaskId?: string;
  query?: string;
  tag?: string;
  tags?: string[];
  stage?: string;
  timelineAction?: string;
  timelineStatus?: string;
  taskSlug?: string;
  targetUrl?: string;
  goal?: string;
  currentStage?: string;
  status?: string;
  currentSummary?: string;
  nextStepHint?: string;
  successCriteria?: Record<string, unknown>;
}

export function validateReverseTaskActionInput(
  input: ReverseTaskActionValidationInput,
): void {
  const action = input.action;

  if (!input.taskId && !['list', 'search', 'prune'].includes(action)) {
    throw new Error(`taskId is required when action="${action}"`);
  }

  if (action === 'search' && !input.query?.trim() && !input.tag?.trim()) {
    throw new Error('query or tag is required when action="search"');
  }

  if (
    action === 'tag' &&
    !(input.tags ?? []).some(tag => tag.trim().length > 0)
  ) {
    throw new Error('at least one tag is required when action="tag"');
  }

  if (action === 'compare' && !input.otherTaskId) {
    throw new Error('otherTaskId is required when action="compare"');
  }

  if (
    action === 'timeline' &&
    (!input.stage || !input.timelineAction || !input.timelineStatus)
  ) {
    throw new Error(
      'stage, timelineAction, and timelineStatus are required when action="timeline"',
    );
  }

  if (action === 'update') {
    const hasMutableField = [
      input.taskSlug,
      input.targetUrl,
      input.goal,
      input.currentStage,
      input.status,
      input.currentSummary,
      input.nextStepHint,
      input.successCriteria,
    ].some(value => value !== undefined);
    if (!hasMutableField) {
      throw new Error(
        'at least one mutable field is required when action="update"',
      );
    }
  }
}
