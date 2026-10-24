/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {getJSHookRuntime} from './runtime.js';
import {defineTool, type Context} from './ToolDefinition.js';

async function withRuntimePageContext<T>(
  context: Context,
  pageIdx: number | undefined,
  action: () => Promise<T>,
): Promise<T> {
  if (pageIdx === undefined) {
    return action();
  }
  const runtime = getJSHookRuntime();
  const targetPage = context.getPageByOptionalIdx(pageIdx);
  runtime.syncPageContext(targetPage);
  try {
    return await action();
  } finally {
    runtime.syncPageContext(context.getSelectedPage());
    runtime.bindPageContext(() => context.getSelectedPage());
  }
}

export const queryDom = defineTool({
  name: 'query_dom',
  description: 'Query one or multiple elements by CSS selector.',
  annotations: {category: ToolCategory.NAVIGATION, readOnlyHint: true},
  schema: {
    pageIdx: zod.number().int().min(0).optional(),
    selector: zod.string(),
    all: zod.boolean().optional(),
    limit: zod.number().int().positive().optional(),
  },
  handler: async (request, response, context) => {
    const runtime = getJSHookRuntime();
    const result = await withRuntimePageContext(
      context,
      request.params.pageIdx,
      async () =>
        request.params.all
          ? runtime.domInspector.querySelectorAll(
              request.params.selector,
              request.params.limit,
            )
          : runtime.domInspector.querySelector(request.params.selector),
    );
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(result, null, 2));
    response.appendResponseLine('```');
  },
});

export const getDomStructure = defineTool({
  name: 'get_dom_structure',
  description: 'Get DOM tree structure for current page.',
  annotations: {category: ToolCategory.NAVIGATION, readOnlyHint: true},
  schema: {
    pageIdx: zod.number().int().min(0).optional(),
    maxDepth: zod.number().int().positive().optional(),
    includeText: zod.boolean().optional(),
  },
  handler: async (request, response, context) => {
    const runtime = getJSHookRuntime();
    const result = await withRuntimePageContext(
      context,
      request.params.pageIdx,
      () =>
        runtime.domInspector.getStructure(
          request.params.maxDepth,
          request.params.includeText,
        ),
    );
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(result, null, 2));
    response.appendResponseLine('```');
  },
});

export const findClickableElements = defineTool({
  name: 'find_clickable_elements',
  description: 'Find clickable buttons/links, optionally filtered by text.',
  annotations: {category: ToolCategory.NAVIGATION, readOnlyHint: true},
  schema: {
    pageIdx: zod.number().int().min(0).optional(),
    filterText: zod.string().optional(),
  },
  handler: async (request, response, context) => {
    const runtime = getJSHookRuntime();
    const result = await withRuntimePageContext(
      context,
      request.params.pageIdx,
      () => runtime.domInspector.findClickable(request.params.filterText),
    );
    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(result, null, 2));
    response.appendResponseLine('```');
  },
});
