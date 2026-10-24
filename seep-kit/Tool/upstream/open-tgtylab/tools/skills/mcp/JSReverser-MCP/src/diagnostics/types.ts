/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export type DiagnosticStatus = 'ok' | 'warn' | 'fail';

export interface DiagnosticCheck {
  name: string;
  status: DiagnosticStatus;
  reason: string;
  fix: string;
  details?: Record<string, unknown>;
}

export interface DiagnosticReport {
  status: DiagnosticStatus;
  summary: string;
  checks: DiagnosticCheck[];
}
