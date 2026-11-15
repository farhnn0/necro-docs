import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEMO_REPOSITORIES } from '@/lib/constants';
import { IngestError } from '../errors';
import { parseIngestRequest } from '../request';

const DEMO_IDS = Object.keys(DEMO_REPOSITORIES) as (keyof typeof DEMO_REPOSITORIES)[];

/** Derives the expected owner/repo from the configured preset URL (respects DEMO*_REPO_URL overrides). */
function expectedFromPreset(url: string): { owner: string; repo: string; repositoryUrl: string } {
  const [owner, repo] = new URL(url).pathname.split('/').filter(Boolean);
  return { owner, repo, repositoryUrl: `https://github.com/${owner}/${repo}` };
}

function errorCodeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof IngestError ? e.code : `UNEXPECTED:${String(e)}`;
  }
}

type Scenario =
  | { kind: 'validDemo'; body: Record<string, unknown>; demoId: string }
  | { kind: 'unknownDemo'; body: Record<string, unknown> }
  | { kind: 'nonObject'; body: unknown }
  | { kind: 'missingUrl'; body: Record<string, unknown> }
  | { kind: 'nonStringUrl'; body: Record<string, unknown> };

const scenarioArb: fc.Arbitrary<Scenario> = fc.oneof(
  // Valid demo id: preset wins, repositoryUrl ignored (any value).
  fc.record({
    kind: fc.constant('validDemo' as const),
    demoId: fc.constantFrom(...DEMO_IDS),
    repositoryUrl: fc.anything(),
  }).map(({ kind, demoId, repositoryUrl }) => ({
    kind,
    demoId,
    body: { useDemo: true, demoId, repositoryUrl },
  })),
  // Unknown demo id (any non-key value, including non-strings).
  fc.record({
    kind: fc.constant('unknownDemo' as const),
    demoId: fc
      .oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined))
      .filter((v) => !(typeof v === 'string' && Object.hasOwn(DEMO_REPOSITORIES, v))),
  }).map(({ kind, demoId }) => ({ kind, body: { useDemo: true, demoId } })),
  // Non-object bodies.
  fc.record({
    kind: fc.constant('nonObject' as const),
    body: fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.array(fc.anything()),
    ),
  }),
  // Missing or null repositoryUrl (no demo).
  fc.record({
    kind: fc.constant('missingUrl' as const),
    useDemo: fc.constantFrom(false, undefined),
    repositoryUrl: fc.constantFrom(undefined, null),
  }).map(({ kind, useDemo, repositoryUrl }) => ({
    kind,
    body: { useDemo, repositoryUrl },
  })),
  // Present but non-string repositoryUrl (no demo).
  fc.record({
    kind: fc.constant('nonStringUrl' as const),
    repositoryUrl: fc.oneof(
      fc.integer(),
      fc.boolean(),
      fc.object(),
      fc.array(fc.anything()),
    ),
  }).map(({ kind, repositoryUrl }) => ({ kind, body: { useDemo: false, repositoryUrl } })),
);

describe('parseIngestRequest demo resolution', () => {
  // Feature: github-ingest-coderot, Property 3: Demo resolution
  // **Validates: Requirements 11.1, 11.3, 11.4**
  it('resolves demo ids to the preset, and classifies every other body', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        if (scenario.kind === 'validDemo') {
          const preset = DEMO_REPOSITORIES[scenario.demoId as keyof typeof DEMO_REPOSITORIES];
          const result = parseIngestRequest(scenario.body);
          expect(result).toEqual(expectedFromPreset(preset));
          return;
        }
        const expectedCode: Record<Exclude<Scenario['kind'], 'validDemo'>, string> = {
          unknownDemo: 'INVALID_DEMO_ID',
          nonObject: 'INVALID_REQUEST',
          missingUrl: 'MISSING_REPOSITORY_URL',
          nonStringUrl: 'INVALID_URL_FORMAT',
        };
        expect(errorCodeOf(() => parseIngestRequest(scenario.body))).toBe(
          expectedCode[scenario.kind],
        );
      }),
      { numRuns: 200 },
    );
  });
});
