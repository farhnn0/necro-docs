import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IngestError } from '@/lib/ingest/errors';
import { analyzeRepository, parseGitHubUrl } from './repoAnalyzer';

type Files = Record<string, string>;

/** Fake GitHub: repo metadata, recursive tree, and raw file bodies. No network. */
function fakeGitHub(files: Files, opts: { sizes?: Record<string, number>; metaStatus?: number; metaHeaders?: HeadersInit } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: { ...(init?.headers as Record<string, string>) } });
    if (url === 'https://api.github.com/repos/Acme/Shop') {
      if (opts.metaStatus) {
        return new Response(JSON.stringify({ message: 'nope' }), { status: opts.metaStatus, headers: opts.metaHeaders });
      }
      return Response.json({ default_branch: 'main', full_name: 'acme/shop' });
    }
    if (url === 'https://api.github.com/repos/Acme/Shop/git/trees/main?recursive=1') {
      return Response.json({
        tree: Object.keys(files).map((path) => ({ path, type: 'blob', mode: '100644', size: opts.sizes?.[path] ?? Math.max(1, files[path].length) })),
      });
    }
    const raw = 'https://raw.githubusercontent.com/Acme/Shop/main/';
    if (url.startsWith(raw)) {
      const path = decodeURIComponent(url.slice(raw.length));
      return path in files ? new Response(files[path]) : new Response('missing', { status: 404 });
    }
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;
  return { impl, calls };
}

const CHARGE = [
  "import { db } from '@/lib/db';", // 1
  '', // 2
  'export async function charge(amount: number) {', // 3
  '  try {', // 4
  '    await db.insert(amount);', // 5
  '  } catch (e) {', // 6
  '  }', // 7
  '  // TODO: add idempotency key', // 8
  '  return amount;', // 9
  '}', // 10
].join('\n');

const SHOP: Files = {
  'src/server.ts': "import { charge } from './billing/charge';\nimport { db } from '@/lib/db';\nexport const run = () => charge(1);\n",
  'src/billing/charge.ts': CHARGE,
  'src/lib/db.ts': 'export const db = { insert: async (n: number) => n };\n',
  'src/billing/charge.test.ts': 'it("x", () => {});',
  'node_modules/left-pad/index.js': 'module.exports = 1;',
  'jest.config.js': 'module.exports = {};',
  'types/globals.d.ts': 'declare const x: number;',
  'README.md': '# shop',
};

describe('parseGitHubUrl', () => {
  it('accepts full URLs, host-only and owner/repo forms and cleans .git, /tree and slashes', () => {
    const want = { owner: 'acme', repo: 'shop' };
    for (const input of [
      'https://github.com/acme/shop',
      'http://www.github.com/acme/shop/',
      'github.com/acme/shop',
      'acme/shop',
      '  acme/shop.git  ',
      'https://github.com/acme/shop/tree/main/src?x=1#top',
    ]) {
      expect(parseGitHubUrl(input)).toEqual(want);
    }
  });

  it('rejects bad input with the documented error codes', () => {
    const code = (input: unknown) => {
      try {
        parseGitHubUrl(input);
      } catch (e) {
        return (e as IngestError).code;
      }
      return null;
    };
    expect(code('')).toBe('MISSING_REPOSITORY_URL');
    expect(code(42)).toBe('INVALID_URL_FORMAT');
    expect(code('acme')).toBe('INVALID_URL_FORMAT');
    expect(code('https://gitlab.com/acme/shop')).toBe('NON_GITHUB_REPOSITORY');
    expect(code('ftp://github.com/acme/shop')).toBe('INVALID_URL_FORMAT');
    expect(code('acme/sh op')).toBe('INVALID_URL_FORMAT');
    expect(code('acme/..')).toBe('INVALID_URL_FORMAT');
  });
});

describe('analyzeRepository', () => {
  // Unit tests never reach a real AI provider, even when keys exist in the shell environment.
  beforeEach(() => {
    for (const name of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'OPENCODE_MODEL', 'OPENCODE_BASE_URL', 'OPENCODE_CHAT_COMPLETIONS_URL']) vi.stubEnv(name, '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('produces the documented JSON shape from real file contents', async () => {
    const gh = fakeGitHub(SHOP);
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: gh.impl });

    expect(Object.keys(result).sort()).toEqual(['defaultBranch', 'edges', 'nodes', 'overallRot', 'rotSummary', 'title']);
    expect(result.title).toBe('acme/shop');
    expect(result.defaultBranch).toBe('main');
    expect(result.rotSummary).toBe(`${result.overallRot}% infected`);

    // Tests, node_modules, config and .d.ts files are filtered out.
    expect(result.nodes.map((n) => n.path)).toEqual(['src/billing/charge.ts', 'src/lib/db.ts', 'src/server.ts']);
    for (const node of result.nodes) {
      expect(Object.keys(node).sort()).toEqual(['code', 'findings', 'id', 'lastCommit', 'loc', 'name', 'path', 'recommendation', 'rot', 'summary', 'x', 'y']);
      expect(node.id).toBe(node.path);
      expect(node.rot).toBeGreaterThanOrEqual(0);
      expect(node.rot).toBeLessThanOrEqual(100);
      expect(node.findings.length).toBeGreaterThanOrEqual(2);
      expect(node.findings.length).toBeLessThanOrEqual(4);
    }

    // importer -> imported, including the `@/` alias which maps to src/.
    expect(result.edges).toEqual([
      { from: 'src/billing/charge.ts', to: 'src/lib/db.ts' },
      { from: 'src/server.ts', to: 'src/billing/charge.ts' },
      { from: 'src/server.ts', to: 'src/lib/db.ts' },
    ]);
  });

  it('reports real line numbers for the empty catch and the TODO, and scores that file highest', async () => {
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: fakeGitHub(SHOP).impl });
    const charge = result.nodes.find((n) => n.path === 'src/billing/charge.ts')!;
    expect(charge.findings[0]).toBe('Line 6: Empty catch block swallows exceptions silently.');
    expect(charge.findings.some((f) => f.startsWith('Line 8: TODO comment'))).toBe(true);
    expect(charge.code).toContain('} catch (e) {');
    expect(result.nodes.every((n) => n.rot <= charge.rot)).toBe(true);
    // 18 (empty catch) + 8 (TODO) + coupling for 2 links.
    expect(charge.rot).toBeGreaterThanOrEqual(26);
  });

  it('lays nodes out in the four fixed columns with at least 130px between rows', async () => {
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: fakeGitHub(SHOP).impl });
    const byPath = Object.fromEntries(result.nodes.map((n) => [n.path, n]));
    expect(byPath['src/server.ts'].x).toBe(110); // entrypoint, imports others
    expect(byPath['src/lib/db.ts'].x).toBe(950); // sink, imports nothing
    expect([110, 390, 670, 950]).toContain(byPath['src/billing/charge.ts'].x);
    expect(byPath['src/server.ts'].x).toBeLessThan(byPath['src/billing/charge.ts'].x);
    expect(byPath['src/billing/charge.ts'].x).toBeLessThan(byPath['src/lib/db.ts'].x);
  });

  it('keeps stacked nodes apart when many files share a column', async () => {
    const many: Files = {};
    for (let i = 0; i < 10; i++) many[`src/m${i}.ts`] = `export const v${i} = ${i};\n`;
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: fakeGitHub(many).impl });
    const rows = new Map<number, number[]>();
    for (const n of result.nodes) rows.set(n.x, [...(rows.get(n.x) ?? []), n.y]);
    for (const ys of rows.values()) {
      ys.sort((a, b) => a - b);
      ys.slice(1).forEach((y, i) => expect(y - ys[i]).toBeGreaterThanOrEqual(130));
    }
  });

  it('reads at most 22 files, preferring core folders, and skips oversized ones', async () => {
    const many: Files = { 'scripts/outside.ts': 'export const a = 1;\n', 'src/huge.ts': 'export const b = 1;\n' };
    for (let i = 0; i < 40; i++) many[`src/f${String(i).padStart(2, '0')}.ts`] = `export const v${i} = ${i};\n`;
    const gh = fakeGitHub(many, { sizes: { 'src/huge.ts': 900_000 } });
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: gh.impl });
    expect(result.nodes).toHaveLength(22);
    expect(result.nodes.some((n) => n.path === 'scripts/outside.ts')).toBe(false);
    expect(result.nodes.some((n) => n.path === 'src/huge.ts')).toBe(false);
    expect(gh.calls.filter((c) => c.url.startsWith('https://raw.githubusercontent.com/')).length).toBe(22);
  });

  it('analyzes Python: swallowed except and relative-import edges', async () => {
    const py: Files = {
      'app/main.py': 'from .util import helper\n\n\ndef run():\n    try:\n        helper()\n    except Exception:\n        pass\n',
      'app/util.py': 'def helper():\n    return 1\n',
    };
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: fakeGitHub(py).impl });
    expect(result.edges).toEqual([{ from: 'app/main.py', to: 'app/util.py' }]);
    expect(result.nodes.find((n) => n.path === 'app/main.py')!.findings[0]).toBe('Line 7: Empty except block swallows exceptions silently.');
  });

  it('sends the Bearer token only when one is provided', async () => {
    const withToken = fakeGitHub(SHOP);
    await analyzeRepository('Acme/Shop', { token: 's3cret', fetchImpl: withToken.impl });
    expect(withToken.calls[0].headers.Authorization).toBe('Bearer s3cret');

    const anonymous = fakeGitHub(SHOP);
    await analyzeRepository('Acme/Shop', { token: '', fetchImpl: anonymous.impl });
    expect(anonymous.calls.every((c) => !('Authorization' in c.headers))).toBe(true);
  });

  it('maps GitHub failures to 404 and 429 codes', async () => {
    const notFound = analyzeRepository('Acme/Shop', { token: '', fetchImpl: fakeGitHub(SHOP, { metaStatus: 404 }).impl });
    await expect(notFound).rejects.toMatchObject({ code: 'REPOSITORY_NOT_FOUND', status: 404 });
    const limited = analyzeRepository('Acme/Shop', {
      token: '',
      fetchImpl: fakeGitHub(SHOP, { metaStatus: 403, metaHeaders: { 'x-ratelimit-remaining': '0' } }).impl,
    });
    await expect(limited).rejects.toMatchObject({ code: 'GITHUB_RATE_LIMIT', status: 429 });
  });

  it('merges a messy AI reply per file and keeps static text for gaps', async () => {
    const aiCalls: { url: string; headers: Record<string, string> }[] = [];
    // Fenced, truncated mid-object, "./" path prefix, and one entry with empty findings.
    const reply = '```json\n{"files":[{"id":0,"path":"./src/billing/charge.ts","summary":"Charges the customer and records the ledger row.","findings":["Line 6: The catch block hides failed inserts."],"recommendation":"Rethrow from the catch at line 6."},{"path":"src/lib/db.ts","summary":"Wraps database inserts.","findings":[]},{"id":2,"summary":"cut off';
    vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
      aiCalls.push({ url: String(input), headers: { ...(init?.headers as Record<string, string>) } });
      return Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: reply }] } }] });
    }) as typeof fetch);
    vi.stubEnv('GEMINI_API_KEY', 'gem-key');
    try {
      const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: fakeGitHub(SHOP).impl });
      const byPath = Object.fromEntries(result.nodes.map((n) => [n.path, n]));
      expect(byPath['src/billing/charge.ts'].summary).toBe('Charges the customer and records the ledger row.');
      expect(byPath['src/billing/charge.ts'].recommendation).toBe('Rethrow from the catch at line 6.');
      expect(byPath['src/lib/db.ts'].summary).toBe('Wraps database inserts.');
      expect(byPath['src/lib/db.ts'].findings.length).toBeGreaterThanOrEqual(2); // static findings fill the empty list
      expect(byPath['src/server.ts'].summary).toMatch(/^server\.ts is an entry point/); // truncated entry: static fallback
      expect(aiCalls).toHaveLength(1);
      expect(aiCalls[0].url).not.toContain('gem-key');
      expect(aiCalls[0].headers['x-goog-api-key']).toBe('gem-key');
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it('describes modules by role and exports when no AI provider is configured', async () => {
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: fakeGitHub(SHOP).impl });
    const charge = result.nodes.find((n) => n.path === 'src/billing/charge.ts')!;
    expect(charge.summary).toContain('exposes charge()');
    expect(charge.summary).not.toMatch(/lines of executable code/);
    expect(charge.recommendation).toBe('Log or rethrow the error caught at line 6 so failures reach the caller instead of disappearing.');
  });

  it('fails clearly when no supported source file exists', async () => {
    const docsOnly = analyzeRepository('Acme/Shop', { token: '', fetchImpl: fakeGitHub({ 'README.md': '# hi' }).impl });
    await expect(docsOnly).rejects.toMatchObject({ code: 'NO_CODE_FILES_FOUND', status: 422 });
  });
});
