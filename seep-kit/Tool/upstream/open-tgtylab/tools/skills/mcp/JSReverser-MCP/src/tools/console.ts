/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {features} from '../features.js';
import {zod} from '../third_party/index.js';
import type {ConsoleMessageType} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

type ConsoleResponseType = ConsoleMessageType | 'issue';

const FILTERABLE_MESSAGE_TYPES: [
  ConsoleResponseType,
  ...ConsoleResponseType[],
] = [
  'log',
  'debug',
  'info',
  'error',
  'warn',
  'dir',
  'dirxml',
  'table',
  'trace',
  'clear',
  'startGroup',
  'startGroupCollapsed',
  'endGroup',
  'assert',
  'profile',
  'profileEnd',
  'count',
  'timeEnd',
  'verbose',
  'issue',
];

if (features.issues) {
  FILTERABLE_MESSAGE_TYPES.push('issue');
}

export const consoleMessage = defineTool({
  name: 'console_message',
  description: 'List console messages, or get one message by msgid.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    action: zod.enum(['list', 'get']),
    msgid: zod.number().optional().describe('Message id for action=get.'),
    targetPageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Browser page index to inspect (0-based). When omitted, uses the currently selected page.',
      ),
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of messages to return for action=list. When omitted, returns all messages.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return for action=list (0-based). When omitted, returns the first page.',
      ),
    types: zod
      .array(zod.enum(FILTERABLE_MESSAGE_TYPES))
      .optional()
      .describe(
        'Filter action=list results by message type. When omitted or empty, returns all messages.',
      ),
    includePreservedMessages: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Set true for action=list to include preserved messages from the last 3 navigations.',
      ),
  },
  handler: async (request, response) => {
    if (request.params.action === 'list') {
      response.setIncludeConsoleData(true, {
        targetPageIdx: request.params.targetPageIdx,
        pageSize: request.params.pageSize,
        pageIdx: request.params.pageIdx,
        types: request.params.types,
        includePreservedMessages: request.params.includePreservedMessages,
      });
      return;
    }

    if (request.params.msgid === undefined) {
      throw new Error('msgid is required for action=get.');
    }

    response.attachConsoleMessage(
      request.params.msgid,
      request.params.targetPageIdx,
    );
  },
});
