/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

interface VersionedManifest {
  version?: unknown;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

export async function verifyServerJsonVersion(
  projectRoot = process.cwd(),
): Promise<string> {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const serverJsonPath = path.join(projectRoot, 'server.json');

  const packageJson = await readJsonFile<VersionedManifest>(packageJsonPath);
  if (typeof packageJson.version !== 'string' || !packageJson.version) {
    throw new Error('package.json must contain a non-empty string version.');
  }

  if (!(await fileExists(serverJsonPath))) {
    return `No server.json found; skipped version check for package ${packageJson.version}.`;
  }

  const serverJson = await readJsonFile<VersionedManifest>(serverJsonPath);
  if (typeof serverJson.version !== 'string' || !serverJson.version) {
    throw new Error('server.json must contain a non-empty string version.');
  }

  if (serverJson.version !== packageJson.version) {
    throw new Error(
      `server.json version ${serverJson.version} does not match package.json version ${packageJson.version}.`,
    );
  }

  return `server.json version matches package.json (${packageJson.version}).`;
}

async function main(): Promise<void> {
  try {
    console.log(await verifyServerJsonVersion());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
