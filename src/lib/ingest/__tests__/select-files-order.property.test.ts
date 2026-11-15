import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

import { INGEST_CONFIG } from '@/lib/constants';

import { IngestError } from '../errors';
import type { TreeEntry } from '../github';
import { selectCodeFiles } from '../select-files';

// Independent oracle for the eligibility rules in the design (Req 4.1, 4.2).
const SUPPORTED = new Set<string>(INGEST_CONFIG.SUPPORTED_EXTENSIONS);
const EXCLUDED_DIRS = new Set<string>(INGEST_CONFIG.EXCLUDED_DIRS);
const NAME_RES = [/\.config\./i, /\.test\./i, /\.spec\./i, /^test_.*\.py$/i, /_test\.py$/i];

function oracleEligible(e: TreeEntry): boolean {
  if (e.type !== 'blob' || e.mode === '120000' || !e.size || e.size <= 0) return false;
  const segs = e.path.split('/');
  const name = segs[segs.length - 1];
  const dot = name.lastIndexOf('.');
  if (dot < 0 || !SUPPORTED.has(name.slice(dot).toLowerCase())) return false;
  if (segs.slice(0, -1).some((s) => EXCLUDED_DIRS.has(s))) return false;
  return !NAME_RES.some((re) => re.test(name));
}

const cmp = (a: TreeEntry, b: TreeEntry): number =>
  a.size! - b.size! || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

const dirArb = fc.constantFrom('src', 'lib', 'node_modules', 'dist', 'tests', '__tests__', 'app');
const nameArb = fc.constantFrom(
  'a.ts', 'b.tsx', 'c.js', 'd.jsx', 'e.py', 'F.TS', 'index.ts', 'x.md', 'y.json',
  'z.test.ts', 'w.config.js', 'v.spec.ts', 'test_u.py', 't_test.py', 'noext', 'q.go',
);

const entryArb: fc.Arbitrary<TreeEntry> = fc
  .record({
    dirs: fc.array(dirArb, { maxLength: 2 }),
    name: nameArb,
    type: fc.constantFrom('blob', 'blob', 'blob', 'tree', 'commit') as fc.Arbitrary<'blob' | 'tree' | 'commit'>,
    mode: fc.constantFrom('100644', '100644', '100755', '120000'),
    // Small size range forces many ties so the path tie-break is exercised.
    size: fc.option(fc.integer({ min: 0, max: 12 }), { nil: undefined }),
  })
  .map(({ dirs, name, type, mode, size }) => ({
    path: [...dirs, name].join('/'),
    type,
    mode,
    size,
  }));

// Paths must be unique so the expected order is unambiguous.
const entriesArb = fc.uniqueArray(entryArb, {
  selector: (e) => e.path,
  maxLength: 80,
});

describe('selectCodeFiles order and size (Property 6)', () => {
  // Feature: github-ingest-coderot, Property 6: File selection takes the smallest eligible files, in order
  // Validates: Requirements 4.1, 4.3, 4.4, 4.6
  it('returns the smallest eligible prefix, sorted by (size, path), capped at MAX_FILES', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const eligible = entries.filter(oracleEligible).sort(cmp);

        if (eligible.length === 0) {
          expect(() => selectCodeFiles(entries)).toThrow(IngestError);
          return;
        }

        const { files, criteria } = selectCodeFiles(entries);
        const expected = eligible.slice(0, INGEST_CONFIG.MAX_FILES);

        // Count: min(25, eligibleCount)
        expect(files.length).toBeLessThanOrEqual(INGEST_CONFIG.MAX_FILES);
        expect(files.length).toBe(expected.length);
        expect(criteria.eligibleCount).toBe(eligible.length);
        expect(criteria.selectedCount).toBe(files.length);

        // Only eligible entries, in (size, path) ascending order, and exactly the smallest prefix.
        expect(files.every(oracleEligible)).toBe(true);
        expect(files.map((f) => f.path)).toEqual(expected.map((f) => f.path));
        for (let i = 1; i < files.length; i++) {
          expect(cmp(files[i - 1], files[i])).toBeLessThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});
