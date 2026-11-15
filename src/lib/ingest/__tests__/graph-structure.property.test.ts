import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { posix } from 'node:path';
import { classifyLines, languageOf } from '../analyze';
import { buildEdges, buildNodes, type AnalyzedFile } from '../graph';

const EXTS = ['.ts', '.tsx', '.js'] as const;
const stripExt = (p: string) => p.replace(/\.(tsx|ts|jsx|js)$/, '');
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const relSpec = (from: string, to: string): string => {
  const r = posix.relative(posix.dirname(from), stripExt(to));
  return r.startsWith('.') ? r : `./${r}`;
};

const pathArb = fc
  .tuple(
    fc.constantFrom('src', 'src/lib', 'src/app/api', 'src/lib/ingest'),
    fc.stringMatching(/^[a-z]{1,4}$/),
    fc.constantFrom(...EXTS),
  )
  .map(([d, n, e]) => `${d}/${n}${e}`);

// n files; for each file, a list of import choices:
//   0..n-1 => import of that repo file, n => bare 'react' import, n+1 => escaping path
const graphInput = fc.integer({ min: 1, max: 8 }).chain((n) =>
  fc.tuple(
    fc.uniqueArray(pathArb, { minLength: n, maxLength: n, selector: stripExt }),
    fc.array(fc.array(fc.integer({ min: 0, max: n + 1 }), { maxLength: 5 }), { minLength: n, maxLength: n }),
  ),
);

function buildFiles(paths: string[], targets: number[][]): AnalyzedFile[] {
  const n = paths.length;
  return paths.map((p, i) => {
    const lines = [`// file ${p}`];
    for (const t of targets[i]) {
      if (t < n) {
        const spec = relSpec(p, paths[t]);
        lines.push(`// import Decoy from '${spec}';`);
        lines.push(`import m${lines.length} from '${spec}';`);
      } else if (t === n) {
        lines.push(`import React from 'react';`);
      } else {
        lines.push(`import esc from '../../../../escape';`);
      }
    }
    lines.push('export const v = 1;');
    const content = lines.join('\n');
    const lang = languageOf(p)!;
    return {
      entry: { path: p, type: 'blob', mode: '100644', size: content.length },
      language: lang.language,
      content,
      fetchTruncated: false,
      stats: classifyLines(content, lang.family),
    };
  });
}

describe('Property 16: graph structure', () => {
  it('Feature: github-ingest-coderot, Property 16: Graph structure is internally consistent', () => {
    fc.assert(
      fc.property(graphInput, ([paths, targets]) => {
        const files = buildFiles(paths, targets);
        const analyzedAt = '2026-01-01T00:00:00.000Z';
        const { nodes, relations } = buildNodes(files, analyzedAt);
        const edges = buildEdges(nodes, relations);

        // One node per file, ordered by path, isolated nodes kept (Req 6.7, 8.1).
        const nodeIds = nodes.map((n) => n.id);
        expect(nodeIds).toEqual([...paths].sort(cmp));

        const ids = new Set(nodeIds);

        // Edge endpoints are node ids, no self-loops, id format, unique ids (Req 9.1-9.4, 13.2).
        const edgeIds = new Set<string>();
        for (const e of edges) {
          expect(ids.has(e.source)).toBe(true);
          expect(ids.has(e.target)).toBe(true);
          expect(e.source).not.toBe(e.target);
          expect(e.id).toBe(`${e.source}→${e.target}`);
          expect(e.metadata.importCount).toBeGreaterThanOrEqual(1);
          expect(edgeIds.has(e.id)).toBe(false);
          edgeIds.add(e.id);
        }
        expect(edges.map((e) => e.id)).toEqual([...edges.map((e) => e.id)].sort(cmp));

        // Edge set equals the intended repo-internal, non-self imports, and
        // importCount sums to the number of such import statements (Req 9.5).
        const expectedPairs = new Set<string>();
        let expectedCount = 0;
        targets.forEach((list, i) => {
          for (const t of list) {
            if (t < paths.length && t !== i) {
              expectedPairs.add(`${paths[i]}→${paths[t]}`);
              expectedCount += 1;
            }
          }
        });
        expect(edgeIds).toEqual(expectedPairs);
        expect(edges.reduce((s, e) => s + e.metadata.importCount, 0)).toBe(expectedCount);

        // Deterministic: same input gives same output.
        const again = buildNodes(files, analyzedAt);
        expect(buildEdges(again.nodes, again.relations)).toEqual(edges);
      }),
      { numRuns: 200 },
    );
  });
});
