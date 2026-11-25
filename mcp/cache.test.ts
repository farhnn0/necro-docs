import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cacheAnalysis, createCache, findCachedNode, NO_CACHED_PATH_MESSAGE, NO_CACHED_URL_MESSAGE } from './cache';
import type { RepoAnalysis } from './types';

const analysis = (...paths: string[]) => ({ nodes: paths.map((path) => ({ path })) }) as unknown as RepoAnalysis;

describe('analysis cache', () => {
  it('replaces equivalent URL forms, isolates repositories, and reports missing url/path', () => {
    const cache = createCache();
    cacheAnalysis('https://github.com/a/b', analysis('x.ts'), cache);
    expect(findCachedNode('a/b', 'x.ts', cache).path).toBe('x.ts');

    cacheAnalysis('github.com/A/B', analysis('y.ts'), cache);
    expect(() => findCachedNode('https://github.com/a/b', 'x.ts', cache)).toThrow(NO_CACHED_PATH_MESSAGE);
    expect(findCachedNode('https://github.com/a/b', 'y.ts', cache).path).toBe('y.ts');

    expect(() => findCachedNode('https://github.com/a/other', 'y.ts', cache)).toThrow(NO_CACHED_URL_MESSAGE);
  });

  it('preserves the previous entry when no new analysis is cached (failed refresh)', () => {
    const cache = createCache();
    const first = analysis('x.ts');
    cacheAnalysis('a/b', first, cache);
    // failed refresh: caller never calls cacheAnalysis
    expect(cache.get('a/b')).toBe(first);
  });
});

describe('cache properties', () => {
  it('reports missing URL before missing path', () => {
    const cache = createCache();
    expect(() => findCachedNode('a/b', 'x.ts', cache)).toThrow(NO_CACHED_URL_MESSAGE);
    cacheAnalysis('a/b', analysis('x.ts'), cache);
    expect(() => findCachedNode('github.com/a/b', 'nope.ts', cache)).toThrow(NO_CACHED_PATH_MESSAGE);
  });

  // Feature: mcp-server, Property 3: Cache refresh is isolated and failure-safe
  it('Property 3: equivalent URLs share latest success, failures preserve, other repositories isolate', () => {
    const forms = ['a/b', 'github.com/a/b', 'https://github.com/a/b', 'A/B'];
    const op = fc.record({
      url: fc.constantFrom(...forms, 'c/d', 'https://github.com/c/d'),
      ok: fc.boolean(),
      path: fc.constantFrom('a.ts', 'b.ts', 'c.ts'),
    });
    fc.assert(
      fc.property(fc.array(op, { maxLength: 30 }), (ops) => {
        const cache = createCache();
        const model = new Map<string, string>();
        for (const { url, ok, path } of ops) {
          const key = url.toLowerCase().replace(/^https?:\/\//, '').replace(/^github\.com\//, '').replace(/\/$/, '');
          if (ok) {
            cacheAnalysis(url, analysis(path), cache);
            model.set(key, path);
          }
        }
        for (const [url, key] of [['a/b', 'a/b'], ['github.com/a/b', 'a/b'], ['https://github.com/a/b', 'a/b'], ['c/d', 'c/d']] as const) {
          for (const path of ['a.ts', 'b.ts', 'c.ts']) {
            const expected = model.get(key);
            if (expected === undefined) expect(() => findCachedNode(url, path, cache)).toThrow(NO_CACHED_URL_MESSAGE);
            else if (expected === path) expect(findCachedNode(url, path, cache).path).toBe(path);
            else expect(() => findCachedNode(url, path, cache)).toThrow(NO_CACHED_PATH_MESSAGE);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
