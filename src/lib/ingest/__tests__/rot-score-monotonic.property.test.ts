import { describe, it } from 'vitest';
import fc from 'fast-check';
import { computeRotScore, type FileMetrics } from '../analyze';

/**
 * Feature: github-ingest-coderot, Property 13: Rot score is monotonic in each metric
 *
 * For any metrics with totalLines >= 5, increasing linesOfCode or nestingDepth never
 * lowers the score, and increasing commentRatio never raises it, with the other
 * metrics held fixed.
 *
 * Validates: Requirements 7.5
 */
describe('computeRotScore monotonicity', () => {
  const metricsArb: fc.Arbitrary<FileMetrics> = fc.record({
    totalLines: fc.integer({ min: 5, max: 5000 }),
    linesOfCode: fc.integer({ min: 0, max: 5000 }),
    nestingDepth: fc.integer({ min: 0, max: 50 }),
    commentRatio: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  });

  it('never lowers the score when linesOfCode or nestingDepth rise, and never raises it when commentRatio rises', () => {
    fc.assert(
      fc.property(
        metricsArb,
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 50 }),
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        (m, dLoc, dNest, dComment) => {
          const base = computeRotScore(m);

          const moreLoc = computeRotScore({ ...m, linesOfCode: m.linesOfCode + dLoc });
          if (moreLoc < base) return false;

          const moreNest = computeRotScore({ ...m, nestingDepth: m.nestingDepth + dNest });
          if (moreNest < base) return false;

          const moreComment = computeRotScore({
            ...m,
            commentRatio: Math.min(100, m.commentRatio + dComment),
          });
          if (moreComment > base) return false;

          return true;
        },
      ),
      { numRuns: 500 },
    );
  });
});
