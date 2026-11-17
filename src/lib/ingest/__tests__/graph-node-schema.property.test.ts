import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { classifyLines, computeMetrics, computeRotScore, languageOf } from '../analyze';
import { buildNodes, type AnalyzedFile } from '../graph';

const RAW_MAX = 4000;
const PATHS = ['src/a.ts', 'src/lib/b.tsx', 'x/c.js', 'x/y/d.jsx', 'pkg/e.py', 'f.PY'];
const ANALYZED_AT = '2026-01-01T00:00:00.000Z';

// Mix of plain text, astral characters, lone surrogates, comment markers, and CRLF/CR/LF breaks.
const pieces = fc.constantFrom('a', ' ', '\t', '\n', '\r\n', '\r', '//c', '/*', '*/', '#h', '😀', '\uD800', '\uDC00', 'x = 1;');
const linesContent = fc.array(pieces, { maxLength: 60 }).map((p) => p.join(''));
const veryLong = fc.integer({ min: RAW_MAX + 1, max: 9000 }).map((n) => '😀'.repeat(Math.ceil(n / 2)).slice(0, n));

const contentArb = fc.oneof(
  { weight: 2, arbitrary: fc.constant('') },
  { weight: 3, arbitrary: fc.string() },
  { weight: 3, arbitrary: fc.array(fc.integer({ min: 0x10000, max: 0x10ffff }), { maxLength: 200 }).map((cps) => cps.map((c) => String.fromCodePoint(c)).join('')) },
  { weight: 3, arbitrary: linesContent },
  { weight: 1, arbitrary: veryLong },
);

const fileArb = fc.record({
  path: fc.constantFrom(...PATHS),
  content: contentArb,
  fetchTruncated: fc.boolean(),
});

describe('Property 17: node schema', () => {
  it('Feature: github-ingest-coderot, Property 17: Nodes satisfy the required schema for any file content', () => {
    fc.assert(
      fc.property(fileArb, ({ path, content, fetchTruncated }) => {
        const lang = languageOf(path)!;
        const stats = classifyLines(content, lang.family);
        const file: AnalyzedFile = {
          entry: { path, type: 'blob', mode: '100644', size: content.length },
          language: lang.language,
          content,
          fetchTruncated,
          stats,
        };
        const { nodes } = buildNodes([file], ANALYZED_AT);
        expect(nodes).toHaveLength(1);
        const n = nodes[0];

        // Required fields and types (Req 8.2-8.4, 13.1).
        expect(typeof n.id).toBe('string');
        expect(n.id).toBe(path);
        expect(n.path).toBe(path);
        expect(n.name).toBe(path.split('/').pop());
        expect(['TypeScript', 'JavaScript', 'Python']).toContain(n.language);
        expect(n.analyzedAt).toBe(ANALYZED_AT);
        expect(typeof n.isTruncated).toBe('boolean');

        // Numbers are finite and in range.
        const metrics = computeMetrics(stats);
        const score = computeRotScore(metrics);
        expect(Number.isInteger(n.rotScore)).toBe(true);
        expect(n.rotScore).toBeGreaterThanOrEqual(0);
        expect(n.rotScore).toBeLessThanOrEqual(100);
        expect(n.rotScore).toBe(score);
        for (const v of [n.rotScore, n.linesOfCode, n.importCount, n.exportCount]) {
          expect(Number.isFinite(v)).toBe(true);
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
        const sm = n.summaryMetrics;
        for (const v of [sm.nestingDepth, sm.commentRatio, sm.fileSize]) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
        }
        expect(sm.commentRatio).toBeLessThanOrEqual(100);
        expect(sm.fileSize).toBe(content.length);

        // rawContent is a bounded, well-formed prefix of the content.
        expect(typeof n.rawContent).toBe('string');
        expect(n.rawContent.length).toBeLessThanOrEqual(RAW_MAX);
        if (content.isWellFormed()) {
          expect(n.rawContent.isWellFormed()).toBe(true);
        }
        expect(content.startsWith(n.rawContent)).toBe(true);

        // isTruncated is true exactly when the fetch was truncated or content exceeds 4000 chars.
        expect(n.isTruncated).toBe(fetchTruncated || content.length > RAW_MAX);
      }),
      { numRuns: 200 },
    );
  });
});
