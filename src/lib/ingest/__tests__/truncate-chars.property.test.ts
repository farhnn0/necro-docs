import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { truncateChars } from '@/lib/ingest/analyze';

/**
 * Feature: github-ingest-coderot, Property 10: Character truncation is bounded, prefix-preserving, and well-formed
 *
 * **Validates: Requirements 8.2, 13.4**
 */

// Mixes raw UTF-16 code units (including lone surrogates) with astral characters
// so that surrogate-pair boundaries are hit often.
const astral = fc.constantFrom('😀', '\u{1F9DF}', '𝒳', '🧬');
const codeUnit = fc.integer({ min: 0, max: 0xffff }).map((n) => String.fromCharCode(n));
const chunk = fc.oneof({ weight: 3, arbitrary: codeUnit }, { weight: 2, arbitrary: astral }, { weight: 2, arbitrary: fc.string({ maxLength: 4 }) });
const mixedString = fc.array(chunk, { maxLength: 40 }).map((parts) => parts.join(''));

describe('truncateChars (Property 10)', () => {
  it('is bounded, prefix-preserving, flags truncation correctly, and keeps well-formed input well-formed', () => {
    fc.assert(
      fc.property(mixedString, fc.integer({ min: 0, max: 90 }), (s, max) => {
        const { text, truncated } = truncateChars(s, max);

        expect(text.length).toBeLessThanOrEqual(max);
        expect(s.startsWith(text)).toBe(true);
        expect(truncated).toBe(text.length < s.length);
        if (s.isWellFormed()) {
          expect(text.isWellFormed()).toBe(true);
        }
      }),
      { numRuns: 500 },
    );
  });
});
