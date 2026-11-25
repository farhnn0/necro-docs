import { describe, expect, it } from 'vitest';
import { createIngestErrorState, ingestErrorHelp, ingestErrorMessage } from './helpers';

describe('ingestErrorHelp', () => {
  it('tells the user when the GitHub rate limit resets', () => {
    const help = ingestErrorHelp('GITHUB_RATE_LIMIT', { resetAt: '2026-01-01T00:12:00Z' }, Date.parse('2026-01-01T00:00:30Z'));
    expect(help.hint).toMatch(/^The limit resets in about 12 min\. .*GITHUB_TOKEN/);
    expect(ingestErrorHelp('GITHUB_RATE_LIMIT', { resetAt: null }).hint).toMatch(/^A GITHUB_TOKEN/);
  });

  it('offers the GitHub App only for repositories that may be private', () => {
    expect(ingestErrorHelp('REPOSITORY_NOT_FOUND').connectGithub).toBe(true);
    expect(ingestErrorHelp('NO_CODE_FILES_FOUND').connectGithub).toBeUndefined();
    expect(ingestErrorHelp('NO_CODE_FILES_FOUND').hint).toContain('.py');
  });

  it('keeps createIngestErrorState and ingestErrorMessage in sync', () => {
    expect(createIngestErrorState('NON_GITHUB_REPOSITORY', 'gitlab.com/a/b')).toMatchObject({ status: 'error', title: 'Only GitHub is supported', message: ingestErrorMessage('NON_GITHUB_REPOSITORY'), repository: 'gitlab.com/a/b' });
  });
});
