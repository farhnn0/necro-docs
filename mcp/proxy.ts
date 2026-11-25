/**
 * HTTP proxy helpers for the running Next app: POST /api/ingest and POST /api/patch.
 * Failures throw ProxyError with raw-ish context; user-facing wording is classified in mcp/errors.ts.
 * Thrown messages never contain request bodies or source code.
 */
import { parsePatchResponse } from './patch';
import { DEFAULT_API_URL } from './types';
import type { PatchEndpointResponse, RepoAnalysis } from './types';

export const INGEST_TIMEOUT_MS = 120_000;
export const PATCH_TIMEOUT_MS = 120_000;

export type ProxyErrorKind = 'http' | 'network' | 'timeout' | 'shape';

export class ProxyError extends Error {
  constructor(
    readonly kind: ProxyErrorKind,
    message: string,
    readonly status?: number,
    /** Message from the upstream error body (ingest envelope `error.message` or patch `error`). */
    readonly upstreamMessage?: string,
    /** Ingest error code, e.g. REPOSITORY_NOT_FOUND. Absent for patch errors. */
    readonly upstreamCode?: string,
  ) {
    super(message);
    this.name = 'ProxyError';
  }
}

export interface PatchInput {
  path: string;
  code: string;
  dependencies?: string[];
  importedBy?: string[];
}

type FetchImpl = typeof fetch;

export function resolveBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.NECRO_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

function upstreamError(body: unknown): { message?: string; code?: string } {
  if (!isObject(body)) return {};
  if (typeof body.error === 'string') return { message: body.error };
  if (isObject(body.error)) {
    return {
      message: typeof body.error.message === 'string' ? body.error.message : undefined,
      code: typeof body.error.code === 'string' ? body.error.code : undefined,
    };
  }
  return {};
}

async function postJson(path: string, payload: unknown, timeoutMs: number, fetchImpl: FetchImpl): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchImpl(`${resolveBaseUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      throw controller.signal.aborted
        ? new ProxyError('timeout', `Request to ${path} timed out`)
        : new ProxyError('network', `Cannot reach Next application for ${path}`);
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      if (controller.signal.aborted) throw new ProxyError('timeout', `Request to ${path} timed out`);
      body = undefined;
    }
    if (!res.ok) {
      const { message, code } = upstreamError(body);
      throw new ProxyError('http', `${path} responded with HTTP ${res.status}`, res.status, message, code);
    }
    if (body === undefined) throw new ProxyError('shape', `${path} returned a non-JSON response`, res.status);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function parseAnalysis(body: unknown): RepoAnalysis {
  const ok = isObject(body)
    && typeof body.title === 'string'
    && isObject(body.coverage)
    && Array.isArray(body.nodes)
    && body.nodes.every((n) => isObject(n) && typeof n.path === 'string' && typeof n.rot === 'number' && Array.isArray(n.findings));
  if (!ok) throw new ProxyError('shape', 'Next returned an invalid analysis response');
  return body as unknown as RepoAnalysis;
}

export async function fetchAnalysis(repoUrl: string, fetchImpl: FetchImpl = fetch): Promise<RepoAnalysis> {
  return parseAnalysis(await postJson('/api/ingest', { repoUrl }, INGEST_TIMEOUT_MS, fetchImpl));
}

export async function fetchPatch(input: PatchInput, fetchImpl: FetchImpl = fetch): Promise<PatchEndpointResponse> {
  const payload: PatchInput = { path: input.path, code: input.code };
  if (input.dependencies !== undefined) payload.dependencies = input.dependencies;
  if (input.importedBy !== undefined) payload.importedBy = input.importedBy;
  const body = await postJson('/api/patch', payload, PATCH_TIMEOUT_MS, fetchImpl);
  try {
    return parsePatchResponse(body);
  } catch {
    throw new ProxyError('shape', 'Next returned an invalid patch response');
  }
}
