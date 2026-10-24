/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {getParameterWorkflowLibrary} from '../modules/workflows/ParameterWorkflowLibrary.js';
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const listParameterWorkflows = defineTool({
  name: 'list_parameter_workflows',
  description:
    'List packaged parameter workflows that can guide reverse-engineering and rebuild steps.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {},
  handler: async (_request, response) => {
    const library = await getParameterWorkflowLibrary();
    const items = await library.listWorkflows();
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify({items}, null, 2));
    response.appendResponseLine('```');
  },
});

export const getParameterWorkflow = defineTool({
  name: 'get_parameter_workflow',
  description: 'Get one packaged parameter workflow by id or alias.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    id: zod
      .string()
      .min(1)
      .describe('Workflow id or alias, for example `jd-h5st` or `h5st`.'),
  },
  handler: async (request, response) => {
    const library = await getParameterWorkflowLibrary();
    const doc = await library.getWorkflow(request.params.id);
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          id: doc.metadata.id,
          title: doc.metadata.title,
          aliases: doc.metadata.aliases,
          category: doc.metadata.category,
          summary: doc.metadata.summary,
          parts: doc.parts,
          mutations: doc.mutations,
          workflow: doc.workflow,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

export const recommendParameterWorkflow = defineTool({
  name: 'recommend_parameter_workflow',
  description:
    'Recommend the closest packaged parameter workflow from a keyword, alias, or short natural-language query.',
  annotations: {category: ToolCategory.REVERSE_ENGINEERING, readOnlyHint: true},
  schema: {
    query: zod
      .string()
      .min(1)
      .describe(
        'Keyword or short query, for example `h5st` or `query token sign`.',
      ),
  },
  handler: async (request, response) => {
    const library = await getParameterWorkflowLibrary();
    const doc = await library.recommendWorkflow(request.params.query);
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          id: doc.metadata.id,
          title: doc.metadata.title,
          aliases: doc.metadata.aliases,
          category: doc.metadata.category,
          summary: doc.metadata.summary,
          parts: doc.parts,
          mutations: doc.mutations,
          workflow: doc.workflow,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});
