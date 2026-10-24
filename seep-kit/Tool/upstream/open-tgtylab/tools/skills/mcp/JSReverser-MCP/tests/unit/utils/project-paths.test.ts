/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  buildLocalCliCommand,
  resolveArtifactsTasksDirForPackageRoot,
  resolveDefaultCodeCacheDir,
  resolveDefaultDebuggerSessionsDir,
  resolveDefaultEnvPath,
} from '../../../src/utils/projectPaths.js';

describe('project path resolution', () => {
  it('resolves runtime default paths from the package root instead of process cwd', () => {
    const originalCwd = process.cwd;
    const fakeCwd = path.join(
      path.parse(process.cwd()).root,
      'Windows',
      'system32',
    );

    process.cwd = () => fakeCwd;

    try {
      const codeCacheDir = resolveDefaultCodeCacheDir(import.meta.url);
      const debuggerSessionsDir = resolveDefaultDebuggerSessionsDir(
        import.meta.url,
      );
      const envPath = resolveDefaultEnvPath(import.meta.url);

      assert.ok(codeCacheDir.endsWith(path.join('.cache', 'code')));
      assert.ok(debuggerSessionsDir.endsWith('debugger-sessions'));
      assert.ok(envPath.endsWith('.env'));

      assert.ok(!codeCacheDir.startsWith(fakeCwd));
      assert.ok(!debuggerSessionsDir.startsWith(fakeCwd));
      assert.ok(!envPath.startsWith(fakeCwd));
    } finally {
      process.cwd = originalCwd;
    }
  });

  it('uses repo artifacts/tasks when package root is a source checkout', () => {
    const repoRoot = process.cwd();
    const resolved = resolveArtifactsTasksDirForPackageRoot(repoRoot);

    assert.strictEqual(resolved, path.join(repoRoot, 'artifacts', 'tasks'));
  });

  it('uses user state directory when package root is a packaged install without .git', () => {
    const originalXdgStateHome = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = '/tmp/jsreverser-state-home';

    try {
      const resolved = resolveArtifactsTasksDirForPackageRoot(
        '/tmp/fake-packaged-install',
      );
      assert.strictEqual(
        resolved,
        path.join(
          '/tmp/jsreverser-state-home',
          'jsreverser-mcp',
          'artifacts',
          'tasks',
        ),
      );
    } finally {
      if (originalXdgStateHome === undefined) {
        delete process.env.XDG_STATE_HOME;
      } else {
        process.env.XDG_STATE_HOME = originalXdgStateHome;
      }
    }
  });

  it('lets JSREVERSER_ARTIFACTS_DIR override the default artifacts root', () => {
    const originalArtifactsDir = process.env.JSREVERSER_ARTIFACTS_DIR;
    process.env.JSREVERSER_ARTIFACTS_DIR = '/tmp/custom-jsreverser-artifacts';

    try {
      const resolved = resolveArtifactsTasksDirForPackageRoot(
        '/tmp/fake-packaged-install',
      );
      assert.strictEqual(resolved, '/tmp/custom-jsreverser-artifacts');
    } finally {
      if (originalArtifactsDir === undefined) {
        delete process.env.JSREVERSER_ARTIFACTS_DIR;
      } else {
        process.env.JSREVERSER_ARTIFACTS_DIR = originalArtifactsDir;
      }
    }
  });

  it('builds local node CLI commands instead of package runner commands', () => {
    const command = buildLocalCliCommand(import.meta.url, [
      '--orchestrateReverseTask',
      'task with spaces',
      '--execute',
      '--resume',
    ]);

    assert.ok(command.startsWith('node '));
    assert.ok(command.includes(path.join('build', 'src', 'index.js')));
    assert.ok(!command.startsWith('jsreverser-mcp '));
    assert.ok(!command.includes('npx '));
    assert.ok(command.includes('"task with spaces"'));
  });
});
