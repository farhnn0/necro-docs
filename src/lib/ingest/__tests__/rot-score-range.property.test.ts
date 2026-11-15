import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeRotScore, type FileMetrics } from '@/lib/ingest/analyze';

/**
 * Feature: github-ingest-coderot, Property 12: Rot score is a bounded integer, and small files score 10
 *
 * **Validates: Requirements 7.1, 7.6, 13.5**
 */
describe('computeRotScore range (Property 12)', () => {
  const metricsArb: fc.Arbitrary<FileMetrics> = fc
    .record({
      totalLines: fc.oneof(
        fc.integer({ min: 0, max: 4 }), // small files
        fc.integer({ min: 0, max: 10_000 }),
      ),
      linesOfCode: fc.integer({ min: 0, max: 100_000 }),
      nestingDepth: fc.integer({ min: 0, max: 200 }),
      commentRatio: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    });

  it('returns an integer in [0, 100], and exactly 10 when totalLines < 5', () => {
    fc.assert(
      fc.property(metricsArb, (m) => {
        const score = computeRotScore(m);
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
        if (m.totalLines < 5) {
          expect(score).toBe(10);
        }
      }),
      { numRuns: 500 },
    );
  });
});
