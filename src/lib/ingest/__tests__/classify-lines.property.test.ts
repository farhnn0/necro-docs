import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { classifyLines, computeMetrics, type LanguageFamily } from '@/lib/ingest/analyze';

// Feature: github-ingest-coderot, Property 11: Line classification partitions the file and metrics stay in range
// **Validates: Requirements 7.2, 7.3, 7.4**

// Fragments never contain a line break; separators are the three accepted line endings.
const FRAGMENTS = [
  '',
  '   ',
  '\t\tdeep',
  '    indented',
  '  two',
  'const x = 1;',
  'import a from "./a";',
  '// line comment',
  '/* block */',
  '/* opens',
  ' * inside block',
  '*/',
  '*/ const y = 2;',
  '# python comment',
  'def f():',
  '    return 1',
];

const SEPARATORS = ['\n', '\r\n', '\r'] as const;

const contentArb = fc.record({
  lines: fc.array(fc.constantFrom(...FRAGMENTS), { maxLength: 40 }),
  seps: fc.array(fc.constantFrom(...SEPARATORS), { minLength: 40, maxLength: 40 }),
  trailing: fc.option(fc.constantFrom(...SEPARATORS), { nil: undefined }),
  family: fc.constantFrom<LanguageFamily>('js', 'py'),
});

/** Independent restatement of the split rule: split on any line ending, drop one trailing empty element. */
function expectedTotalLines(content: string): number {
  const parts = content.split(/\r\n|\r|\n/);
  if (parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

describe('classifyLines / computeMetrics properties', () => {
  it('partitions lines, keeps metrics in range, and matches the line split rules', () => {
    fc.assert(
      fc.property(contentArb, ({ lines, seps, trailing, family }) => {
        let content = '';
        lines.forEach((line, i) => {
          content += line;
          if (i < lines.length - 1) content += seps[i];
        });
        if (trailing !== undefined && lines.length > 0) content += trailing;

        const stats = classifyLines(content, family);
        const m = computeMetrics(stats);

        // Partition: every line is exactly one kind.
        expect(stats.blankLines + stats.commentLines + stats.codeLines).toBe(stats.totalLines);

        // Line count follows the split rules (trailing empty element dropped).
        // Adjacent separators such as "\r" + "\n" merge into one break, so the count is
        // derived from the content rather than from lines.length.
        expect(stats.totalLines).toBe(expectedTotalLines(content));

        // Non-negative counts.
        expect(stats.blankLines).toBeGreaterThanOrEqual(0);
        expect(stats.commentLines).toBeGreaterThanOrEqual(0);
        expect(stats.codeLines).toBeGreaterThanOrEqual(0);
        expect(stats.nestingDepth).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(stats.nestingDepth)).toBe(true);

        // Metrics mirror the stats and stay in range.
        expect(m.linesOfCode).toBe(stats.codeLines);
        expect(m.totalLines).toBe(stats.totalLines);
        expect(m.commentRatio).toBeGreaterThanOrEqual(0);
        expect(m.commentRatio).toBeLessThanOrEqual(100);
        expect(Number(m.commentRatio.toFixed(2))).toBe(m.commentRatio);
        if (stats.totalLines === 0) expect(m.commentRatio).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
