/**
 * Necro-Docs: Shared TypeScript Types
 * Central location for all type definitions used across the application
 */

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
  details?: Record<string, any>;
}

export interface ResponseMeta {
  timestamp: number;
  duration: number; // milliseconds
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// Codebase Types
// ============================================================================

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  language?: string;
  children?: FileNode[];
  metadata?: FileMetadata;
}

export interface FileMetadata {
  imports?: string[];
  exports?: string[];
  functions?: FunctionDefinition[];
  classes?: ClassDefinition[];
  variables?: VariableDefinition[];
  dependencies?: string[];
  lastModified?: number;
}

export interface FunctionDefinition {
  name: string;
  line: number;
  description?: string;
  parameters?: ParameterDefinition[];
  returnType?: string;
  isAsync: boolean;
}

export interface ClassDefinition {
  name: string;
  line: number;
  methods?: FunctionDefinition[];
  properties?: PropertyDefinition[];
  extends?: string;
  implements?: string[];
}

export interface PropertyDefinition {
  name: string;
  type?: string;
  visibility?: 'public' | 'private' | 'protected';
}

export interface VariableDefinition {
  name: string;
  type?: string;
  line: number;
}

export interface ParameterDefinition {
  name: string;
  type?: string;
  optional?: boolean;
  default?: any;
}

export interface AnalysisResult {
  totalFiles: number;
  totalLines: number;
  languages: Record<string, number>;
  dependencies: string[];
  architecture: ArchitectureType;
  complexity: ComplexityLevel;
  patterns: CodePattern[];
}

export type ArchitectureType = 'monolithic' | 'modular' | 'microservices' | 'layered';
export type ComplexityLevel = 'low' | 'medium' | 'high' | 'critical';
export type CodePattern = 
  | 'component-based'
  | 'hooks'
  | 'store-pattern'
  | 'service-layer'
  | 'factory-pattern'
  | 'singleton'
  | 'observer-pattern'
  | 'middleware-chain';

// ============================================================================
// Debugger Types
// ============================================================================

export interface DebugPoint {
  id: string;
  fileId: string;
  line: number;
  condition?: string;
  enabled: boolean;
  hitCount: number;
  createdAt: number;
}

export interface DebugLog {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  stackTrace?: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ExecutionTrace {
  id: string;
  functionName: string;
  fileId: string;
  line: number;
  duration: number;
  callStack: StackFrame[];
  variables: Record<string, any>;
  returnValue?: any;
  error?: {
    message: string;
    stack?: string;
  };
}

export interface StackFrame {
  functionName: string;
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

// ============================================================================
// Voice Types
// ============================================================================

export interface VoiceCommand {
  id: string;
  rawText: string;
  parsed: ParsedCommand;
  timestamp: number;
  confidence: number; // 0-1
}

export interface ParsedCommand {
  action: VoiceAction;
  target?: string;
  parameters?: Record<string, any>;
}

export type VoiceAction =
  | 'analyze'
  | 'debug'
  | 'breakpoint'
  | 'step'
  | 'continue'
  | 'inspect'
  | 'search'
  | 'help'
  | 'clear';

// ============================================================================
// UI Types
// ============================================================================

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
  action?: NotificationAction;
}

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

// ============================================================================
// Graph Types (React Flow)
// ============================================================================

export interface GraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  data: Record<string, any>;
  position?: { x: number; y: number };
  selected?: boolean;
  highlighted?: boolean;
  metadata?: Record<string, any>;
}

export type GraphNodeType = 'file' | 'component' | 'function' | 'dependency' | 'module';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: EdgeType;
  animated?: boolean;
  label?: string;
}

export type EdgeType = 'import' | 'export' | 'dependency' | 'calls' | 'inherits';

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
