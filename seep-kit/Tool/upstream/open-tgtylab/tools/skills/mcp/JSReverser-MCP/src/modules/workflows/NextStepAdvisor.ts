/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {NextStepAdvice, NextStepAdvisorInput} from './types.js';

export function recommendNextStep(input: NextStepAdvisorInput): NextStepAdvice {
  if (
    input.currentStage === 'Patch' &&
    (!input.firstDivergenceKnown || !input.hasPassingRebuild)
  ) {
    return {
      stage: 'Patch',
      confidence: 0.9,
      nextStep: 'diff_env_requirements',
      why: '当前任务已明确处于 Patch 阶段，应继续围绕 first divergence 做最小补环境。',
      alternatives: ['record_reverse_evidence', 'manage_reverse_task'],
      avoid: ['PureExtraction', 'Port'],
    };
  }

  if (input.currentStage === 'PureExtraction' && input.hasPassingRebuild) {
    return {
      stage: 'PureExtraction',
      confidence: 0.88,
      nextStep: 'understand_code',
      why: '当前任务已进入 PureExtraction 且本地链路已通过，适合提炼纯算法边界。',
      alternatives: ['deobfuscate_code', 'record_reverse_evidence'],
      avoid: ['breakpoint'],
    };
  }

  if (input.browserHealthy === false || input.pageReady === false) {
    return {
      stage: 'Observe',
      confidence: 0.97,
      nextStep: 'check_browser_health',
      why: '浏览器连接或当前页面尚未就绪，继续做逆向判断之前应先确认基础链路可控。',
      alternatives: ['list_pages', 'navigate_page'],
      avoid: ['breakpoint', 'export_rebuild_bundle'],
    };
  }

  if (!input.hasTargetRequest) {
    return {
      stage: 'Observe',
      confidence: 0.88,
      nextStep: 'network_request',
      why: '当前还没有明确目标请求，应先确认请求入口、参数特征和 initiator。',
      alternatives: ['get_request_initiator', 'list_scripts'],
      avoid: ['breakpoint', 'export_rebuild_bundle'],
    };
  }

  if ((input.hookRecordCount ?? 0) <= 0) {
    return {
      stage: 'Capture',
      confidence: 0.9,
      nextStep: 'inject_hook',
      why: '已经识别到目标请求，但还没有运行时样本，应先做最小 hook 采样，避免过早进入断点调试。',
      alternatives: ['hook_function', 'trace_function'],
      avoid: ['breakpoint'],
    };
  }

  if (!input.hasRebuildBundle) {
    return {
      stage: 'Rebuild',
      confidence: 0.86,
      nextStep: 'export_rebuild_bundle',
      why: '已有运行时样本后，下一步应固化为本地可运行入口，避免证据只停留在页面会话里。',
      alternatives: ['record_reverse_evidence', 'diff_env_requirements'],
      avoid: ['breakpoint'],
    };
  }

  if (!input.firstDivergenceKnown || !input.hasPassingRebuild) {
    return {
      stage: 'Patch',
      confidence: 0.82,
      nextStep: 'diff_env_requirements',
      why: '已经进入本地复现，但还没有稳定通过或尚未明确 first divergence，应继续最小因果单元补环境。',
      alternatives: ['record_reverse_evidence', 'understand_code'],
      avoid: ['PureExtraction', 'Port'],
    };
  }

  return {
    stage: 'PureExtraction',
    confidence: 0.78,
    nextStep: 'understand_code',
    why: '本地链路已基本跑通，下一步适合提炼结构与边界，为纯算法提取做准备。',
    alternatives: ['deobfuscate_code', 'risk_panel'],
    avoid: ['breakpoint'],
  };
}
