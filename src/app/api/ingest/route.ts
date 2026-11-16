/**
 * POST /api/ingest
 *
 * Reads a public GitHub repository through the REST API (no clone), analyzes up to 25 of its
 * smallest eligible code files, and returns a graph-ready result: one node per file (with a
 * code-rot score and metrics) and one edge per resolved import.
 *
 * Set `GITHUB_TOKEN` in the server environment to raise GitHub rate limits. The token is never
 * logged or returned. Other HTTP methods receive Next.js's automatic 405.
 *
 * Request (`Content-Type: application/json`, body at most 10,000 characters):
 * ```json
 * { "repositoryUrl": "https://github.com/owner/repo" }
 * { "useDemo": true, "demoId": "demo1" }
 * ```
 * `useDemo: true` takes precedence over `repositoryUrl`. Demo ids: `demo1`, `demo2`.
 *
 * Success (200): `ApiResponse<IngestResult>`
 * ```json
 * {
 *   "success": true,
 *   "data": { "nodes": [], "edges": [], "metadata": { "fileCount": 0, "averageRotScore": 0,
 *             "processingDurationMs": 0, "defaultBranch": "main", "treeTruncated": false } },
 *   "meta": { "timestamp": 0, "duration": 0 }
 * }
 * ```
 * `meta.duration` equals `data.metadata.processingDurationMs`.
 *
 * Error: `{ "success": false, "error": { "code", "message", "details" }, "meta": {...} }`
 *
 * | HTTP | Code                         | When                                                      |
 * | ---- | ---------------------------- | --------------------------------------------------------- |
 * | 400  | INVALID_REQUEST              | Body is invalid JSON, not an object, or over 10,000 chars |
 * | 400  | MISSING_REPOSITORY_URL       | `repositoryUrl` absent or null (and no demo)              |
 * | 400  | INVALID_URL_FORMAT           | Not a string, not a URL, or missing owner/repo            |
 * | 400  | NON_GITHUB_REPOSITORY        | Host is not github.com / www.github.com                   |
 * | 400  | INVALID_DEMO_ID              | `useDemo: true` with missing or unknown `demoId`          |
 * | 400  | GITHUB_REQUEST_ERROR         | GitHub returned another 4xx                               |
 * | 401  | INVALID_GITHUB_TOKEN         | GitHub returned 401                                       |
 * | 404  | REPOSITORY_NOT_FOUND         | Repository missing or not accessible                      |
 * | 422  | NO_CODE_FILES_FOUND          | No eligible files, or none could be fetched               |
 * | 429  | GITHUB_RATE_LIMIT            | Primary or secondary GitHub rate limit                    |
 * | 500  | ANALYSIS_FAILED              | Unexpected error or result validation failure             |
 * | 502  | GITHUB_API_ERROR             | Network failure or unparseable GitHub response            |
 * | 503  | GITHUB_SERVICE_UNAVAILABLE   | GitHub returned 5xx                                       |
 * | 504  | REQUEST_TIMEOUT              | 60 s budget exceeded                                      |
 *
 * @example curl
 * ```bash
 * curl -X POST http://localhost:3000/api/ingest \
 *   -H "Content-Type: application/json" \
 *   -d '{"useDemo":true,"demoId":"demo1"}'
 * ```
 *
 * @example fetch
 * ```ts
 * const res = await fetch('/api/ingest', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ repositoryUrl: 'https://github.com/pmndrs/zustand' }),
 * });
 * const json: ApiResponse<IngestResult> = await res.json();
 * ```
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { INGEST_CONFIG } from '@/lib/constants';
import type { ApiResponse, IngestResult } from '@/lib/types';
import { IngestError, toErrorResponse } from '@/lib/ingest/errors';
import { createGitHubClient } from '@/lib/ingest/github';
import { ingestRepository } from '@/lib/ingest/pipeline';
import { parseIngestRequest } from '@/lib/ingest/request';

export const maxDuration = 60; // seconds; matches INGEST_CONFIG.TIMEOUT_MS

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = performance.now();
  const token = process.env.GITHUB_TOKEN?.trim() || undefined;
  try {
    const text = await request.text();
    if (text.length > INGEST_CONFIG.MAX_BODY_CHARS) {
      throw new IngestError('INVALID_REQUEST', `Request body exceeds ${INGEST_CONFIG.MAX_BODY_CHARS} characters`);
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new IngestError('INVALID_REQUEST', 'Request body is not valid JSON');
    }

    const target = parseIngestRequest(body);
    const signal = AbortSignal.timeout(INGEST_CONFIG.TIMEOUT_MS);
    const client = createGitHubClient({ token, signal });
    const data = await ingestRepository(target, { client, now: new Date(), startedAt });

    return NextResponse.json<ApiResponse<IngestResult>>(
      {
        success: true,
        data,
        meta: { timestamp: Date.now(), duration: data.metadata!.processingDurationMs },
      },
      { status: 200 },
    );
  } catch (e) {
    return toErrorResponse(e, { token, startedAt });
  }
}
