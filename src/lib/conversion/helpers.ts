import type { RepoAnalysis, RepoCoverage } from '@/lib/repoAnalyzer';
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
} from './types';
import { isPresetId } from './specimens';

export type RotScoreTier = 'crimson' | 'amber' | 'emerald' | 'ink';
export type WorkspaceTarget =
  | { kind: 'preset'; id: PresetId }
  | { kind: 'repository'; repository: string }
  | { kind: 'choices' };

export function scrollyStep(progress: number): 1 | 2 | 3 | 4 {
  const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return value < 0.25 ? 1 : value < 0.5 ? 2 : value < 0.75 ? 3 : 4;
}

export function rotScoreTier(score: number): RotScoreTier {
  if (score >= 70) return 'crimson';
  if (score >= 40) return 'amber';
  return 'emerald';
}

export interface RotScoreMeta {
  tier: RotScoreTier;
  label: string;
  badgeClass: string;
  solidBadgeClass: string;
  textClass: string;
  dotClass: string;
  borderClass: string;
}

export function rotScoreMeta(score: number): RotScoreMeta {
  if (score >= 70) {
    return {
      tier: 'crimson',
      label: 'CRITICAL',
      badgeClass: 'bg-crimson/10 text-crimson border-crimson/30',
      solidBadgeClass: 'bg-crimson text-white',
      textClass: 'text-crimson',
      dotClass: 'bg-crimson',
      borderClass: 'border-l-crimson',
    };
  }
  if (score >= 40) {
    return {
      tier: 'amber',
      label: 'WARNING',
      badgeClass: 'bg-amber/10 text-amber border-amber/30',
      solidBadgeClass: 'bg-amber text-white',
      textClass: 'text-amber',
      dotClass: 'bg-amber',
      borderClass: 'border-l-amber',
    };
  }
  return {
    tier: 'emerald',
    label: 'HEALTHY',
    badgeClass: 'bg-emerald/10 text-emerald border-emerald/30',
    solidBadgeClass: 'bg-emerald text-white',
    textClass: 'text-emerald',
    dotClass: 'bg-emerald',
    borderClass: 'border-l-emerald',
  };
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

/** Maps the `POST /api/ingest` response onto the workspace graph model. */
export function convertRepoAnalysis(analysis: RepoAnalysis): IngestedSpecimen {
  const ids = new Set(analysis.nodes.map((node) => node.id));
  return {
    kind: 'ingested',
    title: analysis.title,
    summary: analysis.rotSummary,
    defaultBranch: analysis.defaultBranch,
    repositoryUrl: `https://github.com/${analysis.title}`,
    overallRot: analysis.overallRot,
    nodes: analysis.nodes.map((node): IngestedWorkspaceNode => ({
      kind: 'ingested',
      id: node.id,
      name: node.name,
      path: node.path,
      linesOfCode: node.loc,
      rotScore: node.rot,
      position: { x: node.x, y: node.y },
      lastCommit: node.lastCommit,
      findings: node.findings,
      notes: node.notes,
      summary: node.summary,
      recommendation: node.recommendation,
      codeExcerpt: node.code,
      // Analyses stored before these fields existed showed every file and did not record the source.
      featured: node.featured !== false,
      explainedBy: node.explainedBy === 'static' ? 'static' : 'ai',
    })),
    edges: analysis.edges
      .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
      .map((edge): WorkspaceEdge => ({ id: `${edge.from}->${edge.to}`, source: edge.from, target: edge.to })),
    coverage: isCoverage(analysis.coverage) ? analysis.coverage : null,
    dependencies: Array.isArray(analysis.dependencies) ? analysis.dependencies.filter((name) => typeof name === 'string') : [],
  };
}
/** `sessionStorage` key holding the last analysis, written by the landing page and read by the workspace. */
export const ACTIVE_REPO_STORAGE_KEY = 'necro_active_repo';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Coverage is optional on stored data; a malformed one is dropped instead of failing the analysis. */
function isCoverage(value: unknown): value is RepoCoverage {
  if (value === null || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  const skipped = c.skipped as Record<string, unknown> | null;
  return ['totalFiles', 'analyzed', 'featured', 'fileLimit'].every((key) => isFiniteNumber(c[key]))
    && typeof c.treeTruncated === 'boolean'
    && skipped !== null && typeof skipped === 'object'
    && ['tests', 'config', 'generated', 'tooLarge', 'overLimit', 'unreadable'].every((key) => isFiniteNumber(skipped[key]));
}

/** Runtime check for data that crosses a trust boundary (network response, sessionStorage). */
export function isRepoAnalysis(value: unknown): value is RepoAnalysis {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || typeof v.defaultBranch !== 'string' || typeof v.rotSummary !== 'string' || !isFiniteNumber(v.overallRot)) return false;
  if (!Array.isArray(v.nodes) || !Array.isArray(v.edges)) return false;
  const nodesOk = v.nodes.every((node) => {
    if (node === null || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    return typeof n.id === 'string' && typeof n.name === 'string' && typeof n.path === 'string' && typeof n.code === 'string'
      && typeof n.lastCommit === 'string' && isFiniteNumber(n.loc) && isFiniteNumber(n.rot) && isFiniteNumber(n.x) && isFiniteNumber(n.y)
      && Array.isArray(n.notes) && n.notes.every((note) => typeof note === 'string')
      // Analyses stored before findings were structured fail here and are analyzed again.
      && Array.isArray(n.findings) && n.findings.every((f) => f !== null && typeof f === 'object'
        && typeof (f as Record<string, unknown>).kind === 'string' && typeof (f as Record<string, unknown>).text === 'string'
        && typeof (f as Record<string, unknown>).suggestion === 'string' && Array.isArray((f as Record<string, unknown>).lines)
        && ((f as Record<string, unknown>).line === null || isFiniteNumber((f as Record<string, unknown>).line)));
  });
  const edgesOk = v.edges.every((edge) => edge !== null && typeof edge === 'object'
    && typeof (edge as Record<string, unknown>).from === 'string' && typeof (edge as Record<string, unknown>).to === 'string');
  return nodesOk && edgesOk;
}

/** `owner/repo` (lower-cased) for `owner/repo`, `github.com/owner/repo` and full URLs. */
export function repositorySlug(input: string): string {
  return input.trim().replace(/^https?:\/\//i, '').replace(/^(?:www\.)?github\.com\//i, '').replace(/[?#].*$/, '')
    .split('/').filter(Boolean).slice(0, 2).join('/').replace(/\.git$/i, '').toLowerCase();
}

/** The stored analysis if it belongs to `repo`, otherwise null. Never throws. */
export function readActiveRepo(raw: string | null, repo: string): RepoAnalysis | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    return isRepoAnalysis(data) && data.title.toLowerCase() === repositorySlug(repo) ? data : null;
  } catch {
    return null;
  }
}

export interface IngestErrorHelp {
  title: string;
  message: string;
  /** What the user can do about it. */
  hint?: string;
  /** A private repository may become readable after installing the GitHub App. */
  connectGithub?: boolean;
}

function rateLimitHint(details: Record<string, unknown> | null | undefined, now: number): string {
  const resetAt = typeof details?.resetAt === 'string' ? Date.parse(details.resetAt) : NaN;
  const waitMs = Number.isFinite(resetAt) ? resetAt - now : typeof details?.retryAfter === 'number' ? details.retryAfter * 1000 : NaN;
  const when = waitMs > 0 ? `The limit resets in about ${Math.ceil(waitMs / 60_000)} min. ` : '';
  return `${when}A GITHUB_TOKEN on the server raises the limit from 60 to 5,000 requests per hour.`;
}

/** Turns an /api/ingest error code (or the client-only NETWORK_ERROR) into user-facing copy. */
export function ingestErrorHelp(code?: string, details?: Record<string, unknown> | null, now = Date.now()): IngestErrorHelp {
  switch (code) {
    case 'INVALID_URL_FORMAT': case 'MISSING_REPOSITORY_URL': case 'INVALID_REQUEST':
      return { title: 'Check the repository URL', message: 'Enter a GitHub URL like github.com/owner/repo.', hint: 'The short form owner/repo works too.' };
    case 'NON_GITHUB_REPOSITORY':
      return { title: 'Only GitHub is supported', message: 'Only github.com repositories are supported.', hint: 'GitLab and Bitbucket repositories cannot be analyzed yet.' };
    case 'REPOSITORY_NOT_FOUND':
      return { title: 'Repository not found', message: 'That repository does not exist or is private.', hint: 'If it is private, connect the GitHub App so Necro-Docs can read it.', connectGithub: true };
    case 'NO_CODE_FILES_FOUND':
      return { title: 'No supported source files', message: 'No TypeScript, JavaScript, Python, or Go files were found.', hint: 'Necro-Docs reads .ts, .tsx, .js, .jsx, .mjs, .cjs, .py and .go files. Vue, Svelte and other languages are not analyzed yet.' };
    case 'GITHUB_RATE_LIMIT':
      return { title: 'GitHub rate limit reached', message: "GitHub's rate limit was reached. Try again later, or open a sample specimen.", hint: rateLimitHint(details, now) };
    case 'INVALID_GITHUB_TOKEN':
      return { title: 'GitHub token rejected', message: 'GitHub rejected the server token.', hint: 'Update GITHUB_TOKEN in .env.local, then restart the server.' };
    case 'REQUEST_TIMEOUT':
      return { title: 'Analysis timed out', message: 'The analysis timed out.', hint: 'Large repositories take longer to read. Try again, or open a sample specimen.' };
    case 'GITHUB_API_ERROR': case 'GITHUB_SERVICE_UNAVAILABLE':
      return { title: 'GitHub is unavailable', message: 'GitHub is unavailable.', hint: 'Check githubstatus.com, then try again.' };
    case 'NETWORK_ERROR':
      return { title: 'Server unreachable', message: 'The server could not be reached.', hint: 'Check your connection and that the Necro-Docs server is running.' };
    default:
      return { title: 'Analysis failed', message: 'The repository could not be analyzed. Try again later.' };
  }
}

export function ingestErrorMessage(code?: string): string {
  return ingestErrorHelp(code).message;
}

export function createIngestErrorState(code?: string, repository?: string, details?: Record<string, unknown> | null): IngestErrorState {
  return { status: 'error', code, repository, ...ingestErrorHelp(code, details) };
}

/** The analysis is one request, so these stages are paced by time while it runs. */
export const INGEST_STAGES = ['Resolving default branch', 'Fetching file tree', 'Reading source files', 'Scanning imports and code rot'] as const;
export const INGEST_STAGE_INTERVAL_MS = 1100;
export const SLOW_INGEST_DELAY_MS = 8000;
export function shouldShowSlowIngest(elapsedMs: number): boolean { return elapsedMs >= SLOW_INGEST_DELAY_MS; }

export function quickQuestions(specimen: Specimen): readonly PresetQuickQuestion[] {
  if (specimen.kind === 'preset') return specimen.quickQuestions;
  const ranked = [...specimen.nodes].sort((a, b) => b.rotScore - a.rotScore);
  return ranked.slice(0, 2).map((node) => ({ question: `What breaks if I change ${node.name}?`, answer: diagnosisForNode(node, specimen) }));
}

export function diagnosisForNode(node: IngestedWorkspaceNode, specimen: IngestedSpecimen): string {
  const dependents = specimen.edges.filter((edge) => edge.target === node.id).length;
  const lead = node.findings[0]?.text ?? `${node.linesOfCode} lines of code.`;
  return `${node.name} has a rot score of ${node.rotScore}. ${lead} ${dependents} file${dependents === 1 ? '' : 's'} depend${dependents === 1 ? 's' : ''} on it, so review its callers before changing it.`;
}
export function buildSeanceRequest(question: string, selectedNodeId: string | null, specimen: Specimen): SeanceRequest {
  return {
    question: question.trim().slice(0, 500), selectedNodeId,
    specimenId: specimen.kind === 'preset' ? specimen.id : null,
    repositoryUrl: specimen.kind === 'ingested' ? specimen.repositoryUrl : null,
    repoTitle: specimen.title,
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
