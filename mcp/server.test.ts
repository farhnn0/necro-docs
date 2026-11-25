import { describe, expect, it, vi } from 'vitest';
import { createServer, handlers } from './server';
import { createCache } from './cache';
import type { RepoAnalysis } from './types';

const repoUrl = 'https://github.com/acme/project';

const analysis = (paths: string[] = ['src/low.ts', 'src/high.ts']): RepoAnalysis => ({
  title: 'acme/project',
  defaultBranch: 'main',
  rotSummary: 'High coupling',
  overallRot: 42,
  coverage: {
    totalFiles: paths.length,
    analyzed: paths.length,
    featured: paths.length,
    skipped: { tests: 0, config: 0, generated: 0, tooLarge: 0, overLimit: 0, unreadable: 0 },
    treeTruncated: false,
    fileLimit: 400,
  },
  dependencies: [],
  edges: [{ from: 'src/high.ts', to: 'src/low.ts' }],
  nodes: paths.map((path, index) => ({
    id: path,
    name: path.split('/').pop() ?? path,
    path,
    loc: 10,
    rot: index === 0 ? 2 : 9,
    lastCommit: '2026-01-01T00:00:00Z',
    x: 0,
    y: 0,
    code: 'SECRET_SOURCE',
    notes: ['internal note'],
    summary: 'Static summary',
    recommendation: 'split this file',
    featured: true,
    explainedBy: 'static',
    findings: [{
      line: index + 1,
      kind: 'deep-nesting',
      text: `finding-${path}`,
      suggestion: 'extract a helper',
      source: 'static',
      lines: [index + 1],
    }],
  })),
} as RepoAnalysis);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const requestBody = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;

describe('MCP server tool registration', () => {
  it('registers exactly the four public tools', () => {
    const server = createServer();
    expect(Object.keys((server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools).sort()).toEqual([
      'analyze_repo',
      'get_findings',
      'scan_code',
      'synthesize_patch',
    ]);
  });
});

describe('MCP server handlers', () => {
  it('validates before proxy, scanner, and cache side effects', async () => {
    const fetchMock = vi.fn();
    const scanMock = vi.fn();
    const cache = createCache();

    const invalidAnalyze = await handlers.analyze_repo({ repoUrl: '' }, { fetchImpl: fetchMock, cache });
    const invalidFindings = await handlers.get_findings({ repoUrl, path: '' }, { fetchImpl: fetchMock, cache });
    const invalidScan = await handlers.scan_code({ path: 'x.ts', code: '' }, { scan: scanMock, cache });
    const invalidPatch = await handlers.synthesize_patch({ path: 'x.ts', code: 'x', autoApprove: true }, { fetchImpl: fetchMock, cache });

    for (const result of [invalidAnalyze, invalidFindings, invalidScan, invalidPatch]) {
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Invalid argument/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scanMock).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });

  it('proxies analyze_repo, returns compact output, and caches only successful analyses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(analysis()));
    const cache = createCache();
    const result = await handlers.analyze_repo({ repoUrl }, { fetchImpl: fetchMock, cache });
    const data = result.structuredContent as Record<string, unknown>;

    expect(requestBody(fetchMock)).toEqual({ repoUrl });
    expect(data).toMatchObject({ title: 'acme/project', defaultBranch: 'main', overallRot: 42 });
    expect(data).not.toHaveProperty('edges');
    expect(data).not.toHaveProperty('nodes');
    expect((data.files as Record<string, unknown>[])).toEqual([
      { path: 'src/high.ts', score: 9, findingCount: 1, patchableCount: 0 },
      { path: 'src/low.ts', score: 2, findingCount: 1, patchableCount: 0 },
    ]);
    expect((data.files as Record<string, unknown>[])[0]).not.toHaveProperty('code');
    expect(cache.get('acme/project')).toBeDefined();

    const failedRefresh = vi.fn().mockRejectedValue(new TypeError('offline'));
    const failed = await handlers.analyze_repo({ repoUrl }, { fetchImpl: failedRefresh, cache });
    expect(failed.isError).toBe(true);
    expect(cache.get('acme/project')?.title).toBe('acme/project');
  });

  it('reads findings from equivalent normalized URLs and isolates missing repositories', async () => {
    const cache = createCache();
    const latest = analysis(['src/latest.ts']);
    cache.set('acme/project', latest);
    const fetchMock = vi.fn();

    const result = await handlers.get_findings({ repoUrl: 'github.com/ACME/PROJECT', path: 'src/latest.ts' }, { fetchImpl: fetchMock, cache });
    expect(result.structuredContent).toEqual({
      repoUrl: 'github.com/ACME/PROJECT',
      path: 'src/latest.ts',
      findings: [{ line: 1, kind: 'deep-nesting', text: 'finding-src/latest.ts', suggestion: 'extract a helper', source: 'static', patchable: false }],
      importedBy: [],
      imports: [],
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain('SECRET_SOURCE');
    expect(fetchMock).not.toHaveBeenCalled();

    const missingUrl = await handlers.get_findings({ repoUrl: 'https://github.com/acme/other', path: 'src/latest.ts' }, { fetchImpl: fetchMock, cache });
    expect(missingUrl.content[0].text).toMatch(/call analyze_repo first/);
    const invalidUrl = await handlers.get_findings({ repoUrl: 'https://gitlab.com/acme/project', path: 'src/latest.ts' }, { fetchImpl: fetchMock, cache });
    expect(invalidUrl.content[0].text).toMatch(/Only github.com repositories are supported/);
    const missingPath = await handlers.get_findings({ repoUrl, path: 'src/other.ts' }, { fetchImpl: fetchMock, cache });
    expect(missingPath.content[0].text).toMatch(/not present/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('delegates scan_code to the injected scanner, including empty results', async () => {
    const scanMock = vi.fn().mockReturnValue({ path: 'draft.ts', findings: [] });
    const result = await handlers.scan_code({ path: 'draft.ts', code: 'const draft = 1;' }, { scan: scanMock });
    expect(scanMock).toHaveBeenCalledOnce();
    expect(scanMock).toHaveBeenCalledWith('draft.ts', 'const draft = 1;');
    expect(result.structuredContent).toEqual({ path: 'draft.ts', findings: [] });
  });

  it('forwards only supported patch context and returns a compact proposal without mutation or auto-approval', async () => {
    const originalCode = 'const value = 1;';
    const patchedCode = 'const value = 2;';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      summary: 'Applied a guarded edit',
      patchedCode,
      provider: 'ai',
      fixed: ['deep-nesting'],
      remaining: [],
    }));
    const result = await handlers.synthesize_patch({
      path: 'src/value.ts',
      code: originalCode,
      dependencies: ['react'],
      importedBy: ['src/app.ts'],
    }, { fetchImpl: fetchMock });

    expect(requestBody(fetchMock)).toEqual({
      path: 'src/value.ts',
      code: originalCode,
      dependencies: ['react'],
      importedBy: ['src/app.ts'],
    });
    expect(result.structuredContent).toMatchObject({
      summary: 'Applied a guarded edit',
      edits: { changed: true, originalLength: originalCode.length, patchedLength: patchedCode.length },
      verification: { status: 'verified-change', fixedCount: 1, remainingCount: 0 },
      fixed: ['deep-nesting'],
      remaining: [],
    });
    expect(result.structuredContent).toHaveProperty('patchedCode', patchedCode);
    expect(result.structuredContent).not.toHaveProperty('autoApprove');
    expect(originalCode).toBe('const value = 1;');
  });

  it('get_findings returns importedBy and imports from edges, never node.code', async () => {
    const cache = createCache();
    cache.set('acme/project', analysis()); // edge: src/high.ts imports src/low.ts
    const low = await handlers.get_findings({ repoUrl, path: 'src/low.ts' }, { cache });
    expect(low.structuredContent).toMatchObject({ importedBy: ['src/high.ts'], imports: [] });
    const high = await handlers.get_findings({ repoUrl, path: 'src/high.ts' }, { cache });
    expect(high.structuredContent).toMatchObject({ importedBy: [], imports: ['src/low.ts'] });
    expect(JSON.stringify([low, high])).not.toContain('SECRET_SOURCE');
  });

  it('scan_code marks patchable findings via isPatchable', async () => {
    const result = await handlers.scan_code({ path: 'a.ts', code: 'try { run(); } catch (e) {}' });
    const findings = (result.structuredContent as { findings: { kind: string; patchable: boolean }[] }).findings;
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.find((f) => f.kind === 'empty-catch')?.patchable).toBe(true);
    expect(findings.every((f) => typeof f.patchable === 'boolean')).toBe(true);
  });

  describe('synthesize_patch with repoUrl', () => {
    const cachedWith = (code: string) => {
      const a = analysis();
      a.dependencies = ['react', 'zod'];
      a.nodes[0].code = code; // src/low.ts, imported by src/high.ts
      const cache = createCache();
      cache.set('acme/project', a);
      return cache;
    };
    const patchBody = { summary: 'fixed', patchedCode: 'try { run(); } catch (e) { log(e); }', provider: 'static-fallback', fixed: ['x'], remaining: [] };

    it('uses cached code, edge importers, and repository dependencies', async () => {
      const code = 'try { run(); } catch (e) {}';
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(patchBody));
      const result = await handlers.synthesize_patch({ repoUrl: 'github.com/ACME/project', path: 'src/low.ts' }, { fetchImpl: fetchMock, cache: cachedWith(code) });
      expect(result.isError).toBeUndefined();
      expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/patch$/);
      expect(requestBody(fetchMock)).toEqual({ path: 'src/low.ts', code, dependencies: ['react', 'zod'], importedBy: ['src/high.ts'] });
      expect(result.structuredContent).toHaveProperty('patchedCode', patchBody.patchedCode);
    });

    it('short-circuits without calling /api/patch when nothing is patchable', async () => {
      const fetchMock = vi.fn();
      const result = await handlers.synthesize_patch({ repoUrl, path: 'src/low.ts' }, { fetchImpl: fetchMock, cache: cachedWith('export const ok = 1;\n') });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({ patchableCount: 0 });
      expect(String((result.structuredContent as { message: string }).message)).toMatch(/No patchable findings/);
    });

    it('reports missing cache or path without calling /api/patch', async () => {
      const fetchMock = vi.fn();
      const noCache = await handlers.synthesize_patch({ repoUrl, path: 'src/low.ts' }, { fetchImpl: fetchMock, cache: createCache() });
      expect(noCache.content[0].text).toMatch(/call analyze_repo first/);
      const noPath = await handlers.synthesize_patch({ repoUrl, path: 'src/none.ts' }, { fetchImpl: fetchMock, cache: cachedWith('x') });
      expect(noPath.content[0].text).toMatch(/not present/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('omits patchedCode when the patch endpoint returns unchanged code', async () => {
    const code = 'const value = 1;';
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      summary: 'No accepted change',
      patchedCode: code,
      provider: 'static-fallback',
      fixed: [],
      remaining: ['deep-nesting'],
    }));
    const result = await handlers.synthesize_patch({ path: 'src/value.ts', code }, { fetchImpl: fetchMock });

    expect(result.structuredContent).toMatchObject({
      edits: { changed: false },
      verification: { status: 'no-change', changed: false },
    });
    expect(result.structuredContent).not.toHaveProperty('patchedCode');
    expect(result.structuredContent).not.toHaveProperty('autoApprove');
  });

  it('returns safe tool errors for proxy and scanner failures', async () => {
    const source = 'SECRET_SOURCE';
    const proxyResult = await handlers.synthesize_patch({ path: 'x.ts', code: source }, {
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('network failure')),
    });
    expect(proxyResult.isError).toBe(true);
    expect(proxyResult.content[0].text).not.toContain(source);

    const scannerResult = await handlers.scan_code({ path: 'x.ts', code: source }, {
      scan: vi.fn(() => { throw new Error('scanner failure'); }),
    });
    expect(scannerResult.isError).toBe(true);
    expect(scannerResult.content[0].text).not.toContain(source);
  });
});
