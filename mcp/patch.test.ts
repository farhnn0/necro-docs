import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { derivePatchResult, parsePatchResponse } from './patch';
import type { PatchEndpointResponse } from './types';

const base: PatchEndpointResponse = { summary: 'proposal', patchedCode: 'b', provider: 'ai', fixed: [], remaining: [] };
const keysDeep = (v: unknown): string[] =>
  v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...keysDeep(x)]) : [];

function expectProposalOnly(result: unknown) {
  const keys = keysDeep(result).map((k) => k.toLowerCase());
  expect(keys).not.toContain('autoapprove');
  expect(keys.filter((k) => /appl(y|ied)|written|commit|branch|pullrequest/.test(k))).toEqual([]);
}

describe('derivePatchResult', () => {
  it('accepts a changed patch that fixed findings with none remaining', () => {
    const r = derivePatchResult('a', { ...base, fixed: ['x', 'y'] });
    expect(r.verification).toMatchObject({ status: 'verified-change', changed: true, fixedCount: 2, remainingCount: 0, patchableFindingsRemain: false, aiOutputUnverified: false });
    expect(r.edits).toEqual({ changed: true, originalLength: 1, patchedLength: 1 });
    expect(r).toHaveProperty('patchedCode', 'b');
    expectProposalOnly(r);
  });

  it('flags changed code with remaining findings', () => {
    const r = derivePatchResult('a', { ...base, fixed: ['x'], remaining: ['z'] });
    expect(r.verification).toMatchObject({ status: 'changed-with-remaining-findings', changed: true, fixedCount: 1, remainingCount: 1, patchableFindingsRemain: true });
    expectProposalOnly(r);
  });

  it('reports unchanged static fallback as no-change', () => {
    const r = derivePatchResult('same', { ...base, patchedCode: 'same', provider: 'static-fallback', remaining: ['z'] });
    expect(r.verification).toMatchObject({ status: 'no-change', changed: false, remainingCount: 1, aiOutputUnverified: false });
    expect(r.edits.changed).toBe(false);
    expect(r).not.toHaveProperty('patchedCode');
    expectProposalOnly(r);
  });

  it('handles empty fixed and remaining arrays', () => {
    const changed = derivePatchResult('a', base);
    expect(changed.verification).toMatchObject({ status: 'changed-with-remaining-findings', fixedCount: 0, remainingCount: 0, aiOutputUnverified: true });
    expect(derivePatchResult('a', { ...base, patchedCode: 'a' }).verification.status).toBe('no-change');
  });

  it('property: changed === (patched !== original) and no-change when equal', () => {
    // Feature: mcp-server, Property 6
    fc.assert(
      fc.property(
        fc.string(), fc.string(), fc.constantFrom('ai', 'static-fallback' as const),
        fc.array(fc.string()), fc.array(fc.string()),
        (original, patched, provider, fixed, remaining) => {
          const r = derivePatchResult(original, { summary: 's', patchedCode: patched, provider: provider as 'ai', fixed, remaining });
          expect(r.verification.changed).toBe(patched !== original);
          expect(r.verification.fixedCount).toBe(fixed.length);
          expect(r.verification.remainingCount).toBe(remaining.length);
          if (patched === original) {
            expect(r.verification.status).toBe('no-change');
            expect(r).not.toHaveProperty('patchedCode');
          } else {
            expect(r).toHaveProperty('patchedCode', patched);
          }
          expectProposalOnly(r);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('parsePatchResponse', () => {
  it('accepts a valid body', () => {
    expect(parsePatchResponse(base)).toEqual(base);
  });

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'x'],
    ['missing summary', { ...base, summary: undefined }],
    ['non-string patchedCode', { ...base, patchedCode: 1 }],
    ['unknown provider', { ...base, provider: 'other' }],
    ['non-array fixed', { ...base, fixed: 'x' }],
    ['non-string remaining item', { ...base, remaining: [1] }],
  ])('rejects malformed response: %s', (_n, body) => {
    expect(() => parsePatchResponse(body)).toThrow('invalid patch response');
  });

  it('drops extra fields such as autoApprove', () => {
    expect(Object.keys(parsePatchResponse({ ...base, autoApprove: true }))).not.toContain('autoApprove');
  });
});
