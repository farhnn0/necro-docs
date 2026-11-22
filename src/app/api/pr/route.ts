import { NextResponse } from 'next/server';
import { createPullRequest, PrError } from '@/lib/githubPr';

/**
 * POST /api/pr
 * Body: { repositoryUrl, filePath, originalCode, patchedCode, summary, rotScore?, fixed?, remaining? }
 * Header `x-github-token` (optional) overrides the server's GITHUB_TOKEN. The token is never logged or returned.
 * Creates a new branch, commits the patched file and opens a pull request. The default branch is never modified.
 */
const fail = (code: string, message: string, status: number) => NextResponse.json({ success: false, error: { code, message } }, { status });

export async function POST(request: Request) {
  const startedAt = performance.now();
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return fail('INVALID_REQUEST', 'Request body must be valid JSON.', 400); }

  const str = (value: unknown) => (typeof value === 'string' ? value : '');
  const strs = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  const supplied = request.headers.get('x-github-token')?.trim() ?? '';
  const token = supplied || process.env.GITHUB_TOKEN?.trim() || '';
  if (!token) return fail('MISSING_TOKEN', 'No GitHub token is configured. Add a personal access token to open the PR.', 401);
  if (token.length > 255 || /\s/.test(token)) return fail('INVALID_TOKEN', 'The GitHub token is malformed.', 401);

  try {
    const result = await createPullRequest({
      repositoryUrl: str(body.repositoryUrl),
      filePath: str(body.filePath),
      originalCode: str(body.originalCode),
      patchedCode: str(body.patchedCode),
      summary: str(body.summary),
      rotScore: typeof body.rotScore === 'number' && Number.isFinite(body.rotScore) ? body.rotScore : undefined,
      fixed: strs(body.fixed),
      remaining: strs(body.remaining),
      token,
    });
    return NextResponse.json({ success: true, data: result, meta: { timestamp: Date.now(), duration: Math.round(performance.now() - startedAt) } });
  } catch (error) {
    if (error instanceof PrError) return fail(error.code, error.message, error.status);
    console.warn('[pr] unexpected failure:', error instanceof Error ? error.name : 'unknown');
    return fail('GITHUB_ERROR', 'Could not reach GitHub.', 502);
  }
}
