import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseRepositoryUrl } from '../github';

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-'];

// Owner/repo names matching /^[A-Za-z0-9_.-]+$/, excluding dot-only names.
// Repo names ending in ".git" are excluded because the parser strips that suffix.
const nameArb = fc
  .array(fc.constantFrom(...ALPHABET), { minLength: 1, maxLength: 30 })
  .map((chars) => chars.join(''))
  .filter((s) => !/^\.+$/.test(s));

const repoArb = nameArb.filter((s) => !s.endsWith('.git'));

const suffixArb = fc.record({
  trailingSlash: fc.boolean(),
  query: fc.option(fc.constantFrom('a=1', 'tab=code', 'x=y&z=w'), { nil: undefined }),
  fragment: fc.option(fc.constantFrom('readme', 'L10', 'top'), { nil: undefined }),
});

describe('Property 1: Repository URL round trip', () => {
  // Feature: github-ingest-coderot, Property 1: Repository URL round trip
  // **Validates: Requirements 1.6**
  it('parseRepositoryUrl returns the owner and repo embedded in https://github.com/{owner}/{repo} with optional trailing slash, query, or fragment', () => {
    fc.assert(
      fc.property(nameArb, repoArb, suffixArb, (owner, repo, opts) => {
        let url = `https://github.com/${owner}/${repo}`;
        if (opts.trailingSlash) url += '/';
        if (opts.query) url += `?${opts.query}`;
        if (opts.fragment) url += `#${opts.fragment}`;
        expect(parseRepositoryUrl(url)).toEqual({ owner, repo });
      }),
      { numRuns: 200 },
    );
  });
});
