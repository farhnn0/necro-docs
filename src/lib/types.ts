// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMeta {
  timestamp: number;
  duration: number; // milliseconds
}

// ============================================================================
// Ingest Types
// ============================================================================

export type IngestLanguage = 'TypeScript' | 'JavaScript' | 'Python';
export type IngestEdgeType = 'import' | 'require' | 'export';

export interface IngestRequestBody {
  repositoryUrl?: string;
  useDemo?: boolean;
  demoId?: string | null;
}

export interface IngestNode {
  id: string; // repository path
  path: string;
  name: string; // basename
  language: IngestLanguage;
  rotScore: number; // integer 0..100
  linesOfCode: number; // >= 0
  summaryMetrics: {
    nestingDepth: number;
    commentRatio: number; // 0..100, 2 dp
    fileSize: number; // bytes, from tree
  };
  rawContent: string; // first 4000 chars
  isTruncated: boolean;
  importCount: number;
  exportCount: number;
  analyzedAt: string; // ISO 8601
}

export interface IngestEdge {
  id: string; // `${source}→${target}`
  source: string;
  target: string;
  type: IngestEdgeType;
  label: string; // specifier as written in the first occurrence
  metadata: { importCount: number }; // >= 1
}

export interface SelectionCriteria {
  extensions: string[];
  excludePatterns: string[];
  sortBy: 'size-asc';
  limit: number;
  eligibleCount: number;
  selectedCount: number;
}

export interface IngestMetadata {
  repositoryUrl: string; // canonical https://github.com/{owner}/{repo}
  defaultBranch: string;
  analyzedAt: string; // ISO 8601
  fileCount: number; // === nodes.length
  averageRotScore: number; // mean of node rotScore, 2 dp
  processingDurationMs: number;
  treeTruncated: boolean;
  skippedFiles: string[]; // selected files that returned 404
  selection: SelectionCriteria;
  rateLimit: { remaining: number; resetAt: string | null } | null;
}

export interface IngestResult {
  nodes: IngestNode[];
  edges: IngestEdge[];
  metadata: IngestMetadata;
}
