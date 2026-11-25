/**
 * Server-local types and bounded constants for the MCP server (mcp/server.ts).
 * Types and constants only. Analysis types come from the app, not redefined here.
 */
import type { RepoAnalysis, RepoCoverage } from '@/lib/repoAnalyzer';

export type { RepoAnalysis, RepoCoverage, RepoEdge, RepoNode } from '@/lib/repoAnalyzer';
export type { FindingKind, RepoFinding } from '@/lib/types';

// ============================================================================
// Tools and limits
// ============================================================================

export const TOOL_NAMES = ['analyze_repo', 'get_findings', 'scan_code', 'synthesize_patch'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const DEFAULT_API_URL = 'http://localhost:3000';

/** Input bounds enforced by the Zod schemas (Requirement 4.7). */
export const INPUT_LIMITS = {
  repoUrl: 500,
  path: 500,
  code: 100_000,
  dependencyName: 200,
  dependencies: 200,
  importerPath: 500,
  importedBy: 20,
} as const;

/** analyze_repo returns at most this many files (Requirement 5.2). */
export const MAX_COMPACT_FILES = 10;

/** Max importer/import paths returned or forwarded (matches /api/patch, which reads at most 20). */
export const MAX_CONTEXT_PATHS = 20;

// ============================================================================
// Cache
// ============================================================================

/** Latest successful full analysis per exact repoUrl string. Process-local only. */
export type AnalysisCache = Map<string, RepoAnalysis>;

// ============================================================================
// Compact tool results
// ============================================================================

export interface CompactFile {
  path: string;
  score: number;
  findingCount: number;
  /** Findings a patch can resolve (isPatchable). */
  patchableCount: number;
}

export interface CompactAnalysis {
  title: string;
  defaultBranch: string;
  overallRot: number;
  rotSummary: string;
  coverage: RepoCoverage;
  files: CompactFile[];
}

/** `static` is authoritative scanner output; `ai-unverified` is a model observation. */
export interface CompactFinding {
  line: number | null;
  kind: string;
  text: string;
  suggestion: string;
  source: 'static' | 'ai-unverified';
  /** True when isPatchable() says a local edit can resolve it. */
  patchable: boolean;
}

export interface FindingsResult {
  repoUrl: string;
  path: string;
  findings: CompactFinding[];
  /** Paths of files that import this file (max 20). */
  importedBy: string[];
  /** Paths of files this file imports (max 20). */
  imports: string[];
}

export interface ScanResult {
  path: string;
  findings: Array<CompactFinding & { source: 'static' }>;
}

// ============================================================================
// Patch
// ============================================================================

/** Direct body returned by POST /api/patch. */
export interface PatchEndpointResponse {
  summary: string;
  patchedCode: string;
  provider: 'ai' | 'static-fallback';
  fixed: string[];
  remaining: string[];
}

export type VerificationStatus = 'verified-change' | 'changed-with-remaining-findings' | 'no-change';

export interface PatchResult {
  summary: string;
  provider: PatchEndpointResponse['provider'];
  patchedCode?: string;
  edits: {
    changed: boolean;
    originalLength: number;
    patchedLength: number;
  };
  verification: {
    status: VerificationStatus;
    changed: boolean;
    fixedCount: number;
    remainingCount: number;
    patchableFindingsRemain: boolean;
    aiOutputUnverified: boolean;
  };
  fixed: string[];
  remaining: string[];
}
