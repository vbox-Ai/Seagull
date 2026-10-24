/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {ResourceType} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const FILTERABLE_RESOURCE_TYPES: readonly [ResourceType, ...ResourceType[]] = [
  'document',
  'stylesheet',
  'image',
  'media',
  'font',
  'script',
  'texttrack',
  'xhr',
  'fetch',
  'prefetch',
  'eventsource',
  'websocket',
  'manifest',
  'signedexchange',
  'ping',
  'cspviolationreport',
  'preflight',
  'fedcm',
  'other',
];

export const networkRequest = defineTool({
  name: 'network_request',
  description: 'List network requests, or get one request by reqid.',
  annotations: {
    category: ToolCategory.NETWORK,
    readOnlyHint: true,
  },
  schema: {
    action: zod.enum(['list', 'get']),
    reqid: zod
      .number()
      .optional()
      .describe(
        'Request id for action=get. If omitted, uses the selected request in DevTools when available.',
      ),
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of requests to return for action=list. When omitted, returns all requests.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return for action=list (0-based). When omitted, returns the first page.',
      ),
    targetPageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Browser page index to inspect (0-based). When omitted, uses the currently selected page.',
      ),
    resourceTypes: zod
      .array(zod.enum(FILTERABLE_RESOURCE_TYPES))
      .optional()
      .describe(
        'Filter action=list results by resource type. When omitted or empty, returns all requests.',
      ),
    includePreservedRequests: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Set true for action=list to include preserved requests from the last 3 navigations.',
      ),
  },
  handler: async (request, response, context) => {
    if (request.params.action === 'list') {
      const data = await context.getDevToolsData();
      const reqid = data?.cdpRequestId
        ? context.resolveCdpRequestId(data.cdpRequestId)
        : undefined;
      response.setIncludeNetworkRequests(true, {
        pageSize: request.params.pageSize,
        pageIdx: request.params.pageIdx,
        targetPageIdx: request.params.targetPageIdx,
        resourceTypes: request.params.resourceTypes,
        includePreservedRequests: request.params.includePreservedRequests,
        networkRequestIdInDevToolsUI: reqid,
      });
      return;
    }

    if (request.params.reqid) {
      response.attachNetworkRequest(
        request.params.reqid,
        request.params.targetPageIdx,
      );
      return;
    }

    const data = await context.getDevToolsData();
    const reqid = data?.cdpRequestId
      ? context.resolveCdpRequestId(data.cdpRequestId)
      : undefined;
    if (reqid) {
      response.attachNetworkRequest(reqid, request.params.targetPageIdx);
    } else {
      response.appendResponseLine(
        'Nothing is currently selected in the DevTools Network panel.',
      );
    }
  },
});
