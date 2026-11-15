import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseRepositoryUrl } from '@/lib/ingest/github';
import { IngestError } from '@/lib/ingest/errors';

const NAME_RE = /^[A-Za-z0-9_.-]+$/;
const isDotsOnly = (s: string) => /^\.+$/.test(s);
const ALLOWED_CODES = new Set(['INVALID_URL_FORMAT', 'NON_GITHUB_REPOSITORY']);

const nameChars = fc.stringMatching(/^[A-Za-z0-9_.-]{1,20}$/).filter((s) => !isDotsOnly(s));
const pathSegment = fc.stringMatching(/^[A-Za-z0-9_.\/-]{0,30}$/);

// Random text, including URL-like noise.
const arbitraryString = fc.string({ maxLength: 200 }).map((input) => ({ input, expected: null as string | null }));

// Non-http(s) protocols: must be rejected as INVALID_URL_FORMAT before host checks.
const nonHttpUrl = fc
  .tuple(
    fc.constantFrom('ftp:', 'ws:', 'wss:', 'file:', 'javascript:', 'mailto:', 'ssh:', 'git:'),
    pathSegment,
  )
  .map(([proto, rest]) => ({ input: `${proto}//github.com/${rest}`, expected: 'INVALID_URL_FORMAT' as string | null }));

// Well-formed http(s) URLs with a non-GitHub host: must be NON_GITHUB_REPOSITORY.
const nonGithubHostUrl = fc
  .tuple(
    fc.domain().filter((d) => d !== 'github.com' && d !== 'www.github.com'),
    fc.constantFrom('http:', 'https:'),
    nameChars,
    nameChars,
  )
  .map(([host, proto, owner, repo]) => ({
    input: `${proto}//${host}/${owner}/${repo}`,
    expected: 'NON_GITHUB_REPOSITORY' as string | null,
  }));

// GitHub-host URLs with arbitrary owner/repo names: the safety check must hold.
const githubUrl = fc
  .tuple(fc.constantFrom('github.com', 'www.github.com', 'GitHub.com'), pathSegment, pathSegment)
  .map(([host, a, b]) => ({ input: `https://${host}/${a}/${b}`, expected: null as string | null }));

const caseArb = fc.oneof(arbitraryString, nonHttpUrl, nonGithubHostUrl, githubUrl);

describe('parseRepositoryUrl safety (Property 2)', () => {
  it('never yields unsafe identifiers and classifies every rejection', () => {
    // Feature: github-ingest-coderot, Property 2: URL parsing never yields unsafe identifiers and classifies every rejection
    // **Validates: Requirements 1.4, 1.5**
    fc.assert(
      fc.property(caseArb, ({ input, expected }) => {
        try {
          const { owner, repo } = parseRepositoryUrl(input);
          expect(owner).toMatch(NAME_RE);
          expect(repo).toMatch(NAME_RE);
          expect(isDotsOnly(owner)).toBe(false);
          expect(isDotsOnly(repo)).toBe(false);
          expect(expected).toBeNull();
        } catch (e) {
          expect(e).toBeInstanceOf(IngestError);
          const code = (e as IngestError).code;
          expect(ALLOWED_CODES.has(code)).toBe(true);
          if (expected !== null) expect(code).toBe(expected);
        }
      }),
      { numRuns: 500 },
    );
  });
});
