import { INGEST_CONFIG } from '@/lib/constants';
import { IngestError } from './errors';

export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  mode: string;
  size?: number;
}

const NAME_RE = /^[A-Za-z0-9_.-]+$/;
const isDotsOnly = (s: string) => /^\.+$/.test(s);

/** Extracts a validated owner/repo from a GitHub URL. */
export function parseRepositoryUrl(input: string): { owner: string; repo: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new IngestError('INVALID_URL_FORMAT', 'Repository URL is not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new IngestError('INVALID_URL_FORMAT', 'Repository URL must use http or https');
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new IngestError('INVALID_URL_FORMAT', 'Repository URL must include owner and repository');
  }
  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') {
    throw new IngestError('NON_GITHUB_REPOSITORY', 'Only github.com repositories are supported');
  }
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, '');
  if (!NAME_RE.test(owner) || !NAME_RE.test(repo) || isDotsOnly(owner) || isDotsOnly(repo)) {
    throw new IngestError('INVALID_URL_FORMAT', 'Owner or repository name contains invalid characters');
  }
  return { owner, repo };
}

export interface RateLimitInfo {
  remaining: number;
  resetAt: string | null; // ISO 8601
}
export interface FetchedFile {
  content: string;
  truncated: boolean;
}

export interface GitHubClient {
  getDefaultBranch(owner: string, repo: string): Promise<string>;
  getTree(owner: string, repo: string, branch: string): Promise<{ entries: TreeEntry[]; truncated: boolean }>;
  /** Returns null when GitHub answers 404 (file skipped). */
  getFileContent(owner: string, repo: string, branch: string, entry: TreeEntry): Promise<FetchedFile | null>;
  getRateLimit(): RateLimitInfo | null;
}

/** Reads at most `maxBytes` from a body stream; `truncated` is true if more bytes existed. */
export async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!body) return { bytes: new Uint8Array(0), truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = maxBytes - total;
      if (value.length > room) {
        if (room > 0) chunks.push(value.subarray(0, room));
        total += Math.max(room, 0);
        truncated = true;
        break;
      }
      chunks.push(value);
      total += value.length;
      if (total === maxBytes) {
        // Cap hit exactly: truncated only if more data follows.
        const next = await reader.read();
        if (!next.done && next.value.length > 0) truncated = true;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }
  return { bytes, truncated };
}

/** Maps an unsuccessful GitHub response to an IngestError. */
export function mapGitHubError(
  res: { status: number; headers: Headers; message?: string },
  ctx: 'repository' | 'other',
): IngestError {
  const { status, headers } = res;
  const detail = res.message ? `: ${res.message}` : '';
  if (status === 401) {
    return new IngestError('INVALID_GITHUB_TOKEN', `GitHub rejected the token${detail}`);
  }
  const retryAfter = headers.get('retry-after');
  if (
    status === 429 ||
    (status === 403 && (headers.get('x-ratelimit-remaining') === '0' || retryAfter !== null))
  ) {
    const reset = Number(headers.get('x-ratelimit-reset'));
    return new IngestError('GITHUB_RATE_LIMIT', 'GitHub rate limit exceeded', {
      resetAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null,
      retryAfter: retryAfter === null ? null : Number(retryAfter),
    });
  }
  if (status === 404 && ctx === 'repository') {
    return new IngestError('REPOSITORY_NOT_FOUND', 'Repository not found or not accessible');
  }
  if (status >= 400 && status < 500) {
    return new IngestError('GITHUB_REQUEST_ERROR', `GitHub request failed (${status})${detail}`, { status });
  }
  if (status >= 500 && status < 600) {
    return new IngestError('GITHUB_SERVICE_UNAVAILABLE', `GitHub service unavailable (${status})`, { status });
  }
  return new IngestError('GITHUB_API_ERROR', `Unexpected GitHub response (${status})`, { status });
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export function createGitHubClient(opts: {
  token?: string;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): GitHubClient {
  const { token, signal } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  const C = INGEST_CONFIG;
  let rateLimit: RateLimitInfo | null = null;

  async function request(path: string, accept: string): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: accept,
      'X-GitHub-Api-Version': C.GITHUB_API_VERSION,
      'User-Agent': C.USER_AGENT,
    };
    if (token) headers.Authorization = `token ${token}`;
    let res: Response;
    try {
      res = await doFetch(`${C.GITHUB_API_BASE}${path}`, { headers, signal });
    } catch (e) {
      if (signal.aborted) throw new IngestError('REQUEST_TIMEOUT', 'The request timed out');
      throw new IngestError('GITHUB_API_ERROR', 'Failed to reach GitHub', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining !== null) {
      const reset = Number(res.headers.get('x-ratelimit-reset'));
      rateLimit = {
        remaining: Number(remaining),
        resetAt: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null,
      };
    }
    return res;
  }

  async function failure(res: Response, ctx: 'repository' | 'other'): Promise<IngestError> {
    let message: string | undefined;
    try {
      const j = (await res.json()) as { message?: unknown };
      if (typeof j.message === 'string') message = j.message;
    } catch {
      /* body not JSON */
    }
    return mapGitHubError({ status: res.status, headers: res.headers, message }, ctx);
  }

  async function json<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch {
      throw new IngestError('GITHUB_API_ERROR', 'GitHub returned an unparseable response');
    }
  }

  const JSON_ACCEPT = 'application/vnd.github+json';

  return {
    async getDefaultBranch(owner, repo) {
      const res = await request(`/repos/${owner}/${repo}`, JSON_ACCEPT);
      if (!res.ok) throw await failure(res, 'repository');
      const data = await json<{ default_branch?: unknown }>(res);
      if (typeof data.default_branch !== 'string' || !data.default_branch) {
        throw new IngestError('GITHUB_API_ERROR', 'GitHub response is missing default_branch');
      }
      return data.default_branch;
    },

    async getTree(owner, repo, branch) {
      const res = await request(
        `/repos/${owner}/${repo}/git/trees/${encodePath(branch)}?recursive=1`,
        JSON_ACCEPT,
      );
      if (!res.ok) throw await failure(res, 'repository');
      const data = await json<{ tree?: TreeEntry[]; truncated?: boolean }>(res);
      if (!Array.isArray(data.tree)) {
        throw new IngestError('GITHUB_API_ERROR', 'GitHub tree response is malformed');
      }
      return { entries: data.tree, truncated: data.truncated === true };
    },

    async getFileContent(owner, repo, branch, entry) {
      const res = await request(
        `/repos/${owner}/${repo}/contents/${encodePath(entry.path)}?ref=${encodeURIComponent(branch)}`,
        'application/vnd.github.raw+json',
      );
      if (res.status === 404) {
        await res.body?.cancel().catch(() => undefined);
        return null;
      }
      if (!res.ok) throw await failure(res, 'other');
      try {
        const big = (entry.size ?? 0) > C.FULL_FETCH_MAX_BYTES;
        if (!big) return { content: await res.text(), truncated: false };
        const { bytes, truncated } = await readCapped(res.body, C.TRUNCATED_FETCH_BYTES);
        return { content: new TextDecoder('utf-8').decode(bytes, { stream: true }), truncated };
      } catch (e) {
        if (signal.aborted) throw new IngestError('REQUEST_TIMEOUT', 'The request timed out');
        throw new IngestError('GITHUB_API_ERROR', 'Failed to read GitHub file content', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },

    getRateLimit: () => rateLimit,
  };
}

