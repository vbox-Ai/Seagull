/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {ReverseStage, ReverseStageGuideEntry} from './types.js';

const sharedDocRefs = [
  'docs/reference/reverse-workflow.md',
  'docs/reference/reverse-bootstrap.md',
];

const stageGuides: Record<ReverseStage, ReverseStageGuideEntry> = {
  Observe: {
    stage: 'Observe',
    goal: '确认目标请求、关键脚本、触发动作和任务边界。',
    entryCriteria: [
      '新任务开始',
      '尚未确认目标请求',
      '尚未确认关键脚本或触发动作',
    ],
    avoid: ['在未确认目标请求前直接补环境', '过早开始断点或手翻混淆代码'],
    recommendedTools: [
      'check_browser_health',
      'network_request',
      'get_request_initiator',
      'list_scripts',
    ],
    docRefs: sharedDocRefs,
  },
  Capture: {
    stage: 'Capture',
    goal: '用最小侵入方式拿到运行时样本、参数、中间值和调用顺序。',
    entryCriteria: [
      '已确认目标请求',
      '已定位候选脚本或函数',
      '需要补运行时证据',
    ],
    avoid: ['无样本直接进入本地补环境', '刚开始就全量对象快照'],
    recommendedTools: [
      'inject_hook',
      'hook_function',
      'trace_function',
      'get_hook_data',
    ],
    docRefs: sharedDocRefs,
  },
  Rebuild: {
    stage: 'Rebuild',
    goal: '把页面证据导出为本地可运行的 Node 复现入口。',
    entryCriteria: ['已有可复用运行时样本', '已知道参数链的最小调用序列'],
    avoid: [
      '没有页面证据就手写 window/document/navigator',
      '直接跳到 Python 宿主',
    ],
    recommendedTools: [
      'export_rebuild_bundle',
      'record_reverse_evidence',
      'diff_env_requirements',
    ],
    docRefs: sharedDocRefs,
  },
  Patch: {
    stage: 'Patch',
    goal: '围绕 first divergence 做最小补环境，直到本地链路稳定通过。',
    entryCriteria: ['已有本地入口', '已拿到当前失败点或阻塞点'],
    avoid: [
      '没有代理日志盲补',
      '一次性补多个无关对象',
      '未对齐浏览器真值就宣称完成',
    ],
    recommendedTools: [
      'diff_env_requirements',
      'record_reverse_evidence',
      'understand_code',
    ],
    docRefs: sharedDocRefs,
  },
  DeepDive: {
    stage: 'DeepDive',
    goal: '对复杂代码、混淆链路和高风险部分做更深入的结构理解。',
    entryCriteria: [
      '基础链路已确认但关键逻辑仍不清楚',
      '需要进一步理解复杂混淆/风控路径',
    ],
    avoid: ['没有基础证据就纯靠 AI 猜逻辑', '忽略浏览器真值直接重写结论'],
    recommendedTools: ['deobfuscate_code', 'understand_code', 'risk_panel'],
    docRefs: sharedDocRefs,
  },
  PureExtraction: {
    stage: 'PureExtraction',
    goal: '在 env-pass 后提炼稳定纯算法实现。',
    entryCriteria: [
      '本地 env rebuild 已稳定通过',
      '服务端验收通过',
      '至少有一种浏览器真值对齐',
    ],
    avoid: ['env rebuild 未跑通就直接提纯', '提纯后不回看与浏览器结果是否一致'],
    recommendedTools: [
      'understand_code',
      'deobfuscate_code',
      'record_reverse_evidence',
    ],
    docRefs: [...sharedDocRefs, 'docs/reference/pure-extraction.md'],
  },
  Port: {
    stage: 'Port',
    goal: '把已稳定的纯算法迁移到其他宿主，例如 Python。',
    entryCriteria: ['PureExtraction 已稳定', '接口和固定样本已验证'],
    avoid: ['Node pure 未稳定就直接迁移', '迁移后没有做回归比对'],
    recommendedTools: ['understand_code', 'record_reverse_evidence'],
    docRefs: [...sharedDocRefs, 'docs/reference/pure-extraction.md'],
  },
};

export function getReverseStageGuide(
  stage: ReverseStage,
): ReverseStageGuideEntry {
  return stageGuides[stage];
}
