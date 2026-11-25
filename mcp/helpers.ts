/**
 * Pure helpers for the MCP server (no I/O). Tasks 3.2, 3.3 and 4.2 append here.
 */
import { isPatchable } from '@/lib/types';
import { MAX_COMPACT_FILES, MAX_CONTEXT_PATHS } from './types';
import type { CompactAnalysis, CompactFinding, RepoAnalysis, RepoFinding, RepoNode } from './types';

/**
 * Compact analyze_repo result: top files by rot (desc), ties by path (asc, code-unit order).
 * Copies only scalar fields so edges, code, notes, recommendations and nodes never leak.
 */
export function summarizeAnalysis(analysis: RepoAnalysis): CompactAnalysis {
  const files = analysis.nodes
    .map((n) => ({ path: n.path, score: n.rot, findingCount: n.findings.length, patchableCount: n.findings.filter(isPatchable).length }))
    .sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, MAX_COMPACT_FILES);

  return {
    title: analysis.title,
    defaultBranch: analysis.defaultBranch,
    overallRot: analysis.overallRot,
    rotSummary: analysis.rotSummary,
    coverage: analysis.coverage,
    files,
  };
}

/**
 * Projects a finding to the five public fields only (drops `lines` and anything else).
 * `static` stays authoritative; any other source (the analyzer's 'ai') becomes 'ai-unverified'.
 * A missing line is normalised to null.
 */
export function projectFinding(f: {
  line?: number | null;
  kind: string;
  text: string;
  suggestion: string;
  source: string;
}): CompactFinding {
  return {
    line: f.line ?? null,
    kind: f.kind,
    text: f.text,
    suggestion: f.suggestion,
    source: f.source === 'static' ? 'static' : 'ai-unverified',
    // isPatchable reads only source, line and kind; the analyzer's null line is restored for partial inputs.
    patchable: isPatchable({ ...f, line: f.line ?? null } as RepoFinding),
  };
}

export const projectFindings = (findings: Parameters<typeof projectFinding>[0][]): CompactFinding[] =>
  findings.map(projectFinding);

/**
 * Import context from cached edges. An edge { from, to } means node `from` imports node `to`
 * (conversion/helpers.ts maps from->source, to->target; page.tsx treats target===node as callers).
 * Unknown ids are skipped; each list is capped.
 */
export function fileContext(analysis: RepoAnalysis, node: RepoNode): { importedBy: string[]; imports: string[] } {
  const pathOf = new Map(analysis.nodes.map((n) => [n.id, n.path]));
  const collect = (pick: (e: { from: string; to: string }) => string | null) =>
    analysis.edges.flatMap((e) => pathOf.get(pick(e) ?? '') ?? []).slice(0, MAX_CONTEXT_PATHS);
  return {
    importedBy: collect((e) => (e.to === node.id ? e.from : null)),
    imports: collect((e) => (e.from === node.id ? e.to : null)),
  };
}
