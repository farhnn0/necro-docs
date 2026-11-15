import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { INGEST_ERROR_STATUS, type IngestErrorCode } from '@/lib/constants';
import { IngestError } from '@/lib/ingest/errors';
import { mapGitHubError } from '@/lib/ingest/github';

/**
 * Feature: github-ingest-coderot, Property 4: GitHub error mapping is total and consistent
 *
 * For any status 100–599, any x-ratelimit-remaining / retry-after header combination,
 * any context, and any GitHub message, mapGitHubError follows the ordered mapping table
 * and the returned status equals INGEST_ERROR_STATUS[code].
 *
 * **Validates: Requirements 2.4, 2.5, 3.5, 12.1, 12.2, 12.3, 12.4, 14.6**
 */

type Ctx = 'repository' | 'other';

interface Input {
  status: number;
  remaining: string | undefined;
  retryAfter: string | undefined;
  ctx: Ctx;
  message: string | undefined;
}

// Independent oracle: the ordered mapping table from design.md, written out separately from the source.
function expectedCode(i: Input): IngestErrorCode {
  if (i.status === 401) return 'INVALID_GITHUB_TOKEN';
  if (
    i.status === 429 ||
    (i.status === 403 && (i.remaining === '0' || i.retryAfter !== undefined))
  ) {
    return 'GITHUB_RATE_LIMIT';
  }
  if (i.status === 404 && i.ctx === 'repository') return 'REPOSITORY_NOT_FOUND';
  if (i.status >= 400 && i.status <= 499) return 'GITHUB_REQUEST_ERROR';
  if (i.status >= 500 && i.status <= 599) return 'GITHUB_SERVICE_UNAVAILABLE';
  return 'GITHUB_API_ERROR';
}

const inputArb: fc.Arbitrary<Input> = fc.record({
  status: fc.oneof(
    fc.integer({ min: 100, max: 599 }),
    // Bias toward the statuses that carry special rules.
    fc.constantFrom(401, 403, 404, 429, 400, 500, 503, 302),
  ),
  remaining: fc.option(fc.constantFrom('0', '1', '59'), { nil: undefined }),
  retryAfter: fc.option(fc.constantFrom('0', '30', '60'), { nil: undefined }),
  ctx: fc.constantFrom<Ctx>('repository', 'other'),
  // Non-empty: the implementation omits the message detail when it is an empty string.
  message: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
});

function toResponse(i: Input): { status: number; headers: Headers; message?: string } {
  const headers = new Headers();
  if (i.remaining !== undefined) headers.set('x-ratelimit-remaining', i.remaining);
  if (i.retryAfter !== undefined) headers.set('retry-after', i.retryAfter);
  return { status: i.status, headers, message: i.message };
}

describe('Property 4: GitHub error mapping is total and consistent', () => {
  it('maps every status/header/context combination per the ordered table', () => {
    fc.assert(
      fc.property(inputArb, (i) => {
        const err = mapGitHubError(toResponse(i), i.ctx);

        expect(err).toBeInstanceOf(IngestError);
        expect(err.code).toBe(expectedCode(i));
        // Status consistency with the single source of truth table.
        expect(err.status).toBe(INGEST_ERROR_STATUS[err.code]);
        expect(err.message.length).toBeGreaterThan(0);

        if (err.code === 'GITHUB_REQUEST_ERROR' && i.message !== undefined) {
          expect(err.message).toContain(i.message);
        }
      }),
      { numRuns: 500 },
    );
  });
});
