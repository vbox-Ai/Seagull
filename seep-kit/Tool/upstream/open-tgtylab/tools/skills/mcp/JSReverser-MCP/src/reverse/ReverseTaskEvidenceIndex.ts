/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ReverseTaskEvidenceAggregateEntry {
  value: string;
  count: number;
}

export interface ReverseTaskEvidenceAggregates {
  total: number;
  dedupedTotal: number;
  bySource: Record<string, number>;
  topUrls: ReverseTaskEvidenceAggregateEntry[];
  topFunctions: ReverseTaskEvidenceAggregateEntry[];
  blockers: string[];
  links: {
    requestToFunctions: Array<{url: string; functions: string[]}>;
    blockerToUrls: Array<{blocker: string; urls: string[]}>;
    functionToCandidateScripts: Array<{
      functionName: string;
      candidateScripts: string[];
    }>;
  };
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function pickUrl(entry: Record<string, unknown>): string | undefined {
  return (
    normalizeText(entry.url) ??
    normalizeText(entry.requestUrl) ??
    normalizeText((entry.request as Record<string, unknown> | undefined)?.url)
  );
}

function pickFunctionName(entry: Record<string, unknown>): string | undefined {
  return (
    normalizeText(entry.functionName) ??
    normalizeText(entry.function) ??
    normalizeText(entry.targetFunctionName)
  );
}

function buildEvidenceKey(entry: Record<string, unknown>): string {
  const source = normalizeText(entry.source) ?? 'unknown';
  const kind = normalizeText(entry.kind) ?? 'event';
  const url = pickUrl(entry) ?? '';
  const functionName = pickFunctionName(entry) ?? '';
  const note = normalizeText(entry.note) ?? '';
  const result = normalizeText(entry.result) ?? '';
  return [source, kind, url, functionName, note, result].join('::');
}

function topEntries(
  counts: Map<string, number>,
  limit = 5,
): ReverseTaskEvidenceAggregateEntry[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({value, count}));
}

export function buildReverseTaskEvidenceIndex(
  entries: Array<Record<string, unknown>>,
  options: {
    targetContext?: Record<string, unknown>;
  } = {},
): {
  dedupedEntries: Array<Record<string, unknown>>;
  aggregates: ReverseTaskEvidenceAggregates;
} {
  const seen = new Set<string>();
  const dedupedEntries: Array<Record<string, unknown>> = [];
  const bySource = new Map<string, number>();
  const urlCounts = new Map<string, number>();
  const functionCounts = new Map<string, number>();
  const blockers = new Set<string>();
  const requestToFunctions = new Map<string, Set<string>>();
  const blockerToUrls = new Map<string, Set<string>>();

  for (const entry of entries) {
    const key = buildEvidenceKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dedupedEntries.push(entry);

    const source = normalizeText(entry.source) ?? 'unknown';
    bySource.set(source, (bySource.get(source) ?? 0) + 1);

    const url = pickUrl(entry);
    if (url) {
      urlCounts.set(url, (urlCounts.get(url) ?? 0) + 1);
    }

    const functionName = pickFunctionName(entry);
    if (functionName) {
      functionCounts.set(
        functionName,
        (functionCounts.get(functionName) ?? 0) + 1,
      );
    }
    if (url && functionName) {
      if (!requestToFunctions.has(url)) {
        requestToFunctions.set(url, new Set());
      }
      requestToFunctions.get(url)!.add(functionName);
    }

    const kind = normalizeText(entry.kind);
    if (kind === 'env-gap') {
      const blocker =
        normalizeText(entry.note) ?? normalizeText(entry.result) ?? 'env-gap';
      blockers.add(blocker);
      if (!blockerToUrls.has(blocker)) {
        blockerToUrls.set(blocker, new Set());
      }
      if (url) {
        blockerToUrls.get(blocker)!.add(url);
      }
    }
  }

  const candidateScripts = Array.isArray(
    options.targetContext?.candidateScripts,
  )
    ? options.targetContext?.candidateScripts
        .map(item => normalizeText(item))
        .filter((item): item is string => Boolean(item))
    : [];
  const functionToCandidateScripts = topEntries(functionCounts, 10)
    .filter(() => candidateScripts.length > 0)
    .map(entry => ({
      functionName: entry.value,
      candidateScripts,
    }));

  return {
    dedupedEntries,
    aggregates: {
      total: entries.length,
      dedupedTotal: dedupedEntries.length,
      bySource: Object.fromEntries(
        [...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
      topUrls: topEntries(urlCounts),
      topFunctions: topEntries(functionCounts),
      blockers: [...blockers],
      links: {
        requestToFunctions: [...requestToFunctions.entries()].map(
          ([url, functions]) => ({
            url,
            functions: [...functions].sort(),
          }),
        ),
        blockerToUrls: [...blockerToUrls.entries()].map(([blocker, urls]) => ({
          blocker,
          urls: [...urls].sort(),
        })),
        functionToCandidateScripts,
      },
    },
  };
}
