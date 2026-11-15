import { describe, expect, it } from 'vitest';
import { createGitHubClient, type TreeEntry } from '../github';
import { IngestError } from '../errors';

interface Call {
  url: string;
  init: RequestInit;
}

/** Fake fetch that records calls and answers with the given responder. */
function fakeFetch(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return responder(url, init ?? {});
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

const headerOf = (init: RequestInit, name: string): string | undefined =>
  new Headers(init.headers).get(name) ?? undefined;

const signal = () => new AbortController().signal;

const fileEntry = (path: string, size: number): TreeEntry => ({
  path,
  type: 'blob',
  mode: '100644',
  size,
});

describe('createGitHubClient', () => {
  it('requests repo metadata and extracts default_branch', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({ default_branch: 'trunk' }));
    const client = createGitHubClient({ signal: signal(), fetchImpl });

    const branch = await client.getDefaultBranch('owner', 'repo');

    expect(branch).toBe('trunk');
    expect(calls[0].url).toBe('https://api.github.com/repos/owner/repo');
  });

  it('requests the tree with recursive=1 and returns entries and truncated flag', async () => {
    const tree = [fileEntry('src/a.ts', 10)];
    const { fetchImpl, calls } = fakeFetch(() => json({ tree, truncated: true }));
    const client = createGitHubClient({ signal: signal(), fetchImpl });

    const result = await client.getTree('owner', 'repo', 'main');

    expect(calls[0].url).toBe('https://api.github.com/repos/owner/repo/git/trees/main?recursive=1');
    expect(result).toEqual({ entries: tree, truncated: true });
  });

  it('requests file contents with ref and the raw media type Accept header', async () => {
    const { fetchImpl, calls } = fakeFetch(() => new Response('export const x = 1;'));
    const client = createGitHubClient({ signal: signal(), fetchImpl });

    const file = await client.getFileContent('owner', 'repo', 'main', fileEntry('src/a.ts', 17));

    expect(calls[0].url).toBe(
      'https://api.github.com/repos/owner/repo/contents/src/a.ts?ref=main',
    );
    expect(headerOf(calls[0].init, 'Accept')).toBe('application/vnd.github.raw+json');
    expect(file).toEqual({ content: 'export const x = 1;', truncated: false });
  });

  it('sends Authorization: token <value> only when a token is set', async () => {
    const withToken = fakeFetch(() => json({ default_branch: 'main' }));
    await createGitHubClient({ token: 'abc123', signal: signal(), fetchImpl: withToken.fetchImpl })
      .getDefaultBranch('o', 'r');
    expect(headerOf(withToken.calls[0].init, 'Authorization')).toBe('token abc123');

    const noToken = fakeFetch(() => json({ default_branch: 'main' }));
    await createGitHubClient({ signal: signal(), fetchImpl: noToken.fetchImpl })
      .getDefaultBranch('o', 'r');
    expect(headerOf(noToken.calls[0].init, 'Authorization')).toBeUndefined();
  });

  it('captures x-ratelimit headers in getRateLimit', async () => {
    const reset = 1_800_000_000;
    const { fetchImpl } = fakeFetch(() =>
      json(
        { default_branch: 'main' },
        { headers: { 'x-ratelimit-remaining': '42', 'x-ratelimit-reset': String(reset) } },
      ),
    );
    const client = createGitHubClient({ signal: signal(), fetchImpl });

    expect(client.getRateLimit()).toBeNull();
    await client.getDefaultBranch('o', 'r');

    expect(client.getRateLimit()).toEqual({
      remaining: 42,
      resetAt: new Date(reset * 1000).toISOString(),
    });
  });

  it('returns null when a file request answers 404', async () => {
    const { fetchImpl } = fakeFetch(() => new Response(null, { status: 404 }));
    const client = createGitHubClient({ signal: signal(), fetchImpl });

    const file = await client.getFileContent('o', 'r', 'main', fileEntry('gone.ts', 5));

    expect(file).toBeNull();
  });

  it('maps a pre-aborted signal with a TimeoutError reason to REQUEST_TIMEOUT', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('timeout', 'TimeoutError'));
    // Fake fetch honors the signal the way the real fetch does.
    const { fetchImpl } = fakeFetch(() => {
      if (controller.signal.aborted) throw controller.signal.reason;
      return json({ default_branch: 'main' });
    });
    const client = createGitHubClient({ signal: controller.signal, fetchImpl });

    const error = await client.getDefaultBranch('o', 'r').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(IngestError);
    expect((error as IngestError).code).toBe('REQUEST_TIMEOUT');
    expect((error as IngestError).status).toBe(504);
  });

  it('returns a 50 KiB truncated result for files over 1 MiB', async () => {
    const total = 1_048_576 + 1024;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // Emit in 64 KiB chunks so the byte cap is hit mid-stream.
        const chunk = 64 * 1024;
        for (let sent = 0; sent < total; sent += chunk) {
          controller.enqueue(new Uint8Array(Math.min(chunk, total - sent)).fill(97));
        }
        controller.close();
      },
    });
    const { fetchImpl } = fakeFetch(() => new Response(body));
    const client = createGitHubClient({ signal: signal(), fetchImpl });

    const file = await client.getFileContent(
      'o',
      'r',
      'main',
      fileEntry('big.txt', total),
    );

    expect(file).not.toBeNull();
    expect(file!.truncated).toBe(true);
    expect(file!.content.length).toBe(51_200);
  });
});
