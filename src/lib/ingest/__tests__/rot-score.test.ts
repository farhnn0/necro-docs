import { describe, expect, it } from 'vitest';
import { classifyLines, computeMetrics, computeRotScore } from '@/lib/ingest/analyze';

function scoreOf(content: string, family: 'js' | 'py' = 'js'): number {
  return computeRotScore(computeMetrics(classifyLines(content, family)));
}

describe('computeRotScore examples (Req 7.5, 7.6)', () => {
  it('scores LOC 200, depth 4, comment ratio 20 as 49', () => {
    // raw = 50 + min(200/100, 25) + min(4/5, 15) - min(20/5, 10) = 48.8 -> 49
    const score = computeRotScore({ linesOfCode: 200, nestingDepth: 4, commentRatio: 20, totalLines: 250 });
    expect(score).toBe(49);
  });

  it('scores a 4-line file as 10 regardless of content', () => {
    const content = 'a();\nb();\nc();\nd();';
    expect(scoreOf(content)).toBe(10);
    expect(computeRotScore({ linesOfCode: 4, nestingDepth: 0, commentRatio: 0, totalLines: 4 })).toBe(10);
  });
});

describe('empty input', () => {
  it('classifies empty content as 0 lines and scores it 10 with no NaN fields', () => {
    const stats = classifyLines('', 'js');
    expect(stats.totalLines).toBe(0);
    expect(stats.codeLines).toBe(0);

    const metrics = computeMetrics(stats);
    expect(metrics.totalLines).toBe(0);
    expect(metrics.commentRatio).toBe(0);

    const score = computeRotScore(metrics);
    expect(score).toBe(10);

    for (const value of [...Object.values(stats).filter((v) => typeof v === 'number'), ...Object.values(metrics), score]) {
      expect(Number.isNaN(value)).toBe(false);
    }
  });
});

describe('line endings', () => {
  const sample = '// header\nconst a = 1;\nfunction f() {\n  return a;\n}\n/* block\n */\nexport default f;\n';

  it('classifies CRLF the same as LF', () => {
    const lf = classifyLines(sample, 'js');
    const crlf = classifyLines(sample.replace(/\n/g, '\r\n'), 'js');
    expect(crlf).toEqual(lf);
    expect(computeRotScore(computeMetrics(crlf))).toBe(computeRotScore(computeMetrics(lf)));
  });

  it('classifies lone CR the same as LF', () => {
    const lf = classifyLines(sample, 'js');
    const cr = classifyLines(sample.replace(/\n/g, '\r'), 'js');
    expect(cr).toEqual(lf);
  });
});
