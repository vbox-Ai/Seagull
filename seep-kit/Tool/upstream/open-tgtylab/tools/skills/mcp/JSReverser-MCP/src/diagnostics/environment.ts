/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {accessSync, constants, existsSync} from 'node:fs';
import path from 'node:path';

import {
  getAIConfigStatus,
  getArtifactsDirectory,
  getPackageRootDirectory,
} from '../utils/config.js';

import type {
  DiagnosticCheck,
  DiagnosticReport,
  DiagnosticStatus,
} from './types.js';

function getNodeVersionStatus(version: string): DiagnosticCheck {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number);
  const supported =
    major > 22 ||
    major === 23 ||
    (major === 22 && minor >= 12) ||
    (major === 20 && minor >= 19) ||
    (major > 20 && major < 22);

  return {
    name: 'node_version',
    status: supported ? 'ok' : 'fail',
    reason: supported
      ? `Detected supported Node version ${version}.`
      : `Detected unsupported Node version ${version}.`,
    fix: supported
      ? 'No action required.'
      : 'Upgrade to Node 20.19.0+, Node 22.12.0+, or a newer supported release.',
    details: {version},
  };
}

function getBuildOutputStatus(packageRoot: string): DiagnosticCheck {
  const buildEntry = path.join(packageRoot, 'build', 'src', 'index.js');
  const exists = existsSync(buildEntry);
  return {
    name: 'build_output',
    status: exists ? 'ok' : 'fail',
    reason: exists
      ? `Build entry exists at ${buildEntry}.`
      : `Build entry is missing at ${buildEntry}.`,
    fix: exists
      ? 'No action required.'
      : 'Run `npm run build` before starting the server.',
    details: {buildEntry},
  };
}

function getAISelectionStatus(): DiagnosticCheck {
  const status = getAIConfigStatus();
  return {
    name: 'ai_provider_selection',
    status: status.selectedProviderConfigured ? 'ok' : 'warn',
    reason: status.selectedProviderReason,
    fix: status.selectedProviderConfigured
      ? 'No action required.'
      : `Configure credentials for ${status.defaultProvider} or switch DEFAULT_LLM_PROVIDER.`,
    details: {
      defaultProvider: status.defaultProvider,
      configuredProviders: status.configuredProviders,
    },
  };
}

function getGeminiCliStatus(): DiagnosticCheck {
  const cliPath = process.env.GEMINI_CLI_PATH || 'gemini-cli';
  return {
    name: 'gemini_cli',
    status: 'warn',
    reason: `Gemini CLI fallback path is set to ${cliPath}. Availability is not verified during static diagnostics.`,
    fix: 'If you rely on Gemini CLI fallback, ensure the executable is installed and on PATH.',
    details: {cliPath},
  };
}

function getArtifactsDirectoryStatus(): DiagnosticCheck {
  const artifactsDir = getArtifactsDirectory();
  try {
    accessSync(path.dirname(artifactsDir), constants.W_OK);
    return {
      name: 'artifacts_dir',
      status: 'ok',
      reason: `Artifacts parent directory is writable for ${artifactsDir}.`,
      fix: 'No action required.',
      details: {artifactsDir},
    };
  } catch (error) {
    return {
      name: 'artifacts_dir',
      status: 'warn',
      reason: `Artifacts parent directory is not writable: ${String(error)}.`,
      fix: 'Set JSREVERSER_ARTIFACTS_DIR to a writable path before running task exports.',
      details: {artifactsDir},
    };
  }
}

function summarizeStatus(checks: DiagnosticCheck[]): DiagnosticStatus {
  if (checks.some(item => item.status === 'fail')) {
    return 'fail';
  }
  if (checks.some(item => item.status === 'warn')) {
    return 'warn';
  }
  return 'ok';
}

export function summarizeDiagnosticReport(report: DiagnosticReport): string {
  const counts = report.checks.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    {ok: 0, warn: 0, fail: 0},
  );

  return `Diagnostics completed with status=${report.status} (ok=${counts.ok}, warn=${counts.warn}, fail=${counts.fail}).`;
}

export function runEnvironmentDiagnostics(): DiagnosticReport {
  const packageRoot = getPackageRootDirectory();
  const checks: DiagnosticCheck[] = [
    getNodeVersionStatus(process.version),
    getBuildOutputStatus(packageRoot),
    getAISelectionStatus(),
    getGeminiCliStatus(),
    getArtifactsDirectoryStatus(),
  ];

  const status = summarizeStatus(checks);
  return {
    status,
    summary: summarizeDiagnosticReport({status, checks, summary: ''}),
    checks,
  };
}
