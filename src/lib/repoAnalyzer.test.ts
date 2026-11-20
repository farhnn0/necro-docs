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

    expect(Object.keys(result).sort()).toEqual(['coverage', 'defaultBranch', 'edges', 'nodes', 'overallRot', 'rotSummary', 'title']);
    // 3 analyzed + the test file, node_modules file and config file; .d.ts and README are not source.
    expect(result.coverage).toEqual({
      totalFiles: 6, analyzed: 3, featured: 3, fileLimit: 400, treeTruncated: false,
      skipped: { tests: 1, config: 1, generated: 1, tooLarge: 0, overLimit: 0, unreadable: 0 },
    });
    expect(result.title).toBe('acme/shop');
    expect(result.defaultBranch).toBe('main');
    expect(result.rotSummary).toBe(`${result.overallRot}% infected`);

    // Tests, node_modules, config and .d.ts files are filtered out.
    expect(result.nodes.map((n) => n.path)).toEqual(['src/billing/charge.ts', 'src/lib/db.ts', 'src/server.ts']);
    for (const node of result.nodes) {
      expect(Object.keys(node).sort()).toEqual(['code', 'explainedBy', 'featured', 'findings', 'id', 'lastCommit', 'loc', 'name', 'path', 'recommendation', 'rot', 'summary', 'x', 'y']);
      expect(node.featured).toBe(true); // small repositories show every file
      expect(node.explainedBy).toBe('static'); // no AI provider in unit tests
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

  it('analyzes every eligible file, marks 30 key files, and skips oversized ones', async () => {
    const many: Files = { 'scripts/outside.ts': 'export const a = 1;\n', 'src/huge.ts': 'export const b = 1;\n' };
    for (let i = 0; i < 40; i++) many[`src/f${String(i).padStart(2, '0')}.ts`] = `export const v${i} = ${i};\n`;
    many['src/deep/nested/hot.ts'] = 'export function hot() { try { run(); } catch {} }\n';
    const gh = fakeGitHub(many, { sizes: { 'src/huge.ts': 900_000 } });
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: gh.impl });
    expect(result.nodes).toHaveLength(42); // 40 + outside + hot; only huge is skipped
    expect(result.nodes.some((n) => n.path === 'scripts/outside.ts')).toBe(true);
    expect(result.nodes.some((n) => n.path === 'src/huge.ts')).toBe(false);
    expect(result.coverage.skipped.tooLarge).toBe(1);
    expect(gh.calls.filter((c) => c.url.startsWith('https://raw.githubusercontent.com/')).length).toBe(42);
    // The deeply nested hotspot is a key file even though shallow files come first in reading order.
    expect(result.nodes.filter((n) => n.featured)).toHaveLength(30);
    expect(result.nodes.find((n) => n.path === 'src/deep/nested/hot.ts')!.featured).toBe(true);
    expect(result.coverage.featured).toBe(30);
  });

  it('stops at the 400-file budget and reports the rest as over the limit', async () => {
    const many: Files = {};
    for (let i = 0; i < 405; i++) many[`src/m${String(i).padStart(3, '0')}.ts`] = `export const v${i} = ${i};\n`;
    const gh = fakeGitHub(many);
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: gh.impl });
    expect(result.nodes).toHaveLength(400);
    expect(result.coverage).toMatchObject({ totalFiles: 405, analyzed: 400, skipped: { overLimit: 5 } });
    expect(gh.calls.filter((c) => c.url.startsWith('https://raw.githubusercontent.com/')).length).toBe(400);
  });

  it('sends only the key files to the AI provider and labels the rest as static', async () => {
    const many: Files = {};
    for (let i = 0; i < 40; i++) many[`src/f${String(i).padStart(2, '0')}.ts`] = `export const v${i} = ${i};\n`;
    const sent: string[] = [];
    vi.stubGlobal('fetch', (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(...[...String(init?.body).matchAll(/\\"path\\":\\"([^\\]+)\\"/g)].map((m) => m[1]));
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"files":[]}' }] } }] });
    }) as typeof fetch);
    vi.stubEnv('GEMINI_API_KEY', 'gem-key');
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: fakeGitHub(many).impl });
    const featured = result.nodes.filter((n) => n.featured).map((n) => n.path).sort();
    expect(featured).toHaveLength(30);
    expect([...sent].sort()).toEqual(featured);
    expect(result.nodes.filter((n) => !n.featured).every((n) => n.explainedBy === 'static')).toBe(true);
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

describe('static scanner fairness', () => {
  beforeEach(() => {
    for (const name of ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'OPENCODE_MODEL', 'OPENCODE_BASE_URL', 'OPENCODE_CHAT_COMPLETIONS_URL']) vi.stubEnv(name, '');
  });
  afterEach(() => vi.unstubAllEnvs());

  const analyze = async (files: Files) => {
    const result = await analyzeRepository('Acme/Shop', { token: '', fetchImpl: fakeGitHub(files).impl });
    return Object.fromEntries(result.nodes.map((n) => [n.path, n]));
  };

  it('treats fallback and documented catches as handled, and merges repeated catches into one finding', async () => {
    const nodes = await analyze({
      'src/fallback.ts': [
        'export async function read(res: Response) {', // 1
        '  try {', // 2
        '    return await res.json();', // 3
        '  } catch {', // 4
        '    return await res.text();', // 5  fallback: handled
        '  }', // 6
        '}', // 7
        'export function parse(s: string) {', // 8
        '  try {', // 9
        '    return JSON.parse(s);', // 10
        '  } catch (e) {', // 11
        '    // partial chunk, the next one completes it', // 12  documented ignore
        '  }', // 13
        '}', // 14
      ].join('\n'),
      'src/silent.ts': 'export function a() { try { x(); } catch {} }\nexport function b() { try { y(); } catch {} }\nexport function c() { try { return z(); } catch { return null; } }\n',
    });
    const fallback = nodes['src/fallback.ts'].findings.join('\n');
    expect(fallback).not.toMatch(/Empty catch|swallow/);
    expect(fallback).toContain('Line 11: catch block deliberately ignores the error');

    const silent = nodes['src/silent.ts'].findings;
    expect(silent[0]).toBe('Line 1: Empty catch block swallows exceptions silently (2 places: lines 1, 2).');
    expect(silent.some((f) => f.startsWith('Line 3: catch block returns a placeholder value'))).toBe(true);
    expect(nodes['src/silent.ts'].rot).toBeGreaterThan(nodes['src/fallback.ts'].rot);
  });

  it('reads a type copied into an AI prompt as schema drift, not as duplicated code', async () => {
    const schema = ['interface AnalysisResult {', '  totalFiles: number;', '  totalLines: number;', '  languages: Record<string, number>;', '  dependencies: string[];', '  complexity: string;', '}'];
    const nodes = await analyze({
      'src/types.ts': `export ${schema.join('\n')}\n`,
      'src/ai.ts': ['export const prompt = `Reply with JSON shaped as:', ...schema, 'Answer only with JSON.`;', ''].join('\n'),
    });
    const ai = nodes['src/ai.ts'].findings.join('\n');
    expect(ai).toContain('Prompt Schema Drift Risk');
    expect(ai).toContain('`AnalysisResult` (declared in src/types.ts)');
    expect(ai).not.toMatch(/same \d\+ line block/);
    expect(nodes['src/types.ts'].findings.join('\n')).not.toMatch(/same \d\+ line block/);
    // Informational only: no rot points beyond the baseline of an otherwise trivial file.
    expect(nodes['src/ai.ts'].rot).toBeLessThanOrEqual(2);
  });

  it('downgrades a fallback chain and a sanitized HTML sink, but still flags the real versions', async () => {
    const nodes = await analyze({
      'src/parse.ts': [
        'export function parse(raw: string) {', // 1
        '  let parsed: unknown;', // 2
        '  try { parsed = JSON.parse(raw); } catch (_err) {}', // 3
        '  if (!parsed) { parsed = JSON.parse(repair(raw)); }', // 4
        '  return parsed;', // 5
        '}',
        'export function loud(raw: string) {', // 7
        '  try { JSON.parse(raw); } catch (_err) {}', // 8
        '  return 1;',
        '}',
        '',
      ].join('\n'),
      'src/Post.tsx': [
        'export const Safe = (p: { html: string }) => <div dangerouslySetInnerHTML={{ __html: safeSanitize(p.html) }} />;', // 1
        'export const Risky = (p: { html: string }) => <div dangerouslySetInnerHTML={{ __html: p.html }} />;', // 2
        '',
      ].join('\n'),
    });
    const parse = nodes['src/parse.ts'].findings.join('\n');
    expect(parse).toContain('Line 8: Empty catch block swallows exceptions silently.');
    expect(parse).not.toContain('Line 3: Empty catch');
    expect(parse).toContain('Line 3: catch is the first stage of a multi-stage fallback');

    const post = nodes['src/Post.tsx'].findings.join('\n');
    expect(post).toContain('Line 2: dangerouslySetInnerHTML renders `p.html`, which is not sanitized');
    expect(post).toContain('Line 1: dangerouslySetInnerHTML receives HTML sanitized by safeSanitize()');
  });

  it('measures control-flow nesting, not JSX or object indentation', async () => {
    const jsx = [
      'export function Page() {',
      '  return (',
      '    <main>',
      '      <section>',
      '        <div>',
      '          <ul>',
      '            <li>',
      '              <span>{"deep markup"}</span>',
      '            </li>',
      '          </ul>',
      '        </div>',
      '      </section>',
      '    </main>',
      '  );',
      '}',
    ].join('\n');
    const loops = [
      'export function walk(rows: number[][]) {', // 1
      '  for (const row of rows) {', // 2
      '    for (const cell of row) {', // 3
      '      if (cell > 0) {', // 4
      '        try {', // 5
      '          if (cell > 9) {', // 6
      '            log(cell);', // 7
      '          }', // 8
      '        } catch (e) {', // 9
      '          throw e;', // 10
      '        }', // 11
      '      }', // 12
      '    }', // 13
      '  }', // 14
      '}', // 15
    ].join('\n');
    const nodes = await analyze({ 'src/page.tsx': jsx, 'src/walk.ts': loops });
    expect(nodes['src/page.tsx'].findings.join('\n')).not.toMatch(/Control flow is nested/);
    expect(nodes['src/page.tsx'].findings.join('\n')).toContain('control flow nested up to 0 levels');
    expect(nodes['src/page.tsx'].rot).toBe(0);
    expect(nodes['src/walk.ts'].findings[0]).toBe('Line 6: Control flow is nested 5 levels deep (if/loop/try inside each other).');
  });

  it('gives type-only modules no rot for being widely imported', async () => {
    const files: Files = { 'src/types.ts': 'export type User = { id: string; name: string };\nexport type Role = "admin" | "user";\n' };
    for (let i = 0; i < 6; i++) files[`src/use${i}.ts`] = `import type { User } from './types';\nexport const f${i} = (u: User) => u.id;\n`;
    const nodes = await analyze(files);
    expect(nodes['src/types.ts'].rot).toBe(0);
  });

  it('reports hard-coded credentials without echoing the value, and copy-pasted blocks across files', async () => {
    const key = `sk-${'a1B2c3D4'.repeat(5)}`;
    const shared = [
      'const encoder = new TextEncoder();',
      'const decoder = new TextDecoder();',
      'const reader = response.body.getReader();',
      'let buffer = "" + decoder.decode(new Uint8Array());',
      'controller.enqueue(encoder.encode(buffer));',
      'controller.close(); reader.releaseLock();',
    ].join('\n');
    const nodes = await analyze({
      'src/client.ts': `const apiKey = "${key}";\nexport const headers = { Authorization: apiKey };\n`,
      'src/a.ts': `export async function a(response: Response, controller: any) {\n${shared}\n}\n`,
      'src/b.ts': `export async function b(response: Response, controller: any) {\n${shared}\n}\n`,
    });
    const client = nodes['src/client.ts'];
    expect(client.findings[0]).toBe('Line 1: Hard-coded credential (API key or private key format) is committed to the repository.');
    expect(JSON.stringify([client.findings, client.summary, client.recommendation])).not.toContain(key);
    expect(nodes['src/a.ts'].findings.join('\n')).toContain('Line 2: The same 6+ line block also appears in src/b.ts (line 2)');
  });
});
