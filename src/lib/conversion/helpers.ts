import type { IngestResult } from '@/lib/types';
import type {
  IngestedSpecimen,
  IngestedWorkspaceNode,
  IngestErrorState,
  PresetId,
  PresetQuickQuestion,
  SeanceRequest,
  SeanceResponseData,
  Specimen,
  SpotlightState,
  WorkspaceEdge,
  WorkspacePosition,
} from './types';
import { isPresetId } from './specimens';

export type RotScoreTier = 'crimson' | 'ink';
export type WorkspaceTarget =
  | { kind: 'preset'; id: PresetId }
  | { kind: 'repository'; repository: string }
  | { kind: 'choices' };

export function scrollyStep(progress: number): 1 | 2 | 3 | 4 {
  const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return value < 0.25 ? 1 : value < 0.5 ? 2 : value < 0.75 ? 3 : 4;
}

export function rotScoreTier(score: number): RotScoreTier {
  return score >= 75 ? 'crimson' : 'ink';
}

export function resolveWorkspaceTarget(input: { repo?: string | null; specimen?: string | null }): WorkspaceTarget {
  const repository = input.repo?.trim();
  if (repository) return { kind: 'repository', repository };
  if (isPresetId(input.specimen)) return { kind: 'preset', id: input.specimen };
  return { kind: 'choices' };
}

export function workspaceTargetHref(target: WorkspaceTarget): string {
  if (target.kind === 'repository') return `/workspace?repo=${encodeURIComponent(target.repository)}`;
  if (target.kind === 'preset') return `/workspace?specimen=${target.id}`;
  return '/workspace?specimen=payment';
}

export function deriveRepositoryTitle(url: string): string {
  const value = url.replace(/\/$/, '').split('/');
  return value.length >= 2 ? `${value[value.length - 2]}/${value[value.length - 1].replace(/\.git$/, '')}` : url;
}

export function deriveIngestSummary(averageRotScore: number): string {
  return `${Math.round(averageRotScore)}% infected`;
}

function layoutNodes(result: IngestResult): Map<string, WorkspacePosition> {
  const ids = new Set(result.nodes.map((node) => node.id));
  const validEdges = result.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const incoming = new Map(result.nodes.map((node) => [node.id, 0]));
  validEdges.forEach((edge) => incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1));
  const depth = new Map<string, number>();
  const queue = result.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  queue.forEach((id) => depth.set(id, 0));
  for (let i = 0; i < queue.length; i += 1) {
    const source = queue[i];
    validEdges.filter((edge) => edge.source === source).forEach((edge) => {
      const next = Math.max(depth.get(edge.target) ?? 0, (depth.get(source) ?? 0) + 1);
      depth.set(edge.target, next);
      if (!queue.includes(edge.target)) queue.push(edge.target);
    });
  }
  result.nodes.forEach((node) => { if (!depth.has(node.id)) depth.set(node.id, 0); });
  const rows = new Map<number, number>();
  return new Map(result.nodes.map((node) => {
    const column = depth.get(node.id) ?? 0;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    return [node.id, { x: 80 + column * 280, y: 80 + row * 150 }];
  }));
}

export function convertIngestResult(result: IngestResult): IngestedSpecimen {
  const positions = layoutNodes(result);
  const ids = new Set(result.nodes.map((node) => node.id));
  const nodes: IngestedWorkspaceNode[] = result.nodes.map((node) => ({
    kind: 'ingested', 
    id: node.id, 
    name: node.name || node.path, 
    path: node.path,
    linesOfCode: node.linesOfCode || 0, 
    rotScore: node.rotScore || 0,
    position: positions.get(node.id) ?? { x: 80, y: 80 }, 
    language: node.language || 'TypeScript',
    nestingDepth: node.summaryMetrics!.nestingDepth, 
    commentRatio: node.summaryMetrics!.commentRatio,
    importCount: node.importCount || 0, 
    exportCount: node.exportCount || 0, 
    fileSize: node.summaryMetrics!.fileSize,
    rawContent: node.rawContent || '', 
    isTruncated: node.isTruncated || false,
  }));
  const edges: WorkspaceEdge[] = result.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({
    id: edge.id!, source: edge.source, target: edge.target, type: edge.type, label: edge.label,
  }));
  return {
    kind: 'ingested', title: deriveRepositoryTitle(result.metadata!.repositoryUrl),
    summary: deriveIngestSummary(result.metadata!.averageRotScore), nodes, edges, metadata: result.metadata!,
  };
}

export function ingestErrorMessage(code?: string): string {
  switch (code) {
    case 'INVALID_URL_FORMAT': case 'MISSING_REPOSITORY_URL': return 'Enter a GitHub URL like github.com/owner/repo.';
    case 'NON_GITHUB_REPOSITORY': return 'Only github.com repositories are supported.';
    case 'REPOSITORY_NOT_FOUND': return 'That repository does not exist or is private.';
    case 'NO_CODE_FILES_FOUND': return 'No TypeScript, JavaScript, or Python files were found.';
    case 'GITHUB_RATE_LIMIT': return "GitHub's rate limit was reached. Try again later.";
    case 'REQUEST_TIMEOUT': return 'The analysis timed out.';
    case 'GITHUB_API_ERROR': case 'GITHUB_SERVICE_UNAVAILABLE': return 'GitHub is unavailable.';
    default: return 'The repository could not be analyzed. Try again later.';
  }
}

export function createIngestErrorState(code?: string, repository?: string): IngestErrorState {
  return { status: 'error', code, repository, message: ingestErrorMessage(code) };
}

export const SLOW_INGEST_DELAY_MS = 8000;
export function shouldShowSlowIngest(elapsedMs: number): boolean { return elapsedMs >= SLOW_INGEST_DELAY_MS; }

export function quickQuestions(specimen: Specimen): readonly PresetQuickQuestion[] {
  if (specimen.kind === 'preset') return specimen.quickQuestions;
  const ranked = [...specimen.nodes].sort((a, b) => b.rotScore - a.rotScore);
  return ranked.slice(0, 2).map((node) => ({ question: `What breaks if I change ${node.name}?`, answer: diagnosisForNode(node, specimen) }));
}

export function diagnosisForNode(node: IngestedWorkspaceNode, specimen: IngestedSpecimen): string {
  const incoming = specimen.edges.filter((edge) => edge.target === node.id).length;
  return `${node.name} has a rot score of ${node.rotScore}, ${node.linesOfCode} lines, ${node.nestingDepth} levels of nesting, and ${incoming} incoming dependenc${incoming === 1 ? 'y' : 'ies'}. Review its callers before changing it.`;
}

export function buildSeanceRequest(question: string, selectedNodeId: string | null, specimen: Specimen): SeanceRequest {
  return {
    question: question.trim().slice(0, 500), selectedNodeId,
    specimenId: specimen.kind === 'preset' ? specimen.id : null,
    repositoryUrl: specimen.kind === 'ingested' ? specimen.metadata!.repositoryUrl : null,
    nodes: specimen.nodes.map(({ id, path, rotScore }) => ({ id, path, rotScore })),
    edges: specimen.edges.map(({ source, target }) => ({ source, target })),
  };
}

export function filterSpotlight(data: SeanceResponseData, specimen: Specimen): SpotlightState {
  const ids = new Set(specimen.nodes.map((node) => node.id));
  return {
    nodeIds: data.spotlightNodeIds.filter((id) => ids.has(id)),
    selectedNodeId: data.selectNodeId && ids.has(data.selectNodeId) ? data.selectNodeId : null,
  };
}
