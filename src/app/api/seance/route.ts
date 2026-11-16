import { NextResponse } from 'next/server';
import type { ApiResponse } from '@/lib/types';
import type { SeanceResponseData } from '@/lib/conversion/types';

type SeanceBody = {
  question?: unknown;
  selectedNodeId?: unknown;
  specimenId?: unknown;
  repositoryUrl?: unknown;
  nodes?: unknown;
  edges?: unknown;
};
type SafeNode = { id: string; path: string; rotScore: number };
type SafeEdge = { source: string; target: string };

const errorResponse = (message: string, status = 400) => NextResponse.json<ApiResponse<null>>({ success: false, error: { code: 'INVALID_REQUEST', message } }, { status });

export async function POST(request: Request) {
  let body: SeanceBody;
  try { body = await request.json() as SeanceBody; } catch { return errorResponse('Request body must be valid JSON.'); }
  if ('rawContent' in body) return errorResponse('Source content is not accepted.');
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
  const nodes = Array.isArray(body.nodes) ? body.nodes : [];
  const edges = Array.isArray(body.edges) ? body.edges : [];
  if (!question || nodes.length > 200 || edges.length > 500) return errorResponse('Question or graph exceeds the request limits.');
  const safeNodes: SafeNode[] = nodes.filter((node): node is SafeNode => {
    if (!node || typeof node !== 'object') return false;
    const value = node as Record<string, unknown>;
    return typeof value.id === 'string' && typeof value.path === 'string' && typeof value.rotScore === 'number' && Number.isFinite(value.rotScore);
  }).map((node) => ({ id: node.id, path: node.path.slice(0, 500), rotScore: Math.max(0, Math.min(100, node.rotScore)) }));
  const ids = new Set(safeNodes.map((node) => node.id));
  const safeEdges: SafeEdge[] = edges.filter((edge): edge is SafeEdge => {
    if (!edge || typeof edge !== 'object') return false;
    const value = edge as Record<string, unknown>;
    return typeof value.source === 'string' && typeof value.target === 'string' && ids.has(value.source) && ids.has(value.target);
  }).map((edge) => ({ source: edge.source, target: edge.target }));
  const normalized = question.toLowerCase();
  const selected = typeof body.selectedNodeId === 'string' && ids.has(body.selectedNodeId) ? body.selectedNodeId : undefined;
  const mentioned = safeNodes.find((node) => normalized.includes(node.id.toLowerCase()) || normalized.includes(node.path.toLowerCase()));
  const focus = mentioned ?? safeNodes.find((node) => node.id === selected) ?? [...safeNodes].sort((a, b) => b.rotScore - a.rotScore)[0];
  const downstream = focus ? safeEdges.filter((edge) => edge.source === focus.id).map((edge) => edge.target) : [];
  const answer = focus
    ? `${focus.path} has a rot score of ${focus.rotScore}. ${downstream.length ? `Changes may affect ${downstream.join(', ')} downstream.` : 'No downstream files were found in the submitted graph.'}`
    : 'No graph nodes were submitted to inspect.';
  const data: SeanceResponseData = { answer, spotlightNodeIds: focus ? [focus.id, ...downstream] : [], ...(focus ? { selectNodeId: focus.id } : {}) };
  return NextResponse.json<ApiResponse<SeanceResponseData>>({ success: true, data });
}
