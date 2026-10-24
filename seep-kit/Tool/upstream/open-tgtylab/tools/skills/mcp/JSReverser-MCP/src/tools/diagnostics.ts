/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {runEnvironmentDiagnostics} from '../diagnostics/environment.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const diagnoseEnvironment = defineTool({
  name: 'diagnose_environment',
  description:
    'Run static environment diagnostics for startup, AI provider setup, and artifact output paths.',
  annotations: {category: ToolCategory.NAVIGATION, readOnlyHint: true},
  requiresBrowser: false,
  schema: {},
  handler: async (_request, response) => {
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(runEnvironmentDiagnostics(), null, 2),
    );
    response.appendResponseLine('```');
  },
});
