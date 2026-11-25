/**
 * Maps thrown errors to concise, actionable, secret-free tool error messages.
 * Never echoes request bodies, source, or patch contents.
 */
import { ZodError } from 'zod';
import { NO_CACHED_PATH_MESSAGE, NO_CACHED_URL_MESSAGE } from './cache';
import { ProxyError } from './proxy';

const SECRET_PATTERNS = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bAIza[A-Za-z0-9_-]{20,}/g,
];

export function redact(text: string): string {
  let out = text.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1');
  for (const p of SECRET_PATTERNS) out = out.replace(p, '[redacted]');
  return out;
}

const UNREACHABLE = 'Cannot reach Next application at NECRO_API_URL; start the Next application or check NECRO_API_URL';
const GENERIC = 'Unexpected error; check the MCP server stderr for details';
const MAX_UPSTREAM = 200;

const CODE_MESSAGES: Record<string, string> = {
  MISSING_REPOSITORY_URL: 'Repository URL is required; provide a valid GitHub repository URL',
  INVALID_URL_FORMAT: 'Repository URL is invalid: use https://github.com/owner/repo or owner/repo',
  NON_GITHUB_REPOSITORY: 'Only github.com repositories are supported',
  REPOSITORY_NOT_FOUND: 'Repository was not found or is not accessible',
  GITHUB_RATE_LIMIT: 'GitHub rate limit exceeded; wait and retry later',
  REQUEST_TIMEOUT: UNREACHABLE,
};

function fromProxy(err: ProxyError): string {
  if (err.kind === 'network' || err.kind === 'timeout') return UNREACHABLE;
  if (err.kind === 'shape') {
    return /patch/i.test(err.message)
      ? 'Next returned an invalid patch response'
      : 'Next returned an invalid analysis response';
  }
  if (err.upstreamCode && CODE_MESSAGES[err.upstreamCode]) return CODE_MESSAGES[err.upstreamCode];
  if (err.status === 429) return CODE_MESSAGES.GITHUB_RATE_LIMIT;
  const detail = err.upstreamMessage ? `: ${redact(err.upstreamMessage).slice(0, MAX_UPSTREAM)}` : '';
  return `Next application request failed (HTTP ${err.status ?? 'error'})${detail}`;
}

export function toToolError(err: unknown): string {
  if (err instanceof ProxyError) return fromProxy(err);
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const name = issue?.path.join('.') || 'input';
    return `Invalid argument '${name}': ${redact(issue?.message ?? 'invalid value')}`;
  }
  if (err instanceof Error && 'code' in err && typeof err.code === 'string' && CODE_MESSAGES[err.code]) {
    return CODE_MESSAGES[err.code];
  }
  if (err instanceof Error && (err.message === NO_CACHED_URL_MESSAGE || err.message === NO_CACHED_PATH_MESSAGE)) {
    return err.message;
  }
  return GENERIC;
}

export const errorResult = (err: unknown) => ({
  isError: true as const,
  content: [{ type: 'text' as const, text: toToolError(err) }],
});
