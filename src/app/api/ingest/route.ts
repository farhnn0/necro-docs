/**
 * POST /api/ingest
 *
 * Analyzes a public GitHub repository through the REST API and raw.githubusercontent.com
 * (no clone): up to 22 core source files, one node per file with a code-rot score, findings
 * with line numbers and a code snippet, plus one edge per resolved import.
 * See `src/lib/repoAnalyzer.ts` and `public/panduan_master_prompt_analisis_repo.md`.
 *
 * Set `GITHUB_TOKEN` in the server environment to raise GitHub rate limits. The token is never
 * logged or returned. Other HTTP methods receive Next.js's automatic 405.
 *
 * Request (`Content-Type: application/json`, body at most 10,000 characters):
 * ```json
 * { "repoUrl": "https://github.com/owner/repo" }
 * ```
 * `repoUrl` also accepts `github.com/owner/repo` and `owner/repo`.
 *
 * Success (200): the analysis itself, not wrapped in an envelope.
 * ```json
 * {
 *   "title": "owner/repo", "defaultBranch": "main", "rotSummary": "68% infected", "overallRot": 68,
 *   "nodes": [{ "id", "name", "path", "loc", "rot", "lastCommit", "x", "y", "code", "notes": ["neutral fact"],
 *              "findings": [{ "kind", "line", "lines", "text", "suggestion", "source": "static" | "ai" }] }],
 *   "edges": [{ "from": "importer path", "to": "imported path" }],
 *   "dependencies": ["package name from the root package.json"]
 * }
 * ```
 *
 * Error: `{ "success": false, "error": { "code", "message", "details" }, "meta": {...} }`
 *
 * | HTTP | Code                         | When                                                      |
 * | ---- | ---------------------------- | --------------------------------------------------------- |
 * | 400  | INVALID_REQUEST              | Body is invalid JSON, not an object, or over 10,000 chars |
 * | 400  | MISSING_REPOSITORY_URL       | `repoUrl` absent or empty                                 |
 * | 400  | INVALID_URL_FORMAT           | Not a string, or missing/invalid owner or repository      |
 * | 400  | NON_GITHUB_REPOSITORY        | Host is not github.com / www.github.com                   |
 * | 404  | REPOSITORY_NOT_FOUND         | Repository missing, private, or not accessible            |
 * | 422  | NO_CODE_FILES_FOUND          | No supported source files, or none could be fetched       |
 * | 429  | GITHUB_RATE_LIMIT            | Primary or secondary GitHub rate limit                    |
 * | 502  | GITHUB_API_ERROR             | Network failure or unparseable GitHub response            |
 * | 504  | REQUEST_TIMEOUT              | 60 s budget exceeded                                      |
 *
 * @example curl
 * ```bash
 * curl -X POST http://localhost:3000/api/ingest \
 *   -H "Content-Type: application/json" \
 *   -d '{"repoUrl":"pmndrs/zustand"}'
 * ```
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { INGEST_CONFIG } from '@/lib/constants';
import { IngestError, toErrorResponse } from '@/lib/ingest/errors';
import { analyzeRepository, parseGitHubUrl } from '@/lib/repoAnalyzer';
import type { RepoAnalysis } from '@/lib/repoAnalyzer';
import { getInstallationToken, INSTALLATIONS_COOKIE, openInstallations } from '@/lib/auth/github-app';

export const maxDuration = 60; // seconds; matches INGEST_CONFIG.TIMEOUT_MS

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = performance.now();
  let token = request.headers.get('x-github-token')?.trim() || process.env.GITHUB_TOKEN?.trim() || undefined;
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
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new IngestError('INVALID_REQUEST', 'Request body must be a JSON object');
    }
    const { repoUrl } = body as { repoUrl?: unknown };
    if (repoUrl === undefined || repoUrl === null) {
      throw new IngestError('MISSING_REPOSITORY_URL', 'repoUrl is required');
    }
    if (!token) {
      // Only an installation verified at sign-in, on the account that owns the repository, may be used.
      const { owner } = parseGitHubUrl(repoUrl);
      const installation = openInstallations(request.cookies.get(INSTALLATIONS_COOKIE)?.value)
        .find((candidate) => candidate.account.toLowerCase() === owner.toLowerCase());
      // Without an installation token the repository is read anonymously, which works for public ones.
      if (installation) token = await getInstallationToken(installation.id).then((auth) => auth.token, () => undefined);
    }

    const analysis: RepoAnalysis = await analyzeRepository(repoUrl as string, {
      token,
      signal: AbortSignal.timeout(INGEST_CONFIG.TIMEOUT_MS),
    });
    return NextResponse.json<RepoAnalysis>(analysis, { status: 200 });
  } catch (e) {
    return toErrorResponse(e, { token, startedAt });
  }
}
