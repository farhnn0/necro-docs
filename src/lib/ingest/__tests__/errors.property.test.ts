import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { toErrorResponse, IngestError } from '../errors';
import { INGEST_ERROR_STATUS, type IngestErrorCode } from '@/lib/constants';

/**
 * Feature: github-ingest-coderot, Property 5: Error responses are well-formed and never leak the token
 *
 * For any thrown value and any non-empty token, toErrorResponse produces a body with
 * success: false, a non-empty string error.message, an object error.details, and meta.
 * A non-IngestError yields HTTP 500 ANALYSIS_FAILED. The token never appears in the body.
 *
 * Validates: Requirements 10.5, 12.6, 14.5
 */

const CODES = Object.keys(INGEST_ERROR_STATUS) as IngestErrorCode[];

// Realistic-looking token: long alphanumeric, so it cannot collide with JSON keys or "[REDACTED]".
const tokenArb = fc
  .stringMatching(/^[A-Za-z0-9]{16,40}$/)
  .filter((t) => !/REDACTED|success|error|message|details|code|meta|timestamp|duration/.test(t));

const freeTextArb = fc.string({ maxLength: 40 });

// Thrown values, with the token optionally embedded in the message or details.
const thrownArb = (token: string): fc.Arbitrary<unknown> =>
  fc.oneof(
    fc
      .record({
        code: fc.constantFrom(...CODES),
        // Non-empty: every IngestError is raised with a human-readable message.
        text: fc.string({ minLength: 1, maxLength: 40 }),
        embed: fc.boolean(),
        detailKey: fc.stringMatching(/^[a-z]{1,8}$/),
      })
      .map(({ code, text, embed, detailKey }) =>
        new IngestError(code, embed ? `${text} ${token}` : text, {
          [detailKey]: embed ? `auth ${token}` : text,
        }),
      ),
    fc
      .record({ text: freeTextArb, embed: fc.boolean() })
      .map(({ text, embed }) => new Error(embed ? `${text}${token}` : text)),
    fc.oneof(freeTextArb.map((s) => `${s} ${token}`), fc.integer(), fc.constant(null)),
  );

describe('toErrorResponse (Property 5)', () => {
  it('returns a well-formed body and never leaks the token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await fc.assert(
        fc.asyncProperty(
          tokenArb.chain((token) => thrownArb(token).map((thrown) => ({ token, thrown }))),
          async ({ token, thrown }) => {
            const res = toErrorResponse(thrown, { token, startedAt: performance.now() });
            const raw = await res.text();
            const body = JSON.parse(raw);

            expect(body.success).toBe(false);
            expect(typeof body.error.code).toBe('string');
            expect(typeof body.error.message).toBe('string');
            expect(body.error.message.length).toBeGreaterThan(0);
            expect(typeof body.error.details).toBe('object');
            expect(body.error.details).not.toBeNull();
            expect(typeof body.meta.timestamp).toBe('number');
            expect(typeof body.meta.duration).toBe('number');

            if (thrown instanceof IngestError) {
              expect(res.status).toBe(INGEST_ERROR_STATUS[thrown.code]);
              expect(body.error.code).toBe(thrown.code);
            } else {
              expect(res.status).toBe(500);
              expect(body.error.code).toBe('ANALYSIS_FAILED');
            }

            expect(raw).not.toContain(token);
            expect(body.error.message).not.toContain(token);
          },
        ),
        { numRuns: 200 },
      );
    } finally {
      spy.mockRestore();
    }
  });
});
