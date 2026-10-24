/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JS Reverse Engineering Tools
 *
 * This module provides tools for JavaScript debugging and reverse engineering:
 * - Script listing and source retrieval
 * - Source code search
 * - Breakpoint management
 * - Request initiator (call stack) analysis
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {getJSHookRuntime} from './runtime.js';
import {defineTool} from './ToolDefinition.js';

const BREAKPOINT_STALL_HINT =
  'If execution appears stuck: run resume first. If it keeps pausing at the same location, use breakpoint(action="remove") and switch to trace_function(pause=false) or hook_function.';

function formatUrlWithSourceMap(url: string, sourceMapURL?: string): string {
  return sourceMapURL ? `${url} [SourceMap: ${sourceMapURL}]` : url;
}

function formatStackFrameLocation(
  frame: {
    url?: string;
    scriptId?: string;
    lineNumber: number;
    columnNumber: number;
  },
  sourceMapURL?: string,
): string {
  const location = frame.url
    ? `${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`
    : `script ${frame.scriptId}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;

  return sourceMapURL ? `${location} [SourceMap: ${sourceMapURL}]` : location;
}

function findSourceMapURLByScriptUrl(
  debugger_: {
    getScripts(): Array<{url?: string; sourceMapURL?: string}>;
    getScriptsByUrlPattern?(pattern: string): Array<{
      url?: string;
      sourceMapURL?: string;
    }>;
    getScriptById?(scriptId: string): {sourceMapURL?: string} | undefined;
  },
  url?: string,
  stackFrames?: Array<{url?: string; scriptId?: string}>,
): string | undefined {
  if (!url) {
    return undefined;
  }
  const directMatch = debugger_.getScripts().find(script => script.url === url);
  if (directMatch?.sourceMapURL) {
    return directMatch.sourceMapURL;
  }
  const patternMatch = debugger_
    .getScriptsByUrlPattern?.(url)
    .find(script => script.url === url)?.sourceMapURL;
  if (patternMatch) {
    return patternMatch;
  }
  const stackFrameMatch = stackFrames?.find(
    frame => frame.url === url && frame.scriptId,
  );
  if (stackFrameMatch?.scriptId) {
    return debugger_.getScriptById?.(stackFrameMatch.scriptId)?.sourceMapURL;
  }
  return undefined;
}

const reverseTaskParamsSchema = {
  taskId: zod
    .string()
    .optional()
    .describe(
      'Optional reverse task ID for writing durable evidence artifacts.',
    ),
  taskSlug: zod
    .string()
    .optional()
    .describe(
      'Optional reverse task slug used when opening the task artifact directory.',
    ),
  targetUrl: zod
    .string()
    .optional()
    .describe('Optional target page URL associated with the reverse task.'),
  goal: zod
    .string()
    .optional()
    .describe('Optional reverse-engineering goal for the task artifact.'),
};

interface ReverseTaskParams {
  taskId?: string;
  taskSlug?: string;
  targetUrl?: string;
  goal?: string;
}

async function appendDebuggerEvidence(
  params: ReverseTaskParams,
  entry: Record<string, unknown>,
): Promise<void> {
  if (!params.taskId || !params.taskSlug || !params.targetUrl || !params.goal) {
    return;
  }
  const runtime = getJSHookRuntime();
  const task = await runtime.reverseTaskStore.openTask({
    taskId: params.taskId,
    slug: params.taskSlug,
    targetUrl: params.targetUrl,
    goal: params.goal,
  });
  await task.appendLog('runtime-evidence', entry);
}

const pageIdxSchema = {
  pageIdx: zod
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      'Browser page index to inspect (0-based). When omitted, uses the currently selected page.',
    ),
};

async function withOptionalDebuggerPageContext<T>(
  context: {
    getSelectedPage(): unknown;
    getPageByOptionalIdx(idx?: number): unknown;
    selectPage(page: unknown): void;
    reinitDebugger(): Promise<void>;
  },
  pageIdx: number | undefined,
  action: () => Promise<T>,
): Promise<T> {
  if (pageIdx === undefined) {
    return action();
  }

  const originalPage = context.getSelectedPage();
  const targetPage = context.getPageByOptionalIdx(pageIdx);
  if (targetPage === originalPage) {
    return action();
  }

  context.selectPage(targetPage);
  await context.reinitDebugger();
  try {
    return await action();
  } finally {
    context.selectPage(originalPage);
    await context.reinitDebugger();
  }
}

/**
 * List all loaded JavaScript scripts in the current page.
 */
export const listScripts = defineTool({
  name: 'list_scripts',
  description:
    'Lists all JavaScript scripts loaded in the current page. Returns script ID, URL, and source map information. Use this to find scripts before setting breakpoints or searching.',
  annotations: {
    title: 'List Scripts',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    ...pageIdxSchema,
    filter: zod
      .string()
      .optional()
      .describe(
        'Optional filter string to match against script URLs (case-insensitive partial match).',
      ),
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ = context.debuggerContext;

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        let scripts = debugger_.getScripts();

        // Apply filter if provided
        if (request.params.filter) {
          scripts = debugger_.getScriptsByUrlPattern(request.params.filter);
        }

        // Filter out scripts without URLs (inline/eval scripts) unless they're the only ones
        const scriptsWithUrls = scripts.filter(s => s.url);
        const displayScripts =
          scriptsWithUrls.length > 0 ? scriptsWithUrls : scripts;

        if (displayScripts.length === 0) {
          response.appendResponseLine('No scripts found.');
          return;
        }

        response.appendResponseLine(
          `Found ${displayScripts.length} script(s):\n`,
        );

        for (const script of displayScripts) {
          response.appendResponseLine(`- ID: ${script.scriptId}`);
          response.appendResponseLine(
            `  URL: ${script.url || '(inline/eval)'}`,
          );
          if (script.sourceMapURL) {
            response.appendResponseLine(`  SourceMap: ${script.sourceMapURL}`);
          }
          response.appendResponseLine('');
        }
      },
    );
  },
});

/**
 * Get the source code of a script.
 */
export const getScriptSource = defineTool({
  name: 'get_script_source',
  description:
    'Gets the source code of a JavaScript script by its script ID. Supports line range (for normal files) or character offset (for minified single-line files). Use list_scripts first to find the script ID.',
  annotations: {
    title: 'Get Script Source',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    ...pageIdxSchema,
    scriptId: zod
      .string()
      .describe(
        'The script ID (from list_scripts) to get the source code for.',
      ),
    startLine: zod
      .number()
      .int()
      .optional()
      .describe('Start line number (1-based). Use for multi-line files.'),
    endLine: zod
      .number()
      .int()
      .optional()
      .describe('End line number (1-based). Use for multi-line files.'),
    offset: zod
      .number()
      .int()
      .optional()
      .describe(
        'Character offset to start from (0-based). Use for minified single-line files.',
      ),
    length: zod
      .number()
      .int()
      .optional()
      .default(1000)
      .describe(
        'Number of characters to return when using offset (default: 1000).',
      ),
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ = context.debuggerContext;

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        const {scriptId, startLine, endLine, offset, length} = request.params;

        try {
          const source = await debugger_.getScriptSource(scriptId);

          if (!source) {
            response.appendResponseLine(
              `No source found for script ${scriptId}.`,
            );
            return;
          }

          // Character offset mode (for minified files)
          if (offset !== undefined) {
            const start = Math.max(0, offset);
            const end = Math.min(source.length, start + length);
            const extract = source.substring(start, end);

            const prefix = start > 0 ? '...' : '';
            const suffix = end < source.length ? '...' : '';

            response.appendResponseLine(
              `Source for script ${scriptId} (chars ${start}-${end} of ${source.length}):\n`,
            );
            response.appendResponseLine('```javascript');
            response.appendResponseLine(`${prefix}${extract}${suffix}`);
            response.appendResponseLine('```');
            return;
          }

          // Line range mode (for normal files)
          if (startLine !== undefined || endLine !== undefined) {
            const lines = source.split('\n');
            const start = (startLine ?? 1) - 1; // Convert to 0-based
            const end = endLine ?? lines.length;
            const selectedLines = lines.slice(start, end);

            response.appendResponseLine(
              `Source for script ${scriptId} (lines ${start + 1}-${Math.min(end, lines.length)}):\n`,
            );
            response.appendResponseLine('```javascript');
            for (let i = 0; i < selectedLines.length; i++) {
              response.appendResponseLine(
                `${start + i + 1}: ${selectedLines[i]}`,
              );
            }
            response.appendResponseLine('```');
            return;
          }

          // Full source - but warn if it's too large
          if (source.length > 50000) {
            response.appendResponseLine(
              `Script ${scriptId} is large (${source.length} chars). Use offset/length or startLine/endLine to read portions.`,
            );
            response.appendResponseLine(`First 1000 characters:\n`);
            response.appendResponseLine('```javascript');
            response.appendResponseLine(source.substring(0, 1000) + '...');
            response.appendResponseLine('```');
          } else {
            response.appendResponseLine(`Source for script ${scriptId}:\n`);
            response.appendResponseLine('```javascript');
            response.appendResponseLine(source);
            response.appendResponseLine('```');
          }
        } catch (error) {
          response.appendResponseLine(
            `Error getting script source: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  },
});

/**
 * Find a string in a specific script and return its exact position with context.
 * Useful for setting breakpoints in minified files.
 */
export const findInScript = defineTool({
  name: 'find_in_script',
  description:
    'Finds a string in a specific script and returns its exact line/column position with surrounding context. Ideal for setting breakpoints in minified files where the entire code is on one line.',
  annotations: {
    title: 'Find in Script',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    ...pageIdxSchema,
    scriptId: zod
      .string()
      .describe('The script ID to search in (from list_scripts).'),
    query: zod.string().describe('The string to find in the script.'),
    contextChars: zod
      .number()
      .int()
      .optional()
      .default(100)
      .describe(
        'Number of characters to show before and after the match (default: 100).',
      ),
    occurrence: zod
      .number()
      .int()
      .optional()
      .default(1)
      .describe('Which occurrence to find (1 = first, 2 = second, etc.).'),
    caseSensitive: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether the search is case-sensitive (default: true).'),
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ = context.debuggerContext;

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        const {scriptId, query, contextChars, occurrence, caseSensitive} =
          request.params;

        try {
          const source = await debugger_.getScriptSource(scriptId);

          if (!source) {
            response.appendResponseLine(
              `No source found for script ${scriptId}.`,
            );
            return;
          }

          // Find the occurrence
          const searchSource = caseSensitive ? source : source.toLowerCase();
          const searchQuery = caseSensitive ? query : query.toLowerCase();

          let position = -1;
          let currentOccurrence = 0;
          let searchStart = 0;

          while (currentOccurrence < occurrence) {
            position = searchSource.indexOf(searchQuery, searchStart);
            if (position === -1) {
              break;
            }
            currentOccurrence++;
            searchStart = position + 1;
          }

          if (position === -1) {
            response.appendResponseLine(
              `"${query}" not found in script ${scriptId}${occurrence > 1 ? ` (occurrence ${occurrence})` : ''}.`,
            );
            return;
          }

          // Calculate line and column (0-based for CDP)
          let lineNumber = 0;
          let columnNumber = position;
          for (let i = 0; i < position; i++) {
            if (source[i] === '\n') {
              lineNumber++;
              columnNumber = position - i - 1;
            }
          }

          // Extract context
          const contextStart = Math.max(0, position - contextChars);
          const contextEnd = Math.min(
            source.length,
            position + query.length + contextChars,
          );

          const beforeContext = source.substring(contextStart, position);
          const matchText = source.substring(position, position + query.length);
          const afterContext = source.substring(
            position + query.length,
            contextEnd,
          );

          const prefix = contextStart > 0 ? '...' : '';
          const suffix = contextEnd < source.length ? '...' : '';

          const script = debugger_.getScriptById(scriptId);
          const url = script?.url || '(inline)';

          response.appendResponseLine(
            `Found "${query}" in script ${scriptId}:`,
          );
          response.appendResponseLine(`URL: ${url}`);
          response.appendResponseLine(
            `Position: line ${lineNumber + 1}, column ${columnNumber}`,
          );
          response.appendResponseLine(`Character offset: ${position}`);
          response.appendResponseLine('');
          response.appendResponseLine('Context:');
          response.appendResponseLine('```javascript');
          response.appendResponseLine(
            `${prefix}${beforeContext}【${matchText}】${afterContext}${suffix}`,
          );
          response.appendResponseLine('```');
          response.appendResponseLine('');
          response.appendResponseLine(
            `To set a breakpoint here: breakpoint(action: "set", url: "${url}", lineNumber: ${lineNumber + 1}, columnNumber: ${columnNumber})`,
          );
        } catch (error) {
          response.appendResponseLine(
            `Error: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  },
});

/**
 * Extract a function and its dependency tree from a specific script.
 */
export const extractFunctionTree = defineTool({
  name: 'extract_function_tree',
  description:
    'Extracts a target function and its local dependency tree from a script, returning a compact code slice for follow-up reverse analysis.',
  annotations: {
    title: 'Extract Function Tree',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    ...pageIdxSchema,
    ...reverseTaskParamsSchema,
    persistResult: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Persist the extracted function slice back into the reverse task artifact when task params are provided.',
      ),
    scriptId: zod
      .string()
      .describe('The script ID (from list_scripts) to extract from.'),
    functionName: zod.string().describe('The function name to extract.'),
    maxDepth: zod
      .number()
      .int()
      .min(1)
      .optional()
      .default(3)
      .describe('Maximum dependency depth to traverse (default: 3).'),
    maxSize: zod
      .number()
      .int()
      .min(1)
      .optional()
      .default(500)
      .describe(
        'Soft size limit in KB for the extracted result (default: 500).',
      ),
    includeComments: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Whether to preserve comments in generated code (default: true).',
      ),
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ =
          context.debuggerContext as typeof context.debuggerContext & {
            extractFunctionTree?: (
              scriptId: string,
              functionName: string,
              options?: {
                maxDepth?: number;
                maxSize?: number;
                includeComments?: boolean;
              },
            ) => Promise<{
              mainFunction: string;
              code: string;
              functions: Array<{
                name: string;
                code: string;
                dependencies: string[];
                startLine: number;
                endLine: number;
                size: number;
              }>;
              callGraph: Record<string, string[]>;
              totalSize: number;
              extractedCount: number;
            }>;
          };

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        if (!debugger_.extractFunctionTree) {
          response.appendResponseLine(
            'extract_function_tree is not supported by the current debugger context.',
          );
          return;
        }

        try {
          const result = await debugger_.extractFunctionTree(
            request.params.scriptId,
            request.params.functionName,
            {
              maxDepth: request.params.maxDepth,
              maxSize: request.params.maxSize,
              includeComments: request.params.includeComments,
            },
          );

          response.appendResponseLine(
            `Function tree for "${result.mainFunction}" in script ${request.params.scriptId}:`,
          );
          response.appendResponseLine(
            `- Extracted functions: ${result.extractedCount}`,
          );
          response.appendResponseLine(
            `- Total size: ${(result.totalSize / 1024).toFixed(2)} KB`,
          );
          response.appendResponseLine('');
          response.appendResponseLine('Dependencies:');
          for (const fn of result.functions) {
            response.appendResponseLine(
              `- ${fn.name}${fn.dependencies.length > 0 ? ` -> ${fn.dependencies.join(', ')}` : ''}`,
            );
          }
          response.appendResponseLine('');
          response.appendResponseLine('```javascript');
          response.appendResponseLine(result.code);
          response.appendResponseLine('```');

          if (
            request.params.persistResult &&
            request.params.taskId &&
            request.params.taskSlug &&
            request.params.targetUrl &&
            request.params.goal
          ) {
            const runtime = getJSHookRuntime();
            const task = await runtime.reverseTaskStore.openTask({
              taskId: request.params.taskId,
              slug: request.params.taskSlug,
              targetUrl: request.params.targetUrl,
              goal: request.params.goal,
            });
            const existingTargetContext =
              await runtime.reverseTaskStore.readSnapshot<
                Record<string, unknown>
              >(request.params.taskId, 'target-context.json');
            const scriptInfo = debugger_.getScriptById?.(
              request.params.scriptId,
            );
            await task.writeSnapshot('target-context.json', {
              ...(existingTargetContext ?? {}),
              functionSlice: {
                mainFunction: result.mainFunction,
                scriptId: request.params.scriptId,
                scriptUrl: scriptInfo?.url,
                extractedCount: result.extractedCount,
                totalSize: result.totalSize,
              },
            });
            await task.writeSnapshot('function-slice.json', {
              ...result,
              scriptId: request.params.scriptId,
              scriptUrl: scriptInfo?.url,
              persistedAt: Date.now(),
            });
            await task.appendLog('runtime-evidence', {
              source: 'extract_function_tree',
              kind: 'function-slice',
              functionName: result.mainFunction,
              scriptId: request.params.scriptId,
              url: scriptInfo?.url,
              extractedCount: result.extractedCount,
              totalSize: result.totalSize,
              note: `persisted function slice for ${result.mainFunction}`,
            });
            response.appendResponseLine(
              'Persisted function slice into task artifact.',
            );
          }
        } catch (error) {
          response.appendResponseLine(
            `Error extracting function tree: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  },
});

/**
 * Search for a string in all loaded scripts.
 */
export const searchInSources = defineTool({
  name: 'search_in_sources',
  description:
    'Searches for a string or regex pattern in all loaded JavaScript sources. Returns matching lines with script ID, URL, and line number. Use get_script_source with startLine/endLine to view full context around matches.',
  annotations: {
    title: 'Search in Sources',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    ...pageIdxSchema,
    ...reverseTaskParamsSchema,
    persistResult: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Persist a single unambiguous match back into the reverse task artifact when task params are provided.',
      ),
    query: zod.string().describe('The search query (string or regex pattern).'),
    caseSensitive: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Whether the search should be case-sensitive.'),
    isRegex: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to treat the query as a regular expression.'),
    maxResults: zod
      .number()
      .int()
      .optional()
      .default(30)
      .describe('Maximum number of results to return (default: 30).'),
    maxLineLength: zod
      .number()
      .int()
      .optional()
      .default(150)
      .describe(
        'Maximum characters per line preview (default: 150). Set to 0 for full lines.',
      ),
    excludeMinified: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'Skip minified files (files with very long lines). Default: true.',
      ),
    urlFilter: zod
      .string()
      .optional()
      .describe(
        'Only search scripts whose URL contains this string (case-insensitive).',
      ),
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ = context.debuggerContext;

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        const {
          taskId,
          taskSlug,
          targetUrl,
          goal,
          persistResult,
          query,
          caseSensitive,
          isRegex,
          maxResults,
          maxLineLength,
          excludeMinified,
          urlFilter,
        } = request.params;

        try {
          const result = await debugger_.searchInScripts(query, {
            caseSensitive,
            isRegex,
          });

          if (result.matches.length === 0) {
            response.appendResponseLine(`No matches found for "${query}".`);
            return;
          }

          // Filter matches
          let filteredMatches = result.matches;

          // Apply URL filter
          if (urlFilter) {
            const lowerFilter = urlFilter.toLowerCase();
            filteredMatches = filteredMatches.filter(
              m => m.url && m.url.toLowerCase().includes(lowerFilter),
            );
          }

          // Filter out minified files (lines > 10000 chars)
          const minifiedThreshold = 10000;
          let skippedMinified = 0;
          if (excludeMinified) {
            const beforeCount = filteredMatches.length;
            filteredMatches = filteredMatches.filter(m => {
              if (m.lineContent.length > minifiedThreshold) {
                return false;
              }
              return true;
            });
            skippedMinified = beforeCount - filteredMatches.length;
          }

          if (filteredMatches.length === 0) {
            response.appendResponseLine(`No matches found for "${query}".`);
            if (skippedMinified > 0) {
              response.appendResponseLine(
                `(${skippedMinified} matches in minified files were skipped. Set excludeMinified=false to include them.)`,
              );
            }
            return;
          }

          const displayMatches = filteredMatches.slice(0, maxResults);
          const totalMatches = filteredMatches.length;

          response.appendResponseLine(
            `Found ${totalMatches} match(es) for "${query}"${totalMatches > maxResults ? ` (showing first ${maxResults})` : ''}:`,
          );
          if (skippedMinified > 0) {
            response.appendResponseLine(
              `(${skippedMinified} matches in minified files skipped)`,
            );
          }
          response.appendResponseLine('');

          for (const match of displayMatches) {
            const lineNum = match.lineNumber + 1;
            const scriptId = match.scriptId;
            const url = match.url || '(inline)';

            // Truncate line content, centering around the match if possible
            let preview = match.lineContent.trim();
            if (maxLineLength > 0 && preview.length > maxLineLength) {
              // Try to find the query position to center the preview
              const lowerContent = caseSensitive
                ? preview
                : preview.toLowerCase();
              const lowerQuery = caseSensitive ? query : query.toLowerCase();
              const matchPos = isRegex ? 0 : lowerContent.indexOf(lowerQuery);

              if (matchPos >= 0) {
                // Center around match position
                const halfLen = Math.floor(maxLineLength / 2);
                let start = Math.max(0, matchPos - halfLen);
                let end = start + maxLineLength;

                if (end > preview.length) {
                  end = preview.length;
                  start = Math.max(0, end - maxLineLength);
                }

                const prefix = start > 0 ? '...' : '';
                const suffix = end < preview.length ? '...' : '';
                preview = prefix + preview.substring(start, end) + suffix;
              } else {
                // Fallback: truncate from start
                preview = preview.substring(0, maxLineLength) + '...';
              }
            }

            response.appendResponseLine(`[${scriptId}] ${url}:${lineNum}`);
            response.appendResponseLine(`  ${preview}`);
            response.appendResponseLine('');
          }

          response.appendResponseLine('---');
          response.appendResponseLine(
            'Tip: Use get_script_source(scriptId, startLine, endLine) to view full context around a match.',
          );

          if (
            persistResult &&
            taskId &&
            taskSlug &&
            targetUrl &&
            goal &&
            displayMatches.length === 1
          ) {
            const selected = displayMatches[0];
            const runtime = getJSHookRuntime();
            const task = await runtime.reverseTaskStore.openTask({
              taskId,
              slug: taskSlug,
              targetUrl,
              goal,
            });
            const existingTargetContext =
              await runtime.reverseTaskStore.readSnapshot<
                Record<string, unknown>
              >(taskId, 'target-context.json');
            await task.writeSnapshot('target-context.json', {
              ...(existingTargetContext ?? {}),
              locatedSource: {
                query,
                scriptId: selected.scriptId,
                url: selected.url,
                lineNumber: selected.lineNumber + 1,
              },
            });
            await task.appendLog('runtime-evidence', {
              source: 'search_in_sources',
              kind: 'source-locate',
              scriptId: selected.scriptId,
              url: selected.url,
              lineNumber: selected.lineNumber + 1,
              functionName: query,
              note: `located source for ${query}`,
            });
            response.appendResponseLine(
              'Persisted single match into task artifact.',
            );
          }
        } catch (error) {
          response.appendResponseLine(
            `Error searching: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  },
});

async function handleBreakpointSet(
  params: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
    condition?: string;
    isRegex?: boolean;
    pageIdx?: number;
  },
  response: {appendResponseLine(value: string): void},
  context: Parameters<typeof listScripts.handler>[2],
): Promise<void> {
  const {
    url,
    lineNumber,
    columnNumber = 0,
    condition,
    isRegex = false,
    pageIdx,
  } = params;
  if (!url) {
    throw new Error('url is required for action=set.');
  }
  if (lineNumber === undefined) {
    throw new Error('lineNumber is required for action=set.');
  }

  await withOptionalDebuggerPageContext(context, pageIdx, async () => {
    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    try {
      const line0based = lineNumber - 1;
      const breakpointInfo = isRegex
        ? await debugger_.setBreakpointByUrlRegex(
            url,
            line0based,
            columnNumber,
            condition,
          )
        : await debugger_.setBreakpoint(
            url,
            line0based,
            columnNumber,
            condition,
          );

      response.appendResponseLine('Breakpoint set successfully!');
      response.appendResponseLine(`- ID: ${breakpointInfo.breakpointId}`);
      response.appendResponseLine(`- URL: ${url}`);
      response.appendResponseLine(`- Line: ${lineNumber}`);
      if (condition) {
        response.appendResponseLine(`- Condition: ${condition}`);
      }
      if (breakpointInfo.locations.length > 0) {
        response.appendResponseLine(
          `- Resolved to ${breakpointInfo.locations.length} location(s)`,
        );
      }
      response.appendResponseLine(`- Tip: ${BREAKPOINT_STALL_HINT}`);
    } catch (error) {
      response.appendResponseLine(
        `Error setting breakpoint: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

async function handleBreakpointRemove(
  params: {breakpointId?: string; pageIdx?: number},
  response: {appendResponseLine(value: string): void},
  context: Parameters<typeof listScripts.handler>[2],
): Promise<void> {
  const {breakpointId, pageIdx} = params;
  if (!breakpointId) {
    throw new Error('breakpointId is required for action=remove.');
  }

  await withOptionalDebuggerPageContext(context, pageIdx, async () => {
    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    try {
      await debugger_.removeBreakpoint(breakpointId);
      response.appendResponseLine(
        `Breakpoint ${breakpointId} removed successfully.`,
      );
    } catch (error) {
      response.appendResponseLine(
        `Error removing breakpoint: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

async function handleBreakpointList(
  params: {pageIdx?: number},
  response: {appendResponseLine(value: string): void},
  context: Parameters<typeof listScripts.handler>[2],
): Promise<void> {
  await withOptionalDebuggerPageContext(context, params.pageIdx, async () => {
    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    const breakpoints = debugger_.getBreakpoints();

    if (breakpoints.length === 0) {
      response.appendResponseLine('No active breakpoints.');
      return;
    }

    response.appendResponseLine(
      `Active breakpoints (${breakpoints.length}):\n`,
    );

    for (const bp of breakpoints) {
      response.appendResponseLine(`- ID: ${bp.breakpointId}`);
      response.appendResponseLine(`  URL: ${bp.url}`);
      response.appendResponseLine(
        `  Line: ${bp.lineNumber + 1}, Column: ${bp.columnNumber}`,
      );
      if (bp.condition) {
        response.appendResponseLine(`  Condition: ${bp.condition}`);
      }
      if (bp.locations.length > 0) {
        response.appendResponseLine(`  Locations: ${bp.locations.length}`);
      }
      response.appendResponseLine('');
    }
  });
}

/**
 * Manage JavaScript breakpoints.
 */
export const breakpoint = defineTool({
  name: 'breakpoint',
  description:
    'Manage JavaScript breakpoints: set, remove, or list active breakpoints.',
  annotations: {
    title: 'Breakpoint',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    action: zod
      .enum(['set', 'remove', 'list'])
      .describe('Breakpoint action to perform.'),
    ...pageIdxSchema,
    url: zod
      .string()
      .optional()
      .describe(
        'URL or URL pattern for action=set. Can be a partial match or regex pattern.',
      ),
    lineNumber: zod
      .number()
      .int()
      .optional()
      .describe('1-based line number for action=set.'),
    columnNumber: zod
      .number()
      .int()
      .optional()
      .describe('Optional column number for action=set (0-based).'),
    condition: zod
      .string()
      .optional()
      .describe(
        'Optional condition expression for action=set. Breakpoint triggers only when true.',
      ),
    isRegex: zod
      .boolean()
      .optional()
      .describe('Whether action=set should treat url as a regex pattern.'),
    breakpointId: zod
      .string()
      .optional()
      .describe(
        'Breakpoint ID for action=remove. Use breakpoint(action="list") to inspect active IDs.',
      ),
  },
  handler: async (request, response, context) => {
    if (request.params.action === 'set') {
      await handleBreakpointSet(request.params, response, context);
      return;
    }
    if (request.params.action === 'remove') {
      await handleBreakpointRemove(request.params, response, context);
      return;
    }
    await handleBreakpointList(request.params, response, context);
  },
});

/**
 * Get the call stack (initiator) for a network request.
 */
export const getRequestInitiator = defineTool({
  name: 'get_request_initiator',
  description:
    'Gets the JavaScript call stack that initiated a network request. This helps trace which code triggered an API call.',
  annotations: {
    title: 'Get Request Initiator',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    requestId: zod
      .number()
      .int()
      .describe(
        'The request ID (from network_request with action=list) to get the initiator for.',
      ),
    ...pageIdxSchema,
    ...reverseTaskParamsSchema,
  },
  handler: async (request, response, context) => {
    const {requestId, pageIdx} = request.params;
    await withOptionalDebuggerPageContext(context, pageIdx, async () => {
      const debugger_ = context.debuggerContext;

      try {
        const httpRequest = context.getNetworkRequestById(requestId, pageIdx);
        const initiator = context.getRequestInitiator(httpRequest);

        if (!initiator) {
          response.appendResponseLine(
            `No initiator information found for request ${requestId}.`,
          );
          response.appendResponseLine(
            'This might be a navigation request or the initiator was not captured.',
          );
          return;
        }

        response.appendResponseLine(
          `Request initiator for ${httpRequest.url()}:\n`,
        );
        response.appendResponseLine(`Type: ${initiator.type}`);

        if (initiator.url) {
          const initiatorSourceMapURL = findSourceMapURLByScriptUrl(
            debugger_,
            initiator.url,
            initiator.stack?.callFrames,
          );
          response.appendResponseLine(
            `URL: ${formatUrlWithSourceMap(initiator.url, initiatorSourceMapURL)}`,
          );
        }
        if (initiator.lineNumber !== undefined) {
          response.appendResponseLine(`Line: ${initiator.lineNumber + 1}`);
        }
        if (initiator.columnNumber !== undefined) {
          response.appendResponseLine(`Column: ${initiator.columnNumber}`);
        }

        if (initiator.stack && initiator.stack.callFrames.length > 0) {
          response.appendResponseLine('\nCall Stack:');
          for (let i = 0; i < initiator.stack.callFrames.length; i++) {
            const frame = initiator.stack.callFrames[i];
            const functionName = frame.functionName || '(anonymous)';
            const script = frame.scriptId
              ? debugger_.getScriptById(frame.scriptId)
              : undefined;
            const location = formatStackFrameLocation(
              frame,
              script?.sourceMapURL,
            );
            response.appendResponseLine(
              `  ${i + 1}. ${functionName} @ ${location}`,
            );
          }

          // Include parent stack if available (for async calls)
          if (
            initiator.stack.parent &&
            initiator.stack.parent.callFrames.length > 0
          ) {
            response.appendResponseLine('\nAsync Parent Stack:');
            for (let i = 0; i < initiator.stack.parent.callFrames.length; i++) {
              const frame = initiator.stack.parent.callFrames[i];
              const functionName = frame.functionName || '(anonymous)';
              const script = frame.scriptId
                ? debugger_.getScriptById(frame.scriptId)
                : undefined;
              const location = formatStackFrameLocation(
                frame,
                script?.sourceMapURL,
              );
              response.appendResponseLine(
                `  ${i + 1}. ${functionName} @ ${location}`,
              );
            }
          }
        }

        await appendDebuggerEvidence(request.params, {
          tool: 'get_request_initiator',
          requestId,
          requestUrl: httpRequest.url(),
          initiatorType: initiator.type,
          initiatorUrl: initiator.url,
          lineNumber: initiator.lineNumber,
          columnNumber: initiator.columnNumber,
          callFrames:
            initiator.stack?.callFrames.map(frame => ({
              functionName: frame.functionName || '(anonymous)',
              url: frame.url,
              scriptId: frame.scriptId,
              lineNumber: frame.lineNumber,
              columnNumber: frame.columnNumber,
            })) ?? [],
        });
      } catch (error) {
        response.appendResponseLine(
          `Error getting initiator: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});

/**
 * Get the current paused state and debug information.
 */
export const getPausedInfo = defineTool({
  name: 'get_paused_info',
  description:
    'Gets information about the current paused state including call stack, current location, and scope variables. Use this after a breakpoint is hit to understand the execution context.',
  annotations: {
    title: 'Get Paused Info',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    ...pageIdxSchema,
    includeScopes: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to include scope variables (default: true).'),
    maxScopeDepth: zod
      .number()
      .int()
      .optional()
      .default(2)
      .describe('Maximum scope depth to traverse (default: 2).'),
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ = context.debuggerContext;

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        const pausedState = debugger_.getPausedState();

        if (!pausedState.isPaused) {
          response.appendResponseLine('Execution is not paused.');
          response.appendResponseLine(
            'Set a breakpoint and trigger it to pause execution.',
          );
          return;
        }

        response.appendResponseLine('🔴 Execution Paused\n');

        if (pausedState.reason) {
          response.appendResponseLine(`Reason: ${pausedState.reason}`);
        }

        if (
          pausedState.hitBreakpoints &&
          pausedState.hitBreakpoints.length > 0
        ) {
          response.appendResponseLine(
            `Hit breakpoints: ${pausedState.hitBreakpoints.join(', ')}`,
          );
        }

        const autoRecovery = (
          debugger_ as {
            getLastAutoRecoveryEvent?: (maxAgeMs?: number) => {
              breakpointId: string;
              hitCount: number;
              actions?: string[];
              error?: string;
            } | null;
          }
        ).getLastAutoRecoveryEvent?.(60000);
        if (autoRecovery) {
          response.appendResponseLine(
            `Auto-recovery detected: breakpoint ${autoRecovery.breakpointId} hit ${autoRecovery.hitCount} times in a short window.`,
          );
          response.appendResponseLine(
            `Suggestion: move breakpoint to a lower-frequency path or use hook_function/trace_function(pause=false).`,
          );
          if (autoRecovery.error) {
            response.appendResponseLine(
              `Recovery warning: ${autoRecovery.error}`,
            );
          }
        }

        response.appendResponseLine('\n📍 Call Stack:');

        for (let i = 0; i < pausedState.callFrames.length; i++) {
          const frame = pausedState.callFrames[i];
          const script = debugger_.getScriptById(frame.location.scriptId);
          const url =
            script?.url || frame.url || `script:${frame.location.scriptId}`;
          const location = formatStackFrameLocation(
            {
              url,
              scriptId: frame.location.scriptId,
              lineNumber: frame.location.lineNumber,
              columnNumber: frame.location.columnNumber,
            },
            script?.sourceMapURL,
          );
          response.appendResponseLine(
            `  ${i}. ${frame.functionName} @ ${location}`,
          );
          response.appendResponseLine(`     CallFrameId: ${frame.callFrameId}`);
        }

        // Include scope variables if requested
        if (request.params.includeScopes && pausedState.callFrames.length > 0) {
          response.appendResponseLine('\n🔍 Scope Variables (top frame):');

          const topFrame = pausedState.callFrames[0];

          for (const scope of topFrame.scopeChain) {
            // Only show local and closure scopes, skip global
            if (scope.type === 'global') {
              continue;
            }

            const scopeName = scope.name || scope.type;
            response.appendResponseLine(`\n  [${scopeName}]:`);

            if (scope.object.objectId) {
              try {
                const variables = await debugger_.getScopeVariables(
                  scope.object.objectId,
                );

                if (variables.length === 0) {
                  response.appendResponseLine('    (empty)');
                } else {
                  for (const variable of variables.slice(0, 20)) {
                    // Limit to 20 variables
                    const valueStr =
                      typeof variable.value === 'string'
                        ? `"${variable.value}"`
                        : JSON.stringify(variable.value);
                    response.appendResponseLine(
                      `    ${variable.name}: ${valueStr}`,
                    );
                  }
                  if (variables.length > 20) {
                    response.appendResponseLine(
                      `    ... and ${variables.length - 20} more`,
                    );
                  }
                }
              } catch {
                response.appendResponseLine(
                  '    (unable to retrieve variables)',
                );
              }
            }
          }
        }

        response.appendResponseLine(
          '\n💡 Use resume, step_over, step_into, or step_out to continue.',
        );
      },
    );
  },
});

/**
 * Resume execution after a breakpoint.
 */
export const resume = defineTool({
  name: 'resume',
  description:
    'Resumes JavaScript execution after being paused at a breakpoint. Execution continues until the next breakpoint or completion.',
  annotations: {
    title: 'Resume Execution',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    ...pageIdxSchema,
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ = context.debuggerContext;

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        if (!debugger_.isPaused()) {
          response.appendResponseLine('Execution is not paused.');
          return;
        }

        try {
          await debugger_.resume();
          response.appendResponseLine('▶️ Execution resumed.');
        } catch (error) {
          response.appendResponseLine(
            `Error resuming: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  },
});

/**
 * Pause execution.
 */
export const pause = defineTool({
  name: 'pause',
  description:
    'Pauses JavaScript execution at the current point. Use this to interrupt running code.',
  annotations: {
    title: 'Pause Execution',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    ...pageIdxSchema,
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ = context.debuggerContext;

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        if (debugger_.isPaused()) {
          response.appendResponseLine('Execution is already paused.');
          return;
        }

        try {
          await debugger_.pause();
          response.appendResponseLine(
            '⏸️ Pause requested. Waiting for execution to pause...',
          );
        } catch (error) {
          response.appendResponseLine(
            `Error pausing: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  },
});

/**
 * Step over to the next statement.
 */
export const stepOver = defineTool({
  name: 'step_over',
  description:
    'Steps over to the next statement, treating function calls as a single step. Use this to move through code without entering function bodies.',
  annotations: {
    title: 'Step Over',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    ...pageIdxSchema,
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ = context.debuggerContext;

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        if (!debugger_.isPaused()) {
          response.appendResponseLine('Execution is not paused. Cannot step.');
          return;
        }

        try {
          await debugger_.stepOver();
          response.appendResponseLine(
            '⏭️ Stepped over. Use get_paused_info to see current state.',
          );
        } catch (error) {
          response.appendResponseLine(
            `Error stepping over: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  },
});

/**
 * Step into the next function call.
 */
export const stepInto = defineTool({
  name: 'step_into',
  description:
    'Steps into the next function call. Use this to enter and debug function bodies.',
  annotations: {
    title: 'Step Into',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    ...pageIdxSchema,
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ = context.debuggerContext;

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        if (!debugger_.isPaused()) {
          response.appendResponseLine('Execution is not paused. Cannot step.');
          return;
        }

        try {
          await debugger_.stepInto();
          response.appendResponseLine(
            '⬇️ Stepped into. Use get_paused_info to see current state.',
          );
        } catch (error) {
          response.appendResponseLine(
            `Error stepping into: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  },
});

/**
 * Step out of the current function.
 */
export const stepOut = defineTool({
  name: 'step_out',
  description:
    'Steps out of the current function, continuing until the function returns. Use this to quickly exit a function.',
  annotations: {
    title: 'Step Out',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    ...pageIdxSchema,
  },
  handler: async (request, response, context) => {
    await withOptionalDebuggerPageContext(
      context,
      request.params.pageIdx,
      async () => {
        const debugger_ = context.debuggerContext;

        if (!debugger_.isEnabled()) {
          response.appendResponseLine(
            'Debugger is not enabled. Please select a page first.',
          );
          return;
        }

        if (!debugger_.isPaused()) {
          response.appendResponseLine('Execution is not paused. Cannot step.');
          return;
        }

        try {
          await debugger_.stepOut();
          response.appendResponseLine(
            '⬆️ Stepped out. Use get_paused_info to see current state.',
          );
        } catch (error) {
          response.appendResponseLine(
            `Error stepping out: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  },
});

/**
 * Evaluate expression in the current call frame context.
 */
export const evaluateOnCallframe = defineTool({
  name: 'evaluate_on_callframe',
  description:
    'Evaluates a JavaScript expression in the context of a specific call frame while paused. This allows you to inspect variables and execute code in the paused scope.',
  annotations: {
    title: 'Evaluate on Call Frame',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    expression: zod.string().describe('The JavaScript expression to evaluate.'),
    frameIndex: zod
      .number()
      .int()
      .optional()
      .default(0)
      .describe(
        'The call frame index to evaluate in (0 = top frame, default: 0).',
      ),
  },
  handler: async (request, response, context) => {
    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    const pausedState = debugger_.getPausedState();

    if (!pausedState.isPaused) {
      response.appendResponseLine('Execution is not paused. Cannot evaluate.');
      return;
    }

    const {expression, frameIndex} = request.params;

    if (frameIndex >= pausedState.callFrames.length) {
      response.appendResponseLine(
        `Invalid frame index ${frameIndex}. Available frames: 0-${pausedState.callFrames.length - 1}`,
      );
      return;
    }

    const callFrameId = pausedState.callFrames[frameIndex].callFrameId;

    try {
      const result = await debugger_.evaluateOnCallFrame(
        callFrameId,
        expression,
        {
          returnByValue: true,
          generatePreview: true,
        },
      );

      if (result.exceptionDetails) {
        response.appendResponseLine(
          `❌ Error: ${result.exceptionDetails.text}`,
        );
        if (result.exceptionDetails.exception) {
          response.appendResponseLine(
            `   ${result.exceptionDetails.exception.description || ''}`,
          );
        }
      } else {
        response.appendResponseLine(`📝 Result:`);
        if (result.result.value !== undefined) {
          const valueStr =
            typeof result.result.value === 'string'
              ? `"${result.result.value}"`
              : JSON.stringify(result.result.value, null, 2);
          response.appendResponseLine(valueStr);
        } else {
          response.appendResponseLine(
            result.result.description || `[${result.result.type}]`,
          );
        }
      }
    } catch (error) {
      response.appendResponseLine(
        `Error evaluating: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Set a breakpoint on specific code text (function name, statement, etc.)
 * Combines search + locate + set breakpoint in one step.
 */
export const setBreakpointOnText = defineTool({
  name: 'set_breakpoint_on_text',
  description:
    'Sets a breakpoint on specific code (function name, statement, etc.) by searching for it and automatically determining the exact position. Works with both normal and minified files. NOTE: Prefer hook_function for monitoring function calls — it captures args/results without pausing execution. Use this only when you need to inspect local variables at a specific code location.',
  annotations: {
    title: 'Set Breakpoint on Text',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    ...pageIdxSchema,
    text: zod
      .string()
      .describe(
        'The code text to find and set breakpoint on (e.g., "function myFunc", "fetchData(", "apiCall").',
      ),
    urlFilter: zod
      .string()
      .optional()
      .describe(
        'Only search in scripts whose URL contains this string (case-insensitive).',
      ),
    occurrence: zod
      .number()
      .int()
      .optional()
      .default(1)
      .describe('Which occurrence to break on (1 = first, 2 = second, etc.).'),
    condition: zod
      .string()
      .optional()
      .describe(
        'Optional condition expression. Breakpoint only triggers when this evaluates to true.',
      ),
  },
  handler: async (request, response, context) => {
    const {text, urlFilter, occurrence, condition, pageIdx} = request.params;

    await withOptionalDebuggerPageContext(context, pageIdx, async () => {
      const debugger_ = context.debuggerContext;

      if (!debugger_.isEnabled()) {
        response.appendResponseLine(
          'Debugger is not enabled. Please select a page first.',
        );
        return;
      }

      try {
        const searchResult = await debugger_.searchInScripts(text, {
          caseSensitive: true,
          isRegex: false,
        });

        if (searchResult.matches.length === 0) {
          response.appendResponseLine(
            `"${text}" not found in any loaded script.`,
          );
          return;
        }

        let matches = searchResult.matches;
        if (urlFilter) {
          const lowerFilter = urlFilter.toLowerCase();
          matches = matches.filter(
            m => m.url && m.url.toLowerCase().includes(lowerFilter),
          );
          if (matches.length === 0) {
            response.appendResponseLine(
              `"${text}" not found in scripts matching "${urlFilter}".`,
            );
            return;
          }
        }

        if (occurrence > matches.length) {
          response.appendResponseLine(
            `Only ${matches.length} occurrence(s) found, but occurrence ${occurrence} was requested.`,
          );
          return;
        }

        const match = matches[occurrence - 1];
        const script = debugger_.getScriptById(match.scriptId);
        const url = script?.url || match.url;

        if (!url) {
          response.appendResponseLine(
            'Cannot set breakpoint: script has no URL (inline script).',
          );
          return;
        }

        const source = await debugger_.getScriptSource(match.scriptId);
        let columnNumber = 0;
        const lines = source.split('\n');
        if (match.lineNumber < lines.length) {
          const lineContent = lines[match.lineNumber];
          const colPos = lineContent.indexOf(text);
          if (colPos >= 0) {
            columnNumber = colPos;
          }
        }

        const breakpointInfo = await debugger_.setBreakpoint(
          url,
          match.lineNumber,
          columnNumber,
          condition,
        );

        response.appendResponseLine(`✅ Breakpoint set successfully!`);
        response.appendResponseLine(`- ID: ${breakpointInfo.breakpointId}`);
        response.appendResponseLine(`- URL: ${url}`);
        response.appendResponseLine(
          `- Line: ${match.lineNumber + 1}, Column: ${columnNumber}`,
        );
        if (condition) {
          response.appendResponseLine(`- Condition: ${condition}`);
        }
        response.appendResponseLine(`- Tip: ${BREAKPOINT_STALL_HINT}`);

        const contextStart = Math.max(0, columnNumber - 50);
        const contextEnd = Math.min(
          lines[match.lineNumber].length,
          columnNumber + text.length + 50,
        );
        const preview = lines[match.lineNumber].substring(
          contextStart,
          contextEnd,
        );
        const prefix = contextStart > 0 ? '...' : '';
        const suffix = contextEnd < lines[match.lineNumber].length ? '...' : '';

        response.appendResponseLine('');
        response.appendResponseLine('Context:');
        response.appendResponseLine('```javascript');
        response.appendResponseLine(`${prefix}${preview}${suffix}`);
        response.appendResponseLine('```');
      } catch (error) {
        response.appendResponseLine(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});

/**
 * Hook a function to monitor its calls and return values.
 */
export const hookFunction = defineTool({
  name: 'hook_function',
  description:
    'Recommended default for reverse engineering: hook a function and log calls/args/results without pausing execution.',
  annotations: {
    title: 'Hook Function',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    ...pageIdxSchema,
    target: zod
      .string()
      .describe(
        'The function to hook. Can be: global function name ("fetch"), object method ("XMLHttpRequest.prototype.open"), or path ("window.app.api.request").',
      ),
    logArgs: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to log function arguments (default: true).'),
    logResult: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to log return value (default: true).'),
    logStack: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to log call stack (default: false).'),
    hookId: zod
      .string()
      .optional()
      .describe(
        'Custom identifier for this hook. Used to unhook later. Defaults to target name.',
      ),
  },
  handler: async (request, response, context) => {
    const {target, logArgs, logResult, logStack, hookId, pageIdx} =
      request.params;
    const id = hookId || target.replace(/[^a-zA-Z0-9]/g, '_');

    // Split target into object path and method
    const parts = target.split('.');
    const methodName = parts.pop()!;
    const objectPath = parts.length > 0 ? parts.join('.') : 'window';

    const hookCode = `
(function() {
  const hookId = ${JSON.stringify(id)};
  const objectPath = ${JSON.stringify(objectPath)};
  const methodName = ${JSON.stringify(methodName)};
  const logArgs = ${logArgs};
  const logResult = ${logResult};
  const logStack = ${logStack};

  // Get the object
  let obj;
  try {
    obj = objectPath === 'window' ? window : eval(objectPath);
  } catch(e) {
    throw new Error('Cannot find object: ' + objectPath);
  }

  if (!obj || typeof obj[methodName] !== 'function') {
    throw new Error('Cannot find function: ' + methodName + ' on ' + objectPath);
  }

  // Store original and hooks registry
  window.__mcp_hooks__ = window.__mcp_hooks__ || {};
  window.__hookStore = window.__hookStore || {};
  if (window.__mcp_hooks__[hookId]) {
    return { success: false, message: 'Hook already exists with id: ' + hookId };
  }
  if (!window.__hookStore[hookId]) {
    window.__hookStore[hookId] = [];
  }

  const original = obj[methodName];
  window.__mcp_hooks__[hookId] = { obj, methodName, original };

  const safeClone = (value) => {
    try {
      if (typeof value === 'function') return '[Function]';
      if (typeof Element !== 'undefined' && value instanceof Element) {
        return '[Element: ' + value.tagName + ']';
      }
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      try {
        return String(value);
      } catch {
        return '[Unserializable]';
      }
    }
  };

  const pushHookData = (record) => {
    const store = window.__hookStore[hookId];
    if (!Array.isArray(store)) return;
    store.push(record);
    if (store.length > 1000) store.shift();
  };

  // Create hooked function
  obj[methodName] = function(...args) {
    const callInfo = {
      hook: hookId,
      target: objectPath + '.' + methodName,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      event: 'call',
    };

    if (logArgs) {
      callInfo.arguments = args.map(arg => safeClone(arg));
    }

    if (logStack) {
      callInfo.stack = new Error().stack?.split('\\n').slice(2, 6).map(s => s.trim());
    }

    pushHookData(callInfo);
    console.log('[MCP Hook]', callInfo);

    try {
      const result = original.apply(this, args);

      // Handle promises
      if (result && typeof result.then === 'function') {
        return result.then(res => {
          if (logResult) {
            const resInfo = safeClone(res);
            const resultInfo = {
              hook: hookId,
              target: objectPath + '.' + methodName,
              timestamp: Date.now(),
              isoTime: new Date().toISOString(),
              event: 'result',
              result: resInfo,
            };
            pushHookData(resultInfo);
            console.log('[MCP Hook Result]', { hook: hookId, result: resInfo });
          }
          return res;
        }).catch(err => {
          const errorInfo = {
            hook: hookId,
            target: objectPath + '.' + methodName,
            timestamp: Date.now(),
            isoTime: new Date().toISOString(),
            event: 'error',
            error: err && err.message ? err.message : String(err),
          };
          pushHookData(errorInfo);
          console.log('[MCP Hook Error]', { hook: hookId, error: err.message });
          throw err;
        });
      }

      if (logResult) {
        const resInfo = safeClone(result);
        const resultInfo = {
          hook: hookId,
          target: objectPath + '.' + methodName,
          timestamp: Date.now(),
          isoTime: new Date().toISOString(),
          event: 'result',
          result: resInfo,
        };
        pushHookData(resultInfo);
        console.log('[MCP Hook Result]', { hook: hookId, result: resInfo });
      }

      return result;
    } catch(err) {
      const errorInfo = {
        hook: hookId,
        target: objectPath + '.' + methodName,
        timestamp: Date.now(),
        isoTime: new Date().toISOString(),
        event: 'error',
        error: err && err.message ? err.message : String(err),
      };
      pushHookData(errorInfo);
      console.log('[MCP Hook Error]', { hook: hookId, error: err.message });
      throw err;
    }
  };

  // Preserve function properties
  Object.keys(original).forEach(key => {
    try { obj[methodName][key] = original[key]; } catch(e) {}
  });

  return { success: true, hookId: hookId };
})();
`;

    try {
      const frame =
        pageIdx === undefined
          ? context.getSelectedFrame()
          : context.getPageByOptionalIdx(pageIdx).mainFrame();
      const result = await frame.evaluate(hookCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          response.appendResponseLine(`✅ Hook installed successfully!`);
          response.appendResponseLine(`- Hook ID: ${id}`);
          response.appendResponseLine(`- Target: ${target}`);
          response.appendResponseLine(`- Log args: ${logArgs}`);
          response.appendResponseLine(`- Log result: ${logResult}`);
          response.appendResponseLine(`- Log stack: ${logStack}`);
          response.appendResponseLine('');
          response.appendResponseLine(
            'Function calls will be logged to console. Use console_message(action="list") to view.',
          );
          response.appendResponseLine(
            `Use unhook_function(hookId: "${id}") to remove.`,
          );
        } else {
          response.appendResponseLine(
            `❌ ${(result as {message: string}).message}`,
          );
        }
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Remove a function hook.
 */
export const unhookFunction = defineTool({
  name: 'unhook_function',
  description: 'Removes a previously installed function hook.',
  annotations: {
    title: 'Unhook Function',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    hookId: zod
      .string()
      .describe('The hook ID to remove (from hook_function).'),
  },
  handler: async (request, response, context) => {
    const {hookId} = request.params;

    const unhookCode = `
(function() {
  const hookId = ${JSON.stringify(hookId)};
  if (!window.__mcp_hooks__ || !window.__mcp_hooks__[hookId]) {
    return { success: false, message: 'Hook not found: ' + hookId };
  }

  const { obj, methodName, original } = window.__mcp_hooks__[hookId];
  obj[methodName] = original;
  delete window.__mcp_hooks__[hookId];

  return { success: true };
})();
`;

    try {
      const frame = context.getSelectedFrame();
      const result = await frame.evaluate(unhookCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          response.appendResponseLine(
            `✅ Hook "${hookId}" removed successfully.`,
          );
        } else {
          response.appendResponseLine(
            `❌ ${(result as {message: string}).message}`,
          );
        }
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * List all active hooks.
 */
export const listHooks = defineTool({
  name: 'list_hooks',
  description: 'Lists all active function hooks.',
  annotations: {
    title: 'List Hooks',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {},
  handler: async (request, response, context) => {
    const listCode = `
(function() {
  if (!window.__mcp_hooks__) return [];
  return Object.keys(window.__mcp_hooks__).map(id => {
    const hook = window.__mcp_hooks__[id];
    return { id, target: hook.obj.constructor.name + '.' + hook.methodName };
  });
})();
`;

    try {
      const frame = context.getSelectedFrame();
      const hooks = (await frame.evaluate(listCode)) as Array<{
        id: string;
        target: string;
      }>;

      if (!hooks || hooks.length === 0) {
        response.appendResponseLine('No active hooks.');
        return;
      }

      response.appendResponseLine(`Active hooks (${hooks.length}):\n`);
      for (const hook of hooks) {
        response.appendResponseLine(`- ${hook.id}: ${hook.target}`);
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Inspect an object deeply.
 */
export const inspectObject = defineTool({
  name: 'inspect_object',
  description:
    'Deeply inspects a JavaScript object, showing its properties, prototype chain, and methods. Useful for understanding object structure.',
  annotations: {
    title: 'Inspect Object',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    expression: zod
      .string()
      .describe(
        'JavaScript expression to evaluate and inspect (e.g., "window.app", "document.body", "myObject").',
      ),
    depth: zod
      .number()
      .int()
      .optional()
      .default(2)
      .describe('How deep to inspect nested objects (default: 2).'),
    showMethods: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to show methods (default: true).'),
    showPrototype: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to show prototype chain (default: true).'),
  },
  handler: async (request, response, context) => {
    const {expression, depth, showMethods, showPrototype} = request.params;

    const inspectCode = `
(function() {
  const maxDepth = ${depth};
  const showMethods = ${showMethods};
  const showPrototype = ${showPrototype};

  let target;
  try {
    target = eval(${JSON.stringify(expression)});
  } catch(e) {
    return { error: 'Cannot evaluate: ' + e.message };
  }

  if (target === null) return { type: 'null', value: null };
  if (target === undefined) return { type: 'undefined', value: undefined };

  const seen = new WeakSet();

  function inspect(obj, currentDepth) {
    if (currentDepth > maxDepth) return '[Max depth reached]';
    if (obj === null) return null;
    if (obj === undefined) return undefined;

    const type = typeof obj;
    if (type !== 'object' && type !== 'function') return obj;

    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);

    if (Array.isArray(obj)) {
      if (obj.length > 100) return '[Array(' + obj.length + ')]';
      return obj.slice(0, 20).map(item => inspect(item, currentDepth + 1));
    }

    const result = {};
    const props = Object.getOwnPropertyNames(obj);

    for (const prop of props.slice(0, 50)) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
        const value = obj[prop];
        const valueType = typeof value;

        if (valueType === 'function') {
          if (showMethods) {
            result[prop] = '[Function: ' + (value.name || 'anonymous') + ']';
          }
        } else if (valueType === 'object' && value !== null) {
          result[prop] = inspect(value, currentDepth + 1);
        } else {
          result[prop] = value;
        }
      } catch(e) {
        result[prop] = '[Error: ' + e.message + ']';
      }
    }

    if (props.length > 50) {
      result['...'] = (props.length - 50) + ' more properties';
    }

    return result;
  }

  const result = {
    type: typeof target,
    constructor: target.constructor?.name,
    value: inspect(target, 0),
  };

  if (showPrototype && typeof target === 'object') {
    const protoChain = [];
    let proto = Object.getPrototypeOf(target);
    while (proto && protoChain.length < 5) {
      protoChain.push(proto.constructor?.name || 'Object');
      proto = Object.getPrototypeOf(proto);
    }
    result.prototypeChain = protoChain;
  }

  return result;
})();
`;

    try {
      const frame = context.getSelectedFrame();
      const result = await frame.evaluate(inspectCode);

      if (result && typeof result === 'object' && 'error' in result) {
        response.appendResponseLine(`❌ ${(result as {error: string}).error}`);
        return;
      }

      response.appendResponseLine(`Inspecting: ${expression}\n`);
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result, null, 2));
      response.appendResponseLine('```');
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Get browser storage data.
 */
export const getStorage = defineTool({
  name: 'get_storage',
  description:
    'Gets browser storage data including cookies, localStorage, and sessionStorage.',
  annotations: {
    title: 'Get Storage',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: true,
  },
  schema: {
    ...pageIdxSchema,
    type: zod
      .enum(['all', 'cookies', 'localStorage', 'sessionStorage'])
      .optional()
      .default('all')
      .describe('Which storage to retrieve (default: all).'),
    filter: zod
      .string()
      .optional()
      .describe('Optional filter string to match against keys/names.'),
  },
  handler: async (request, response, context) => {
    const {type, filter, pageIdx} = request.params;

    const storageCode = `
(function() {
  const type = ${JSON.stringify(type)};
  const filter = ${JSON.stringify(filter)};
  const result = {};

  function matchFilter(key) {
    if (!filter) return true;
    return key.toLowerCase().includes(filter.toLowerCase());
  }

  if (type === 'all' || type === 'cookies') {
    const cookies = {};
    document.cookie.split(';').forEach(c => {
      const [name, ...valueParts] = c.trim().split('=');
      if (name && matchFilter(name)) {
        cookies[name] = valueParts.join('=');
      }
    });
    result.cookies = cookies;
  }

  if (type === 'all' || type === 'localStorage') {
    const local = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && matchFilter(key)) {
        try {
          const value = localStorage.getItem(key);
          try {
            local[key] = JSON.parse(value);
          } catch {
            local[key] = value;
          }
        } catch(e) {
          local[key] = '[Error reading]';
        }
      }
    }
    result.localStorage = local;
  }

  if (type === 'all' || type === 'sessionStorage') {
    const session = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && matchFilter(key)) {
        try {
          const value = sessionStorage.getItem(key);
          try {
            session[key] = JSON.parse(value);
          } catch {
            session[key] = value;
          }
        } catch(e) {
          session[key] = '[Error reading]';
        }
      }
    }
    result.sessionStorage = session;
  }

  return result;
})();
`;

    try {
      const frame =
        pageIdx === undefined
          ? context.getSelectedFrame()
          : context.getPageByOptionalIdx(pageIdx).mainFrame();
      const result = await frame.evaluate(storageCode);

      response.appendResponseLine(
        `Storage data${filter ? ` (filter: "${filter}")` : ''}:\n`,
      );
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify(result, null, 2));
      response.appendResponseLine('```');
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

async function handleXhrBreakpoint(
  params: {action: 'set' | 'remove'; url?: string; pageIdx?: number},
  response: {appendResponseLine(value: string): void},
  context: Parameters<typeof listScripts.handler>[2],
): Promise<void> {
  const {action, url, pageIdx} = params;
  if (!url) {
    throw new Error('url is required for xhr_breakpoint actions.');
  }

  await withOptionalDebuggerPageContext(context, pageIdx, async () => {
    const debugger_ = context.debuggerContext;

    if (!debugger_.isEnabled()) {
      response.appendResponseLine(
        'Debugger is not enabled. Please select a page first.',
      );
      return;
    }

    const client = debugger_.getClient();
    if (!client) {
      response.appendResponseLine('Debugger client not available.');
      return;
    }

    try {
      if (action === 'set') {
        await client.send('DOMDebugger.setXHRBreakpoint', {url});
        response.appendResponseLine(
          `✅ XHR breakpoint set for URLs containing: "${url}"`,
        );
        response.appendResponseLine(
          'Debugger will pause when a matching XHR/Fetch request is made.',
        );
        return;
      }

      await client.send('DOMDebugger.removeXHRBreakpoint', {url});
      response.appendResponseLine(`✅ XHR breakpoint removed for: "${url}"`);
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

/**
 * Manage XHR/Fetch breakpoints.
 */
export const xhrBreakpoint = defineTool({
  name: 'xhr_breakpoint',
  description: 'Set or remove an XHR/Fetch breakpoint by URL substring match.',
  annotations: {
    title: 'XHR Breakpoint',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    action: zod
      .enum(['set', 'remove'])
      .describe('XHR breakpoint action to perform.'),
    ...pageIdxSchema,
    url: zod
      .string()
      .optional()
      .describe('URL pattern to set/remove breakpoint for (partial match).'),
  },
  handler: async (request, response, context) => {
    await handleXhrBreakpoint(request.params, response, context);
  },
});

/**
 * Monitor events on an element or window.
 */
export const monitorEvents = defineTool({
  name: 'monitor_events',
  description:
    'Monitors DOM events on a specified element or window. Events will be logged to console.',
  annotations: {
    title: 'Monitor Events',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    selector: zod
      .string()
      .optional()
      .default('window')
      .describe(
        'CSS selector for element to monitor, or "window"/"document" (default: window).',
      ),
    events: zod
      .array(zod.string())
      .optional()
      .describe(
        'Specific events to monitor (e.g., ["click", "keydown"]). If not specified, monitors common events.',
      ),
    monitorId: zod
      .string()
      .optional()
      .describe('Custom ID for this monitor. Used to stop monitoring later.'),
    ...reverseTaskParamsSchema,
  },
  handler: async (request, response, context) => {
    const {selector, events, monitorId} = request.params;
    const id = monitorId || selector?.replace(/[^a-zA-Z0-9]/g, '_') || 'window';

    const defaultEvents = [
      'click',
      'dblclick',
      'mousedown',
      'mouseup',
      'keydown',
      'keyup',
      'keypress',
      'submit',
      'change',
      'input',
      'focus',
      'blur',
    ];

    const monitorCode = `
(function() {
  const selector = ${JSON.stringify(selector)};
  const events = ${JSON.stringify(events || defaultEvents)};
  const monitorId = ${JSON.stringify(id)};

  window.__mcp_monitors__ = window.__mcp_monitors__ || {};
  if (window.__mcp_monitors__[monitorId]) {
    return { success: false, message: 'Monitor already exists: ' + monitorId };
  }

  let target;
  if (selector === 'window') {
    target = window;
  } else if (selector === 'document') {
    target = document;
  } else {
    target = document.querySelector(selector);
    if (!target) {
      return { success: false, message: 'Element not found: ' + selector };
    }
  }

  const listeners = {};

  events.forEach(eventType => {
    const handler = (e) => {
      const info = {
        monitor: monitorId,
        event: eventType,
        timestamp: new Date().toISOString(),
        target: e.target?.tagName || 'unknown',
      };

      if (e.target?.id) info.targetId = e.target.id;
      if (e.target?.className) info.targetClass = e.target.className;
      if (e.key) info.key = e.key;
      if (e.code) info.code = e.code;
      if (e.clientX !== undefined) info.position = { x: e.clientX, y: e.clientY };

      console.log('[MCP Event]', info);
    };

    target.addEventListener(eventType, handler, true);
    listeners[eventType] = handler;
  });

  window.__mcp_monitors__[monitorId] = { target, listeners };

  return { success: true, monitorId, eventCount: events.length };
})();
`;

    try {
      const frame = context.getSelectedFrame();
      const result = await frame.evaluate(monitorCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          const r = result as {monitorId: string; eventCount: number};
          await appendDebuggerEvidence(request.params, {
            tool: 'monitor_events',
            monitorId: r.monitorId,
            selector,
            eventCount: r.eventCount,
            events: events || defaultEvents,
          });
          response.appendResponseLine(`✅ Event monitor started!`);
          response.appendResponseLine(`- Monitor ID: ${r.monitorId}`);
          response.appendResponseLine(`- Target: ${selector}`);
          response.appendResponseLine(`- Events: ${r.eventCount} types`);
          response.appendResponseLine('');
          response.appendResponseLine(
            'Events will be logged to console. Use console_message(action="list") to view.',
          );
          response.appendResponseLine(
            `Use stop_monitor(monitorId: "${r.monitorId}") to stop.`,
          );
        } else {
          response.appendResponseLine(
            `❌ ${(result as {message: string}).message}`,
          );
        }
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Stop monitoring events.
 */
export const stopMonitor = defineTool({
  name: 'stop_monitor',
  description: 'Stops an event monitor.',
  annotations: {
    title: 'Stop Monitor',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    monitorId: zod.string().describe('The monitor ID to stop.'),
  },
  handler: async (request, response, context) => {
    const {monitorId} = request.params;

    const stopCode = `
(function() {
  const monitorId = ${JSON.stringify(monitorId)};
  if (!window.__mcp_monitors__ || !window.__mcp_monitors__[monitorId]) {
    return { success: false, message: 'Monitor not found: ' + monitorId };
  }

  const { target, listeners } = window.__mcp_monitors__[monitorId];
  Object.entries(listeners).forEach(([eventType, handler]) => {
    target.removeEventListener(eventType, handler, true);
  });

  delete window.__mcp_monitors__[monitorId];
  return { success: true };
})();
`;

    try {
      const frame = context.getSelectedFrame();
      const result = await frame.evaluate(stopCode);

      if (result && typeof result === 'object') {
        if ((result as {success: boolean}).success) {
          response.appendResponseLine(`✅ Monitor "${monitorId}" stopped.`);
        } else {
          response.appendResponseLine(
            `❌ ${(result as {message: string}).message}`,
          );
        }
      }
    } catch (error) {
      response.appendResponseLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Trace a function by name - works for module-internal functions.
 * Uses conditional breakpoints to log without pausing.
 */
export const traceFunction = defineTool({
  name: 'trace_function',
  description:
    'Traces calls to a function by its name in the source code. Works for ANY function including module-internal functions (webpack/rollup bundled). Uses "logpoints" (conditional breakpoints) to log arguments without pausing execution.',
  annotations: {
    title: 'Trace Function',
    category: ToolCategory.REVERSE_ENGINEERING,
    readOnlyHint: false,
  },
  schema: {
    ...pageIdxSchema,
    functionName: zod
      .string()
      .describe(
        'The function name to trace. Will search for "function NAME" or "NAME = function" or "NAME(" patterns.',
      ),
    urlFilter: zod
      .string()
      .optional()
      .describe('Only search in scripts matching this URL pattern.'),
    logArgs: zod
      .boolean()
      .optional()
      .default(true)
      .describe('Whether to log function arguments (default: true).'),
    logThis: zod
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to log "this" context (default: false).'),
    pause: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to actually pause execution (default: false, just logs).',
      ),
    traceId: zod
      .string()
      .optional()
      .describe('Custom ID for this trace. Used to identify in logs.'),
    ...reverseTaskParamsSchema,
  },
  handler: async (request, response, context) => {
    const {functionName, urlFilter, logArgs, logThis, pause, traceId, pageIdx} =
      request.params;
    const id = traceId || `trace_${functionName}`;

    // Search patterns for function definitions
    const patterns = [
      `function ${functionName}`,
      `${functionName}=function`,
      `${functionName} = function`,
      `${functionName}=(`,
      `${functionName} = (`,
      `${functionName}(`,
      `${functionName}:function`,
      `${functionName}: function`,
    ];

    await withOptionalDebuggerPageContext(context, pageIdx, async () => {
      const debugger_ = context.debuggerContext;

      if (!debugger_.isEnabled()) {
        response.appendResponseLine(
          'Debugger is not enabled. Please select a page first.',
        );
        return;
      }

      try {
        let foundMatch = null;

        // Search for each pattern
        for (const pattern of patterns) {
          const result = await debugger_.searchInScripts(pattern, {
            caseSensitive: true,
            isRegex: false,
          });

          let matches = result.matches;

          // Apply URL filter
          if (urlFilter) {
            const lowerFilter = urlFilter.toLowerCase();
            matches = matches.filter(
              m => m.url && m.url.toLowerCase().includes(lowerFilter),
            );
          }

          // Skip minified files with extremely long lines
          matches = matches.filter(m => m.lineContent.length < 100000);

          if (matches.length > 0) {
            foundMatch = {pattern, match: matches[0]};
            break;
          }
        }

        if (!foundMatch) {
          response.appendResponseLine(
            `❌ Function "${functionName}" not found in any script.`,
          );
          response.appendResponseLine('');
          response.appendResponseLine('Searched patterns:');
          for (const p of patterns.slice(0, 4)) {
            response.appendResponseLine(`  - "${p}"`);
          }
          response.appendResponseLine('');
          response.appendResponseLine(
            'Tip: Use search_in_sources to find the exact function signature, then use breakpoint(action="set").',
          );
          return;
        }

        const {match} = foundMatch;
        const script = debugger_.getScriptById(match.scriptId);
        const url = script?.url || match.url;

        if (!url) {
          response.appendResponseLine(
            'Cannot trace: script has no URL (inline script).',
          );
          return;
        }

        const source = await debugger_.getScriptSource(match.scriptId);
        const lines = source.split('\n');
        let columnNumber = 0;

        if (match.lineNumber < lines.length) {
          const lineContent = lines[match.lineNumber];
          const funcStart = lineContent.indexOf(foundMatch.pattern);
          if (funcStart >= 0) {
            const afterPattern = lineContent.substring(
              funcStart + foundMatch.pattern.length,
            );
            const braceMatch = afterPattern.match(/[({]/);
            if (braceMatch && braceMatch.index !== undefined) {
              columnNumber =
                funcStart + foundMatch.pattern.length + braceMatch.index + 1;
            } else {
              columnNumber = funcStart;
            }
          }
        }

        const logParts = [`'[Trace ${id}] ${functionName} called'`];
        if (logArgs) {
          logParts.push(`'args:'`);
          logParts.push(`JSON.stringify(Array.from(arguments)).slice(0,500)`);
        }
        if (logThis) {
          logParts.push(`'this:'`);
          logParts.push(`this?.constructor?.name || typeof this`);
        }
        const logExpr = `console.log(${logParts.join(', ')})`;
        const condition = pause ? logExpr : `(${logExpr}, false)`;

        const breakpointInfo = await debugger_.setBreakpoint(
          url,
          match.lineNumber,
          columnNumber,
          condition,
        );

        await appendDebuggerEvidence(request.params, {
          tool: 'trace_function',
          traceId: id,
          functionName,
          breakpointId: breakpointInfo.breakpointId,
          location: `${url}:${match.lineNumber + 1}:${columnNumber}`,
          mode: pause ? 'pause' : 'log',
          urlFilter: urlFilter ?? null,
          logArgs,
          logThis,
        });

        response.appendResponseLine(`✅ Function trace installed!`);
        response.appendResponseLine(`- Trace ID: ${id}`);
        response.appendResponseLine(`- Function: ${functionName}`);
        response.appendResponseLine(
          `- Breakpoint ID: ${breakpointInfo.breakpointId}`,
        );
        response.appendResponseLine(
          `- Location: ${url}:${match.lineNumber + 1}:${columnNumber}`,
        );
        response.appendResponseLine(
          `- Mode: ${pause ? 'Pause on call' : 'Log only (no pause)'}`,
        );
        response.appendResponseLine('');
        response.appendResponseLine(
          'Calls will be logged to console. Use console_message(action="list") to view.',
        );
        response.appendResponseLine(
          `Use breakpoint(action: "remove", breakpointId: "${breakpointInfo.breakpointId}") to stop tracing.`,
        );

        if (match.lineNumber < lines.length) {
          const lineContent = lines[match.lineNumber];
          const contextStart = Math.max(0, columnNumber - 30);
          const contextEnd = Math.min(lineContent.length, columnNumber + 50);
          const preview = lineContent.substring(contextStart, contextEnd);
          const prefix = contextStart > 0 ? '...' : '';
          const suffix = contextEnd < lineContent.length ? '...' : '';

          response.appendResponseLine('');
          response.appendResponseLine('Trace point:');
          response.appendResponseLine('```javascript');
          response.appendResponseLine(`${prefix}${preview}${suffix}`);
          response.appendResponseLine('```');
        }
      } catch (error) {
        response.appendResponseLine(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  },
});
