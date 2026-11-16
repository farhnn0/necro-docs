import type { ApiResponse } from '@/lib/types';

export type PresetId = 'payment' | 'scraper' | 'realtime';

export interface WorkspacePosition {
  x: number;
  y: number;
}

export interface WorkspaceNodeBase {
  id: string;
  name: string;
  path: string;
  linesOfCode: number;
  rotScore: number;
  position: WorkspacePosition;
}

export interface PresetWorkspaceNode extends WorkspaceNodeBase {
  kind: 'preset';
  lastModified: string;
  findings: string[];
  codeExcerpt: string;
}

/** A file from a real repository analysis (`POST /api/ingest`). */
export interface IngestedWorkspaceNode extends WorkspaceNodeBase {
  kind: 'ingested';
  lastCommit: string;
  findings: string[];
  codeExcerpt: string;
}
export type WorkspaceNode = PresetWorkspaceNode | IngestedWorkspaceNode;

export interface WorkspaceEdge {
  id: string;
  source: string;
  target: string;
}

export interface PresetQuickQuestion {
  question: string;
  answer: string;
}

export interface PresetSpecimen {
  kind: 'preset';
  id: PresetId;
  title: string;
  summary: string;
  primaryLanguage: string;
  description: string;
  nodes: PresetWorkspaceNode[];
  edges: WorkspaceEdge[];
  quickQuestions: PresetQuickQuestion[];
}

export interface IngestedSpecimen {
  kind: 'ingested';
  title: string;
  summary: string;
  defaultBranch: string;
  /** Canonical `https://github.com/{owner}/{repo}`. */
  repositoryUrl: string;
  overallRot: number;
  nodes: IngestedWorkspaceNode[];
  edges: WorkspaceEdge[];
}
export type Specimen = PresetSpecimen | IngestedSpecimen;

export type IngestLoadingState = {
  status: 'loading';
  repository: string;
  isSlow: boolean;
};

export type IngestErrorState = {
  status: 'error';
  message: string;
  code?: string;
  repository?: string;
};

export type IngestRequestState =
  | { status: 'idle' }
  | IngestLoadingState
  | IngestErrorState
  | { status: 'success' };

export interface SeanceRequestNode {
  id: string;
  path: string;
  rotScore: number;
}

export interface SeanceRequestEdge {
  source: string;
  target: string;
}

export interface SeanceRequest {
  question: string;
  selectedNodeId: string | null;
  specimenId: PresetId | null;
  repositoryUrl: string | null;
  nodes: SeanceRequestNode[];
  edges: SeanceRequestEdge[];
}

export interface SeanceResponseData {
  answer: string;
  spotlightNodeIds: string[];
  selectNodeId?: string;
}

export type SeanceResponse = ApiResponse<SeanceResponseData>;

export interface SpotlightState {
  nodeIds: string[];
  selectedNodeId: string | null;
}

