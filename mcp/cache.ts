/** Process-local analysis cache keyed by normalized lowercase owner/repo values. */
import { parseGitHubUrl } from '../src/lib/repoAnalyzer';
import type { AnalysisCache, RepoAnalysis, RepoNode } from './types';

export const NO_CACHED_URL_MESSAGE = 'No cached analysis for this repoUrl; call analyze_repo first';
export const NO_CACHED_PATH_MESSAGE =
  'File is not present in the latest cached analysis; use a path returned by analyze_repo';

export function createCache(): AnalysisCache {
  return new Map();
}

export const analysisCache: AnalysisCache = createCache();

export function normalizeRepoKey(repoUrl: string): string {
  const { owner, repo } = parseGitHubUrl(repoUrl);
  return `${owner}/${repo}`.toLowerCase();
}

/** Call only after the analysis has been validated; a failed refresh simply never reaches this. */
export function cacheAnalysis(url: string, analysis: RepoAnalysis, cache: AnalysisCache = analysisCache): void {
  cache.set(normalizeRepoKey(url), analysis);
}

/** Throws an actionable Error when the normalized repository or exact path is absent. Never touches the network. */
export function findCached(url: string, path: string, cache: AnalysisCache = analysisCache): { analysis: RepoAnalysis; node: RepoNode } {
  const analysis = cache.get(normalizeRepoKey(url));
  if (!analysis) throw new Error(NO_CACHED_URL_MESSAGE);
  const node = analysis.nodes.find((n) => n.path === path);
  if (!node) throw new Error(NO_CACHED_PATH_MESSAGE);
  return { analysis, node };
}

export const findCachedNode = (url: string, path: string, cache: AnalysisCache = analysisCache): RepoNode =>
  findCached(url, path, cache).node;
