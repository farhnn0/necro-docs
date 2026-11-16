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
  INVALID_PAGINATION: 'INVALID_PAGINATION',

  // Analysis
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

  // Ingest (each key maps to a status in INGEST_ERROR_STATUS)
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_REPOSITORY_URL: 'MISSING_REPOSITORY_URL',
  INVALID_URL_FORMAT: 'INVALID_URL_FORMAT',
  NON_GITHUB_REPOSITORY: 'NON_GITHUB_REPOSITORY',
  INVALID_DEMO_ID: 'INVALID_DEMO_ID',
  GITHUB_REQUEST_ERROR: 'GITHUB_REQUEST_ERROR',
  INVALID_GITHUB_TOKEN: 'INVALID_GITHUB_TOKEN',
  REPOSITORY_NOT_FOUND: 'REPOSITORY_NOT_FOUND',
  NO_CODE_FILES_FOUND: 'NO_CODE_FILES_FOUND',
  GITHUB_RATE_LIMIT: 'GITHUB_RATE_LIMIT',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  GITHUB_SERVICE_UNAVAILABLE: 'GITHUB_SERVICE_UNAVAILABLE',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
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
  GITHUB_API_BASE: 'https://api.github.com',
  GITHUB_API_VERSION: '2022-11-28',
  USER_AGENT: 'necro-docs-ingest',
  TIMEOUT_MS: 60_000,
  MAX_BODY_CHARS: 10_000,
  FETCH_CONCURRENCY: 5,
  MAX_FILES: 25,
  SUPPORTED_EXTENSIONS: ['.ts', '.tsx', '.js', '.jsx', '.py'],
  EXCLUDED_DIRS: ['node_modules', 'dist', 'build', '__tests__', 'tests', 'test'],
  EXCLUDED_NAME_PATTERNS: ['*.config.*', '*.test.*', '*.spec.*', 'test_*.py', '*_test.py'],
  FULL_FETCH_MAX_BYTES: 1_048_576,
  TRUNCATED_FETCH_BYTES: 51_200,
  RAW_CONTENT_MAX_CHARS: 4000,
  SMALL_FILE_LINES: 5,
  SMALL_FILE_SCORE: 10,
  ROT: {
    BASE: 50,
    LOC_DIVISOR: 100,
    LOC_CAP: 25,
    NEST_DIVISOR: 5,
    NEST_CAP: 15,
    COMMENT_DIVISOR: 5,
    COMMENT_CAP: 10,
  },
} as const;

// ============================================================================
// Demo Presets
// ============================================================================

export const DEMO_REPOSITORIES = {
  demo1: process.env.DEMO1_REPO_URL ?? 'https://github.com/pmndrs/zustand',
  demo2: process.env.DEMO2_REPO_URL ?? 'https://github.com/pallets/flask',
} as const;

// ============================================================================
// Error Codes
// ============================================================================

// ============================================================================
// Ingest Error Status
// ============================================================================

/** HTTP status for every ingest error code. Single source of truth. */
export const INGEST_ERROR_STATUS = {
  INVALID_REQUEST: 400,
  MISSING_REPOSITORY_URL: 400,
  INVALID_URL_FORMAT: 400,
  NON_GITHUB_REPOSITORY: 400,
  INVALID_DEMO_ID: 400,
  GITHUB_REQUEST_ERROR: 400,
  INVALID_GITHUB_TOKEN: 401,
  REPOSITORY_NOT_FOUND: 404,
  NO_CODE_FILES_FOUND: 422,
  GITHUB_RATE_LIMIT: 429,
  ANALYSIS_FAILED: 500,
  GITHUB_API_ERROR: 502,
  GITHUB_SERVICE_UNAVAILABLE: 503,
  REQUEST_TIMEOUT: 504,
} as const;

export type IngestErrorCode = keyof typeof INGEST_ERROR_STATUS;
