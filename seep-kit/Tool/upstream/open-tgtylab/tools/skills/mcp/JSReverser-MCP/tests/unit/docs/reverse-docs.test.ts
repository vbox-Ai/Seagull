/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {describe, it} from 'node:test';

const repoRoot = process.cwd();

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('reverse workflow docs', () => {
  it('documents task artifacts, local rebuild, and Codex workflow guidance', async () => {
    const readme = await readRepoFile('README.md');
    const claudeDoc = await readRepoFile('CLAUDE.md');
    const caseIndex = await readRepoFile('scripts/cases/README.md');
    const workflowIndex = await readRepoFile(
      'docs/knowledge/parameter-blueprints/index.json',
    );
    const reverseIndex = await readRepoFile(
      'docs/reference/reverse-task-index.md',
    );
    const artifactsDoc = await readRepoFile(
      'docs/reference/reverse-artifacts.md',
    );
    const caseSafetyPolicy = await readRepoFile(
      'docs/reference/case-safety-policy.md',
    );
    const reverseWorkflowDoc = await readRepoFile(
      'docs/reference/reverse-workflow.md',
    );
    const reverseBootstrapDoc = await readRepoFile(
      'docs/reference/reverse-bootstrap.md',
    );
    const envPatchingDoc = await readRepoFile('docs/reference/env-patching.md');
    const orchestrationGuide = await readRepoFile(
      'docs/guides/reverse-task-orchestration.md',
    );
    const clientConfigurationGuide = await readRepoFile(
      'docs/guides/client-configuration.md',
    );
    const troubleshootingGuide = await readRepoFile(
      'docs/guides/troubleshooting.md',
    );
    const browserConnectionGuide = await readRepoFile(
      'docs/guides/browser-connection.md',
    );
    const clientSystemPromptGuide = await readRepoFile(
      'docs/guides/client-system-prompt.md',
    );
    const quickReferenceGuide = await readRepoFile(
      'docs/guides/mcp-agent-quick-reference.md',
    );
    const autoResumeGuide = await readRepoFile(
      'docs/guides/mcp-client-auto-resume-example.md',
    );
    const updatePromptTemplate = await readRepoFile(
      'docs/reference/reverse-update-prompt-template.md',
    );
    const reverseReportTemplate = await readRepoFile(
      'docs/reference/reverse-report-template.md',
    );
    const algorithmUpgradeTemplate = await readRepoFile(
      'docs/reference/algorithm-upgrade-template.md',
    );
    const reverseAgentResponseSchema = await readRepoFile(
      'docs/reference/reverse-agent-response.schema.json',
    );
    const manageResponseSchema = await readRepoFile(
      'docs/reference/manage-response.schema.json',
    );
    const orchestrateResponseSchema = await readRepoFile(
      'docs/reference/orchestrate-response.schema.json',
    );
    const rebuildHealthResponseSchema = await readRepoFile(
      'docs/reference/rebuild-health-response.schema.json',
    );
    const reverseAgentSchemaVersioning = await readRepoFile(
      'docs/reference/reverse-agent-schema-versioning.md',
    );
    const toolReference = await readRepoFile(
      'docs/reference/tool-reference.md',
    );
    const toolIoContract = await readRepoFile(
      'docs/reference/tool-io-contract.md',
    );
    const outputContract = await readRepoFile(
      'skills/jsreverser-mcp-playbook/references/output-contract.md',
    );
    const envTemplate = await readRepoFile(
      'artifacts/tasks/_TEMPLATE/env/env.js',
    );
    const polyfillsTemplate = await readRepoFile(
      'artifacts/tasks/_TEMPLATE/env/polyfills.js',
    );
    const entryTemplate = await readRepoFile(
      'artifacts/tasks/_TEMPLATE/env/entry.js',
    );
    const docsRootEntries = await readdir(path.join(repoRoot, 'docs'), {
      withFileTypes: true,
    });
    const docsRootFiles = docsRootEntries
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .sort();

    assert.ok(readme.includes('核心方法论'));
    assert.ok(readme.includes('已沉淀链路'));
    assert.ok(readme.includes('支持的能力'));
    assert.ok(readme.includes('第一次启动建议'));
    assert.ok(readme.includes('工具暴露模式'));
    assert.ok(readme.includes('默认启动使用 `--toolProfile kernel`'));
    assert.ok(readme.includes('只暴露 35 个自动化优先工具'));
    assert.ok(readme.includes('`compact` 会暴露 63 个高频工具'));
    assert.ok(readme.includes('`full` 会暴露全部 110 个工具'));
    assert.ok(
      readme.includes('https://github.com/ChromeDevTools/chrome-devtools-mcp'),
    );
    assert.ok(readme.includes('--traceOutput errors'));
    assert.ok(
      clientConfigurationGuide.includes(
        '默认配置不写 `--toolProfile`，等价于 `--toolProfile kernel`。',
      ),
    );
    assert.ok(clientConfigurationGuide.includes('35 个自动化优先工具'));
    assert.ok(clientConfigurationGuide.includes('63 个高频工具'));
    assert.ok(clientConfigurationGuide.includes('暴露全部 110 个工具'));
    assert.ok(clientConfigurationGuide.includes('`tools: none`'));
    assert.ok(clientConfigurationGuide.includes('useAI` 是工具调用参数'));
    assert.ok(troubleshootingGuide.includes('客户端显示 `tools: none`'));
    assert.ok(troubleshootingGuide.includes('启动后访问地址不通'));
    assert.ok(troubleshootingGuide.includes('AI 配置和 `useAI`'));
    assert.ok(troubleshootingGuide.includes('Codex 不愿意继续分析'));
    assert.ok(troubleshootingGuide.includes('webSocketDebuggerUrl'));
    assert.ok(troubleshootingGuide.includes('`understand_code` 的行为'));
    assert.ok(troubleshootingGuide.includes('返回里会带 `aiRuntime`'));
    assert.ok(
      browserConnectionGuide.includes(
        '不是 HTTP Web 服务；没有项目主页需要访问',
      ),
    );
    assert.ok(clientSystemPromptGuide.includes('Codex 使用边界'));
    assert.ok(readme.includes('文档入口'));
    assert.match(
      readme,
      /## 文档入口\n\n逆向相关任务开场先读：`docs\/reference\/reverse-bootstrap\.md`。\n该入口会继续要求模型读取 `docs\/reference\/case-safety-policy\.md`、`docs\/reference\/reverse-workflow\.md`。\n若已进入 `env-pass` 后的提纯阶段，再读 `docs\/reference\/pure-extraction\.md`。/,
    );
    assert.match(
      claudeDoc,
      /## 文档入口\n\n逆向相关任务开场先读：`docs\/reference\/reverse-bootstrap\.md`。\n该入口会继续要求模型读取 `docs\/reference\/case-safety-policy\.md`、`docs\/reference\/reverse-workflow\.md`。\n若已进入 `env-pass` 后的提纯阶段，再读 `docs\/reference\/pure-extraction\.md`。/,
    );
    assert.ok(readme.includes('参考项目'));
    assert.ok(readme.includes('某东 `h5st` 参数'));
    assert.ok(
      readme.includes('[scripts/cases/README.md](scripts/cases/README.md)'),
    );
    assert.ok(readme.includes('参数蓝图库'));
    assert.ok(readme.includes('diagnose_environment'));
    assert.ok(readme.includes('recommend_next_step'));
    assert.ok(readme.includes('explain_reverse_stage'));
    assert.ok(readme.includes('start_reverse_task'));
    assert.ok(readme.includes('create_reverse_task_from_request'));
    assert.ok(readme.includes('manage_reverse_task'));
    assert.ok(readme.includes('orchestrate_reverse_task'));
    assert.ok(readme.includes('run_reverse_agent'));
    assert.ok(readme.includes('默认入口就是 `manage_reverse_task`'));
    assert.ok(
      readme.includes('archive / restore / search / tag / prune / compare'),
    );
    assert.ok(readme.includes('--manageReverseTask list'));
    assert.ok(readme.includes('--manageReverseTask get --taskId <taskId>'));
    assert.ok(
      readme.includes('--manageReverseTask summarize --taskId <taskId>'),
    );
    assert.ok(
      readme.includes('--manageReverseTask progress --taskId <taskId>'),
    );
    assert.ok(
      readme.includes('--manageReverseTask search --query sign --tag jd'),
    );
    assert.ok(
      readme.includes(
        '--manageReverseTask compare --taskId <taskId> --otherTaskId <otherTaskId>',
      ),
    );
    assert.ok(readme.includes('--orchestrateReverseTask <taskId>'));
    assert.ok(
      readme.includes('--orchestrateReverseTask <taskId> --execute --resume'),
    );
    assert.ok(
      readme.includes('--orchestrateReverseTask <taskId> --strategy env-fix'),
    );
    assert.ok(readme.includes('--runReverseAgent <taskId>'));
    assert.ok(readme.includes('outputMode'));
    assert.ok(readme.includes('fallbackPlan'));
    assert.ok(readme.includes('skipSteps'));
    assert.ok(readme.includes('get_rebuild_health_report'));
    assert.ok(readme.includes('agentGuidance'));
    assert.ok(readme.includes('recommendedStrategy'));
    assert.ok(readme.includes('artifacts'));
    assert.ok(readme.includes('get / summarize'));
    assert.ok(readme.includes('patchSuggestions'));
    assert.ok(readme.includes('evidenceAggregates'));
    assert.ok(readme.includes('--executionOverrides'));
    assert.ok(readme.includes('reverse-task-orchestration.md'));
    assert.ok(readme.includes('CLI cheatsheet'));
    assert.ok(
      readme.includes('供后续 summarize / progress / orchestration 复用'),
    );
    assert.ok(readme.includes('--doctor'));
    assert.ok(readme.includes('[docs/knowledge/parameter-blueprints/'));
    assert.ok(readme.includes('Git 默认只提交 `artifacts/tasks/_TEMPLATE/`'));
    assert.deepStrictEqual(docsRootFiles, []);
    assert.ok(caseIndex.includes('迁移状态'));
    assert.ok(caseIndex.includes('docs/knowledge/parameter-blueprints/'));
    assert.ok(!caseIndex.includes('jd-h5st-pure-node.mjs'));
    assert.ok(!caseIndex.includes('ks-hxfalcon-pure-node.mjs'));
    assert.ok(!caseIndex.includes('douyin-a-bogus-pure-node.mjs'));
    assert.ok(caseIndex.includes('参数级旧 case 已全部退役'));
    assert.ok(!caseIndex.includes('mcp-reverse-pure-node-workflow.mjs'));
    assert.ok(!caseIndex.includes('abstract-case-template.mjs'));
    assert.ok(
      caseIndex.includes('如果新增公开参数 / 链路入口，统一更新本文件'),
    );
    assert.ok(workflowIndex.includes('generic-header-sign'));
    assert.ok(workflowIndex.includes('jd-h5st'));
    assert.ok(caseIndex.includes('字段规范'));
    assert.ok(reverseIndex.includes('export_rebuild_bundle'));
    assert.ok(reverseIndex.includes('record_reverse_evidence'));
    assert.ok(artifactsDoc.includes('timeline.jsonl'));
    assert.ok(artifactsDoc.includes('最小必备文件'));
    assert.ok(artifactsDoc.includes('可选文件'));
    assert.ok(artifactsDoc.includes('run/exported-runtime.js'));
    assert.ok(artifactsDoc.includes('portable runtime'));
    assert.ok(reverseWorkflowDoc.includes('模型执行协议'));
    assert.ok(reverseWorkflowDoc.includes('Observe-first'));
    assert.ok(reverseWorkflowDoc.includes('env rebuild'));
    assert.ok(readme.includes('reverse-update-prompt-template'));
    assert.ok(readme.includes('reverse-report-template'));
    assert.ok(reverseBootstrapDoc.includes('第一条正式工作回复必须包含'));
    assert.ok(reverseBootstrapDoc.includes('当前阶段'));
    assert.ok(updatePromptTemplate.includes('first divergence'));
    assert.ok(updatePromptTemplate.includes('不要猜'));
    assert.ok(reverseReportTemplate.includes('目标接口与字段'));
    assert.ok(reverseReportTemplate.includes('task artifact'));
    assert.ok(
      caseSafetyPolicy.includes('仅 `artifacts/tasks/_TEMPLATE/` 允许默认入库'),
    );
    assert.ok(
      caseSafetyPolicy.includes(
        '真实 `artifacts/tasks/<task-id>/` 默认视为本地私有任务目录',
      ),
    );
    assert.ok(
      caseSafetyPolicy.includes(
        '新增正式文档时，不要再直接放到 `docs/` 根目录',
      ),
    );
    assert.ok(algorithmUpgradeTemplate.includes('first divergence'));
    assert.ok(algorithmUpgradeTemplate.includes('targetFunctionNames'));
    assert.ok(algorithmUpgradeTemplate.includes('env rebuild'));
    assert.ok(toolReference.includes('targetActionDescription'));
    assert.ok(toolReference.includes('targetFunctionNames'));
    assert.ok(toolReference.includes('diagnose_environment'));
    assert.ok(toolReference.includes('recommend_next_step'));
    assert.ok(toolReference.includes('explain_reverse_stage'));
    assert.ok(toolReference.includes('hover_element'));
    assert.ok(toolReference.includes('select_option'));
    assert.ok(toolReference.includes('wait_for_network_idle'));
    assert.ok(toolReference.includes('set_viewport'));
    assert.ok(toolReference.includes('repair_browser_connection'));
    assert.ok(toolReference.includes('trace_request_to_code'));
    assert.ok(toolReference.includes('locate_candidate_functions'));
    assert.ok(toolReference.includes('probe_runtime_capabilities'));
    assert.ok(toolReference.includes('export_diagnostic_bundle'));
    assert.ok(toolReference.includes('infer_websocket_schema'));
    assert.ok(toolReference.includes('diff_session_state'));
    assert.ok(toolReference.includes('aiMode'));
    assert.ok(toolReference.includes('orchestrate_reverse_task'));
    assert.ok(toolReference.includes('run_reverse_agent'));
    assert.ok(toolReference.includes('generatedArtifacts'));
    assert.ok(toolReference.includes('get_rebuild_health_report'));
    assert.ok(toolReference.includes('otherTaskId'));
    assert.ok(toolReference.includes('pruneOlderThanDays'));
    assert.ok(toolReference.includes('strategy'));
    assert.ok(toolReference.includes('agentGuidance'));
    assert.ok(toolReference.includes('recommendedStrategy'));
    assert.ok(toolReference.includes('artifacts'));
    assert.ok(toolReference.includes('outputMode'));
    assert.ok(toolReference.includes('fallbackPlan'));
    assert.ok(toolReference.includes('get_rebuild_health_report'));
    assert.ok(orchestrationGuide.includes('codex --resume'));
    assert.ok(orchestrationGuide.includes('mcp-agent-quick-reference.md'));
    assert.ok(orchestrationGuide.includes('orchestration-checkpoint.json'));
    assert.ok(orchestrationGuide.includes('--stopOnError'));
    assert.ok(orchestrationGuide.includes('--executionOverrides'));
    assert.ok(orchestrationGuide.includes('CLI cheatsheet'));
    assert.ok(orchestrationGuide.includes('onlySteps'));
    assert.ok(orchestrationGuide.includes('fromStep'));
    assert.ok(orchestrationGuide.includes('strategy'));
    assert.ok(orchestrationGuide.includes('env-fix'));
    assert.ok(orchestrationGuide.includes('get_rebuild_health_report'));
    assert.ok(orchestrationGuide.includes('agentGuidance'));
    assert.ok(orchestrationGuide.includes('compact'));
    assert.ok(orchestrationGuide.includes('## agent-first JSON 示例'));
    assert.ok(orchestrationGuide.includes('"schemaVersion": "1.0"'));
    assert.ok(orchestrationGuide.includes('"taskId": "task-demo-001"'));
    assert.ok(
      orchestrationGuide.includes(
        '"requiredParams": ["runtimeError", "observedCapabilities"]',
      ),
    );
    assert.ok(orchestrationGuide.includes('env error fallback'));
    assert.ok(orchestrationGuide.includes('"errorType": "env_error"'));
    assert.ok(orchestrationGuide.includes('"errorType": "task_blocked"'));
    assert.ok(orchestrationGuide.includes('怎么消费这些状态'));
    assert.ok(orchestrationGuide.includes('推荐消费顺序'));
    assert.ok(orchestrationGuide.includes('先读 `responseSummary`'));
    assert.ok(orchestrationGuide.includes('最小状态机'));
    assert.ok(orchestrationGuide.includes('agent 执行模板'));
    assert.ok(
      orchestrationGuide.includes(
        'if outcome == blocked: stop and surface blockedBy',
      ),
    );
    assert.ok(orchestrationGuide.includes('工具选择决策表'));
    assert.ok(orchestrationGuide.includes('想自动决定下一步并连续推进'));
    assert.ok(orchestrationGuide.includes('简化决策树'));
    assert.ok(orchestrationGuide.includes('已有 taskId?'));
    assert.ok(orchestrationGuide.includes('典型组合'));
    assert.ok(orchestrationGuide.includes('观察 -> 落盘 -> 摘要 -> 编排'));
    assert.ok(orchestrationGuide.includes('反模式 / 常见误用'));
    assert.ok(
      orchestrationGuide.includes('拿到 `outcome=blocked` 还继续盲目 `resume`'),
    );
    assert.ok(
      orchestrationGuide.includes('把 `recommend_next_step` 当成持久化编排器'),
    );
    assert.ok(
      orchestrationGuide.includes(
        '忽略 `continuation.ready=false` 还强行执行 `continuation.invoke`',
      ),
    );
    assert.ok(orchestrationGuide.includes('一句话记忆版'));
    assert.ok(orchestrationGuide.includes('自动推进'));
    assert.ok(orchestrationGuide.includes('fallbackPlan'));
    assert.ok(orchestrationGuide.includes('recommendedNextAction'));
    assert.match(
      orchestrationGuide,
      /failureType\s+\|\s+常见含义\s+\|\s+默认 retryable/,
    );
    assert.ok(orchestrationGuide.includes('record_reverse_evidence'));
    assert.ok(orchestrationGuide.includes('证据落盘'));
    assert.ok(toolReference.includes('start_reverse_task'));
    assert.ok(toolReference.includes('manage_reverse_task'));
    assert.ok(toolReference.includes('"schemaVersion": "1.0"'));
    assert.ok(
      toolReference.includes(
        'Compact response example (`manage_reverse_task:get`)',
      ),
    );
    assert.ok(toolReference.includes('"requiredParams": ["taskId"]'));
    assert.ok(
      toolReference.includes(
        '"requiredParams": ["runtimeError", "observedCapabilities"]',
      ),
    );
    assert.ok(
      toolReference.includes(
        'Failure response example (`env_error`, resumable)',
      ),
    );
    assert.ok(toolReference.includes('Blocked response example'));
    assert.ok(!toolReference.includes('append_reverse_timeline'));
    assert.ok(!toolReference.includes('update_reverse_task_state'));
    assert.ok(!toolReference.includes('get_reverse_task_state'));
    assert.ok(!toolReference.includes('summarize_reverse_task'));
    assert.ok(!toolReference.includes('auto_progress_reverse_task'));
    assert.ok(!toolReference.includes('list_reverse_tasks'));
    assert.ok(toolIoContract.includes('Canonical Store'));
    assert.ok(outputContract.includes('targetContext'));
    assert.ok(outputContract.includes('targetActionDescription'));
    assert.ok(envPatchingDoc.includes('MCP 页面取证'));
    assert.ok(envPatchingDoc.includes('capture.json'));
    assert.ok(envPatchingDoc.includes('不要猜环境'));
    assert.ok(envPatchingDoc.includes('代理诊断层'));
    assert.ok(envPatchingDoc.includes('补丁判定表'));
    assert.ok(envPatchingDoc.includes('负面示例'));
    assert.ok(envPatchingDoc.includes('两阶段目标'));
    assert.ok(envPatchingDoc.includes('可移植 JS 导出'));
    assert.ok(envTemplate.includes('globalThis.window = globalThis'));
    assert.ok(envTemplate.includes('globalThis.localStorage ??='));
    assert.ok(polyfillsTemplate.includes('globalThis.watch = function watch'));
    assert.ok(
      polyfillsTemplate.includes(
        'globalThis.makeFunction = function makeFunction',
      ),
    );
    assert.ok(polyfillsTemplate.includes('[env:get]'));
    assert.ok(entryTemplate.includes("import './env.js';"));
    assert.ok(entryTemplate.includes("import './polyfills.js';"));
    const gettingStarted = await readRepoFile('docs/guides/getting-started.md');
    assert.ok(gettingStarted.includes('resume=true'));
    assert.ok(
      gettingStarted.includes(
        'node /ABSOLUTE/PATH/JSReverser-MCP/build/src/index.js --orchestrateReverseTask <taskId> --execute --resume',
      ),
    );
    assert.ok(!gettingStarted.includes('jsreverser-mcp --'));
    assert.ok(!gettingStarted.includes('npx jsreverser-mcp'));
    assert.ok(
      gettingStarted.includes(
        '--orchestrateReverseTask <taskId> --execute --resume',
      ),
    );
    assert.ok(gettingStarted.includes('--runReverseAgent <taskId>'));
    assert.ok(gettingStarted.includes('orchestration-checkpoint.json'));
    assert.ok(gettingStarted.includes('run/pure-selftest.test.mjs'));
    assert.ok(gettingStarted.includes('record_reverse_evidence'));
    assert.ok(gettingStarted.includes('mcp-agent-quick-reference.md'));
    assert.ok(gettingStarted.includes('mcp-client-auto-resume-example.md'));
    assert.ok(gettingStarted.includes('create_reverse_task_from_request'));
    assert.ok(gettingStarted.includes('get_rebuild_health_report'));
    assert.ok(gettingStarted.includes('evidenceAggregates'));
    assert.ok(quickReferenceGuide.includes('MCP agent 速查页'));
    assert.ok(quickReferenceGuide.includes('工具怎么选'));
    assert.ok(quickReferenceGuide.includes('schemaVersion'));
    assert.ok(quickReferenceGuide.includes('当前应为 `"1.0"`'));
    assert.ok(quickReferenceGuide.includes('响应先读什么'));
    assert.ok(quickReferenceGuide.includes('最小状态机'));
    assert.ok(quickReferenceGuide.includes('反模式'));
    assert.ok(quickReferenceGuide.includes('一页版速查'));
    assert.ok(quickReferenceGuide.includes('可直接嵌入的 system prompt 片段'));
    assert.ok(quickReferenceGuide.includes('你在调用 JSReverser-MCP。'));
    assert.ok(
      quickReferenceGuide.includes('如果上下文再紧一点，可以继续压缩成'),
    );
    assert.ok(
      quickReferenceGuide.includes('mcp-client-auto-resume-example.md'),
    );
    assert.ok(
      quickReferenceGuide.includes('reverse-agent-response.schema.json'),
    );
    assert.ok(quickReferenceGuide.includes('manage-response.schema.json'));
    assert.ok(quickReferenceGuide.includes('orchestrate-response.schema.json'));
    assert.ok(
      quickReferenceGuide.includes('rebuild-health-response.schema.json'),
    );
    assert.ok(
      quickReferenceGuide.includes('reverse-agent-schema-versioning.md'),
    );
    assert.ok(autoResumeGuide.includes('MCP client 自动续跑示例'));
    assert.ok(autoResumeGuide.includes('runReverseLoop'));
    assert.ok(autoResumeGuide.includes('schemaVersion?: string;'));
    assert.ok(autoResumeGuide.includes('unsupported_schema_version'));
    assert.ok(autoResumeGuide.includes('missingRequiredParams'));
    assert.ok(autoResumeGuide.includes('outcome=blocked'));
    assert.ok(autoResumeGuide.includes('fallbackPlan'));
    assert.ok(autoResumeGuide.includes('reverse-agent-response.schema.json'));
    assert.ok(autoResumeGuide.includes('manage-response.schema.json'));
    assert.ok(autoResumeGuide.includes('orchestrate-response.schema.json'));
    assert.ok(autoResumeGuide.includes('rebuild-health-response.schema.json'));
    assert.ok(autoResumeGuide.includes('reverse-agent-schema-versioning.md'));
    assert.ok(
      reverseAgentResponseSchema.includes(
        '"title": "JSReverser MCP Reverse Agent Response"',
      ),
    );
    assert.ok(reverseAgentResponseSchema.includes('"x-schemaVersion": "1.0"'));
    assert.ok(reverseAgentResponseSchema.includes('"schemaVersion"'));
    assert.ok(reverseAgentResponseSchema.includes('"const": "1.0"'));
    assert.ok(reverseAgentResponseSchema.includes('"routeGuard"'));
    assert.ok(reverseAgentResponseSchema.includes('"continuation"'));
    assert.ok(reverseAgentResponseSchema.includes('"invokeHint"'));
    assert.ok(reverseAgentResponseSchema.includes('"fallbackPlan"'));
    assert.ok(reverseAgentResponseSchema.includes('"$defs"'));
    assert.ok(reverseAgentResponseSchema.includes('"fallbackPlanStep"'));
    assert.ok(reverseAgentResponseSchema.includes('"toolClass"'));
    assert.ok(reverseAgentResponseSchema.includes('"routeHint"'));
    assert.ok(reverseAgentResponseSchema.includes('"examples"'));
    assert.ok(reverseAgentResponseSchema.includes('"outcome": "success"'));
    assert.ok(reverseAgentResponseSchema.includes('"outcome": "partial"'));
    assert.ok(reverseAgentResponseSchema.includes('"outcome": "blocked"'));
    assert.ok(
      manageResponseSchema.includes(
        '"title": "JSReverser MCP manage_reverse_task Response"',
      ),
    );
    assert.ok(manageResponseSchema.includes('"x-schemaVersion": "1.0"'));
    assert.ok(manageResponseSchema.includes('"action"'));
    assert.ok(
      orchestrateResponseSchema.includes(
        '"title": "JSReverser MCP orchestrate_reverse_task Response"',
      ),
    );
    assert.ok(orchestrateResponseSchema.includes('"x-schemaVersion": "1.0"'));
    assert.ok(orchestrateResponseSchema.includes('"orchestration"'));
    assert.ok(
      rebuildHealthResponseSchema.includes(
        '"title": "JSReverser MCP get_rebuild_health_report Response"',
      ),
    );
    assert.ok(rebuildHealthResponseSchema.includes('"x-schemaVersion": "1.0"'));
    assert.ok(rebuildHealthResponseSchema.includes('"missingCapabilities"'));
    assert.ok(reverseAgentSchemaVersioning.includes('schemaVersion: "1.0"'));
    assert.ok(reverseAgentSchemaVersioning.includes('x-schemaVersion: "1.0"'));
    assert.ok(
      reverseAgentSchemaVersioning.includes(
        'Unsupported reverse-agent schema version',
      ),
    );
  });
});
