/**
 * Necro-Docs: Constants & Configuration
 * Centralized configuration and constant values
 */

// ============================================================================
// API Configuration
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
  },
  VOICE: {
    RECOGNIZE: '/api/voice/recognize',
    SYNTHESIZE: '/api/voice/synthesize',
  },
} as const;

// ============================================================================
// UI Configuration
// ============================================================================

export const UI_CONFIG = {
  SIDEBAR_WIDTH: 300, // pixels
  GRAPH_CONTAINER_MIN_HEIGHT: 400, // pixels
  NOTIFICATION_DURATION: 5000, // milliseconds
  ANIMATION_DURATION: 200, // milliseconds
  DEBOUNCE_DELAY: 300, // milliseconds
  THROTTLE_DELAY: 300, // milliseconds
} as const;

// ============================================================================
// Color Palette
// ============================================================================

export const COLORS = {
  CANVAS: '#FFFFFF',
  SURFACE: '#F6F7F9',
  INK: '#111113',
  MUTED: '#686A72',
  HAIRLINE: '#E8E9ED',
  SKY_ACCENT: '#0284C7',
  CRIMSON: '#E11D48',
  AMBER: '#D97706',
  EMERALD: '#059669',
  STAGE_SKY: '#E0F2FE',
  STAGE_PINK: '#FCE7F3',
  STAGE_VIOLET: '#EDE9FE',
  CLOSING_SKY: '#F0F9FF',
  GRID_DOT: '#D4D4D8',
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
// Ingest Configuration
// ============================================================================

export const INGEST_CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_FILES: 1000,
  TIMEOUT: 60000, // milliseconds
  CHUNK_SIZE: 50,
  RAW_CONTENT_MAX_CHARS: 100000,
  FETCH_CONCURRENCY: 5,
  EXCLUDED_NAME_PATTERNS: [
    '.*', // Hidden files
    'node_modules',
    '.git',
    'dist',
    'build',
  ] as const,
  EXCLUDED_DIRS: [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
  ] as const,
  SUPPORTED_EXTENSIONS: [
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'java', 'go', 'rs', 'cs', 'cpp', 'c',
    'json', 'yaml', 'yml', 'toml', 'xml',
    'md', 'txt', 'sql',
  ] as const,
  SMALL_FILE_LINES: 50,
  SMALL_FILE_SCORE: 1,
  ROT: {
    BASE: 30,
    LOC_DIVISOR: 500,
    LOC_CAP: 20,
    NEST_DIVISOR: 5,
    NEST_CAP: 15,
    COMMENT_DIVISOR: 50,
    COMMENT_CAP: 15,
  },
  GITHUB_API_VERSION: '2022-11-28',
  USER_AGENT: 'Necro-Docs/1.0',
  GITHUB_API_BASE: 'https://api.github.com',
  FULL_FETCH_MAX_BYTES: 1024 * 1024,
  TRUNCATED_FETCH_BYTES: 512 * 1024,
  MAX_BODY_CHARS: 100000,
  TIMEOUT_MS: 60000,
} as const;

export const INGEST_ERROR_STATUS = {
  FETCH_ERROR: 'fetch_error',
  PARSE_ERROR: 'parse_error',
  VALIDATION_ERROR: 'validation_error',
  SIZE_EXCEEDED: 'size_exceeded',
  RATE_LIMITED: 'rate_limited',
  NOT_FOUND: 'not_found',
  NO_CODE_FILES_FOUND: 'no_code_files_found',
  INVALID_REQUEST: 'invalid_request',
  INVALID_DEMO_ID: 'invalid_demo_id',
  MISSING_REPOSITORY_URL: 'missing_repository_url',
  INVALID_URL_FORMAT: 'invalid_url_format',
  ANALYSIS_FAILED: 'analysis_failed',
} as const;

export type IngestErrorCode = 
  | 'fetch_error'
  | 'parse_error'
  | 'validation_error'
  | 'size_exceeded'
  | 'rate_limited'
  | 'not_found'
  | 'no_code_files_found'
  | 'invalid_request'
  | 'invalid_demo_id'
  | 'missing_repository_url'
  | 'invalid_url_format'
  | 'analysis_failed'
  | 'MISSING_REPOSITORY_URL'
  | 'INVALID_URL_FORMAT'
  | 'NO_CODE_FILES_FOUND'
  | 'INVALID_REQUEST'
  | 'ANALYSIS_FAILED'
  | 'INVALID_DEMO_ID'
  | 'GITHUB_API_ERROR'
  | 'REQUEST_TIMEOUT'
  | 'NON_GITHUB_REPOSITORY'
  | 'INVALID_GITHUB_TOKEN'
  | 'GITHUB_RATE_LIMIT'
  | 'REPOSITORY_NOT_FOUND'
  | 'GITHUB_REQUEST_ERROR'
  | 'GITHUB_SERVICE_UNAVAILABLE';

export const DEMO_REPOSITORIES = {
  react: 'https://github.com/facebook/react',
  next: 'https://github.com/vercel/next.js',
  zustand: 'https://github.com/pmndrs/zustand',
} as const;
