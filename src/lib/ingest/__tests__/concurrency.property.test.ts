import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { mapWithConcurrency } from '@/lib/utils';

// Feature: github-ingest-coderot, Property 8: Bounded concurrency preserves order and completeness
// **Validates: Requirements 5.2**
describe('mapWithConcurrency bounded concurrency', () => {
  it('keeps input order, never exceeds the limit, and processes each item exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 1000 }), { maxLength: 30 }),
        fc.integer({ min: 1, max: 8 }),
        fc.array(fc.integer({ min: 0, max: 2 }), { maxLength: 30 }),
        async (items, limit, delays) => {
          let inFlight = 0;
          let maxInFlight = 0;
          const calls = new Array<number>(items.length).fill(0);

          const results = await mapWithConcurrency(items, limit, async (item, i) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            calls[i]++;
            await new Promise<void>((resolve) => setTimeout(resolve, delays[i] ?? 0));
            inFlight--;
            return item * 2;
          });

          expect(results).toEqual(items.map((item) => item * 2));
          expect(maxInFlight).toBeLessThanOrEqual(limit);
          expect(calls.every((count) => count === 1)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  }, 60_000);
});
