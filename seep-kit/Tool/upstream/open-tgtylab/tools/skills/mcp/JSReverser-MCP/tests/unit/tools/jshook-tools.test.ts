/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {zod} from '../../../src/third_party/index.js';
import {
  analyzeTarget,
  getReference,
  getReferenceRoute,
  riskPanel,
  summarizeCode,
  exportSessionReport,
} from '../../../src/tools/analyzer.js';
import {collectCode, collectionDiff} from '../../../src/tools/collector.js';
import {queryDom} from '../../../src/tools/dom.js';
import {createHook, getHookData} from '../../../src/tools/hook.js';
import {
  clickElement,
  checkBrowserHealth,
  emulateDevice,
  getAllLinks,
  hoverElement,
  pressKey,
  scrollPage,
  selectOption,
  sessionState,
  setViewport,
  uploadFile,
  waitForNetworkIdle,
} from '../../../src/tools/page.js';
import {injectStealth} from '../../../src/tools/stealth.js';

describe('jshook tools schema', () => {
  it('validates collect_code schema', () => {
    const schema = zod.object(collectCode.schema);
    const result = schema.parse({
      url: 'https://example.com',
      smartMode: 'summary',
      returnMode: 'pattern',
      pattern: 'main',
      limit: 5,
      topN: 3,
    });
    assert.strictEqual(result.smartMode, 'summary');
    assert.strictEqual(result.returnMode, 'pattern');
  });

  it('validates collection_diff schema', () => {
    const schema = zod.object(collectionDiff.schema);
    const result = schema.parse({
      previous: [{url: 'a.js', size: 12, type: 'external'}],
      includeUnchanged: true,
    });
    assert.strictEqual(result.previous.length, 1);
    assert.strictEqual(result.includeUnchanged, true);
  });

  it('validates summarize_code schema', () => {
    const schema = zod.object(summarizeCode.schema);
    const result = schema.parse({mode: 'single', code: 'const x = 1;'});
    assert.strictEqual(result.mode, 'single');
  });

  it('validates risk_panel and export_session_report schemas', () => {
    const riskSchema = zod.object(riskPanel.schema);
    const analyzeSchema = zod.object(analyzeTarget.schema);
    const reportSchema = zod.object(exportSessionReport.schema);
    const referenceSchema = zod.object(getReference.schema);
    const referenceRouteSchema = zod.object(getReferenceRoute.schema);

    const risk = riskSchema.parse({code: 'md5(x)', includeHookSignals: true});
    const workflow = analyzeSchema.parse({
      url: 'https://example.com',
      hookPreset: 'network-core',
      autoInjectHooks: true,
      correlationWindowMs: 800,
      maxCorrelatedFlows: 5,
      maxFingerprints: 6,
    });
    const report = reportSchema.parse({
      format: 'markdown',
      includeHookData: true,
    });
    const referenceDoc = referenceSchema.parse({
      mode: 'doc',
      docId: 'reverse-workflow',
    });
    const referenceSummary = referenceSchema.parse({
      mode: 'summary',
      docId: 'reverse-workflow',
      maxSections: 4,
    });
    const referenceByStage = referenceRouteSchema.parse({
      mode: 'stage',
      stage: 'Patch',
    });
    const referenceByTopic = referenceRouteSchema.parse({
      mode: 'topic',
      topic: 'env-rebuild',
    });
    const referenceRecommendation = referenceRouteSchema.parse({
      mode: 'recommend',
      query: '我要补环境并定位 first divergence',
    });

    assert.strictEqual(risk.includeHookSignals, true);
    assert.strictEqual(workflow.hookPreset, 'network-core');
    assert.strictEqual(workflow.maxFingerprints, 6);
    assert.strictEqual(report.format, 'markdown');
    assert.strictEqual(referenceDoc.docId, 'reverse-workflow');
    assert.strictEqual(referenceDoc.mode, 'doc');
    assert.strictEqual(referenceSummary.maxSections, 4);
    assert.strictEqual(referenceSummary.mode, 'summary');
    assert.strictEqual(referenceByStage.stage, 'Patch');
    assert.strictEqual(referenceByStage.mode, 'stage');
    assert.strictEqual(referenceByTopic.topic, 'env-rebuild');
    assert.strictEqual(referenceByTopic.mode, 'topic');
    assert.strictEqual(
      referenceRecommendation.query,
      '我要补环境并定位 first divergence',
    );
    assert.strictEqual(referenceRecommendation.mode, 'recommend');
  });

  it('validates hook and stealth schemas', () => {
    const hookSchema = zod.object(createHook.schema);
    const hookDataSchema = zod.object(getHookData.schema);
    const stealthSchema = zod.object(injectStealth.schema);

    const hook = hookSchema.parse({type: 'fetch'});
    const hookData = hookDataSchema.parse({
      hookId: 'h1',
      view: 'summary',
      maxRecords: 20,
    });
    const stealth = stealthSchema.parse({preset: 'windows-chrome'});

    assert.strictEqual(hook.type, 'fetch');
    assert.strictEqual(hookData.view, 'summary');
    assert.strictEqual(stealth.preset, 'windows-chrome');
  });

  it('validates dom and page schemas', () => {
    const domSchema = zod.object(queryDom.schema);
    const pageSchema = zod.object(clickElement.schema);
    const hoverSchema = zod.object(hoverElement.schema);
    const selectSchema = zod.object(selectOption.schema);
    const scrollSchema = zod.object(scrollPage.schema);
    const keySchema = zod.object(pressKey.schema);
    const uploadSchema = zod.object(uploadFile.schema);
    const viewportSchema = zod.object(setViewport.schema);
    const emulateSchema = zod.object(emulateDevice.schema);
    const networkIdleSchema = zod.object(waitForNetworkIdle.schema);
    const linksSchema = zod.object(getAllLinks.schema);
    const healthSchema = zod.object(checkBrowserHealth.schema);
    const sessionStateSchema = zod.object(sessionState.schema);

    const dom = domSchema.parse({selector: 'button'});
    const page = pageSchema.parse({selector: '#x'});
    const hover = hoverSchema.parse({selector: '#menu'});
    const select = selectSchema.parse({selector: 'select', values: ['a']});
    const scroll = scrollSchema.parse({x: 10, y: 20});
    const key = keySchema.parse({key: 'Enter'});
    const upload = uploadSchema.parse({selector: 'input', filePath: '/tmp/a'});
    const viewport = viewportSchema.parse({width: 390, height: 844});
    const emulate = emulateSchema.parse({deviceName: 'iPhone'});
    const networkIdle = networkIdleSchema.parse({timeout: 1000});
    const links = linksSchema.parse({pageIdx: 1});
    const health = healthSchema.parse({});
    const saveSession = sessionStateSchema.parse({
      action: 'save',
      sessionId: 's1',
      includeCookies: true,
    });
    const restoreSession = sessionStateSchema.parse({
      action: 'restore',
      sessionId: 's1',
      clearStorageBeforeRestore: true,
    });
    const listed = sessionStateSchema.parse({action: 'list'});
    const removed = sessionStateSchema.parse({
      action: 'delete',
      sessionId: 's1',
    });
    const dumped = sessionStateSchema.parse({
      action: 'dump',
      sessionId: 's1',
      pretty: false,
    });
    const loaded = sessionStateSchema.parse({
      action: 'load',
      snapshotJson: '{"id":"s1"}',
      overwrite: true,
    });

    assert.strictEqual(dom.selector, 'button');
    assert.strictEqual(page.selector, '#x');
    assert.strictEqual(hover.selector, '#menu');
    assert.deepStrictEqual(select.values, ['a']);
    assert.strictEqual(scroll.y, 20);
    assert.strictEqual(key.key, 'Enter');
    assert.strictEqual(upload.filePath, '/tmp/a');
    assert.strictEqual(viewport.width, 390);
    assert.strictEqual(emulate.deviceName, 'iPhone');
    assert.strictEqual(networkIdle.timeout, 1000);
    assert.strictEqual(links.pageIdx, 1);
    assert.deepStrictEqual(health, {});
    assert.strictEqual(saveSession.action, 'save');
    assert.strictEqual(saveSession.sessionId, 's1');
    assert.strictEqual(restoreSession.action, 'restore');
    assert.strictEqual(restoreSession.clearStorageBeforeRestore, true);
    assert.strictEqual(listed.action, 'list');
    assert.strictEqual(removed.action, 'delete');
    assert.strictEqual(removed.sessionId, 's1');
    assert.strictEqual(dumped.action, 'dump');
    assert.strictEqual(dumped.pretty, false);
    assert.strictEqual(loaded.action, 'load');
    assert.strictEqual(loaded.overwrite, true);
  });
});
