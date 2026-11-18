import { describe, expect, it } from 'vitest';
import { branchNameFor, createPullRequest, matchStyle, PrError, safeFilePath } from './githubPr';

const original = 'const a = 1;\nconst b = 2;\n';
const patched = 'const a = 1;\n';
const b64 = (text: string) => Buffer.from(text).toString('base64');

type Route = [method: string, match: RegExp, status: number, body: unknown];
function mockGithub(routes: Route[]) {
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes.find(([m, re]) => m === method && re.test(url));
    const [, , status, body] = route ?? [method, /./, 404, { message: 'Not Found' }];
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const happy = (): Route[] => [
  ['GET', /\/repos\/o\/r$/, 200, { default_branch: 'main', permissions: { push: true } }],
  ['GET', /git\/ref\/heads\/main$/, 200, { object: { sha: 'headsha' } }],
  ['GET', /contents\/src\/a\.ts\?ref=headsha$/, 200, { type: 'file', sha: 'filesha', encoding: 'base64', content: b64(original) }],
  ['POST', /git\/refs$/, 201, {}],
  ['PUT', /contents\/src\/a\.ts$/, 200, {}],
  ['POST', /\/pulls$/, 201, { number: 7, html_url: 'https://github.com/o/r/pull/7' }],
];
const params = { repositoryUrl: 'https://github.com/o/r', filePath: 'src/a.ts', originalCode: original, patchedCode: patched, summary: 'Removed dead code.', rotScore: 81, token: 'ghp_x' };

describe('createPullRequest', () => {
  it('creates branch, commits patched file and opens the PR', async () => {
    const { fetchImpl, calls } = mockGithub(happy());
    const result = await createPullRequest(params, fetchImpl);
    expect(result).toMatchObject({ prNumber: 7, prUrl: 'https://github.com/o/r/pull/7' });
    expect(result.branch).toMatch(/^necro\/fix-a-[a-z0-9]+$/);
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(Buffer.from(String(put.body?.content), 'base64').toString()).toBe(patched);
    expect(put.body).toMatchObject({ sha: 'filesha', branch: result.branch, message: 'fix(forensics): remediate code rot in a.ts [NecroDocs Autopsy]' });
    const pr = calls.find((c) => c.url.endsWith('/pulls'))!;
    expect(pr.body).toMatchObject({ base: 'main', head: result.branch, title: '🩺 fix(forensics): remediate code rot in a.ts' });
    expect(String(pr.body?.body)).toContain('Removed dead code.');
  });

  it('refuses when GitHub copy differs from the analyzed snapshot, before creating a branch', async () => {
    const routes = happy().map((r): Route => (r[2] === 200 && /contents/.test(String(r[1])) ? [r[0], r[1], 200, { type: 'file', sha: 's', encoding: 'base64', content: b64('different\n') }] : r));
    const { fetchImpl, calls } = mockGithub(routes);
    await expect(createPullRequest(params, fetchImpl)).rejects.toMatchObject({ code: 'FILE_MISMATCH' });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('reports NO_PUSH_ACCESS without writing anything', async () => {
    const routes = happy();
    routes[0] = ['GET', /\/repos\/o\/r$/, 200, { default_branch: 'main', permissions: { push: false } }];
    const { fetchImpl, calls } = mockGithub(routes);
    await expect(createPullRequest(params, fetchImpl)).rejects.toMatchObject({ code: 'NO_PUSH_ACCESS', status: 403 });
    expect(calls).toHaveLength(1);
  });

  it('maps a rejected token and deletes the branch when the commit fails', async () => {
    await expect(createPullRequest(params, mockGithub([['GET', /\/repos\/o\/r$/, 401, { message: 'Bad credentials' }]]).fetchImpl)).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    const routes = happy();
    routes[4] = ['PUT', /contents\/src\/a\.ts$/, 422, { message: 'boom' }];
    routes.push(['DELETE', /git\/refs\/heads\/necro\//, 204, {}]);
    const { fetchImpl, calls } = mockGithub(routes);
    await expect(createPullRequest(params, fetchImpl)).rejects.toBeInstanceOf(PrError);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('rejects an unchanged patch', async () => {
    await expect(createPullRequest({ ...params, patchedCode: original }, mockGithub(happy()).fetchImpl)).rejects.toMatchObject({ code: 'NO_CHANGES' });
  });
});

describe('helpers', () => {
  it('rejects path traversal', () => {
    expect(safeFilePath('/src/a.ts')).toBe('src/a.ts');
    for (const bad of ['../x', 'a/../b', '', 'a//b']) expect(() => safeFilePath(bad)).toThrow(PrError);
  });
  it('sanitizes branch names', () => {
    expect(branchNameFor('src/Side Bar.v2.tsx', 36)).toBe('necro/fix-side-bar-v2-10');
  });
  it('preserves CRLF and trailing newline', () => {
    expect(matchStyle('a\r\nb\r\n', 'a\nc')).toBe('a\r\nc\r\n');
    expect(matchStyle('a', 'a\n\n')).toBe('a');
  });
});
