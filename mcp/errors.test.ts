import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { NO_CACHED_URL_MESSAGE } from './cache';
import { redact, toToolError } from './errors';
import { ProxyError } from './proxy';

const http = (code: string, status = 400, msg = 'x') => new ProxyError('http', 'h', status, msg, code);

describe('toToolError', () => {
  it('gives a distinct message per class', () => {
    const zerr = z.object({ repoUrl: z.string() }).safeParse({}).error!;
    const msgs = [
      zerr,
      http('MISSING_REPOSITORY_URL'),
      http('INVALID_URL_FORMAT'),
      http('NON_GITHUB_REPOSITORY'),
      http('REPOSITORY_NOT_FOUND', 404),
      http('GITHUB_RATE_LIMIT', 429),
      new ProxyError('network', 'n'),
      new ProxyError('shape', 'Next returned an invalid analysis response'),
      new ProxyError('shape', 'Next returned an invalid patch response'),
      new Error(NO_CACHED_URL_MESSAGE),
      new Error('boom'),
    ].map(toToolError);
    expect(new Set(msgs).size).toBe(msgs.length);
    expect(msgs[0]).toContain("'repoUrl'");
  });

  it('treats timeout like unreachable and does not leak secrets', () => {
    expect(toToolError(new ProxyError('timeout', 't'))).toContain('NECRO_API_URL');
    const leaky = new ProxyError('http', 'h', 500, 'fail https://u:p@x.com ghp_' + 'a'.repeat(30), 'ANALYSIS_FAILED');
    const out = toToolError(leaky);
    expect(out).not.toMatch(/ghp_|u:p@/);
    expect(toToolError(new Error('sk-' + 'b'.repeat(30)))).not.toContain('sk-');
  });
});

describe('redact', () => {
  it('strips userinfo and token-like strings', () => {
    const s = redact(`https://user:tok@host/x github_pat_${'A'.repeat(25)} AIza${'c'.repeat(30)} sk-${'d'.repeat(20)}`);
    expect(s).toBe('https://host/x [redacted] [redacted] [redacted]');
  });
});
