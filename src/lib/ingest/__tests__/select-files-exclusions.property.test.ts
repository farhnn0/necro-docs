import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { INGEST_CONFIG } from '@/lib/constants';
import { IngestError } from '@/lib/ingest/errors';
import type { TreeEntry } from '@/lib/ingest/github';
import { selectCodeFiles } from '@/lib/ingest/select-files';

// Feature: github-ingest-coderot, Property 7: Excluded paths are never selected
// **Validates: Requirements 4.2**

// Independent oracle for "excluded", written from the spec rather than from select-files.ts.
const EXCLUDED_DIR_SET = new Set<string>(['node_modules', 'dist', 'build', '__tests__', 'tests', 'test']);
const EXCLUDED_NAME_RES: RegExp[] = [/\.config\./i, /\.test\./i, /\.spec\./i, /^test_.*\.py$/i, /_test\.py$/i];

function isExcludedPath(path: string): boolean {
  const segments = path.split('/');
  const name = segments[segments.length - 1];
  if (segments.slice(0, -1).some((s) => EXCLUDED_DIR_SET.has(s))) return true;
  return EXCLUDED_NAME_RES.some((re) => re.test(name));
}

const word = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/);
const supportedExt = fc.constantFrom(...INGEST_CONFIG.SUPPORTED_EXTENSIONS);
const excludedDir = fc.constantFrom(...EXCLUDED_DIR_SET);

// File names that match one of the excluded name patterns.
const excludedName = fc.oneof(
  fc.tuple(word, supportedExt).map(([b, e]) => `${b}.config${e}`),
  fc.tuple(word, supportedExt).map(([b, e]) => `${b}.test${e}`),
  fc.tuple(word, supportedExt).map(([b, e]) => `${b}.spec${e}`),
  word.map((b) => `test_${b}.py`),
  word.map((b) => `${b}_test.py`),
);

// Path with an excluded directory inserted at a random depth.
const pathWithExcludedDir = fc
  .tuple(fc.array(word, { maxLength: 3 }), excludedDir, word, supportedExt, fc.nat({ max: 3 }))
  .map(([dirs, d, b, e, i]) => {
    const segs = [...dirs];
    segs.splice(Math.min(i, segs.length), 0, d);
    return [...segs, `${b}${e}`].join('/');
  });

// Path whose file name matches an excluded pattern.
const pathWithExcludedName = fc
  .tuple(fc.array(word, { maxLength: 3 }), excludedName)
  .map(([dirs, n]) => [...dirs, n].join('/'));

// Ordinary paths, mixed in so the selector also sees eligible entries.
const anyPath = fc
  .tuple(fc.array(word, { maxLength: 3 }), word, supportedExt)
  .map(([dirs, b, e]) => [...dirs, `${b}${e}`].join('/'));

const toEntry = (path: string, size: number): TreeEntry => ({ path, type: 'blob', mode: '100644', size });
const sizeArb = fc.integer({ min: 1, max: 10_000 });

describe('selectCodeFiles exclusions (Property 7)', () => {
  it('never selects a path with an excluded directory or file name', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.oneof(pathWithExcludedDir, pathWithExcludedName), sizeArb), { minLength: 1, maxLength: 30 }),
        fc.array(fc.tuple(anyPath, sizeArb), { maxLength: 30 }),
        (excluded, others) => {
          const entries = [...excluded, ...others].map(([p, s]) => toEntry(p, s));
          let selected: TreeEntry[] = [];
          try {
            selected = selectCodeFiles(entries).files;
          } catch (err) {
            // No eligible file at all is a valid outcome; anything else is a real failure.
            if (!(err instanceof IngestError && err.code === 'NO_CODE_FILES_FOUND')) throw err;
          }
          expect(selected.filter((f) => isExcludedPath(f.path))).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });
});
