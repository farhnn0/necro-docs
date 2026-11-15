# Necro-Docs: API Integration & Backend Patterns

## API Architecture Overview

Necro-Docs menggunakan Next.js API Routes untuk backend logic, dengan clear separation antara client-side (React/Zustand) dan server-side (API routes).

### API Route Structure

```
src/app/api/
├── codebase/
│   ├── analyze/
│   │   └── route.ts       # POST /api/codebase/analyze
│   ├── files/
│   │   └── route.ts       # GET /api/codebase/files
│   └── structure/
│       └── route.ts       # POST /api/codebase/structure
├── debugger/
│   ├── breakpoints/
│   │   └── route.ts       # GET, POST /api/debugger/breakpoints
│   ├── execute/
│   │   └── route.ts       # POST /api/debugger/execute
│   └── logs/
│       └── route.ts       # GET /api/debugger/logs
└── voice/
    ├── recognize/
    │   └── route.ts       # POST /api/voice/recognize
    └── synthesize/
        └── route.ts       # POST /api/voice/synthesize
```

## API Response Patterns

### Standard Response Format

```typescript
// src/lib/types.ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  meta?: {
    timestamp: number;
    duration: number;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
```

### Success Response

```typescript
// Example successful response
const response: ApiResponse<AnalysisResult> = {
  success: true,
  data: {
    totalFiles: 42,
    totalLines: 15000,
    languages: { TypeScript: 60, CSS: 25, JSON: 15 },
    dependencies: ['react', 'zustand', 'tailwindcss'],
    architecture: 'modular',
    complexity: 'medium',
    patterns: ['component-based', 'hooks', 'store-pattern'],
  },
  meta: {
    timestamp: Date.now(),
    duration: 1234, // milliseconds
  },
};
```

### Error Response

```typescript
// Example error response
const response: ApiResponse<null> = {
  success: false,
  error: {
    code: 'ANALYSIS_FAILED',
    message: 'Failed to analyze codebase',
    details: {
      reason: 'Directory not found',
      path: '/invalid/path',
    },
  },
  meta: {
    timestamp: Date.now(),
    duration: 100,
  },
};
```

## API Route Implementation

### Basic Route Template

```typescript
// src/app/api/codebase/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ApiResponse, AnalysisResult } from '@/lib/types';

/**
 * POST /api/codebase/analyze
 * Analyzes a codebase and returns structure analysis
 * 
 * Request body:
 * {
 *   rootPath: string
 *   includeMetadata?: boolean
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = performance.now();

  try {
    // Parse and validate request
    const body = await request.json();
    const { rootPath, includeMetadata = true } = body;

    if (!rootPath || typeof rootPath !== 'string') {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Missing or invalid rootPath parameter',
          },
        },
        { status: 400 }
      );
    }

    // Business logic
    const result = await analyzeCodebase(rootPath, includeMetadata);

    // Success response
    const duration = performance.now() - startTime;
    return NextResponse.json<ApiResponse<AnalysisResult>>(
      {
        success: true,
        data: result,
        meta: {
          timestamp: Date.now(),
          duration: Math.round(duration),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    // Error handling
    const duration = performance.now() - startTime;
    const message = error instanceof Error ? error.message : 'Unknown error';

    console.error('[/api/codebase/analyze]', error);

    return NextResponse.json<ApiResponse<null>>(
      {
        success: false,
        error: {
          code: 'ANALYSIS_ERROR',
          message: 'Failed to analyze codebase',
          details: {
            error: message,
          },
        },
        meta: {
          timestamp: Date.now(),
          duration: Math.round(duration),
        },
      },
      { status: 500 }
    );
  }
}

// Helper function (move to lib/ if reused)
async function analyzeCodebase(
  rootPath: string,
  includeMetadata: boolean
): Promise<AnalysisResult> {
  // Implementation
  return {
    totalFiles: 42,
    totalLines: 15000,
    languages: { TypeScript: 60, CSS: 25, JSON: 15 },
    dependencies: [],
    architecture: 'modular',
    complexity: 'medium',
    patterns: [],
  };
}
```

### Route with Authentication

```typescript
// src/app/api/debugger/execute/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';
import { ApiResponse } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check authentication
    const auth = checkAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json<ApiResponse<null>>(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Your logic here
    const result = await executeDebugger(body);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    // Handle error
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message: String(error) } },
      { status: 500 }
    );
  }
}
```

### Pagination Handler

```typescript
// src/app/api/debugger/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PaginatedResponse, DebugLog } from '@/lib/types';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') ?? '1');
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50');
    const level = searchParams.get('level') as any;

    // Validate pagination
    if (page < 1 || pageSize < 1 || pageSize > 100) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PAGINATION',
            message: 'Invalid page or pageSize',
          },
        },
        { status: 400 }
      );
    }

    // Fetch logs
    const { items, total } = await fetchDebugLogs(
      { level },
      page,
      pageSize
    );

    const response: PaginatedResponse<DebugLog> = {
      items,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    };

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: 'ERROR', message: String(error) } },
      { status: 500 }
    );
  }
}

async function fetchDebugLogs(
  filters: any,
  page: number,
  pageSize: number
): Promise<{ items: DebugLog[]; total: number }> {
  // Implementation
  return { items: [], total: 0 };
}
```

## Client-Side API Calls

### Fetch Service Pattern

```typescript
// src/lib/api/client.ts
import { ApiResponse } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

interface FetchOptions extends RequestInit {
  timeout?: number;
}

async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const { timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export const api = {
  // Codebase endpoints
  codebase: {
    analyze: (rootPath: string) =>
      apiFetch('/api/codebase/analyze', {
        method: 'POST',
        body: JSON.stringify({ rootPath }),
      }),

    getFiles: (path: string) =>
      apiFetch(`/api/codebase/files?path=${encodeURIComponent(path)}`),

    getStructure: (rootPath: string) =>
      apiFetch('/api/codebase/structure', {
        method: 'POST',
        body: JSON.stringify({ rootPath }),
      }),
  },

  // Debugger endpoints
  debugger: {
    addBreakpoint: (fileId: string, line: number) =>
      apiFetch('/api/debugger/breakpoints', {
        method: 'POST',
        body: JSON.stringify({ fileId, line }),
      }),

    getBreakpoints: () => apiFetch('/api/debugger/breakpoints'),

    execute: (code: string) =>
      apiFetch('/api/debugger/execute', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),

    getLogs: (page = 1, pageSize = 50) =>
      apiFetch(
        `/api/debugger/logs?page=${page}&pageSize=${pageSize}`
      ),
  },

  // Voice endpoints
  voice: {
    recognize: (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append('audio', audioBlob);
      return apiFetch('/api/voice/recognize', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set Content-Type for FormData
      });
    },

    synthesize: (text: string) =>
      apiFetch('/api/voice/synthesize', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
  },
};
```

### Using API with Zustand

```typescript
// src/stores/codebase.store.ts
import { create } from 'zustand';
import { api } from '@/lib/api/client';

interface CodebaseState {
  files: FileNode[];
  isAnalyzing: boolean;
  error: string | null;

  analyze: (rootPath: string) => Promise<void>;
}

export const useCodebaseStore = create<CodebaseState>((set) => ({
  files: [],
  isAnalyzing: false,
  error: null,

  analyze: async (rootPath: string) => {
    set({ isAnalyzing: true, error: null });

    try {
      const response = await api.codebase.analyze(rootPath);

      if (!response.success) {
        throw new Error(response.error?.message ?? 'Analysis failed');
      }

      // Transform API response to store format
      const files = transformAnalysisResult(response.data);
      set({ files, isAnalyzing: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      set({ error: message, isAnalyzing: false });
    }
  },
}));

function transformAnalysisResult(result: AnalysisResult): FileNode[] {
  // Transform API response to FileNode format
  return [];
}
```

### Using API in Components

```typescript
// src/components/codebase-explorer/FileTree.tsx
'use client';

import { useEffect } from 'react';
import { useCodebaseStore } from '@/stores/codebase.store';

export function FileTree() {
  const { files, isAnalyzing, error, analyze } = useCodebaseStore();

  useEffect(() => {
    analyze('/project');
  }, [analyze]);

  if (isAnalyzing) {
    return <div className="p-4 text-ghost">Analyzing codebase...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-neon-red">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="p-4">
      {files.map((file) => (
        <FileTreeNode key={file.id} file={file} />
      ))}
    </div>
  );
}
```

## Error Handling Strategy

### Client-Side Error Boundaries

```typescript
// src/components/error-boundary.tsx
'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback?.(this.state.error) ?? (
          <div className="p-4 bg-neon-red/5 border border-neon-red text-neon-red rounded">
            <h2 className="font-bold mb-2">Something went wrong</h2>
            <p className="text-sm">{this.state.error.message}</p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

### Error Notification Pattern

```typescript
// Using UI store
const { addNotification } = useUIStore();

try {
  await api.codebase.analyze(rootPath);
} catch (error) {
  addNotification({
    type: 'error',
    message: error instanceof Error ? error.message : 'Unknown error',
    duration: 5000,
  });
}
```

## Data Caching Strategy

### Simple Cache with Zustand

```typescript
// src/stores/cache.store.ts
import { create } from 'zustand';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds
}

interface CacheState {
  cache: Map<string, CacheEntry<any>>;
  set: <T,>(key: string, data: T, ttl?: number) => void;
  get: <T,>(key: string) => T | null;
  invalidate: (key: string) => void;
  clear: () => void;
}

export const useCacheStore = create<CacheState>((set, get) => ({
  cache: new Map(),

  set: <T,>(key: string, data: T, ttl = 5 * 60 * 1000) => {
    const cache = new Map(get().cache);
    cache.set(key, { data, timestamp: Date.now(), ttl });
    set({ cache });
  },

  get: <T,>(key: string): T | null => {
    const entry = get().cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      get().invalidate(key);
      return null;
    }

    return entry.data as T;
  },

  invalidate: (key: string) => {
    const cache = new Map(get().cache);
    cache.delete(key);
    set({ cache });
  },

  clear: () => set({ cache: new Map() }),
}));
```

### Using Cache

```typescript
// src/stores/codebase.store.ts
export const useCodebaseStore = create<CodebaseState>((set) => ({
  // ... other state

  analyze: async (rootPath: string) => {
    // Check cache first
    const cached = useCacheStore.getState().get(`analysis:${rootPath}`);
    if (cached) {
      set({ files: cached });
      return;
    }

    set({ isAnalyzing: true });
    try {
      const response = await api.codebase.analyze(rootPath);
      if (response.success) {
        const files = transformAnalysisResult(response.data);
        // Cache the result
        useCacheStore.getState().set(`analysis:${rootPath}`, files);
        set({ files, isAnalyzing: false });
      }
    } catch (error) {
      set({ error: String(error), isAnalyzing: false });
    }
  },
}));
```

## Rate Limiting & Throttling

### Request Throttle

```typescript
// src/lib/utils/throttle.ts
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
```

### Usage in Search

```typescript
// src/components/search/CodeSearch.tsx
'use client';

import { useMemo } from 'react';
import { throttle } from '@/lib/utils/throttle';
import { useCodebaseStore } from '@/stores/codebase.store';

export function CodeSearch() {
  const { search } = useCodebaseStore();

  const throttledSearch = useMemo(
    () => throttle((query: string) => {
      search(query);
    }, 300),
    [search]
  );

  return (
    <input
      type="text"
      onChange={(e) => throttledSearch(e.target.value)}
      placeholder="Search files..."
      className="w-full bg-blueprint-900 border border-ghost/20 rounded px-3 py-2"
    />
  );
}
```

## Environment Configuration

### .env.local (Development)

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000

# Feature Flags
NEXT_PUBLIC_ENABLE_VOICE_DEBUG=true
NEXT_PUBLIC_ENABLE_ANALYTICS=false

# Third-party Services (if needed)
OPENAI_API_KEY=your_key_here
```

### .env.production

```env
NEXT_PUBLIC_API_URL=https://necro-docs.example.com

NEXT_PUBLIC_ENABLE_VOICE_DEBUG=true
NEXT_PUBLIC_ENABLE_ANALYTICS=true
```

## Testing API Routes

### Unit Test Example

```typescript
// src/app/api/codebase/analyze/__tests__/route.test.ts
import { POST } from '../route';
import { NextRequest } from 'next/server';

describe('POST /api/codebase/analyze', () => {
  it('should return analysis result', async () => {
    const request = new NextRequest('http://localhost:3000/api/codebase/analyze', {
      method: 'POST',
      body: JSON.stringify({ rootPath: '/project' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  it('should return error for invalid request', async () => {
    const request = new NextRequest('http://localhost:3000/api/codebase/analyze', {
      method: 'POST',
      body: JSON.stringify({ /* missing rootPath */ }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });
});
```

---

**Best Practices**:
- Always validate input data at API route level
- Use consistent error response format
- Implement proper error logging
- Cache expensive computations
- Handle timeouts gracefully
- Rate limit sensitive endpoints
- Return meaningful error messages
- Document API endpoints with JSDoc comments
