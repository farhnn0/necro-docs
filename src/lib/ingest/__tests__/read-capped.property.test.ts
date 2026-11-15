import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readCapped } from '../github';

/**
 * Feature: github-ingest-coderot, Property 9: Capped read returns an exact prefix
 *
 * For any byte sequence, for any split of it into stream chunks, and for any cap m >= 0,
 * readCapped returns exactly the first min(m, length) bytes, and reports truncated if and
 * only if length > m. When length <= m the returned bytes equal the input, unmodified.
 *
 * **Validates: Requirements 5.4, 5.6**
 */

function toStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks.shift();
      if (next === undefined) controller.close();
      else controller.enqueue(next);
    },
  });
}

/** Splits `data` at the given cut points. Empty chunks are allowed on purpose. */
function splitAt(data: Uint8Array, cuts: number[]): Uint8Array[] {
  const points = [...new Set(cuts.map((c) => Math.min(c, data.length)))].sort((a, b) => a - b);
  const out: Uint8Array[] = [];
  let prev = 0;
  for (const p of points) {
    out.push(data.slice(prev, p));
    prev = p;
  }
  out.push(data.slice(prev));
  return out;
}

const bytesArb = fc.uint8Array({ minLength: 0, maxLength: 300 });
const cutsArb = fc.array(fc.integer({ min: 0, max: 300 }), { maxLength: 12 });
const capArb = fc.integer({ min: 0, max: 320 });

describe('readCapped property', () => {
  it('returns an exact prefix and a correct truncated flag for any chunking and cap', async () => {
    await fc.assert(
      fc.asyncProperty(bytesArb, cutsArb, capArb, async (data, cuts, cap) => {
        const chunks = splitAt(data, cuts);
        const { bytes, truncated } = await readCapped(toStream(chunks), cap);

        const expected = data.subarray(0, Math.min(cap, data.length));
        expect(Array.from(bytes)).toEqual(Array.from(expected));
        expect(truncated).toBe(data.length > cap);
      }),
      { numRuns: 200 },
    );
  });

  it('returns empty bytes and not truncated for a null body', async () => {
    await fc.assert(
      fc.asyncProperty(capArb, async (cap) => {
        const result = await readCapped(null, cap);
        expect(result.bytes.length).toBe(0);
        expect(result.truncated).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
