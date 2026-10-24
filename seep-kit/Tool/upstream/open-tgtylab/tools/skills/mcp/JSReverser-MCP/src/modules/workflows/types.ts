/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export interface ParameterWorkflowMetadata {
  id: string;
  title: string;
  aliases: string[];
  keywords?: string[];
  category: string;
  status: string;
  version: string;
  lastUpdated: string;
  summary: string;
  relatedDocs?: string[];
}

export interface ParameterWorkflowIndexEntry {
  id: string;
  path: string;
  aliases: string[];
  keywords?: string[];
  category: string;
  status: string;
  summary: string;
}

export interface ParameterWorkflowIndex {
  schemaVersion: string;
  libraryVersion: string;
  workflows: ParameterWorkflowIndexEntry[];
}

export interface ParameterWorkflowDocument {
  metadata: ParameterWorkflowMetadata;
  workflow: string;
  path: string;
  parts?: {
    parameter: string;
    parts: Array<Record<string, unknown>>;
  };
  mutations?: {
    parameter: string;
    mutations: Array<Record<string, unknown>>;
  };
}

export type ReverseStage =
  | 'Observe'
  | 'Capture'
  | 'Rebuild'
  | 'Patch'
  | 'DeepDive'
  | 'PureExtraction'
  | 'Port';

export interface NextStepAdvisorInput {
  taskId?: string;
  browserHealthy?: boolean;
  pageReady?: boolean;
  taskGoal?: string;
  currentStage?: ReverseStage | string;
  taskStatus?: string;
  hasTargetRequest?: boolean;
  hookRecordCount?: number;
  hasRebuildBundle?: boolean;
  hasPassingRebuild?: boolean;
  firstDivergenceKnown?: boolean;
}

export interface NextStepAdvice {
  stage: ReverseStage;
  confidence: number;
  nextStep: string;
  why: string;
  alternatives: string[];
  avoid: string[];
}

export interface ReverseStageGuideEntry {
  stage: ReverseStage;
  goal: string;
  entryCriteria: string[];
  avoid: string[];
  recommendedTools: string[];
  docRefs: string[];
}
