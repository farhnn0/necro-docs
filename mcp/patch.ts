/**
 * Pure helpers for synthesize_patch: validate the /api/patch body and derive the MCP result.
 * Proposal only: nothing here applies code, approves, branches, commits, or opens a PR.
 */
import type { PatchEndpointResponse, PatchResult, VerificationStatus } from './types';

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

export function parsePatchResponse(body: unknown): PatchEndpointResponse {
  const b = body as Record<string, unknown> | null;
  if (
    b === null || typeof b !== 'object' || Array.isArray(b)
    || typeof b.summary !== 'string'
    || typeof b.patchedCode !== 'string'
    || (b.provider !== 'ai' && b.provider !== 'static-fallback')
    || !isStringArray(b.fixed)
    || !isStringArray(b.remaining)
  ) throw new Error('Next returned an invalid patch response');
  return { summary: b.summary, patchedCode: b.patchedCode, provider: b.provider, fixed: b.fixed, remaining: b.remaining };
}

export function derivePatchResult(originalCode: string, response: PatchEndpointResponse): PatchResult {
  const changed = response.patchedCode !== originalCode;
  const { fixed, remaining } = response;
  const status: VerificationStatus = !changed ? 'no-change' : fixed.length > 0 && remaining.length === 0 ? 'verified-change' : 'changed-with-remaining-findings';
  return {
    summary: response.summary,
    provider: response.provider,
    ...(changed ? { patchedCode: response.patchedCode } : {}),
    edits: { changed, originalLength: originalCode.length, patchedLength: response.patchedCode.length },
    verification: {
      status,
      changed,
      fixedCount: fixed.length,
      remainingCount: remaining.length,
      patchableFindingsRemain: remaining.length > 0,
      // AI output counts as verified only when the endpoint's rescan shows a change that resolved findings.
      aiOutputUnverified: response.provider === 'ai' && !(changed && fixed.length > 0),
    },
    fixed,
    remaining,
  };
}
