import type {
  ApiResponse,
  IngestEdge,
  IngestNode,
  IngestResult,
} from '@/lib/types';

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

export interface IngestedWorkspaceNode extends WorkspaceNodeBase {
  kind: 'ingested';
  language: IngestNode['language'];
  nestingDepth: number;
  commentRatio: number;
  importCount: number;
  exportCount: number;
  fileSize: number;
  rawContent: string;
  isTruncated: boolean;
}

export type WorkspaceNode = PresetWorkspaceNode | IngestedWorkspaceNode;

export interface WorkspaceEdge {
  id: string;
  source: string;
  target: string;
  type?: IngestEdge['type'];
  label?: string;
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
  nodes: IngestedWorkspaceNode[];
  edges: WorkspaceEdge[];
  metadata: IngestResult['metadata'];
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

export type IngestedSpecimenSource = IngestResult;
