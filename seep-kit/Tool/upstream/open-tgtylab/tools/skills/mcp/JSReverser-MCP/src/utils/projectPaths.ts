/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Runtime path helpers that stay stable even when the host launches the
 * server with an unexpected working directory (for example Windows system32).
 */

import {existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

function findPackageRoot(fromDir: string): string | undefined {
  let currentDir = fromDir;

  while (true) {
    if (existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

export function resolvePackageRoot(moduleUrl: string): string {
  const packageRoot = findPackageRoot(path.dirname(fileURLToPath(moduleUrl)));
  return packageRoot ?? process.cwd();
}

function resolveUserStateHome(): string {
  const xdgStateHome = process.env.XDG_STATE_HOME;
  if (xdgStateHome && xdgStateHome.trim().length > 0) {
    return xdgStateHome;
  }
  return path.join(os.homedir(), '.local', 'state');
}

export function resolveArtifactsTasksDirForPackageRoot(
  packageRoot: string,
): string {
  const explicitDir = process.env.JSREVERSER_ARTIFACTS_DIR;
  if (explicitDir && explicitDir.trim().length > 0) {
    return path.resolve(explicitDir);
  }

  if (existsSync(path.join(packageRoot, '.git'))) {
    return path.join(packageRoot, 'artifacts', 'tasks');
  }

  return path.join(
    resolveUserStateHome(),
    'jsreverser-mcp',
    'artifacts',
    'tasks',
  );
}

export function resolveDefaultArtifactsTasksDir(moduleUrl: string): string {
  return resolveArtifactsTasksDirForPackageRoot(resolvePackageRoot(moduleUrl));
}

export function resolveDefaultDebuggerSessionsDir(moduleUrl: string): string {
  return path.join(resolvePackageRoot(moduleUrl), 'debugger-sessions');
}

export function resolveDefaultCodeCacheDir(moduleUrl: string): string {
  return path.join(resolvePackageRoot(moduleUrl), '.cache', 'code');
}

export function resolveDefaultEnvPath(moduleUrl: string): string {
  return path.join(resolvePackageRoot(moduleUrl), '.env');
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

export function buildLocalCliCommand(
  moduleUrl: string,
  args: string[],
): string {
  const cliEntry = path.join(
    resolvePackageRoot(moduleUrl),
    'build',
    'src',
    'index.js',
  );
  return ['node', cliEntry, ...args].map(quoteShellArg).join(' ');
}
