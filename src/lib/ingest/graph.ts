import { INGEST_CONFIG } from '@/lib/constants';
import type { IngestEdge, IngestEdgeType, IngestLanguage, IngestNode, IngestResult } from '@/lib/types';
import { computeMetrics, computeRotScore, languageOf, truncateChars } from './analyze';
import type { LineStats } from './analyze';
import { IngestError } from './errors';
import type { TreeEntry } from './github';
import { detectRelations, resolveImport } from './relations';
import type { Relations } from './relations';

export interface AnalyzedFile {
  entry: TreeEntry;
  language: IngestLanguage;
  content: string;
  fetchTruncated: boolean;
  stats: LineStats;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const EDGE_TYPES: readonly IngestEdgeType[] = ['import', 'require', 'export'];
const LANGUAGES: readonly IngestLanguage[] = ['TypeScript', 'JavaScript', 'Python'];

/** One node per fetched file, ordered by path. `relations` is keyed by node id. */
export function buildNodes(
  files: AnalyzedFile[],
  analyzedAt: string,
): { nodes: IngestNode[]; relations: Map<string, Relations> } {
  const relations = new Map<string, Relations>();
  const nodes = files.map((f): IngestNode => {
    const family = languageOf(f.entry.path)?.family ?? 'js';
    const rel = detectRelations(f.stats.codeText, family);
    relations.set(f.entry.path, rel);
    const metrics = computeMetrics(f.stats);
    const raw = truncateChars(f.content, INGEST_CONFIG.RAW_CONTENT_MAX_CHARS);
    return {
      id: f.entry.path,
      path: f.entry.path,
      name: f.entry.path.split('/').pop() ?? f.entry.path,
      language: f.language,
      rotScore: computeRotScore(metrics),
      linesOfCode: metrics.linesOfCode,
      summaryMetrics: {
        nestingDepth: metrics.nestingDepth,
        commentRatio: metrics.commentRatio,
        fileSize: f.entry.size ?? f.content.length,
      },
      rawContent: raw.text,
      isTruncated: f.fetchTruncated || raw.truncated,
      importCount: rel.imports.filter((i) => i.type !== 'export').length,
      exportCount: rel.exportCount,
      analyzedAt,
    };
  });
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { nodes, relations };
}

/** Resolves imports against node ids only; drops self-loops; merges duplicate pairs. */
export function buildEdges(nodes: IngestNode[], relations: Map<string, Relations>): IngestEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const edges = new Map<string, IngestEdge>();
  for (const node of nodes) {
    const family = languageOf(node.path)?.family ?? 'js';
    for (const imp of relations.get(node.id)?.imports ?? []) {
      const target = resolveImport(imp, node.path, family, ids);
      if (!target || target === node.id) continue;
      const id = `${node.id}→${target}`;
      const existing = edges.get(id);
      if (existing) existing.metadata!.importCount += 1;
      else
        edges.set(id, {
          id,
          source: node.id,
          target,
          type: imp.type,
          label: imp.specifier,
          metadata: { importCount: 1 },
        });
    }
  }
  return [...edges.values()].sort((a, b) => (a.id! < b.id! ? -1 : a.id! > b.id! ? 1 : 0));
}

export function summarize(nodes: IngestNode[]): { fileCount: number; averageRotScore: number } {
  const sum = nodes.reduce((s, n) => s + (n.rotScore || 0), 0);
  return { fileCount: nodes.length, averageRotScore: nodes.length ? round2(sum / nodes.length) : 0 };
}

/** Throws ANALYSIS_FAILED (details.violations, max 20) if any Req 13 invariant is broken. */
export function validateIngestResult(r: IngestResult): void {
  const v: string[] = [];
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const str = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

  const ids = new Set<string>();
  for (const n of r.nodes) {
    const w = `node ${n.id}`;
    if (!str(n.id) || !str(n.path) || !str(n.name)) v.push(`${w}: id/path/name must be non-empty strings`);
    if (ids.has(n.id)) v.push(`${w}: duplicate id`);
    ids.add(n.id);
    if (!LANGUAGES.includes(n.language!)) v.push(`${w}: invalid language`);
    if (!num(n.rotScore) || n.rotScore < 0 || n.rotScore > 100) v.push(`${w}: rotScore out of [0,100]`);
    if (!num(n.linesOfCode) || n.linesOfCode < 0) v.push(`${w}: invalid linesOfCode`);
    const m = n.summaryMetrics;
    if (!m || !num(m.nestingDepth) || !num(m.commentRatio) || !num(m.fileSize)) v.push(`${w}: invalid summaryMetrics`);
    if (typeof n.rawContent !== 'string' || n.rawContent.length > INGEST_CONFIG.RAW_CONTENT_MAX_CHARS)
      v.push(`${w}: rawContent missing or longer than ${INGEST_CONFIG.RAW_CONTENT_MAX_CHARS}`);
    else if (typeof n.rawContent.isWellFormed === 'function' && !n.rawContent.isWellFormed())
      v.push(`${w}: rawContent is not well-formed`);
    if (typeof n.isTruncated !== 'boolean') v.push(`${w}: isTruncated must be boolean`);
    if (!num(n.importCount) || !num(n.exportCount)) v.push(`${w}: invalid import/export count`);
    if (!str(n.analyzedAt) || Number.isNaN(Date.parse(n.analyzedAt))) v.push(`${w}: invalid analyzedAt`);
  }
  for (const e of r.edges) {
    const w = `edge ${e.id}`;
    if (e.id !== `${e.source}→${e.target}`) v.push(`${w}: id must be source→target`);
    if (!ids.has(e.source) || !ids.has(e.target)) v.push(`${w}: endpoint is not a node`);
    if (!EDGE_TYPES.includes(e.type)) v.push(`${w}: invalid type`);
    if (typeof e.label !== 'string') v.push(`${w}: label must be a string`);
    if (!num(e.metadata?.importCount) || e.metadata.importCount < 1) v.push(`${w}: importCount must be >= 1`);
  }
  const md = r.metadata!;
  if (md.fileCount !== r.nodes.length) v.push('metadata.fileCount must equal nodes.length');
  if (!num(md.averageRotScore) || md.averageRotScore < 0 || md.averageRotScore > 100)
    v.push('metadata.averageRotScore out of [0,100]');
  if (!num(md.processingDurationMs) || md.processingDurationMs < 0) v.push('metadata.processingDurationMs invalid');

  if (v.length) {
    throw new IngestError('ANALYSIS_FAILED', 'Result validation failed', { violations: v.slice(0, 20) });
  }
}
