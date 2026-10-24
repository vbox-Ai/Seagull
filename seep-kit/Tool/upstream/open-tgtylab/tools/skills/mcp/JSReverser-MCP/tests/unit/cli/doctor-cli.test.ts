/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {executeKnowledgeCliCommand, parseArguments} from '../../../src/cli.js';
import {startReverseTask} from '../../../src/reverse/ReverseTaskBootstrap.js';
import {updateReverseTaskState} from '../../../src/reverse/ReverseTaskState.js';
import {ReverseTaskStore} from '../../../src/reverse/ReverseTaskStore.js';
import {getJSHookRuntime} from '../../../src/tools/runtime.js';

describe('doctor cli', () => {
  it('parses --doctor', () => {
    const parsed = parseArguments('1.2.3', ['node', 'cli.js', '--doctor']);
    assert.strictEqual(parsed.doctor, true);
  });

  it('prints diagnostics json and exits through standalone command path', async () => {
    const lines: string[] = [];
    const handled = await executeKnowledgeCliCommand({doctor: true}, line =>
      lines.push(line),
    );

    assert.strictEqual(handled, true);
    assert.strictEqual(lines.length, 1);
    const parsed = JSON.parse(lines[0]) as {status: string; checks: unknown[]};
    assert.ok(['ok', 'warn', 'fail'].includes(parsed.status));
    assert.ok(Array.isArray(parsed.checks));
  });

  it('supports unified manageReverseTask CLI actions', async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'jsreverser-cli-task-'));
    const originalArtifactsDir = process.env.JSREVERSER_ARTIFACTS_DIR;

    try {
      process.env.JSREVERSER_ARTIFACTS_DIR = rootDir;
      const store = new ReverseTaskStore({rootDir});
      await startReverseTask(store, {
        taskId: 'task-cli-001',
        taskSlug: 'cli-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'cli task flow',
        targetContext: {
          targetRequest: {
            method: 'POST',
            url: 'https://example.com/api/sign',
          },
        },
      });
      const opened = await store.openTask({
        taskId: 'task-cli-001',
        slug: 'cli-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'cli task flow',
      });
      await opened.appendLog('runtime-evidence', {
        source: 'hook',
        kind: 'hook-hit',
        note: 'captured from CLI flow',
      });
      await mkdir(path.join(rootDir, 'task-cli-001', 'run'), {recursive: true});
      await mkdir(path.join(rootDir, 'task-cli-001', 'env'), {recursive: true});
      await writeFile(
        path.join(rootDir, 'task-cli-001', 'run', 'portable.js'),
        '// portable',
      );
      await writeFile(
        path.join(rootDir, 'task-cli-001', 'env', 'replay.js'),
        '// replay',
      );

      const listLines: string[] = [];
      const listHandled = await executeKnowledgeCliCommand(
        {manageReverseTask: 'list'},
        line => listLines.push(line),
      );
      assert.strictEqual(listHandled, true);
      const listPayload = JSON.parse(listLines[0]) as {
        action: string;
        items: Array<{taskId: string}>;
      };
      assert.strictEqual(listPayload.action, 'list');
      assert.strictEqual(listPayload.items[0]?.taskId, 'task-cli-001');

      const stateLines: string[] = [];
      const stateHandled = await executeKnowledgeCliCommand(
        {
          manageReverseTask: 'get',
          taskId: 'task-cli-001',
          reverseTimelineLimit: 3,
          reverseEvidenceLimit: 3,
        },
        line => stateLines.push(line),
      );
      assert.strictEqual(stateHandled, true);
      const statePayload = JSON.parse(stateLines[0]) as {
        action: string;
        taskId: string;
        recentEvidence: Array<{source: string}>;
        compactDelivery?: {
          portablePureReady?: boolean;
          portableReplayReady?: boolean;
          files?: string[];
        };
      };
      assert.strictEqual(statePayload.action, 'get');
      assert.strictEqual(statePayload.taskId, 'task-cli-001');
      assert.strictEqual(statePayload.recentEvidence[0]?.source, 'hook');
      assert.strictEqual(statePayload.compactDelivery?.portablePureReady, true);
      assert.strictEqual(
        statePayload.compactDelivery?.portableReplayReady,
        true,
      );
      assert.deepStrictEqual(statePayload.compactDelivery?.files, [
        'run/portable.js',
        'env/replay.js',
      ]);

      const summaryLines: string[] = [];
      const summaryHandled = await executeKnowledgeCliCommand(
        {manageReverseTask: 'summarize', taskId: 'task-cli-001'},
        line => summaryLines.push(line),
      );
      assert.strictEqual(summaryHandled, true);
      const summaryPayload = JSON.parse(summaryLines[0]) as {
        action: string;
        taskId: string;
        goal: string;
        compactDelivery?: {
          portablePureReady?: boolean;
          portableReplayReady?: boolean;
          files?: string[];
        };
      };
      assert.strictEqual(summaryPayload.action, 'summarize');
      assert.strictEqual(summaryPayload.taskId, 'task-cli-001');
      assert.strictEqual(summaryPayload.goal, 'cli task flow');
      assert.strictEqual(
        summaryPayload.compactDelivery?.portablePureReady,
        true,
      );
      assert.strictEqual(
        summaryPayload.compactDelivery?.portableReplayReady,
        true,
      );
      assert.deepStrictEqual(summaryPayload.compactDelivery?.files, [
        'run/portable.js',
        'env/replay.js',
      ]);

      const progressLines: string[] = [];
      const progressHandled = await executeKnowledgeCliCommand(
        {manageReverseTask: 'progress', taskId: 'task-cli-001'},
        line => progressLines.push(line),
      );
      assert.strictEqual(progressHandled, true);
      const progressPayload = JSON.parse(progressLines[0]) as {
        action: string;
        currentStage: string;
        nextStepHint: string;
        reasoning: string[];
        schemaVersion?: string;
        outcome?: string;
        shouldResume?: boolean;
        nextBestTool?: string;
        detailLevel?: string;
        routeGuard?: {preferredToolClass?: string; routeHint?: string};
        continuation?: {
          tool?: string;
          ready?: boolean;
          actionKey?: string;
          toolClass?: string;
          routeHint?: string;
          invoke?: {tool?: string; params?: Record<string, unknown>};
        };
        agentGuidance?: {
          recommendedTool?: string;
          recommendedStrategy?: string;
          toolClass?: string;
          routeHint?: string;
        };
      };
      assert.strictEqual(progressPayload.action, 'progress');
      assert.strictEqual(progressPayload.schemaVersion, '1.0');
      assert.strictEqual(progressPayload.currentStage, 'Rebuild');
      assert.strictEqual(progressPayload.nextStepHint, 'export_rebuild_bundle');
      assert.ok(Array.isArray(progressPayload.reasoning));
      assert.strictEqual(progressPayload.outcome, 'success');
      assert.strictEqual(progressPayload.shouldResume, true);
      assert.strictEqual(progressPayload.nextBestTool, 'export_rebuild_bundle');
      assert.strictEqual(progressPayload.detailLevel, 'standard');
      assert.strictEqual(
        progressPayload.routeGuard?.preferredToolClass,
        'rebuild',
      );
      assert.strictEqual(
        progressPayload.routeGuard?.routeHint,
        'switch_to_rebuild',
      );
      assert.strictEqual(progressPayload.continuation?.ready, true);
      assert.strictEqual(
        progressPayload.continuation?.tool,
        'export_rebuild_bundle',
      );
      assert.strictEqual(
        progressPayload.continuation?.actionKey,
        'export_rebuild_bundle',
      );
      assert.strictEqual(
        progressPayload.continuation?.invoke?.tool,
        'export_rebuild_bundle',
      );
      assert.deepStrictEqual(progressPayload.continuation?.invoke?.params, {
        taskId: 'task-cli-001',
      });
      assert.strictEqual(progressPayload.continuation?.toolClass, 'rebuild');
      assert.strictEqual(
        progressPayload.continuation?.routeHint,
        'switch_to_rebuild',
      );
      assert.strictEqual(
        progressPayload.agentGuidance?.recommendedTool,
        'export_rebuild_bundle',
      );
      assert.strictEqual(
        progressPayload.agentGuidance?.recommendedStrategy,
        'rebuild-first',
      );
      assert.strictEqual(progressPayload.agentGuidance?.toolClass, 'rebuild');
      assert.strictEqual(
        progressPayload.agentGuidance?.routeHint,
        'switch_to_rebuild',
      );

      const compactLines: string[] = [];
      const compactHandled = await executeKnowledgeCliCommand(
        {
          manageReverseTask: 'summarize',
          taskId: 'task-cli-001',
          outputMode: 'compact',
        },
        line => compactLines.push(line),
      );
      assert.strictEqual(compactHandled, true);
      const compactPayload = JSON.parse(compactLines[0]) as {
        outputMode?: string;
        recentTimeline?: unknown[];
        recentEvidence?: unknown[];
      };
      assert.strictEqual(compactPayload.outputMode, 'compact');
      assert.strictEqual(compactPayload.recentTimeline, undefined);
      assert.strictEqual(compactPayload.recentEvidence, undefined);

      await assert.rejects(
        () =>
          executeKnowledgeCliCommand(
            {manageReverseTask: 'search'},
            () => undefined,
          ),
        /query or tag is required/,
      );
    } finally {
      if (originalArtifactsDir === undefined) {
        delete process.env.JSREVERSER_ARTIFACTS_DIR;
      } else {
        process.env.JSREVERSER_ARTIFACTS_DIR = originalArtifactsDir;
      }
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('resumes orchestrateReverseTask CLI execution from a failed checkpoint', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-cli-orchestrate-resume-'),
    );
    const originalArtifactsDir = process.env.JSREVERSER_ARTIFACTS_DIR;

    try {
      process.env.JSREVERSER_ARTIFACTS_DIR = rootDir;
      const store = new ReverseTaskStore({rootDir});
      await startReverseTask(store, {
        taskId: 'task-cli-orchestrate-resume-001',
        taskSlug: 'cli-orchestrate-resume-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'cli orchestrate resume flow',
        targetContext: {
          targetRequest: {
            method: 'POST',
            url: 'https://example.com/api/sign',
          },
        },
      });
      const opened = await store.openTask({
        taskId: 'task-cli-orchestrate-resume-001',
        slug: 'cli-orchestrate-resume-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'cli orchestrate resume flow',
      });
      await opened.writeSnapshot('target-context.json', {
        targetRequest: {
          method: 'POST',
          url: 'https://example.com/api/sign',
        },
        locatedSignature: {
          functionName: 'genSign',
          scriptUrl: 'https://example.com/app.js',
        },
      });
      await opened.writeSnapshot('function-slice.json', {
        mainFunction: 'genSign',
        scriptId: '77',
        scriptUrl: 'https://example.com/app.js',
        code: 'function genSign(){return 1}',
        extractedCount: 1,
        totalSize: 24,
      });
      await updateReverseTaskState(store, {
        taskId: 'task-cli-orchestrate-resume-001',
        currentStage: 'PureExtraction',
        status: 'partial',
        currentSummary: 'ready to extract pure algorithm',
        nextStepHint: 'understand_code',
        successCriteria: {localRebuild: 'pass', browserAlignment: 'pass'},
      });

      const firstLines: string[] = [];
      const firstHandled = await executeKnowledgeCliCommand(
        {
          orchestrateReverseTask: 'task-cli-orchestrate-resume-001',
          execute: true,
        },
        line => firstLines.push(line),
      );
      assert.strictEqual(firstHandled, true);
      const firstPayload = JSON.parse(firstLines[0]) as {
        errorCode?: string;
        errorType?: string;
        retryable?: boolean;
        blockedBy?: string;
        execution?: {
          checkpoint?: {
            status: string;
            failedStepKey?: string;
            failureType?: string;
            retryable?: boolean;
          };
          failedStep?: {
            tool: string;
            failureType?: string;
            retryable?: boolean;
          };
          recovery?: {recommendedCommand?: string; shouldResume?: boolean};
        };
      };
      assert.strictEqual(firstPayload.execution?.checkpoint?.status, 'failed');
      assert.strictEqual(
        firstPayload.execution?.checkpoint?.failedStepKey,
        'understand_code',
      );
      assert.strictEqual(
        firstPayload.execution?.checkpoint?.failureType,
        'tool_error',
      );
      assert.strictEqual(firstPayload.execution?.checkpoint?.retryable, true);
      assert.strictEqual(
        firstPayload.execution?.failedStep?.tool,
        'understand_code',
      );
      assert.strictEqual(firstPayload.errorCode, 'tool_error');
      assert.strictEqual(firstPayload.errorType, 'tool_error');
      assert.strictEqual(firstPayload.retryable, true);
      assert.strictEqual(firstPayload.blockedBy, 'tooling');
      assert.ok(
        firstPayload.execution?.recovery?.recommendedCommand?.includes(
          '--execute --resume',
        ),
      );
      assert.ok(
        firstPayload.execution?.recovery?.recommendedCommand?.startsWith(
          'node ',
        ),
      );
      assert.ok(
        !firstPayload.execution?.recovery?.recommendedCommand?.startsWith(
          'jsreverser-mcp ',
        ),
      );
      assert.strictEqual(firstPayload.execution?.recovery?.shouldResume, true);

      const resumedLines: string[] = [];
      const resumedHandled = await executeKnowledgeCliCommand(
        {
          orchestrateReverseTask: 'task-cli-orchestrate-resume-001',
          execute: true,
          resume: true,
          includeSummary: false,
          executionOverrides: {
            understand_code: {
              status: 'ok',
              result: 'synthetic pure extraction completed after resume',
            },
          },
        },
        line => resumedLines.push(line),
      );
      assert.strictEqual(resumedHandled, true);
      const resumedPayload = JSON.parse(resumedLines[0]) as {
        execution?: {
          resumed: boolean;
          checkpoint?: {status: string};
          stepResults: Array<{
            key: string;
            status: string;
            retryCount?: number;
          }>;
        };
        summary?: unknown;
      };
      assert.strictEqual(resumedPayload.execution?.resumed, true);
      assert.strictEqual(
        resumedPayload.execution?.checkpoint?.status,
        'passed',
      );
      assert.strictEqual(resumedPayload.summary, undefined);
      assert.ok(
        resumedPayload.execution?.stepResults.some(
          entry =>
            entry.key === 'understand_code' &&
            entry.status === 'failed' &&
            entry.retryCount === 1,
        ),
      );
      assert.ok(
        resumedPayload.execution?.stepResults.some(
          entry => entry.key === 'understand_code' && entry.status === 'passed',
        ),
      );
    } finally {
      if (originalArtifactsDir === undefined) {
        delete process.env.JSREVERSER_ARTIFACTS_DIR;
      } else {
        process.env.JSREVERSER_ARTIFACTS_DIR = originalArtifactsDir;
      }
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('supports orchestrateReverseTask CLI execution and extended flags', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-cli-orchestrate-'),
    );
    const originalArtifactsDir = process.env.JSREVERSER_ARTIFACTS_DIR;

    try {
      process.env.JSREVERSER_ARTIFACTS_DIR = rootDir;
      const store = new ReverseTaskStore({rootDir});
      await startReverseTask(store, {
        taskId: 'task-cli-orchestrate-001',
        taskSlug: 'cli-orchestrate-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'cli orchestrate flow',
        targetContext: {
          targetRequest: {
            method: 'POST',
            url: 'https://example.com/api/sign',
          },
        },
      });
      const opened = await store.openTask({
        taskId: 'task-cli-orchestrate-001',
        slug: 'cli-orchestrate-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'cli orchestrate flow',
      });
      await opened.writeSnapshot('target-context.json', {
        targetRequest: {
          method: 'POST',
          url: 'https://example.com/api/sign',
        },
        locatedSignature: {
          functionName: 'genSign',
          scriptUrl: 'https://example.com/app.js',
        },
      });
      await opened.writeSnapshot('function-slice.json', {
        mainFunction: 'genSign',
        scriptId: '77',
        scriptUrl: 'https://example.com/app.js',
        code: 'function genSign(){return 1}',
        extractedCount: 1,
        totalSize: 24,
      });
      await updateReverseTaskState(store, {
        taskId: 'task-cli-orchestrate-001',
        currentStage: 'PureExtraction',
        status: 'partial',
        currentSummary: 'ready to extract pure algorithm',
        nextStepHint: 'understand_code',
        successCriteria: {localRebuild: 'pass', browserAlignment: 'pass'},
      });

      const lines: string[] = [];
      const handled = await executeKnowledgeCliCommand(
        {
          orchestrateReverseTask: 'task-cli-orchestrate-001',
          execute: true,
          resume: true,
          outputMode: 'compact',
          stopOnError: false,
          onlyStep: ['understand_code'],
          includeSummary: true,
          persistState: true,
          executionOverrides: {
            understand_code: {
              status: 'ok',
              result: 'synthetic pure extraction completed',
            },
          },
        },
        line => lines.push(line),
      );
      assert.strictEqual(handled, true);
      const payload = JSON.parse(lines[0]) as {
        taskId: string;
        outputMode?: string;
        outcome?: string;
        shouldResume?: boolean;
        nextBestTool?: string;
        detailLevel?: string;
        agentGuidance?: unknown;
        continuation?: {tool?: string; ready?: boolean; actionKey?: string};
        execution?: {
          executed: boolean;
          resumed: boolean;
          checkpoint?: {status: string};
        };
        summary?: {taskId: string};
        orchestration: {primaryStep: {tool: string}};
      };
      assert.strictEqual(payload.taskId, 'task-cli-orchestrate-001');
      assert.strictEqual(payload.outputMode, 'compact');
      assert.strictEqual(payload.outcome, 'success');
      assert.strictEqual(payload.shouldResume, false);
      assert.strictEqual(payload.nextBestTool, undefined);
      assert.strictEqual(payload.detailLevel, 'minimal');
      assert.strictEqual(payload.agentGuidance, undefined);
      assert.strictEqual(payload.continuation?.ready, true);
      assert.strictEqual(payload.continuation?.tool, 'understand_code');
      assert.strictEqual(payload.continuation?.actionKey, 'understand_code');
      assert.strictEqual(payload.execution?.executed, true);
      assert.strictEqual(payload.execution?.resumed, true);
      assert.strictEqual(payload.execution?.checkpoint?.status, 'passed');
      assert.strictEqual(payload.summary, undefined);
      assert.strictEqual(
        payload.orchestration.primaryStep.tool,
        'understand_code',
      );
    } finally {
      if (originalArtifactsDir === undefined) {
        delete process.env.JSREVERSER_ARTIFACTS_DIR;
      } else {
        process.env.JSREVERSER_ARTIFACTS_DIR = originalArtifactsDir;
      }
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('returns env-error recovery guidance when a filtered orchestration step fails', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-cli-orchestrate-env-'),
    );
    const originalArtifactsDir = process.env.JSREVERSER_ARTIFACTS_DIR;

    try {
      process.env.JSREVERSER_ARTIFACTS_DIR = rootDir;
      const store = new ReverseTaskStore({rootDir});
      await startReverseTask(store, {
        taskId: 'task-cli-orchestrate-env-001',
        taskSlug: 'cli-orchestrate-env-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'cli orchestrate env flow',
        targetContext: {
          targetRequest: {
            method: 'POST',
            url: 'https://example.com/api/sign',
          },
        },
      });
      const opened = await store.openTask({
        taskId: 'task-cli-orchestrate-env-001',
        slug: 'cli-orchestrate-env-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'cli orchestrate env flow',
      });
      await opened.writeSnapshot('target-context.json', {
        targetRequest: {
          method: 'POST',
          url: 'https://example.com/api/sign',
        },
        locatedSignature: {
          functionName: 'genSign',
          scriptUrl: 'https://example.com/app.js',
        },
      });
      await opened.writeSnapshot('function-slice.json', {
        mainFunction: 'genSign',
        scriptId: '77',
        scriptUrl: 'https://example.com/app.js',
        code: 'function genSign(){return 1}',
        extractedCount: 1,
        totalSize: 24,
      });
      await updateReverseTaskState(store, {
        taskId: 'task-cli-orchestrate-env-001',
        currentStage: 'PureExtraction',
        status: 'partial',
        currentSummary: 'ready to extract pure algorithm',
        nextStepHint: 'understand_code',
        successCriteria: {localRebuild: 'pass', browserAlignment: 'pass'},
      });

      const lines: string[] = [];
      const handled = await executeKnowledgeCliCommand(
        {
          orchestrateReverseTask: 'task-cli-orchestrate-env-001',
          execute: true,
          onlyStep: ['understand_code'],
          executionOverrides: {
            understand_code: {
              status: 'error',
              error: 'window is not defined',
            },
          },
        },
        line => lines.push(line),
      );
      assert.strictEqual(handled, true);
      const payload = JSON.parse(lines[0]) as {
        execution?: {
          failedStep?: {failureType?: string};
          recovery?: {
            recommendedCommand?: string;
            shouldInspectSummary?: boolean;
            shouldResume?: boolean;
          };
        };
      };
      assert.strictEqual(
        payload.execution?.failedStep?.failureType,
        'env_error',
      );
      assert.ok(
        payload.execution?.recovery?.recommendedCommand?.includes(
          '--manageReverseTask summarize',
        ),
      );
      assert.ok(
        payload.execution?.recovery?.recommendedCommand?.startsWith('node '),
      );
      assert.strictEqual(
        payload.execution?.recovery?.shouldInspectSummary,
        true,
      );
      assert.strictEqual(payload.execution?.recovery?.shouldResume, true);
    } finally {
      if (originalArtifactsDir === undefined) {
        delete process.env.JSREVERSER_ARTIFACTS_DIR;
      } else {
        process.env.JSREVERSER_ARTIFACTS_DIR = originalArtifactsDir;
      }
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('supports runReverseAgent CLI execution for pure-extraction drafts', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-cli-run-agent-'),
    );
    const originalArtifactsDir = process.env.JSREVERSER_ARTIFACTS_DIR;
    const runtime = getJSHookRuntime();
    const originals = {
      analyzerUnderstand: runtime.analyzer.understand,
      deobfuscatorDeobfuscate: runtime.deobfuscator.deobfuscate,
    };

    try {
      process.env.JSREVERSER_ARTIFACTS_DIR = rootDir;
      const store = new ReverseTaskStore({rootDir});
      await startReverseTask(store, {
        taskId: 'task-cli-run-agent-001',
        taskSlug: 'cli-run-agent-demo',
        targetUrl: 'https://example.com/api/h5st',
        goal: 'cli run agent flow',
        targetContext: {
          targetRequest: {
            method: 'POST',
            url: 'https://example.com/api/h5st',
          },
        },
        currentStage: 'PureExtraction',
        currentSummary: 'ready for pure extraction',
      });
      const opened = await store.openTask({
        taskId: 'task-cli-run-agent-001',
        slug: 'cli-run-agent-demo',
        targetUrl: 'https://example.com/api/h5st',
        goal: 'cli run agent flow',
        currentStage: 'PureExtraction',
        currentSummary: 'ready for pure extraction',
      });
      await opened.writeSnapshot('target-context.json', {
        targetRequest: {
          method: 'POST',
          url: 'https://example.com/api/h5st',
        },
        locatedSignature: {
          functionName: 'genH5st',
          scriptUrl: 'https://example.com/app.js',
        },
      });
      await opened.writeSnapshot('function-slice.json', {
        mainFunction: 'genH5st',
        scriptId: '77',
        scriptUrl: 'https://example.com/app.js',
        code: 'function genH5st(){return hash(body)}\nfunction hash(v){return v}',
        extractedCount: 2,
        totalSize: 64,
      });
      await opened.appendLog('runtime-evidence', {
        source: 'capture',
        kind: 'sample',
        requestUrl: 'https://example.com/api/h5st',
        bodyPreview:
          '{"appid":"app-1","body":{"sku":"1001"},"functionId":"sign.test"}',
      });

      runtime.analyzer.understand = async () => ({
        structure: {
          functions: [],
          classes: [],
          modules: [],
          callGraph: {nodes: [], edges: []},
        },
        techStack: {other: []},
        businessLogic: {
          mainFeatures: ['build h5st'],
          entities: [],
          rules: [],
          dataModel: {},
        },
        dataFlow: {
          graph: {nodes: [], edges: []},
          sources: [],
          sinks: [],
          taintPaths: [],
        },
        securityRisks: [],
        qualityScore: 90,
      });
      runtime.deobfuscator.deobfuscate = async () => ({
        code: 'function genH5st(input){return input}',
        readabilityScore: 90,
        confidence: 0.9,
        obfuscationType: ['webpack'],
        transformations: [],
        analysis: 'cli normalized draft',
      });

      const lines: string[] = [];
      const handled = await executeKnowledgeCliCommand(
        {
          runReverseAgent: 'task-cli-run-agent-001',
          maxRounds: 2,
          goalMode: 'port-ready',
          autoExportPortable: true,
          outputMode: 'compact',
          includeSummary: false,
        },
        line => lines.push(line),
      );
      assert.strictEqual(handled, true);
      const payload = JSON.parse(lines[0]) as {
        run?: {
          stopReason?: string;
          goalMode?: string;
          autoExportPortable?: boolean;
        };
        outputMode?: string;
        generatedArtifacts?: string[];
      };
      assert.strictEqual(payload.run?.stopReason, 'pure_extraction_ready');
      assert.strictEqual(payload.run?.goalMode, 'port-ready');
      assert.strictEqual(payload.run?.autoExportPortable, true);
      assert.strictEqual(payload.outputMode, 'compact');
      assert.ok((payload.generatedArtifacts ?? []).includes('run/portable.js'));

      const pureMain = await readFile(
        path.join(rootDir, 'task-cli-run-agent-001', 'run', 'pure-main.js'),
        'utf8',
      );
      assert.ok(pureMain.includes('PORT_CONTRACT'));
      const portable = await readFile(
        path.join(rootDir, 'task-cli-run-agent-001', 'run', 'portable.js'),
        'utf8',
      );
      assert.ok(portable.includes('runPortableFixture'));
    } finally {
      runtime.analyzer.understand = originals.analyzerUnderstand;
      runtime.deobfuscator.deobfuscate = originals.deobfuscatorDeobfuscate;
      if (originalArtifactsDir === undefined) {
        delete process.env.JSREVERSER_ARTIFACTS_DIR;
      } else {
        process.env.JSREVERSER_ARTIFACTS_DIR = originalArtifactsDir;
      }
      await rm(rootDir, {recursive: true, force: true});
    }
  });

  it('supports exportPortableBundle CLI execution for compact delivery artifacts', async () => {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), 'jsreverser-cli-portable-export-'),
    );
    const originalArtifactsDir = process.env.JSREVERSER_ARTIFACTS_DIR;

    try {
      process.env.JSREVERSER_ARTIFACTS_DIR = rootDir;
      const store = new ReverseTaskStore({rootDir});
      const task = await store.openTask({
        taskId: 'task-cli-portable-001',
        slug: 'cli-portable-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'cli portable export',
      });
      await task.writeSnapshot('task.json', {
        taskId: 'task-cli-portable-001',
        slug: 'cli-portable-demo',
        targetUrl: 'https://example.com/api/sign',
        goal: 'cli portable export',
      });
      await task.writeSnapshot('pure-extraction.json', {
        stage: 'PureExtraction',
        goalMode: 'pure-draft',
        mainFunction: 'signPayload',
      });
      await mkdir(path.join(rootDir, 'task-cli-portable-001', 'run'), {
        recursive: true,
      });
      await mkdir(path.join(rootDir, 'task-cli-portable-001', 'env'), {
        recursive: true,
      });
      await writeFile(
        path.join(rootDir, 'task-cli-portable-001', 'run', 'fixtures.json'),
        `${JSON.stringify(
          {
            goalMode: 'pure-draft',
            mainFunction: 'signPayload',
            samples: [
              {caseId: 'fixture-001', input: {token: 'a'}, runtimeContext: {}},
            ],
          },
          null,
          2,
        )}\n`,
      );
      await writeFile(
        path.join(rootDir, 'task-cli-portable-001', 'env', 'capture.json'),
        `${JSON.stringify(
          {
            runtimeEvidence: [{functionName: 'signPayload'}],
          },
          null,
          2,
        )}\n`,
      );
      await writeFile(
        path.join(rootDir, 'task-cli-portable-001', 'run', 'pure-main.js'),
        [
          'export function signPayload(input, runtimeContext = {}) {',
          '  return {ok: false, input, runtimeContext, signature: null};',
          '}',
          'export function runFixture(fixture) {',
          '  return signPayload(fixture.input ?? {}, fixture.runtimeContext ?? {});',
          '}',
        ].join('\n'),
      );
      await writeFile(
        path.join(rootDir, 'task-cli-portable-001', 'env', 'env.js'),
        'globalThis.window = globalThis;\n',
      );
      await writeFile(
        path.join(rootDir, 'task-cli-portable-001', 'env', 'polyfills.js'),
        'globalThis.atob = (v) => v;\n',
      );
      await writeFile(
        path.join(rootDir, 'task-cli-portable-001', 'env', 'entry.js'),
        'import "./env.js";\nimport "./polyfills.js";\nconsole.log("replay");\n',
      );

      const lines: string[] = [];
      const handled = await executeKnowledgeCliCommand(
        {
          exportPortableBundle: 'task-cli-portable-001',
          artifactMode: 'pure',
        },
        line => lines.push(line),
      );
      assert.strictEqual(handled, true);

      const payload = JSON.parse(lines[0]) as {
        artifactMode?: string;
        generatedFiles?: string[];
      };
      assert.strictEqual(payload.artifactMode, 'pure');
      assert.deepStrictEqual(payload.generatedFiles, ['run/portable.js']);

      const portable = await readFile(
        path.join(rootDir, 'task-cli-portable-001', 'run', 'portable.js'),
        'utf8',
      );
      assert.ok(portable.includes('runPortableFixture'));
    } finally {
      if (originalArtifactsDir === undefined) {
        delete process.env.JSREVERSER_ARTIFACTS_DIR;
      } else {
        process.env.JSREVERSER_ARTIFACTS_DIR = originalArtifactsDir;
      }
      await rm(rootDir, {recursive: true, force: true});
    }
  });
});
