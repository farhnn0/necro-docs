'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CodeBlock } from '@/components/ui/code-block';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ChevronLeft, Code, Download, FileText, Flame, GitCompare, GripVertical, Maximize2, Mic, Minimize2, RotateCcw, Search, Volume2, X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  DndContext,
  useDraggable,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import {
  ACTIVE_REPO_STORAGE_KEY,
  convertRepoAnalysis,
  createIngestErrorState,
  isRepoAnalysis,
  readActiveRepo,
  rotScoreTier,
  rotScoreMeta,
  quickQuestions,
} from '@/lib/conversion/helpers';
import type { RotScoreMeta } from '@/lib/conversion/helpers';
import {
  getPresetSpecimen,
  isPresetId,
  PRESET_IDS,
} from '@/lib/conversion/specimens';
import type { IngestErrorState, PresetId, Specimen, SpotlightState, WorkspaceNode } from '@/lib/conversion/types';
import type { RepoAnalysis } from '@/lib/repoAnalyzer';
import type { ApiResponse } from '@/lib/types';
import SeanceConsole from './SeanceConsole';
import { SurgicalPatch, type CachedPatch } from './SurgicalPatch';
import { toast } from '@/components/ui/toast';

const initialTranscript =
  'Select any file node or ask a question aloud to trace downstream dependencies.';

type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognitionErrorEventLike = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const speechErrorMessages: Record<string, string> = {
  'not-allowed': 'Microphone permission was denied. You can still type a question.',
  'service-not-allowed': 'Microphone permission was denied. You can still type a question.',
  'no-speech': 'No speech was detected. Try again, or type a question instead.',
  'audio-capture': 'No microphone could be accessed. You can still type a question.',
  network: 'Speech recognition could not reach its service. You can still type a question.',
  aborted: 'Voice input was stopped. You can still type a question.',
};

function PresetChoices({ onChoose }: { onChoose?: (id: PresetId) => void }) {
  return (
    <section aria-labelledby="preset-choices-title" className="mx-auto max-w-2xl p-6 sm:p-10">
      <p className="font-mono text-xs text-muted">Workspace source</p>
      <h1 id="preset-choices-title" className="mt-1 font-display text-2xl font-bold">
        Choose a specimen to inspect
      </h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
        Open a pre-indexed specimen now, or return to the landing page to submit a repository.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {PRESET_IDS.map((id) => {
          const specimen = getPresetSpecimen(id);
          return (
            <a
              key={id}
              href={onChoose ? undefined : `/workspace?specimen=${id}`}
              onClick={onChoose ? (event) => { event.preventDefault(); onChoose(id); } : undefined}
              className="rounded-2xl border border-hairline bg-white p-4 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
            >
              <span className="font-mono text-xs text-skyAccent">{specimen.summary}</span>
              <span className="mt-2 block font-display text-[13px] font-medium">{specimen.title}</span>
              <span className="mt-2 block text-xs leading-relaxed text-muted">{specimen.description}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

const GRAPH_WIDTH = 1200;
const GRAPH_HEIGHT = 1600;
const NODE_WIDTH = 226;
const NODE_HEIGHT = 132;

/** Shift that moves the nodes' bounding box to the middle of the graph canvas. */
function centerOffset(nodes: { position: { x: number; y: number } }[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs) + NODE_WIDTH;
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys) + NODE_HEIGHT;
  return { x: GRAPH_WIDTH / 2 - (minX + maxX) / 2, y: GRAPH_HEIGHT / 2 - (minY + maxY) / 2 };
}

function DraggableGraphNode({
  node,
  position,
  selected,
  isSpotlight,
  dimmed,
  meta,
  impactTag,
  hasPatch = false,
  onSelectNode,
}: {
  node: WorkspaceNode;
  position: { x: number; y: number };
  selected: boolean;
  isSpotlight: boolean;
  dimmed: boolean;
  meta: RotScoreMeta;
  impactTag?: 'Direct impact' | 'Downstream sink';
  hasPatch?: boolean;
  onSelectNode: (nodeId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: node.id,
  });

  return (
    <article
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-graph-node
      role="button"
      tabIndex={0}
      aria-label={`${node.name}, ${node.rotScore} rot (${meta.label}), ${node.linesOfCode} lines of code`}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        onSelectNode(node.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        onSelectNode(node.id);
      }}
      className={`absolute flex h-[132px] w-[226px] select-none cursor-grab active:cursor-grabbing flex-col justify-between rounded-2xl border ${
        hasPatch && !selected && !isSpotlight ? 'border-emerald/40' : 'border-hairline'
      } bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
        isDragging ? 'z-50 shadow-xl ring-2 ring-skyAccent opacity-95' : ''
      } ${selected ? 'ring-2 ring-ink' : isSpotlight ? 'ring-2 ring-skyAccent' : ''} ${
        dimmed ? 'opacity-[.22]' : 'opacity-100'
      }`}
      style={{
        left: position.x,
        top: position.y,
        touchAction: 'none',
      }}
    >
      {impactTag && <span className="absolute -top-2 left-3 rounded-full bg-skyAccent px-2 py-0.5 font-mono text-[9px] font-medium text-white shadow-sm">{impactTag}</span>}
      {hasPatch && <span className="absolute -top-2 right-3 rounded-full bg-emerald px-2 py-0.5 font-mono text-[9px] font-bold tracking-wide text-white shadow-2xs">PATCH READY</span>}
      <div className="flex items-start justify-between gap-3 font-mono text-[10px]">
        <div className="flex items-center gap-1.5 text-muted">
          <GripVertical size={13} className="shrink-0 text-muted/50" aria-hidden="true" />
          <span>{node.linesOfCode} lines</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold text-white shadow-xs ${meta.solidBadgeClass}`}>
          {node.rotScore} rot
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="truncate font-display text-[13px] font-semibold text-ink" title={node.name}>{node.name}</h3>
        <p className="truncate font-mono text-[10px] text-muted" title={node.path}>{node.path}</p>
      </div>
    </article>
  );
}

function GraphViewport({
  specimen,
  selectedNodeId,
  impactOriginId = null,
  spotlightNodeIds,
  camera,
  isolateHotspots = false,
  visibleNodeIds,
  onCameraChange,
  onSelectNode,
  synthesizedPatches,
}: {
  specimen: Specimen | null;
  selectedNodeId: string | null;
  /** File the blast radius was computed from. Outlives the inspector, so closing it keeps the labels stable. */
  impactOriginId?: string | null;
  spotlightNodeIds: string[];
  camera: { x: number; y: number; scale: number };
  isolateHotspots?: boolean;
  visibleNodeIds?: Set<string>;
  onCameraChange: (camera: { x: number; y: number; scale: number }) => void;
  onSelectNode: (nodeId: string | null) => void;
  synthesizedPatches?: Record<string, CachedPatch>;
}) {
  const viewportRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; cameraX: number; cameraY: number; moved: boolean } | null>(null);
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [activeDrag, setActiveDrag] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    setNodePositions({});
    setActiveDrag(null);
  }, [specimen]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    })
  );

  const validNodes = specimen?.nodes ?? [];
  const nodeIds = new Set(validNodes.map((node) => node.id));
  const validEdges = (specimen?.edges ?? []).filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
  const positions = new Map(validNodes.map((node) => [node.id, node]));
  const spotlight = new Set(spotlightNodeIds.filter((id) => nodeIds.has(id)));
  const offset = centerOffset(validNodes);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey) {
        const factor = Math.exp(-event.deltaY * 0.002);
        onCameraChange({ ...camera, scale: Math.max(0.35, Math.min(1.8, camera.scale * factor)) });
      } else if (event.shiftKey) {
        const horizontalDelta = event.deltaX || event.deltaY;
        onCameraChange({ ...camera, x: camera.x - horizontalDelta, y: camera.y });
      } else {
        onCameraChange({ ...camera, x: camera.x - event.deltaX, y: camera.y - event.deltaY });
      }
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [camera, onCameraChange]);


  const getNodePos = (node: WorkspaceNode) => {
    const base = nodePositions[node.id] ?? node.position;
    if (activeDrag && activeDrag.id === node.id) {
      return { x: base.x + activeDrag.x, y: base.y + activeDrag.y };
    }
    return base;
  };

  const handleDragMove = (event: DragMoveEvent) => {
    if (event.active) {
      setActiveDrag({
        id: String(event.active.id),
        x: event.delta.x / camera.scale,
        y: event.delta.y / camera.scale,
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    const nodeId = String(active.id);
    const baseNode = positions.get(nodeId);
    if (!baseNode) {
      setActiveDrag(null);
      return;
    }
    const current = nodePositions[nodeId] ?? baseNode.position;
    setNodePositions((prev) => ({
      ...prev,
      [nodeId]: {
        x: Math.round(current.x + delta.x / camera.scale),
        y: Math.round(current.y + delta.y / camera.scale),
      },
    }));
    setActiveDrag(null);
  };

  const handleDragCancel = () => {
    setActiveDrag(null);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <section
        ref={viewportRef}
        tabIndex={0}
        aria-label="Dependency graph. Focus this canvas and use arrow keys to pan. Drag empty space to move the graph."
        onKeyDown={(event) => {
          const deltas: Record<string, { x: number; y: number }> = {
            ArrowLeft: { x: -40, y: 0 },
            ArrowRight: { x: 40, y: 0 },
            ArrowUp: { x: 0, y: -40 },
            ArrowDown: { x: 0, y: 40 },
          };
          const delta = deltas[event.key];
          if (!delta) return;
          event.preventDefault();
          onCameraChange({ ...camera, x: camera.x + delta.x, y: camera.y + delta.y });
        }}
        onPointerDown={(event) => {
          const target = event.target as Element;
          if (target.closest('[data-graph-node]')) return;
          dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y, moved: false };
          viewportRef.current?.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
          onCameraChange({ ...camera, x: drag.cameraX + dx, y: drag.cameraY + dy });
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (drag?.pointerId !== event.pointerId) return;
          if (!drag.moved) onSelectNode(null);
          dragRef.current = null;
          viewportRef.current?.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { dragRef.current = null; }}
        data-selected-node={selectedNodeId ?? undefined}
        data-spotlight-count={spotlight.size}
        data-camera-x={camera.x}
        data-camera-y={camera.y}
        data-camera-scale={camera.scale}
        className="paper-grid relative h-full min-h-0 w-full flex-1 select-none touch-none cursor-grab overflow-hidden active:cursor-grabbing"
      >
        {specimen ? (
          <div className="absolute left-1/2 top-1/2 h-[1600px] w-[1200px] motion-reduce:transition-none" style={{ willChange: 'transform', transform: `translate(-50%, -50%) translate3d(${camera.x + offset.x}px, ${camera.y + offset.y}px, 0) scale(${camera.scale})` }}>
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="img" aria-label="Edges between source files">
              {validEdges.map((edge) => {
                const source = positions.get(edge.source);
                const target = positions.get(edge.target);
                if (!source || !target) return null;
                const sourcePos = getNodePos(source);
                const targetPos = getNodePos(target);
                const sourceX = sourcePos.x + NODE_WIDTH;
                const sourceY = sourcePos.y + NODE_HEIGHT / 2;
                const targetX = targetPos.x;
                const targetY = targetPos.y + NODE_HEIGHT / 2;
                const bend = Math.max(48, Math.abs(targetX - sourceX) * 0.45);
                const active = selectedNodeId === edge.source || selectedNodeId === edge.target || spotlight.has(edge.target);
                const spotlightEdge = spotlight.size > 0 && spotlight.has(edge.target);
                const edgeColor = spotlightEdge ? '#0284C7' : active ? '#111113' : '#D4D4D8';
                const hidden = visibleNodeIds && (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target));
                return <path key={edge.id} d={`M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`} fill="none" stroke={edgeColor} strokeWidth={selectedNodeId && active ? 1.8 : 1.2} opacity={hidden ? 0.08 : 1} />;
              })}
            </svg>
            {validNodes.map((node) => {
              const selected = node.id === selectedNodeId;
              const isSpotlight = spotlight.has(node.id);
              const dimmed = (visibleNodeIds && !visibleNodeIds.has(node.id)) || (isolateHotspots && node.rotScore < 70 && !selected && !isSpotlight);
              const focusId = selectedNodeId ?? impactOriginId;
              const directImpact = focusId !== null && validEdges.some((edge) => edge.source === focusId && edge.target === node.id);
              const impactTag = directImpact ? 'Direct impact' : isSpotlight && node.id !== focusId ? 'Downstream sink' : undefined;
              const meta = rotScoreMeta(node.rotScore);
              const pos = getNodePos(node);
              const hasPatch = Boolean(synthesizedPatches?.[node.path]);
              return (
                <DraggableGraphNode
                  key={node.id}
                  node={node}
                  position={pos}
                  selected={selected}
                  isSpotlight={isSpotlight}
                  dimmed={dimmed}
                  meta={meta}
                  impactTag={impactTag}
                  hasPatch={hasPatch}
                  onSelectNode={onSelectNode}
                />
              );
            })}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <div><p className="font-mono text-xs text-muted">No specimen loaded</p><p className="mt-2 text-sm text-muted">Choose a specimen to begin.</p></div>
          </div>
        )}
      </section>
    </DndContext>
  );
}

export function LegacySeanceSlot({ specimen, onQuickQuestion, onSubmit }: { specimen: Specimen | null; onQuickQuestion?: (question: string) => void; onSubmit?: (question: string) => void }) {
  const questions = specimen ? quickQuestions(specimen) : [];
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [isListening, setIsListening] = useState(false);
  const [speechRecognition, setSpeechRecognition] = useState<SpeechRecognitionConstructor | null>(null);

  useEffect(() => {
    const browserWindow = window as SpeechRecognitionWindow;
    const constructor = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
    // Browser feature detection must happen after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    // Wrapped in a function: React calls any function passed to a state setter.
    setSpeechRecognition(() => constructor);
    if (!constructor) setTranscript('Voice input is not supported in this browser. You can still type a question.');
  }, []);

  useEffect(() => () => {
    recognitionRef.current?.abort();
  }, []);

  const stopRecognition = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  };

  const showSpeechError = (error: string) => {
    setTranscript(speechErrorMessages[error] ?? 'Speech recognition failed. You can still type a question.');
    stopRecognition();
    inputRef.current?.focus();
  };

  const startRecognition = () => {
    if (!speechRecognition) {
      setTranscript('Voice input is not supported in this browser. You can still type a question.');
      inputRef.current?.focus();
      return;
    }
    const recognition = new speechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const query = Array.from({ length: event.results.length }, (_, index) => event.results[index][0]?.transcript ?? '').join('').trim();
      if (!query) return;
      setTranscript(query);
      stopRecognition();
      onSubmit?.(query);
      inputRef.current?.focus();
    };
    recognition.onerror = (event) => showSpeechError(event.error);
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    setTranscript('Listening…');
    try { recognition.start(); } catch { showSpeechError('generic'); }
  };

  const toggleRecognition = () => {
    if (isListening) stopRecognition();
    else startRecognition();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = inputRef.current?.value.trim() ?? '';
    if (query) { setTranscript(query); onSubmit?.(query); }
  };

  return (
    <section aria-labelledby="seance-title" className="absolute bottom-4 left-1/2 z-10 w-[86%] max-w-lg -translate-x-1/2">
      <div className="acctual-window rounded-2xl bg-white/95 p-3 backdrop-blur-md">
        <h2 id="seance-title" className="sr-only">Seance console</h2>
        <p aria-live="polite" className="px-1 text-xs leading-relaxed text-ink">{transcript}</p>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Quick questions">
          {questions.map(({ question }) => <button key={question} type="button" onClick={() => onQuickQuestion?.(question)} className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-left text-[10px] font-medium text-ink transition-colors hover:bg-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">{question}</button>)}
        </div>
        <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-3 border-t border-hairline pt-3">
          <label htmlFor="seance-question" className="sr-only">Ask a question</label>
          <input ref={inputRef} id="seance-question" name="seance-question" type="text" className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent" placeholder="Ask the code archaeologist…" />
          <button type="submit" className="rounded-full bg-ink px-3 py-2 text-xs font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">Send</button>
          <button type="button" onClick={toggleRecognition} disabled={!speechRecognition && !isListening} aria-label={isListening ? 'Listening…' : 'Ask by voice'} aria-pressed={isListening} title={speechRecognition ? (isListening ? 'Stop listening' : 'Ask by voice') : 'Voice input is not supported in this browser'} className="rounded-full bg-ink p-2 text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"><Mic size={14} aria-hidden="true" /></button>
          <div aria-hidden="true" className="flex h-5 items-center gap-1 px-1">{[2, 3.5, 5, 3, 4, 2.5, 4].map((height, index) => <span key={index} className="w-0.5 bg-ink" style={{ height: `${height * 4}px` }} />)}</div>
        </form>
      </div>
    </section>
  );
}

function DetailPanel({
  specimen,
  selectedNodeId,
  onClose,
  onBlastRadius,
  onSelectNode,
  synthesizedPatches,
  onSavePatch,
}: {
  specimen: Specimen | null;
  selectedNodeId: string | null;
  onClose: () => void;
  onBlastRadius: () => void;
  onSelectNode: (nodeId: string) => void;
  synthesizedPatches: Record<string, CachedPatch>;
  onSavePatch: (path: string, patch: CachedPatch) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'overview' | 'source'>('overview');
  const [highlightRange, setHighlightRange] = useState<{ start: number; end: number } | null>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const node = specimen?.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
  const findings = node?.findings ?? [];
  const code = node?.codeExcerpt ?? '';
  const imports = node ? specimen?.edges.filter((edge) => edge.source === node.id) ?? [] : [];
  const importedBy = node ? specimen?.edges.filter((edge) => edge.target === node.id) ?? [] : [];
  const meta = node ? rotScoreMeta(node.rotScore) : null;
  const hasSynthesizedPatch = node ? Boolean(synthesizedPatches[node.path]) : false;

  useEffect(() => {
    if (tab !== 'source' || highlightRange === null) return;
    const timer = window.setTimeout(() => {
      const target = codeRef.current?.querySelector(`[data-line="${highlightRange.start}"]`);
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [tab, highlightRange]);

  const jumpToFinding = (finding: string) => {
    const match = /Lines?\s+(\d+)(?:\s*(?:[-–]|to)\s*(\d+))?/i.exec(finding);
    if (match) setHighlightRange({ start: Number(match[1]), end: Number(match[2] ?? match[1]) });
    else setHighlightRange(null);
    setTab('source');
  };

  return <aside aria-label="Specimen detail panel" className={`absolute right-4 top-20 bottom-4 z-20 flex min-h-0 ${expanded ? 'w-[560px]' : 'w-[400px]'} flex-col overflow-hidden rounded-[24px] border border-[#E8E9ED] bg-white/95 shadow-[0_20px_50px_-12px_rgba(17,17,19,0.12)] backdrop-blur-md transition-all duration-200 max-sm:left-4 max-sm:right-4 max-sm:top-20 max-sm:bottom-4 max-sm:w-auto`}>
    <header className="shrink-0 border-b border-hairline bg-white/50 p-3.5 pb-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-[9px] font-medium tracking-wider text-muted uppercase">AUTOPSY REPORT</span>
          <span className="truncate font-mono text-[10px] text-muted" title={node?.path}>{node?.path ?? 'Select a file node'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? 'Compact sidebar' : 'Expand sidebar'}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-hairline text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
            title={expanded ? 'Compact view' : 'Expand view'}
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close specimen detail"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-hairline text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
            title="Close inspector"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <h2 className="truncate font-display text-[15px] font-semibold tracking-tight text-ink">{node?.name ?? 'Specimen detail'}</h2>
        {node && meta && (
          <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold text-white shadow-2xs shrink-0 ${meta.solidBadgeClass}`}>
            {node.rotScore} ROT · {meta.label}
          </span>
        )}
      </div>

      {node && <div className="mt-2.5 flex rounded-xl border border-hairline bg-surface/70 p-0.5" role="tablist"><button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')} className={`flex-1 rounded-lg px-3 py-1 text-xs font-medium transition-all ${tab === 'overview' ? 'bg-white text-ink shadow-xs' : 'text-muted hover:text-ink'}`}>Overview</button><button type="button" role="tab" aria-selected={tab === 'source'} onClick={() => setTab('source')} className={`flex-1 rounded-lg px-3 py-1 text-xs font-medium transition-all ${tab === 'source' ? 'bg-white text-ink shadow-xs' : 'text-muted hover:text-ink'}`}>Source Code</button></div>}
    </header>

    {node ? tab === 'overview' ? <>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 pb-28 space-y-3.5">
      {meta && (
        <div className="rounded-xl border border-hairline bg-surface/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-medium tracking-wider text-muted uppercase">Code Rot Index</span>
            <span className={`font-mono text-[11px] font-bold ${meta.textClass}`}>{meta.label}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={`font-mono text-2xl font-bold tracking-tight ${meta.textClass}`}>{node.rotScore}</span>
            <span className="font-mono text-xs text-muted">/ 100</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hairline">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                meta.tier === 'crimson' ? 'bg-crimson' : meta.tier === 'amber' ? 'bg-amber' : 'bg-emerald'
              }`}
              style={{ width: `${Math.max(4, Math.min(100, node.rotScore))}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 divide-x divide-hairline rounded-xl border border-hairline bg-surface/30 p-2 text-center">
        <div className="px-1">
          <div className="font-mono text-[9px] text-muted">LINES</div>
          <div className="font-mono text-xs font-semibold text-ink truncate">{node.linesOfCode}</div>
        </div>
        <div className="px-1">
          <div className="font-mono text-[9px] text-muted">IMPORTS</div>
          <div className="font-mono text-xs font-semibold text-ink truncate">{imports.length}</div>
        </div>
        <div className="px-1">
          <div className="font-mono text-[9px] text-muted">CALLERS</div>
          <div className="font-mono text-xs font-semibold text-ink truncate">{importedBy.length}</div>
        </div>
        <div className="px-1">
          <div className="font-mono text-[9px] text-muted">BRANCH</div>
          <div className="font-mono text-xs font-semibold text-ink truncate" title={node.kind === 'preset' ? node.lastModified : 'Active'}>
            {node.kind === 'preset' ? node.lastModified : 'Active'}
          </div>
        </div>
      </div>

      <p className="text-[12px] leading-relaxed text-muted">{node.kind === 'ingested' ? node.summary : 'Preset specimen with curated findings and source context.'}</p>

      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <h3 className="font-display text-[13px] font-semibold text-ink">Forensic Findings</h3>
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-surface px-1.5 font-mono text-[9px] font-medium text-muted">{findings.length}</span>
          </div>
          <span className="font-mono text-[10px] text-muted">Click line to jump</span>
        </div>
        <ol className="space-y-2">{findings.map((finding) => {
          const match = /^(?:Lines?\s+(\d+(?:\s*(?:[-–]|to)\s*\d+)?))(?::\s*|\s*-\s*|\s+)(.*)$/i.exec(finding);
          const lineLabel = match ? `L${match[1]}` : null;
          const message = match ? match[2] : finding;
          const isCritical = /empty catch|high cyclomatic|eval|unsafe|vulnerability/i.test(finding);
          return <li key={finding}><button type="button" onClick={() => jumpToFinding(finding)} className="group flex w-full items-start gap-2.5 rounded-xl border border-hairline bg-surface/30 p-2.5 text-left transition-all hover:border-muted/30 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">{lineLabel ? <span className="shrink-0 rounded-md border border-hairline bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink shadow-2xs group-hover:border-ink/30">{lineLabel}</span> : <span className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold ${isCritical ? 'bg-crimson/10 text-crimson' : 'bg-surface text-muted'}`}>#</span>}<span className="text-[12px] leading-relaxed text-ink group-hover:text-black">{message}</span></button></li>;
        })}</ol>
      </section>

      <SurgicalPatch
        key={node.path}
        path={node.path}
        code={code}
        findings={findings}
        repositoryUrl={specimen?.kind === 'ingested' ? specimen.repositoryUrl : null}
        rotScore={node.rotScore}
        initialPatch={synthesizedPatches[node.path] ?? null}
        onSynthesized={(patch) => onSavePatch(node.path, patch)}
      />

      <section className="rounded-xl border border-hairline bg-surface/30 p-3">
        <h3 className="font-display text-[12px] font-semibold text-ink">Recommended action</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">{node.kind === 'ingested' ? node.recommendation : 'Review the findings and validate the change with a focused regression test.'}</p>
      </section>

      <section>
        <h3 className="font-display text-[12px] font-semibold text-ink mb-2">Dependency graph</h3>
        <div className="space-y-2.5">
          <div>
            <span className="font-mono text-[10px] text-muted uppercase">Depends on ({imports.length})</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {imports.length ? imports.map((edge) => <button key={edge.id} type="button" onClick={() => onSelectNode(edge.target)} className="truncate max-w-full rounded-md border border-hairline bg-surface/70 px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-ink/20 hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">→ {specimen?.nodes.find((candidate) => candidate.id === edge.target)?.name ?? edge.target}</button>) : <p className="text-[11px] text-muted italic">No indexed imports</p>}
            </div>
          </div>
          <div>
            <span className="font-mono text-[10px] text-muted uppercase">Imported by ({importedBy.length})</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {importedBy.length ? importedBy.map((edge) => <button key={edge.id} type="button" onClick={() => onSelectNode(edge.source)} className="truncate max-w-full rounded-md border border-hairline bg-surface/70 px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-ink/20 hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">← {specimen?.nodes.find((candidate) => candidate.id === edge.source)?.name ?? edge.source}</button>) : <p className="text-[11px] text-muted italic">No indexed callers</p>}
            </div>
          </div>
        </div>
      </section>
      </div>
      <div className="shrink-0 border-t border-hairline bg-white/95 p-2.5 backdrop-blur-sm">
        <button type="button" onClick={onBlastRadius} className="w-full rounded-lg bg-ink px-3 py-2 text-[11px] font-medium text-white shadow-xs transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">Analyze downstream blast radius →</button>
      </div>
    </> : <div ref={codeRef} className="min-h-0 flex-1 overflow-hidden p-3"><CodeBlock code={code} title={node.path} highlightRange={highlightRange} className="h-full min-h-0" /></div> : <p className="p-5 text-xs text-muted">Select a file node to inspect it.</p>}
  </aside>;
}
function WorkspaceContent() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [source, setSource] = useState<{ repo: string | null; specimenId: PresetId | null } | null>(null);
  const [specimen, setSpecimen] = useState<Specimen | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [spotlightNodeIds, setSpotlightNodeIds] = useState<string[]>([]);
  const [impactOriginId, setImpactOriginId] = useState<string | null>(null);
  const [isolateHotspots, setIsolateHotspots] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [minRot, setMinRot] = useState(0);
  const [showComparison, setShowComparison] = useState(false);
  const [previousAudit, setPreviousAudit] = useState<{ files: number; averageRot: number } | null>(null);
  const [briefOpen, setBriefOpen] = useState(false);
  const [camera, setCamera] = useState({ x: 0, y: 20, scale: 0.92 });
  const [requestState, setRequestState] = useState<
    { status: 'idle' | 'loading' | 'success'; repository?: string; partial?: boolean; showingSample?: boolean; isSlow?: boolean } | IngestErrorState
  >({ status: 'idle' });
  const [retryNonce, setRetryNonce] = useState(0);
  const [synthesizedPatches, setSynthesizedPatches] = useState<Record<string, CachedPatch>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.sessionStorage.getItem('necro_synthesized_patches');
      return stored ? (JSON.parse(stored) as Record<string, CachedPatch>) : {};
    } catch {
      return {};
    }
  });

  const handleSavePatch = (path: string, patch: CachedPatch) => {
    setSynthesizedPatches((prev) => {
      const updated = { ...prev, [path]: patch };
      try {
        window.sessionStorage.setItem('necro_synthesized_patches', JSON.stringify(updated));
      } catch {
        // ignore storage quota issues
      }
      return updated;
    });
  };

  const activeControllerRef = useRef<AbortController | null>(null);
  const lifecycleHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    const repo = params.get('repo')?.trim() || null;
    const requestedSpecimen = params.get('specimen');
    const specimenId = isPresetId(requestedSpecimen) ? requestedSpecimen : null;
    const nextSpecimen = specimenId ? getPresetSpecimen(specimenId) : null;
    const controller = new AbortController();
    activeControllerRef.current?.abort();
    activeControllerRef.current = controller;
    const normalizedRepository = repo && /^[a-z][a-z\d+.-]*:\/\//i.test(repo) ? repo : repo ? `https://${repo}` : null;

    // URL search parameters are browser state; resolve them after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource({ repo, specimenId });
    setSelectedNodeId(null);
    setSpotlightNodeIds([]);
    setImpactOriginId(null);
    setIsolateHotspots(false);
    setCamera({ x: 0, y: 20, scale: 0.92 });
    if (specimenId || !normalizedRepository) {
      setSpecimen(nextSpecimen);
      setRequestState({ status: specimenId ? 'success' : 'idle' });
      return () => controller.abort();
    }

    const showAnalysis = (analysis: RepoAnalysis) => {
      const analyzed = convertRepoAnalysis(analysis);
      setSpecimen(analyzed);
      // Jangan buka Autopsy Report otomatis setelah analyze. Inspector muncul setelah node diklik.
      setSelectedNodeId(null);
      setRequestState({ status: 'success', repository: analysis.title });
      const snapshot = { repository: analysis.title, branch: analysis.defaultBranch, files: analyzed.nodes.length, averageRot: analysis.overallRot, savedAt: Date.now() };
      try {
        const history = JSON.parse(localStorage.getItem('necro:audit-history') || '[]') as typeof snapshot[];
        localStorage.setItem('necro:audit-history', JSON.stringify([snapshot, ...history.filter((item) => item.repository !== snapshot.repository)].slice(0, 10)));
      } catch { /* history is optional */ }
    };

    // The landing page already analyzed this repository and left the result in sessionStorage.
    let stored: string | null = null;
    try { stored = window.sessionStorage.getItem(ACTIVE_REPO_STORAGE_KEY); } catch { /* storage unavailable */ }
    const cached = readActiveRepo(stored, repo ?? '');
    if (cached) {
      showAnalysis(cached);
      return () => controller.abort();
    }

    setSpecimen(null);
    setRequestState({ status: 'loading', repository: repo ?? normalizedRepository, isSlow: false });
    const slowTimer = window.setTimeout(() => {
      if (!controller.signal.aborted) setRequestState({ status: 'loading', repository: repo ?? normalizedRepository ?? '', isSlow: true });
    }, 8000);
    void (async () => {
      try {
        const response = await fetch('/api/ingest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl: repo }),
          signal: controller.signal,
        });
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          if (!controller.signal.aborted) setRequestState(createIngestErrorState(undefined, repo ?? undefined));
          return;
        }
        if (controller.signal.aborted) return;
        if (!response.ok || !isRepoAnalysis(payload)) {
          const code = (payload as ApiResponse<null> | null)?.error?.code;
          setRequestState(createIngestErrorState(response.ok ? undefined : code, repo ?? undefined));
          return;
        }
        showAnalysis(payload);
      } catch {
        if (!controller.signal.aborted) setRequestState({ status: 'error', message: 'The server could not be reached.', repository: repo ?? undefined });
      }
    })();
    return () => {
      window.clearTimeout(slowTimer);
      controller.abort();
      if (activeControllerRef.current === controller) activeControllerRef.current = null;
    };
  }, [queryString, retryNonce]);

  useEffect(() => {
    lifecycleHeadingRef.current?.focus();
  }, [requestState.status, specimen]);

  const choosePreset = (id: PresetId) => {
    activeControllerRef.current?.abort();
    const next = getPresetSpecimen(id);
    setSpecimen(next);
    setSource({ repo: null, specimenId: id });
    setSelectedNodeId(null);
    setRequestState({ status: 'success', showingSample: true });
  };

  const cancelIngest = () => {
    activeControllerRef.current?.abort();
    setSpecimen(null);
    setSource({ repo: null, specimenId: null });
    setRequestState({ status: 'idle' });
  };

  const retryIngest = () => setRetryNonce((value) => value + 1);




  useEffect(() => () => window.speechSynthesis.cancel(), []);

  const selectNode = (nodeId: string | null) => {
    if (nodeId === null) {
      setSpotlightNodeIds([]);
      setImpactOriginId(null);
      setSelectedNodeId(null);
      return;
    }
    if ((specimen?.nodes ?? []).some((node) => node.id === nodeId)) {
      setSpotlightNodeIds([]);
      setImpactOriginId(null);
      setSelectedNodeId(nodeId);
    }
  };

  const visibleNodeIds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return new Set((specimen?.nodes ?? []).filter((node) =>
      (!query || `${node.name} ${node.path}`.toLowerCase().includes(query)) && node.rotScore >= minRot,
    ).map((node) => node.id));
  }, [specimen, searchQuery, minRot]);

  const exportReport = (format: 'json' | 'md') => {
    if (!specimen) return;
    const report = format === 'json'
      ? JSON.stringify({ title: specimen.title, summary: specimen.summary, nodes: specimen.nodes, edges: specimen.edges }, null, 2)
      : `# ${specimen.title}\n\n${specimen.summary}\n\n## Files\n${specimen.nodes.map((node) => `- ${node.path}: ${node.rotScore}/100 rot, ${node.linesOfCode} LOC`).join('\n')}`;
    const blob = new Blob([report], { type: format === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${specimen.title.replace(/[^a-z0-9]+/gi, '-')}.${format === 'json' ? 'json' : 'md'}`; link.click(); URL.revokeObjectURL(url);
    toast.add({
      type: 'success',
      title: 'Report exported',
      description: `Downloaded ${format.toUpperCase()} autopsy brief.`,
    });
  };

  const loadPreviousAudit = () => {
    const history = JSON.parse(localStorage.getItem('necro:audit-history') || '[]') as { files: number; averageRot: number }[];
    setPreviousAudit(history[0] ?? null);
    setShowComparison(true);
  };
  const analyzeBlastRadius = () => {
    if (!specimen || !selectedNodeId) return;
    const currentNode = specimen.nodes.find((candidate) => candidate.id === selectedNodeId);
    const ids = new Set<string>([selectedNodeId]);
    let changed = true;
    while (changed) { changed = false; specimen.edges.forEach((edge) => { if (ids.has(edge.source) && !ids.has(edge.target)) { ids.add(edge.target); changed = true; } }); }
    setSpotlightNodeIds([...ids]);
    setImpactOriginId(selectedNodeId);

    const downstreamCount = ids.size - 1;
    if (downstreamCount === 0) {
      toast.add({
        type: 'info',
        title: 'No downstream blast radius',
        description: `"${currentNode?.name ?? 'This file'}" has no downstream consumers. Changes here will not cascade to other indexed files.`,
      });
    } else {
      toast.add({
        type: 'success',
        title: 'Blast radius mapped',
        description: `Identified ${downstreamCount} downstream ${downstreamCount === 1 ? 'file' : 'files'} in the dependency blast radius.`,
      });
    }
  };

  const animateCamera = (next: { x: number; y: number; scale: number }) => setCamera(next);

  const briefNodes = [...(specimen?.nodes ?? [])].sort((a, b) => b.rotScore - a.rotScore).slice(0, 3);
  const briefText = specimen ? `${specimen.title} has ${specimen.nodes.length} analyzed files with an overall rot score of ${specimen.kind === 'ingested' ? specimen.overallRot : specimen.summary}. The top priorities are ${briefNodes.map((node) => node.name).join(', ')}.` : '';
  const speakBrief = () => { if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(briefText); utterance.rate = 1.02; window.speechSynthesis.speak(utterance); } };

  const handleSpotlight = ({ nodeIds, selectedNodeId: responseSelection }: SpotlightState) => {
    setSpotlightNodeIds(nodeIds);
    setImpactOriginId(responseSelection ?? selectedNodeId);
    if (responseSelection) setSelectedNodeId(responseSelection);
    const selected = (specimen?.nodes ?? []).filter((node) => nodeIds.includes(node.id));
    if (selected.length === 0) return;
    const minX = Math.min(...selected.map((node) => node.position.x));
    const maxX = Math.max(...selected.map((node) => node.position.x + NODE_WIDTH));
    const minY = Math.min(...selected.map((node) => node.position.y));
    const maxY = Math.max(...selected.map((node) => node.position.y + NODE_HEIGHT));
    setCamera({ x: GRAPH_WIDTH / 2 - (minX + maxX) / 2, y: GRAPH_HEIGHT / 2 - (minY + maxY) / 2, scale: selected.length > 2 ? 0.7 : 0.86 });
  };

  const title = specimen?.title ?? source?.repo ?? 'Necro-Docs workspace';
  const summary = specimen?.summary;

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-canvas font-sans text-ink">
      <h1 ref={lifecycleHeadingRef} tabIndex={-1} className="sr-only">Necro-Docs workspace</h1>
      <header className="z-20 flex h-13 shrink-0 items-center justify-between border-b border-hairline bg-white/95 px-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-1 rounded-lg border border-hairline px-2 py-1 text-xs font-medium text-muted transition hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">
            <ChevronLeft size={14} aria-hidden="true" />
            <span>Back</span>
          </Link>
          <span aria-hidden="true" className="h-4 w-px bg-hairline" />
          <span className="truncate font-mono text-[13px] font-semibold text-ink" title={title}>{title}</span>
          {summary && <span className="hidden font-mono text-[10px] text-muted rounded-full bg-surface px-2.5 py-0.5 sm:inline">{summary}</span>}
          {requestState.status === 'success' && requestState.showingSample && <span className="hidden font-mono text-[10px] text-amber rounded-full bg-amber/10 px-2.5 py-0.5 sm:inline">Sample Data</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={loadPreviousAudit}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent ${
              showComparison ? 'border-ink bg-ink text-white shadow-xs' : 'border-hairline text-muted hover:bg-surface hover:text-ink'
            }`}
            title="Compare current audit with previous snapshot"
          >
            <GitCompare size={13} />
            <span className="hidden sm:inline">Compare</span>
          </button>
          <button
            type="button"
            onClick={() => setBriefOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-2xs transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
            aria-label="Open repository brief"
          >
            <FileText size={13} className="text-muted" />
            <span>Repo Brief</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-xl border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-2xs transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
              >
                <Download size={13} className="text-muted" />
                <span>Export</span>
                <ChevronDown size={12} className="text-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl p-1 shadow-lg border-hairline bg-white">
              <DropdownMenuItem onClick={() => exportReport('md')} className="cursor-pointer gap-2 rounded-lg px-2.5 py-2 text-xs text-ink hover:bg-surface">
                <FileText size={14} className="text-muted" />
                <div className="flex flex-col">
                  <span className="font-medium">Markdown Report</span>
                  <span className="text-[10px] text-muted">Executive autopsy (.md)</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportReport('json')} className="cursor-pointer gap-2 rounded-lg px-2.5 py-2 text-xs text-ink hover:bg-surface">
                <Code size={14} className="text-muted" />
                <div className="flex flex-col">
                  <span className="font-medium">JSON Graph Data</span>
                  <span className="text-[10px] text-muted">Nodes & edges schema (.json)</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {showComparison && specimen && (
        <div className="z-20 flex shrink-0 items-center justify-between border-b border-hairline bg-surface/90 px-4 py-2 text-xs text-muted backdrop-blur-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] font-semibold text-ink bg-white border border-hairline px-2 py-0.5 rounded-md">
              AUDIT COMPARISON
            </span>
            <span>Current: <strong className="text-ink">{specimen.nodes.length} files, {Math.round(specimen.nodes.reduce((sum, node) => sum + node.rotScore, 0) / Math.max(1, specimen.nodes.length))} rot</strong></span>
            <span className="text-muted/50">·</span>
            <span>{previousAudit ? <>Previous: <strong className="text-ink">{previousAudit.files} files, {previousAudit.averageRot} rot</strong></> : 'No previous snapshot recorded yet for this repository.'}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowComparison(false)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink"
            aria-label="Close comparison"
            title="Close comparison"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {specimen && <div className={`absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-2xl border border-hairline bg-white/95 px-3 py-1.5 shadow-[0_12px_32px_-4px_rgba(17,17,19,0.10)] backdrop-blur-md transition-all duration-200 max-w-[95vw] ${
        showComparison ? 'top-26 sm:top-[104px]' : 'top-16'
      }`}>
        <div className="relative w-40 sm:w-56">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search files..."
            aria-label="Search files"
            className="h-8 rounded-xl border-hairline bg-surface/50 pl-8 text-xs placeholder:text-muted/60 focus-visible:ring-1 focus-visible:ring-ink"
          />
        </div>
        <span aria-hidden="true" className="h-4 w-px bg-hairline" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={isolateHotspots}
            title="Focus files with rot score ≥ 70"
            onClick={() => setIsolateHotspots((value) => !value)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent ${
              isolateHotspots ? 'bg-crimson text-white shadow-2xs' : 'border border-hairline bg-white text-ink hover:bg-surface'
            }`}
          >
            <Flame size={13} className={isolateHotspots ? 'text-white' : 'text-crimson'} />
            <span className="hidden sm:inline">Hotspots</span>
          </button>
          <label className="hidden md:flex items-center gap-1.5 font-mono text-[10px] text-muted">
            <span>Min:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={minRot}
              onChange={(event) => setMinRot(Number(event.target.value))}
              className="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-hairline accent-ink"
            />
            <span className="w-4 font-semibold text-ink">{minRot}</span>
          </label>
        </div>
        <span aria-hidden="true" className="hidden lg:block h-4 w-px bg-hairline shrink-0" />
        <div className="hidden lg:flex shrink-0 items-center gap-3 font-mono text-[11px] text-muted whitespace-nowrap select-none">
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"><span className="h-2 w-2 shrink-0 rounded-full bg-emerald" />&lt;40</span>
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"><span className="h-2 w-2 shrink-0 rounded-full bg-amber" />40–69</span>
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"><span className="h-2 w-2 shrink-0 rounded-full bg-crimson" />≥70</span>
        </div>
        <span aria-hidden="true" className="h-4 w-px bg-hairline" />
        <div className="flex items-center rounded-xl border border-hairline bg-surface/40 p-0.5">
          <button
            type="button"
            onClick={() => animateCamera({ ...camera, scale: Math.max(0.35, camera.scale - 0.1) })}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink"
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut size={13} />
          </button>
          <span className="min-w-9 text-center font-mono text-[10px] font-semibold text-muted select-none">
            {Math.round(camera.scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => animateCamera({ ...camera, scale: Math.min(1.5, camera.scale + 0.1) })}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink"
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn size={13} />
          </button>
          <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-hairline" />
          <button
            type="button"
            onClick={() => animateCamera({ x: 0, y: 20, scale: 0.92 })}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink"
            aria-label="Fit graph"
            title="Reset view (Fit to screen)"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>}
      {briefOpen && specimen && <div role="dialog" aria-modal="true" aria-labelledby="repo-brief-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-6" onClick={() => setBriefOpen(false)}><div className="w-full max-w-lg rounded-2xl border border-hairline bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] text-muted">EXECUTIVE REPO BRIEFING</p><h2 id="repo-brief-title" className="mt-1 font-display text-lg font-medium">{specimen.title}</h2></div><button type="button" onClick={() => setBriefOpen(false)} className="rounded-full border border-hairline px-2.5 py-1 text-xs text-muted">Close</button></div><p className="mt-4 text-sm leading-relaxed text-muted">{briefText}</p><h3 className="mt-5 font-display text-[13px] font-medium">Top refactoring priorities</h3><ol className="mt-2 space-y-2">{briefNodes.map((node, index) => <li key={node.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs"><span><b className="mr-2 font-mono text-muted">0{index + 1}</b>{node.name}</span><span className="font-mono text-crimson">{node.rotScore} rot</span></li>)}</ol><button type="button" onClick={speakBrief} className="mt-5 flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-xs font-medium text-white"><Volume2 size={14} />Listen to 15s Brief</button></div></div>}

      {requestState.status === 'loading' && (
        <div role="status" aria-live="polite" className="border-b border-hairline bg-surface px-5 py-3 font-mono text-xs">
          <div>Analyzing repository… {requestState.repository}</div>
          <button type="button" onClick={cancelIngest} className="mt-2 rounded-full border border-ink px-3 py-1.5 font-sans text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">Cancel</button>
          {requestState.isSlow && <><p className="mt-3">This is taking longer than usual.</p><PresetChoices onChoose={choosePreset} /></>}
        </div>
      )}
      {requestState.status === 'error' && (
        <div role="alert" className="border-b border-hairline bg-surface px-5 py-3 text-xs">
          <span>{requestState.message}</span>
          {requestState.code && <span className="ml-2 font-mono text-muted">{requestState.code}</span>}
          <div className="mt-3 flex gap-2"><button type="button" onClick={retryIngest} className="rounded-full border border-ink px-3 py-1.5 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">Try again</button></div>
          <PresetChoices onChoose={choosePreset} />
        </div>
      )}

      {source?.repo || specimen ? (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="relative flex min-w-0 flex-1 flex-col">
            <GraphViewport
              specimen={specimen}
              selectedNodeId={selectedNodeId}
              impactOriginId={impactOriginId}
              spotlightNodeIds={spotlightNodeIds}
              camera={camera}
              visibleNodeIds={visibleNodeIds}
              onCameraChange={setCamera}
              onSelectNode={selectNode}
              isolateHotspots={isolateHotspots}
              synthesizedPatches={synthesizedPatches}
            />
            {specimen && <SeanceConsole specimen={specimen} selectedNodeId={selectedNodeId} onSpotlight={handleSpotlight} />}
          </div>
          {selectedNodeId && (
            <DetailPanel
              specimen={specimen}
              selectedNodeId={selectedNodeId}
              onBlastRadius={analyzeBlastRadius}
              onSelectNode={selectNode}
              onClose={() => setSelectedNodeId(null)}
              synthesizedPatches={synthesizedPatches}
              onSavePatch={handleSavePatch}
            />
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto"><PresetChoices /></div>
      )}
    </main>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<main className="flex h-screen w-screen items-center justify-center bg-canvas font-mono text-xs text-muted">Loading workspace…</main>}>
      <WorkspaceContent />
    </Suspense>
  );
}




