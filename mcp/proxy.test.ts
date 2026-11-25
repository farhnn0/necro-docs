
import { describe, expect, it, vi } from 'vitest';
import { fetchAnalysis, fetchPatch, ProxyError, resolveBaseUrl } from './proxy';
import { cacheAnalysis, createCache } from './cache';
import { toToolError } from './errors';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const analysis = { title: 'o/r', nodes: [{ path: 'a.ts', rot: 3, findings: [] }], coverage: {} };

describe('proxy', () => {
  it('resolves base URL', () => {
    expect(resolveBaseUrl({})).toBe('http://localhost:3000');
    expect(resolveBaseUrl({ NECRO_API_URL: '  http://x:1/ ' })).toBe('http://x:1');
  });

  it('forwards only repoUrl to ingest and returns the direct analysis', async () => {
    const f = vi.fn().mockResolvedValue(json(analysis));
    expect(await fetchAnalysis('o/r', f)).toEqual(analysis);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ repoUrl: 'o/r' });
  });

  it('rejects malformed analysis', async () => {
    const f = vi.fn().mockResolvedValue(json({ title: 'x' }));
    await expect(fetchAnalysis('o/r', f)).rejects.toMatchObject({ kind: 'shape', message: 'Next returned an invalid analysis response' });
  });

  it('omits undefined optional patch fields', async () => {
    const f = vi.fn().mockResolvedValue(json({ summary: 's', patchedCode: 'c', provider: 'ai', fixed: [], remaining: [] }));
    await fetchPatch({ path: 'a.ts', code: 'x', importedBy: undefined }, f);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ path: 'a.ts', code: 'x' });
  });

  it('maps http, network and shape errors without leaking source', async () => {
    const http = vi.fn().mockResolvedValue(json({ success: false, error: { code: 'GITHUB_RATE_LIMIT', message: 'limit' } }, 429));
    await expect(fetchAnalysis('o/r', http)).rejects.toMatchObject({ kind: 'http', status: 429, upstreamMessage: 'limit', upstreamCode: 'GITHUB_RATE_LIMIT' });
    const patchHttp = vi.fn().mockResolvedValue(json({ error: 'too big' }, 413));
    await expect(fetchPatch({ path: 'a', code: 'SECRET' }, patchHttp)).rejects.toMatchObject({ status: 413, upstreamMessage: 'too big' });
    const net = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const err = await fetchPatch({ path: 'a', code: 'SECRET' }, net).catch((e) => e);
    expect(err).toBeInstanceOf(ProxyError);
    expect(err.kind).toBe('network');
    expect(err.message).not.toContain('SECRET');
    const bad = vi.fn().mockResolvedValue(json({ nope: 1 }));
    await expect(fetchPatch({ path: 'a', code: 'x' }, bad)).rejects.toMatchObject({ kind: 'shape', message: 'Next returned an invalid patch response' });
  });

  it('times out via abort', async () => {
    vi.useFakeTimers();
    const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted')))));
    const p = fetchAnalysis('o/r', f as unknown as typeof fetch).catch((e) => e);
    await vi.advanceTimersByTimeAsync(120_000);
    expect((await p).kind).toBe('timeout');
    vi.useRealTimers();
  });
});

describe('proxy (task 5.3 additions)', () => {
  const patchBody = { summary: 's', patchedCode: 'c', provider: 'ai', fixed: [], remaining: [] };
  const analyze = async (url: string, f: typeof fetch, cache: ReturnType<typeof createCache>) =>
    cacheAnalysis(url, await fetchAnalysis(url, f), cache);

  it('caches only after a validated analysis', async () => {
    const cache = createCache();
    await analyze('o/r', vi.fn().mockResolvedValue(json(analysis)), cache);
    expect(cache.get('o/r')).toEqual(analysis);
  });

  it('keeps the previous cache entry when a refresh fails', async () => {
    const cache = createCache();
    await analyze('o/r', vi.fn().mockResolvedValue(json(analysis)), cache);
    await expect(analyze('o/r', vi.fn().mockResolvedValue(json({ title: 'x' })), cache)).rejects.toBeInstanceOf(ProxyError);
    await expect(analyze('o/r', vi.fn().mockResolvedValue(json({}, 500)), cache)).rejects.toBeInstanceOf(ProxyError);
    await expect(analyze('o/r', vi.fn().mockRejectedValue(new TypeError('x')), cache)).rejects.toBeInstanceOf(ProxyError);
    expect(cache.get('o/r')).toEqual(analysis);
  });

  it('does not cache anything on a first failed analysis', async () => {
    const cache = createCache();
    await analyze('o/r', vi.fn().mockResolvedValue(json({ nope: 1 })), cache).catch(() => undefined);
    expect(cache.size).toBe(0);
  });

  it('forwards optional patch context only when supplied and never findings/autoApprove', async () => {
    const f = vi.fn().mockResolvedValue(json(patchBody));
    const input = { path: 'a.ts', code: 'x', dependencies: ['d'], importedBy: ['i'], findings: [{ id: 1 }], autoApprove: true };
    expect(await fetchPatch(input as never, f)).toMatchObject({ summary: 's', patchedCode: 'c' });
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent).toEqual({ path: 'a.ts', code: 'x', dependencies: ['d'], importedBy: ['i'] });
    expect(sent).not.toHaveProperty('findings');
    expect(sent).not.toHaveProperty('autoApprove');

    const g = vi.fn().mockResolvedValue(json(patchBody));
    await fetchPatch({ path: 'a.ts', code: 'x', findings: [1], autoApprove: true } as never, g);
    expect(JSON.parse(g.mock.calls[0][1].body)).toEqual({ path: 'a.ts', code: 'x' });
  });

  it('rejects non-JSON success responses as shape errors', async () => {
    const f = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(fetchAnalysis('o/r', f)).rejects.toMatchObject({ kind: 'shape' });
  });

  it('surfaces generic HTTP failures with status', async () => {
    const f = vi.fn().mockResolvedValue(json({ success: false, error: { code: 'X', message: 'boom' } }, 500));
    const err = await fetchAnalysis('o/r', f).catch((e) => e);
    expect(err).toMatchObject({ kind: 'http', status: 500, upstreamMessage: 'boom' });
    expect(toToolError(err)).toBe('Next application request failed (HTTP 500): boom');
  });

  it('maps rate limiting to the user-facing message', async () => {
    const coded = vi.fn().mockResolvedValue(json({ error: { code: 'GITHUB_RATE_LIMIT', message: 'm' } }, 429));
    expect(toToolError(await fetchAnalysis('o/r', coded).catch((e) => e))).toBe('GitHub rate limit exceeded; wait and retry later');
    const bare = vi.fn().mockResolvedValue(json({}, 429));
    expect(toToolError(await fetchAnalysis('o/r', bare).catch((e) => e))).toBe('GitHub rate limit exceeded; wait and retry later');
  });

  it('maps unavailable Next to the unreachable message', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(toToolError(await fetchAnalysis('o/r', f).catch((e) => e))).toBe(
      'Cannot reach Next application at NECRO_API_URL; start the Next application or check NECRO_API_URL',
    );
  });
});
