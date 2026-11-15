import { NextResponse } from 'next/server';
import { INGEST_ERROR_STATUS, type IngestErrorCode } from '@/lib/constants';
import type { ApiResponse } from '@/lib/types';

export class IngestError extends Error {
  readonly status: number;

  constructor(
    readonly code: IngestErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'IngestError';
    this.status = INGEST_ERROR_STATUS[code];
  }
}

/** Normalizes anything thrown into an IngestError. */
export function toIngestError(e: unknown, signal?: AbortSignal): IngestError {
  if (e instanceof IngestError) return e;
  if (signal?.aborted) {
    return new IngestError('REQUEST_TIMEOUT', 'The request timed out');
  }
  const message = e instanceof Error ? e.message : String(e);
  return new IngestError('ANALYSIS_FAILED', 'Failed to analyze repository', { error: message });
}

/** Replaces every occurrence of the token (raw and JSON-escaped) with [REDACTED]. */
function redact(text: string, token?: string): string {
  if (!token) return text;
  const escaped = JSON.stringify(token).slice(1, -1);
  return text.split(token).join('[REDACTED]').split(escaped).join('[REDACTED]');
}

export function toErrorResponse(
  e: unknown,
  ctx: { token?: string; startedAt: number },
): NextResponse {
  const err = toIngestError(e);
  const body: ApiResponse<null> = {
    success: false,
    error: { code: err.code, message: err.message, details: err.details },
    meta: { timestamp: Date.now(), duration: Math.round(performance.now() - ctx.startedAt) },
  };
  const text = redact(JSON.stringify(body), ctx.token);
  console.error(`[ingest] ${err.code} ${err.status}: ${redact(err.message, ctx.token)}`);
  return new NextResponse(text, {
    status: err.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
