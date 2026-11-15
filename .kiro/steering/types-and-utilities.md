# Necro-Docs: Shared Types & Utilities Guide

Panduan untuk shared types, constants, dan utility functions yang digunakan di seluruh Necro-Docs.

## Shared Types Structure

Semua shared types harus di-export dari `src/lib/types.ts` untuk centralized type definitions.

### Core Types

```typescript
// src/lib/types.ts

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

export interface BreakpointEvent {
  id: string;
  breakpointId: string;
  timestamp: number;
  executionTrace: ExecutionTrace;
  variables: VariableInspection;
}

export interface VariableInspection {
  scope: 'local' | 'closure' | 'global';
  variables: Variable[];
}

export interface Variable {
  name: string;
  value: any;
  type: string;
  mutable: boolean;
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

export interface VoiceRecognitionResult {
  text: string;
  alternatives?: string[];
  confidence: number;
  language: string;
}

export interface VoiceSynthesisRequest {
  text: string;
  rate?: number; // 0.5-2
  pitch?: number; // 0-2
  volume?: number; // 0-1
}

export interface VoiceSynthesisResult {
  audioUrl: string;
  duration: number; // milliseconds
}

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

export interface Modal {
  id: string;
  type: ModalType;
  title: string;
  content: string;
  actions?: ModalAction[];
}

export type ModalType = 'info' | 'warning' | 'error' | 'success' | 'custom';

export interface ModalAction {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
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
// Feature Flag Types
// ============================================================================

export interface FeatureFlags {
  voiceDebugger: boolean;
  codebaseAnalysis: boolean;
  nodeGraphVisualization: boolean;
  darkMode: boolean;
  analytics: boolean;
}

// ============================================================================
// User Session Types
// ============================================================================

export interface UserSession {
  id: string;
  createdAt: number;
  lastActivity: number;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'dark' | 'light';
  language: string;
  defaultLayout: LayoutType;
  autoSave: boolean;
}

export type LayoutType = 'explorer-left' | 'explorer-right' | 'explorer-bottom' | 'full-screen';
```

## Constants & Configuration

```typescript
// src/lib/constants.ts

// ============================================================================
// API Constants
// ============================================================================

export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
  TIMEOUT: 30000, // milliseconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // milliseconds
} as const;

export const API_ENDPOINTS = {
  CODEBASE: {
    ANALYZE: '/api/codebase/analyze',
    FILES: '/api/codebase/files',
    STRUCTURE: '/api/codebase/structure',
  },
  DEBUGGER: {
    BREAKPOINTS: '/api/debugger/breakpoints',
    EXECUTE: '/api/debugger/execute',
    LOGS: '/api/debugger/logs',
    TRACES: '/api/debugger/traces',
  },
  VOICE: {
    RECOGNIZE: '/api/voice/recognize',
    SYNTHESIZE: '/api/voice/synthesize',
  },
} as const;

// ============================================================================
// UI Constants
// ============================================================================

export const UI_CONFIG = {
  SIDEBAR_WIDTH: 300, // pixels
  GRAPH_CONTAINER_MIN_HEIGHT: 400, // pixels
  NOTIFICATION_DURATION: 5000, // milliseconds
  ANIMATION_DURATION: 200, // milliseconds
  DEBOUNCE_DELAY: 300, // milliseconds
  THROTTLE_DELAY: 300, // milliseconds
} as const;

export const COLORS = {
  PRIMARY: {
    900: '#0a0e27',
    800: '#0f1a3d',
    700: '#1a2a5e',
    600: '#2d3f7f',
    500: '#3d51a0',
  },
  NEON: {
    CYAN: '#00d9ff',
    GREEN: '#00ff88',
    PURPLE: '#c700ff',
    RED: '#ff0040',
    BLUE: '#0080ff',
  },
  NEUTRAL: {
    BONE: '#e8e8e8',
    GHOST: '#a0a0a0',
    SLATE: '#4a5568',
    BLACK: '#000000',
  },
} as const;

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  USER_PREFERENCES: 'necro:preferences',
  RECENT_PROJECTS: 'necro:recent-projects',
  DEBUG_HISTORY: 'necro:debug-history',
  BREAKPOINTS: 'necro:breakpoints',
  CACHE_DATA: 'necro:cache',
} as const;

// ============================================================================
// Feature Flags
// ============================================================================

export const FEATURE_FLAGS = {
  VOICE_DEBUGGER: process.env.NEXT_PUBLIC_ENABLE_VOICE_DEBUG === 'true',
  ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
  EXPERIMENTAL_FEATURES: process.env.NODE_ENV === 'development',
} as const;

// ============================================================================
// Error Codes
// ============================================================================

export const ERROR_CODES = {
  // Authentication
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  
  // Validation
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_PAGINATION: 'INVALID_PAGINATION',
  
  // Analysis
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  ANALYSIS_TIMEOUT: 'ANALYSIS_TIMEOUT',
  INVALID_PATH: 'INVALID_PATH',
  
  // Debugger
  BREAKPOINT_ERROR: 'BREAKPOINT_ERROR',
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  
  // Voice
  VOICE_RECOGNITION_FAILED: 'VOICE_RECOGNITION_FAILED',
  AUDIO_NOT_SUPPORTED: 'AUDIO_NOT_SUPPORTED',
  
  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

// ============================================================================
// Supported Languages
// ============================================================================

export const SUPPORTED_LANGUAGES = {
  TYPESCRIPT: 'typescript',
  JAVASCRIPT: 'javascript',
  PYTHON: 'python',
  JAVA: 'java',
  CSHARP: 'csharp',
  RUST: 'rust',
  GO: 'go',
  CPP: 'cpp',
} as const;

// ============================================================================
// Code Patterns
// ============================================================================

export const COMMON_PATTERNS = {
  COMPONENT_BASED: 'component-based',
  HOOKS: 'hooks',
  STORE_PATTERN: 'store-pattern',
  SERVICE_LAYER: 'service-layer',
  FACTORY_PATTERN: 'factory-pattern',
  SINGLETON: 'singleton',
  OBSERVER_PATTERN: 'observer-pattern',
  MIDDLEWARE_CHAIN: 'middleware-chain',
} as const;

// ============================================================================
// Architecture Types
// ============================================================================

export const ARCHITECTURE_TYPES = {
  MONOLITHIC: 'monolithic',
  MODULAR: 'modular',
  MICROSERVICES: 'microservices',
  LAYERED: 'layered',
} as const;
```

## Utility Functions

```typescript
// src/lib/utils.ts

import { FileNode, Variable } from './types';

// ============================================================================
// Type Guards
// ============================================================================

export function isError(value: any): value is Error {
  return value instanceof Error;
}

export function isFileNode(value: any): value is FileNode {
  return (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    'name' in value &&
    'path' in value &&
    'type' in value
  );
}

// ============================================================================
// String Utilities
// ============================================================================

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
}

export function truncate(str: string, length: number): string {
  return str.length > length ? str.slice(0, length) + '...' : str;
}

export function formatPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

// ============================================================================
// Array Utilities
// ============================================================================

export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (result, item) => {
      const groupKey = String(item[key]);
      if (!result[groupKey]) {
        result[groupKey] = [];
      }
      result[groupKey].push(item);
      return result;
    },
    {} as Record<string, T[]>
  );
}

export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

export function flatten<T>(array: T[][]): T[] {
  return array.reduce((acc, val) => acc.concat(val), []);
}

// ============================================================================
// Object Utilities
// ============================================================================

export function omit<T extends Record<string, any>>(
  obj: T,
  keys: (keyof T)[]
): Partial<T> {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
}

export function pick<T extends Record<string, any>>(
  obj: T,
  keys: (keyof T)[]
): Partial<T> {
  return keys.reduce(
    (result, key) => {
      result[key] = obj[key];
      return result;
    },
    {} as Partial<T>
  );
}

export function deepMerge<T extends Record<string, any>>(
  ...objects: T[]
): T {
  return objects.reduce((result, obj) => {
    Object.keys(obj).forEach((key) => {
      if (
        obj[key] &&
        typeof obj[key] === 'object' &&
        !Array.isArray(obj[key])
      ) {
        result[key] = deepMerge(result[key] || {}, obj[key]);
      } else {
        result[key] = obj[key];
      }
    });
    return result;
  }, {} as T);
}

// ============================================================================
// Time Utilities
// ============================================================================

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function getTimeSince(timestamp: number): string {
  const elapsed = Date.now() - timestamp;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

// ============================================================================
// Debounce & Throttle
// ============================================================================

export function debounce<Args extends any[]>(
  fn: (...args: Args) => void,
  delay: number
) {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Args) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      fn(...args);
      timeout = null;
    }, delay);
  };
}

export function throttle<Args extends any[]>(
  fn: (...args: Args) => void,
  delay: number
) {
  let timeout: NodeJS.Timeout | null = null;
  let lastRun = 0;

  return (...args: Args) => {
    const now = Date.now();
    const timeSinceLastRun = now - lastRun;

    if (timeSinceLastRun >= delay) {
      fn(...args);
      lastRun = now;
    } else {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        fn(...args);
        lastRun = Date.now();
      }, delay - timeSinceLastRun);
    }
  };
}

// ============================================================================
// File & Path Utilities
// ============================================================================

export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || '';
}

export function getDirectoryPath(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join('/');
}

export function joinPaths(...paths: string[]): string {
  return paths.map((p) => p.replace(/\\/g, '/')).join('/');
}

export function isSourceFile(fileName: string): boolean {
  const ext = getFileExtension(fileName).toLowerCase();
  return ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs'].includes(ext);
}

// ============================================================================
// Validation Utilities
// ============================================================================

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isEmpty(value: any): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' && Object.keys(value).length === 0)
  );
}

// ============================================================================
// JSON & Serialization Utilities
// ============================================================================

export function safeJsonParse<T = any>(
  json: string,
  fallback?: T
): T | undefined {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value: any): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ============================================================================
// Display Utilities
// ============================================================================

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

// ============================================================================
// Class Utilities
// ============================================================================

export function classNames(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
```

## Usage Examples

### Using Types in Components

```typescript
// src/components/file-tree/FileTree.tsx
'use client';

import { FileNode } from '@/lib/types';
import { isSourceFile, getFileExtension } from '@/lib/utils';

interface FileTreeProps {
  files: FileNode[];
  onSelect: (file: FileNode) => void;
}

export function FileTree({ files, onSelect }: FileTreeProps) {
  return (
    <ul>
      {files.map((file) => (
        <li
          key={file.id}
          onClick={() => onSelect(file)}
          data-testid={`file-tree-item-${file.id}`}
        >
          {file.type === 'file' && isSourceFile(file.name) && (
            <span className="text-xs text-neon-cyan">
              {getFileExtension(file.name).toUpperCase()}
            </span>
          )}
          {file.name}
        </li>
      ))}
    </ul>
  );
}
```

### Using Constants in Stores

```typescript
// src/stores/ui.store.ts
import { UI_CONFIG, STORAGE_KEYS } from '@/lib/constants';

export const useUIStore = create<UIState>((set) => ({
  // Use constants
  sidebarWidth: UI_CONFIG.SIDEBAR_WIDTH,
  notificationDuration: UI_CONFIG.NOTIFICATION_DURATION,

  // Operations
  savePreferences: (prefs) => {
    localStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(prefs));
  },
}));
```

### Using Utilities in API Routes

```typescript
// src/app/api/codebase/analyze/route.ts
import { formatDuration, isEmpty } from '@/lib/utils';
import { ERROR_CODES } from '@/lib/constants';

export async function POST(request: NextRequest) {
  const startTime = performance.now();

  try {
    const body = await request.json();
    const { rootPath } = body;

    if (isEmpty(rootPath)) {
      return NextResponse.json({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_REQUEST,
          message: 'rootPath is required',
        },
      }, { status: 400 });
    }

    const result = await analyzeCodebase(rootPath);
    const duration = performance.now() - startTime;

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        timestamp: Date.now(),
        duration: Math.round(duration),
      },
    });
  } catch (error) {
    // Error handling
    return NextResponse.json({
      success: false,
      error: {
        code: ERROR_CODES.ANALYSIS_FAILED,
        message: String(error),
      },
    }, { status: 500 });
  }
}
```

---

**Best Practices**:
- Keep all shared types in `src/lib/types.ts`
- Keep all constants in `src/lib/constants.ts`
- Keep all utilities in `src/lib/utils.ts`
- Export types and constants using `export type` and `export const`
- Document complex types with JSDoc comments
- Use type guards for runtime type checking
- Keep utility functions pure and side-effect free
- Add tests for utility functions

---

**Last Updated**: November 2026
**Status**: Production Ready
