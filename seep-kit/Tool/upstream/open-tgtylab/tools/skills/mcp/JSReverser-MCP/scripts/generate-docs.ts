/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';

import {cliOptions} from '../build/src/cli.js';
import * as advisorTools from '../build/src/tools/advisor.js';
import * as agentRunnerTools from '../build/src/tools/agent-runner.js';
import * as jshookAnalyzerTools from '../build/src/tools/analyzer.js';
import {ToolCategory, labels} from '../build/src/tools/categories.js';
import * as jshookCollectorTools from '../build/src/tools/collector.js';
import * as consoleTools from '../build/src/tools/console.js';
import * as debuggerTools from '../build/src/tools/debugger.js';
import * as diagnosticsTools from '../build/src/tools/diagnostics.js';
import * as jshookDomTools from '../build/src/tools/dom.js';
import * as frameTools from '../build/src/tools/frames.js';
import * as jshookHookTools from '../build/src/tools/hook.js';
import * as networkTools from '../build/src/tools/network.js';
import {optimizationTools} from '../build/src/tools/optimizations.js';
import * as orchestratorTools from '../build/src/tools/orchestrator.js';
import * as jshookPageTools from '../build/src/tools/page.js';
import * as pagesTools from '../build/src/tools/pages.js';
import * as jshookRebuildTools from '../build/src/tools/rebuild.js';
import * as screenshotTools from '../build/src/tools/screenshot.js';
import * as scriptTools from '../build/src/tools/script.js';
import * as jshookStealthTools from '../build/src/tools/stealth.js';
import * as taskManagerTools from '../build/src/tools/task-manager.js';
import * as taskTools from '../build/src/tools/task.js';
import * as websocketTools from '../build/src/tools/websocket.js';
import * as workflowTools from '../build/src/tools/workflows.js';

const OUTPUT_PATH = './docs/reference/tool-reference.md';
const README_PATH = './README.md';

interface ToolDef {
  name: string;
  description: string;
  annotations: {category: ToolCategory};
  schema: Record<string, unknown>;
}

function allTools(): ToolDef[] {
  return [
    ...Object.values(consoleTools),
    ...Object.values(debuggerTools),
    ...Object.values(diagnosticsTools),
    ...Object.values(frameTools),
    ...Object.values(networkTools),
    ...optimizationTools,
    ...Object.values(pagesTools),
    ...Object.values(screenshotTools),
    ...Object.values(scriptTools),
    ...Object.values(websocketTools),
    ...Object.values(jshookCollectorTools),
    ...Object.values(jshookAnalyzerTools),
    ...Object.values(agentRunnerTools),
    ...Object.values(jshookHookTools),
    ...Object.values(jshookStealthTools),
    ...Object.values(jshookDomTools),
    ...Object.values(jshookPageTools),
    ...Object.values(jshookRebuildTools),
    ...Object.values(advisorTools),
    ...Object.values(orchestratorTools),
    ...Object.values(taskTools),
    ...Object.values(taskManagerTools),
    ...Object.values(workflowTools),
  ] as ToolDef[];
}

function uniqueToolsByName(tools: ToolDef[]): ToolDef[] {
  const seen = new Set<string>();
  const deduped: ToolDef[] = [];
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      continue;
    }
    seen.add(tool.name);
    deduped.push(tool);
  }
  return deduped;
}

function generateConfigOptionsMarkdown(): string {
  let markdown = '';
  for (const [optionName, optionConfig] of Object.entries(cliOptions)) {
    if (optionConfig.hidden) continue;
    const aliasText = optionConfig.alias ? `, \`-${optionConfig.alias}\`` : '';
    const description = optionConfig.description || optionConfig.describe || '';

    markdown += `- **\`--${optionName}\`${aliasText}**\n`;
    markdown += `  ${description}\n`;
    markdown += `  - **Type:** ${optionConfig.type}\n`;
    if (optionConfig.choices) {
      markdown += `  - **Choices:** ${optionConfig.choices.map(c => `\`${c}\``).join(', ')}\n`;
    }
    if (optionConfig.default !== undefined) {
      markdown += `  - **Default:** \`${optionConfig.default}\`\n`;
    }
    markdown += '\n';
  }

  return markdown.trim();
}

function generateReverseAgentResponseMarkdown(): string {
  return `## Agent Response Contracts

Reverse-task tools return agent-oriented response fields for low-token continuation and recovery.

Common fields include \`schemaVersion\`, \`responseSummary\`, \`diagnostics\`, \`outcome\`, \`agentGuidance\`, \`recommendedStrategy\`, \`artifacts\`, \`generatedArtifacts\`, \`outputMode\`, \`fallbackPlan\`, \`continuation\`, \`targetActionDescription\`, \`otherTaskId\`, \`pruneOlderThanDays\`, and \`strategy\`.

### Compact response example (\`manage_reverse_task:get\`)

\`\`\`json
{
  "schemaVersion": "1.0",
  "responseSummary": "Task loaded.",
  "continuation": {
    "invoke": "manage_reverse_task",
    "invokeHint": {
      "requiredParams": ["taskId"],
      "optionalParams": ["outputMode"]
    }
  },
  "agentGuidance": {
    "recommendedStrategy": "observe-first"
  },
  "artifacts": ["task.json"]
}
\`\`\`

### Failure response example (\`env_error\`, resumable)

\`\`\`json
{
  "schemaVersion": "1.0",
  "outcome": "blocked",
  "errorType": "env_error",
  "fallbackPlan": {
    "recommendedStrategy": "env-fix"
  },
  "continuation": {
    "invoke": "orchestrate_reverse_task",
    "invokeHint": {
      "requiredParams": ["runtimeError", "observedCapabilities"]
    }
  }
}
\`\`\`

### Blocked response example

\`\`\`json
{
  "schemaVersion": "1.0",
  "outcome": "blocked",
  "blockedBy": ["missing runtime evidence"],
  "agentGuidance": {
    "recommendedStrategy": "evidence-only"
  }
}
\`\`\``;
}

function updateReadmeBlock(
  beginMarker: string,
  endMarker: string,
  content: string,
): void {
  const readmeContent = fs.readFileSync(README_PATH, 'utf8');
  const beginIndex = readmeContent.indexOf(beginMarker);
  const endIndex = readmeContent.indexOf(endMarker);

  if (beginIndex === -1 || endIndex === -1) {
    return;
  }

  const before = readmeContent.substring(0, beginIndex + beginMarker.length);
  const after = readmeContent.substring(endIndex);
  const updated = `${before}\n\n${content}\n\n${after}`;
  fs.writeFileSync(README_PATH, updated);
}

function generateDocs(): void {
  const tools = uniqueToolsByName(allTools()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const categories = new Map<string, ToolDef[]>();

  for (const tool of tools) {
    const category = tool.annotations.category;
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category)!.push(tool);
  }

  const categoryOrder = Object.values(ToolCategory);
  let markdown = `<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->\n\n# Chrome DevTools MCP Tool Reference\n\n> 快速按逆向目标查工具，请先看：[\`docs/reference/reverse-task-index.md\`](./reverse-task-index.md)\n\n${generateReverseAgentResponseMarkdown()}\n\n`;

  for (const category of categoryOrder) {
    const toolsInCategory = categories.get(category) || [];
    if (toolsInCategory.length === 0) continue;
    markdown += `- **[${labels[category]}](#${labels[category].toLowerCase().replace(/\s+/g, '-')})** (${toolsInCategory.length} tools)\n`;
    for (const tool of toolsInCategory) {
      markdown += `  - [\`${tool.name}\`](#${tool.name.toLowerCase()})\n`;
    }
  }

  markdown += '\n';

  for (const category of categoryOrder) {
    const toolsInCategory = categories.get(category) || [];
    if (toolsInCategory.length === 0) continue;

    markdown += `## ${labels[category]}\n\n`;
    for (const tool of toolsInCategory) {
      markdown += `### \`${tool.name}\`\n\n`;
      markdown += `**Description:** ${tool.description}\n\n`;

      const params = Object.keys(tool.schema || {});
      if (params.length > 0) {
        markdown += '**Parameters:**\n\n';
        for (const p of params) {
          markdown += `- \`${p}\`\n`;
        }
        markdown += '\n';
      }
    }
  }

  fs.writeFileSync(OUTPUT_PATH, markdown);

  const toolsTOC = Array.from(categories.entries())
    .map(([category, categoryTools]) => {
      const lines = [
        `- **${labels[category as ToolCategory]}** (${categoryTools.length} tools)`,
      ];
      for (const tool of categoryTools) {
        lines.push(
          `  - [\`${tool.name}\`](docs/reference/tool-reference.md#${tool.name.toLowerCase()})`,
        );
      }
      return lines.join('\n');
    })
    .join('\n');

  updateReadmeBlock(
    '<!-- BEGIN AUTO GENERATED TOOLS -->',
    '<!-- END AUTO GENERATED TOOLS -->',
    toolsTOC,
  );
  updateReadmeBlock(
    '<!-- BEGIN AUTO GENERATED OPTIONS -->',
    '<!-- END AUTO GENERATED OPTIONS -->',
    generateConfigOptionsMarkdown(),
  );

  console.log(`Generated ${OUTPUT_PATH} with ${tools.length} tools.`);
}

generateDocs();
