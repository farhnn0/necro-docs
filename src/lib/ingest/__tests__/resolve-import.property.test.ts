import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { posix } from 'node:path';
import { resolveImport } from '@/lib/ingest/relations';
import type { LanguageFamily } from '@/lib/ingest/analyze';

/**
 * Feature: github-ingest-coderot, Property 14: Relative import resolution round trip
 *
 * **Validates: Requirements 6.6**
 */

const JS_DIRS = ['src', 'lib', 'ui', 'core'];
const JS_STEMS = ['alpha', 'beta', 'gamma', 'delta'];
const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

// Python directory and module names are disjoint so a package and a module never share a path.
const PY_DIRS = ['pkg', 'sub', 'core'];
const PY_STEMS = ['mod_a', 'mod_b', 'util'];

interface Entry {
  dirs: string[];
  stem: string;
  ext: string;
}

const jsEntry: fc.Arbitrary<Entry> = fc.record({
  dirs: fc.array(fc.constantFrom(...JS_DIRS), { minLength: 0, maxLength: 3 }),
  stem: fc.constantFrom(...JS_STEMS),
  ext: fc.constantFrom(...JS_EXTS),
});

const pyEntry: fc.Arbitrary<Entry> = fc.record({
  dirs: fc.array(fc.constantFrom(...PY_DIRS), { minLength: 0, maxLength: 3 }),
  stem: fc.constantFrom(...PY_STEMS),
  ext: fc.constant('.py'),
});

/** Builds a deduplicated file set. Python packages get an __init__.py for every directory prefix. */
function buildFiles(family: LanguageFamily, entries: Entry[]): string[] {
  const paths = new Set<string>();
  for (const e of entries) {
    if (family === 'js') {
      // Dedupe by stem so `a.ts` and `a.js` never coexist (that would make `./a` ambiguous).
      paths.add([...e.dirs, e.stem].join('/') + e.ext);
    } else {
      paths.add([...e.dirs, e.stem].join('/') + '.py');
      for (let k = 1; k <= e.dirs.length; k++) {
        paths.add([...e.dirs.slice(0, k), '__init__.py'].join('/'));
      }
    }
  }
  // Keep only one path per JS stem, regardless of extension.
  if (family === 'js') {
    const seen = new Set<string>();
    return [...paths].filter((p) => {
      const key = p.replace(/\.(tsx|jsx|ts|js)$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return [...paths];
}

/** `./x/y` form, extension removed, computed with posix paths. */
function jsSpecifier(source: string, target: string, ext: string): string {
  const stem = target.slice(0, -ext.length);
  const rel = posix.relative(posix.dirname(source), stem);
  return rel.startsWith('.') ? rel : './' + rel;
}

/** Leading-dot form. One dot is the source directory, each extra dot climbs one level. */
function pySpecifier(source: string, target: string): string {
  const srcDir = posix.dirname(source) === '.' ? [] : posix.dirname(source).split('/');
  const tgtParts = target.endsWith('/__init__.py')
    ? target.slice(0, -'/__init__.py'.length).split('/')
    : target.slice(0, -'.py'.length).split('/');
  let c = 0;
  while (c < srcDir.length && c < tgtParts.length && srcDir[c] === tgtParts[c]) c++;
  const dots = srcDir.length - c + 1;
  return '.'.repeat(dots) + tgtParts.slice(c).join('.');
}

const scenario = fc
  .record({
    family: fc.constantFrom<LanguageFamily>('js', 'py'),
    entries: fc.array(fc.oneof(jsEntry, pyEntry), { minLength: 2, maxLength: 8 }),
    srcIdx: fc.nat(),
    tgtIdx: fc.nat(),
  })
  .map(({ family, entries, srcIdx, tgtIdx }) => {
    const pool = entries.filter((e) => (family === 'js' ? e.ext !== '.py' : e.ext === '.py'));
    const files = buildFiles(family, pool);
    return { family, files, source: files[srcIdx % Math.max(files.length, 1)], target: files[tgtIdx % Math.max(files.length, 1)] };
  })
  .filter((s) => s.files.length >= 2);

describe('resolveImport relative round trip (Property 14)', () => {
  it('resolves a relative specifier built from source to target back to the target', () => {
    fc.assert(
      fc.property(scenario, ({ family, files, source, target }) => {
        const selected = new Set(files);
        const spec =
          family === 'js'
            ? jsSpecifier(source, target, target.match(/\.(tsx|jsx|ts|js)$/)![0])
            : pySpecifier(source, target);
        const actual = resolveImport({ specifier: spec, type: 'import' }, source, family, selected);
        expect(actual, `source=${source} target=${target} specifier=${spec}`).toBe(target);
      }),
      { numRuns: 300 },
    );
  });
});
