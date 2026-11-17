'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CodeBlock } from '@/components/ui/code-block';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Download, GitCompare, GripVertical, Maximize2, Mic, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react';
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
import type { IngestedWorkspaceNode, IngestErrorState, PresetId, Specimen, WorkspaceNode } from '@/lib/conversion/types';
import type { RepoAnalysis } from '@/lib/repoAnalyzer';
import type { ApiResponse } from '@/lib/types';
import SeanceConsole from './SeanceConsole';

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
  onSelectNode,
}: {
  node: WorkspaceNode;
  position: { x: number; y: number };
  selected: boolean;
  isSpotlight: boolean;
  dimmed: boolean;
  meta: RotScoreMeta;
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
      className={`absolute flex h-[132px] w-[226px] select-none cursor-grab active:cursor-grabbing flex-col justify-between rounded-2xl border border-hairline bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
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
  spotlightNodeIds,
  camera,
  isolateHotspots = false,
  visibleNodeIds,
  onCameraChange,
  onSelectNode,
}: {
  specimen: Specimen | null;
  selectedNodeId: string | null;
  spotlightNodeIds: string[];
  camera: { x: number; y: number; scale: number };
  isolateHotspots?: boolean;
  visibleNodeIds?: Set<string>;
  onCameraChange: (camera: { x: number; y: number; scale: number }) => void;
  onSelectNode: (nodeId: string | null) => void;
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
        className="paper-grid relative min-h-0 flex-1 select-none touch-none cursor-grab overflow-hidden active:cursor-grabbing"
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
                const hidden = visibleNodeIds && (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target));
                return <path key={edge.id} d={`M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`} fill="none" stroke={active ? (spotlight.has(edge.target) ? '#0284C7' : '#111113') : '#D4D4D8'} strokeWidth={selectedNodeId && active ? 1.8 : 1.2} opacity={hidden ? 0.08 : 1} />;
              })}
            </svg>
            {validNodes.map((node) => {
              const selected = node.id === selectedNodeId;
              const isSpotlight = spotlight.has(node.id);
              const dimmed = (visibleNodeIds && !visibleNodeIds.has(node.id)) || (isolateHotspots && node.rotScore < 70 && !selected && !isSpotlight);
              const meta = rotScoreMeta(node.rotScore);
              const pos = getNodePos(node);
              return (
                <DraggableGraphNode
                  key={node.id}
                  node={node}
                  position={pos}
                  selected={selected}
                  isSpotlight={isSpotlight}
                  dimmed={dimmed}
                  meta={meta}
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

function DetailPanel({ specimen, selectedNodeId, onClose, onBlastRadius, onSelectNode }: {
  specimen: Specimen | null;
  selectedNodeId: string | null;
  onClose: () => void;
  onBlastRadius: () => void;
  onSelectNode: (nodeId: string) => void;
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
    if (match) {
      const start = Number(match[1]);
      setHighlightRange({ start, end: Number(match[2] ?? match[1]) });
    } else {
      setHighlightRange(null);
    }
    setTab('source');
  };

  return <aside aria-label="Specimen detail panel" className={`${expanded ? 'w-[640px]' : 'w-[420px]'} z-30 flex h-full shrink-0 flex-col border-l border-hairline bg-white transition-all duration-200 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:h-[78vh] max-sm:w-full max-sm:border-l-0 max-sm:border-t`}>
    <header className="shrink-0 border-b border-hairline p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[9px] text-muted">AUTOPSY REPORT</span>
            {meta && (
              <span className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold text-white shadow-xs ${meta.solidBadgeClass}`}>
                {meta.label}
              </span>
            )}
          </div>
          <p className="truncate font-mono text-[10px] text-muted" title={node?.path}>{node?.path ?? 'Select a file node'}</p>
          <h2 className="mt-1 truncate font-display text-[15px] font-medium">{node?.name ?? 'Specimen detail'}</h2>
          {node && meta && (
            <p className="mt-1 font-mono text-[12px] font-semibold">
              <span className={meta.textClass}>{node.rotScore}</span>
              <span className="ml-1 text-[10px] font-normal text-muted">/ 100 rot  · {meta.label}</span>
            </p>
          )}
          {node && <p className="mt-2 text-[13px] leading-[1.45] font-normal text-muted">{node.kind === 'ingested' ? node.summary : 'Preset specimen with curated findings and source context.'}</p>}
        </div>
        <div className="flex shrink-0 gap-1.5"><button type="button" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? 'Compact sidebar' : 'Expand sidebar'} className="rounded-full border border-hairline px-2.5 py-1 text-[12px] font-normal text-muted hover:bg-surface">{expanded ? 'Compact' : 'Expand'}</button><button type="button" onClick={onClose} aria-label="Close specimen detail" className="rounded-full border border-hairline px-2.5 py-1 text-[12px] font-normal text-muted hover:bg-surface">Close</button></div>
      </div>
      {node && <div className="mt-4 flex rounded-lg bg-surface p-1" role="tablist"><button type="button" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${tab === 'overview' ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>Overview</button><button type="button" role="tab" aria-selected={tab === 'source'} onClick={() => setTab('source')} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${tab === 'source' ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}>Source Code</button></div>}
    </header>
    {node ? tab === 'overview' ? <div className="flex-1 overflow-y-auto p-4"><section><div className="flex items-center justify-between"><h3 className="font-display text-[13px] font-medium">Findings</h3><span className="font-mono text-[10px] text-muted">Click to jump to line</span></div><ol className="mt-3 space-y-2">{findings.map((finding, index) => {
      const isLine = /Lines?\s+\d+/i.test(finding);
      const isCritical = /empty catch|high cyclomatic|eval|unsafe/i.test(finding);
      const isPositive = /no high-severity|healthy|clean|positive/i.test(finding);
      const badgeClass = isPositive ? 'bg-emerald text-white' : isCritical ? 'bg-crimson/15 text-crimson font-bold' : isLine ? 'bg-amber/20 text-amber font-semibold' : 'bg-surface text-ink';
      return <li key={finding}><button type="button" onClick={() => jumpToFinding(finding)} className="flex w-full gap-2.5 rounded-lg p-2 text-left text-[13px] leading-relaxed text-muted hover:bg-surface transition-colors"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] ${badgeClass}`}>{String(index + 1).padStart(2, '0')}</span><span className="text-ink">{finding}</span></button></li>;
    })}</ol></section><section className="mt-6"><h3 className="font-display text-[13px] font-medium">Module telemetry</h3><dl className="mt-3 grid grid-cols-2 gap-2">{[['Lines', String(node.linesOfCode)], ['Imports', String(imports.length)], ['Imported by', String(importedBy.length)], [node.kind === 'preset' ? 'Last modified' : 'Last commit', node.kind === 'preset' ? node.lastModified : node.lastCommit]].map(([label, value]) => <div key={label} className="rounded-lg bg-surface p-2.5"><dt className="font-mono text-[10px] text-muted">{label}</dt><dd className="mt-1 truncate font-mono text-xs font-medium text-ink">{value}</dd></div>)}</dl></section><section className="mt-4 rounded-lg border border-hairline bg-surface p-3"><h3 className="font-display text-[13px] font-medium">Recommended action</h3><p className="mt-1.5 text-[13px] leading-[1.45] text-muted">{node.kind === 'ingested' ? node.recommendation : 'Review the findings and validate the change with a focused regression test.'}</p></section><section className="mt-6"><h3 className="font-display text-[13px] font-medium">Imports</h3><div className="mt-2 space-y-1">{imports.length ? imports.map((edge) => <button key={edge.id} type="button" onClick={() => onSelectNode(edge.target)} className="block w-full truncate rounded px-2 py-1.5 text-left font-mono text-[10px] text-muted hover:bg-surface hover:text-ink">→ {specimen?.nodes.find((candidate) => candidate.id === edge.target)?.name ?? edge.target}</button>) : <p className="text-xs text-muted">No indexed imports.</p>}</div><h3 className="mt-4 font-display text-[13px] font-medium">Imported by</h3><div className="mt-2 space-y-1">{importedBy.length ? importedBy.map((edge) => <button key={edge.id} type="button" onClick={() => onSelectNode(edge.source)} className="block w-full truncate rounded px-2 py-1.5 text-left font-mono text-[10px] text-muted hover:bg-surface hover:text-ink">← {specimen?.nodes.find((candidate) => candidate.id === edge.source)?.name ?? edge.source}</button>) : <p className="text-xs text-muted">No indexed dependents.</p>}</div></section><button type="button" onClick={onBlastRadius} className="mt-6 w-full rounded-xl bg-ink px-3 py-2.5 text-xs font-medium text-white hover:opacity-90">Analyze downstream blast radius →</button></div> : <div ref={codeRef} className="min-h-0 flex-1 p-3"><CodeBlock code={code} title={node.path} highlightRange={highlightRange} className="h-full" /></div> : <p className="p-5 text-xs text-muted">Select a file node to inspect it.</p>}
  </aside>;
}
function WorkspaceContent() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [source, setSource] = useState<{ repo: string | null; specimenId: PresetId | null } | null>(null);
  const [specimen, setSpecimen] = useState<Specimen | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [spotlightNodeIds, setSpotlightNodeIds] = useState<string[]>([]);
  const [isolateHotspots, setIsolateHotspots] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [minRot, setMinRot] = useState(0);
  const [showComparison, setShowComparison] = useState(false);
  const [previousAudit, setPreviousAudit] = useState<{ files: number; averageRot: number } | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 20, scale: 0.92 });
  const [requestState, setRequestState] = useState<
    { status: 'idle' | 'loading' | 'success'; repository?: string; partial?: boolean; showingSample?: boolean; isSlow?: boolean } | IngestErrorState
  >({ status: 'idle' });
  const [retryNonce, setRetryNonce] = useState(0);
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
    setIsolateHotspots(false);
    setCamera({ x: 0, y: 20, scale: 0.92 });
    if (specimenId || !normalizedRepository) {
      setSpecimen(nextSpecimen);
      setRequestState({ status: specimenId ? 'success' : 'idle' });
      return () => controller.abort();
    }

    const showAnalysis = (analysis: RepoAnalysis) => {
      const analyzed = convertRepoAnalysis(analysis);
      const hotspot = analyzed.nodes.reduce<IngestedWorkspaceNode | null>((top, candidate) => top === null || candidate.rotScore > top.rotScore ? candidate : top, null);
      setSpecimen(analyzed);
      setSelectedNodeId(hotspot?.id ?? null);
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
      setSelectedNodeId(null);
      return;
    }
    if ((specimen?.nodes ?? []).some((node) => node.id === nodeId)) setSelectedNodeId(nodeId);
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
  };

  const loadPreviousAudit = () => {
    const history = JSON.parse(localStorage.getItem('necro:audit-history') || '[]') as { files: number; averageRot: number }[];
    setPreviousAudit(history[0] ?? null);
    setShowComparison(true);
  };
  const analyzeBlastRadius = () => {
    if (!specimen || !selectedNodeId) return;
    const ids = new Set<string>([selectedNodeId]);
    let changed = true;
    while (changed) { changed = false; specimen.edges.forEach((edge) => { if (ids.has(edge.source) && !ids.has(edge.target)) { ids.add(edge.target); changed = true; } }); }
    setSpotlightNodeIds([...ids]);
  };

  const animateCamera = (next: { x: number; y: number; scale: number }) => setCamera(next);

  const title = specimen?.title ?? source?.repo ?? 'Necro-Docs workspace';
  const summary = specimen?.summary;

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-canvas font-sans text-ink">
      <h1 ref={lifecycleHeadingRef} tabIndex={-1} className="sr-only">Necro-Docs workspace</h1>
      <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-hairline bg-white px-5">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-1.5 text-xs font-normal text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">
            <ChevronLeft size={16} aria-hidden="true" />
            <span>Back</span>
          </Link>
          <span aria-hidden="true" className="h-4 w-px bg-hairline" />
          <span className="truncate font-mono text-[12px] font-medium" title={title}>{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {summary && <span className="hidden font-mono text-[10px] text-muted sm:inline">{summary}</span>}
                    {requestState.status === 'success' && requestState.showingSample && <span className="hidden font-mono text-[10px] text-muted sm:inline">Showing sample data</span>}
          <button type="button" aria-pressed={isolateHotspots} title="Dim files with rot score below 70" onClick={() => setIsolateHotspots((value) => !value)} className={`rounded-full border px-2.5 py-1 text-[12px] font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent ${isolateHotspots ? 'border-ink bg-ink text-white' : 'border-hairline text-ink hover:bg-surface'}`}>
            Focus hotspots
          </button>
          <button type="button" aria-label="Reset graph view" onClick={() => animateCamera({ x: 0, y: 20, scale: 0.92 })} className="flex items-center gap-1.5 rounded-full border border-hairline px-2 py-0.5 text-[12px] font-normal text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">
            <RotateCcw size={13} aria-hidden="true" />
            <span>Reset view</span>
          </button>
        </div>
      </header>

      {specimen && <div className="z-10 flex flex-wrap items-center gap-2 border-b border-hairline bg-white px-4 py-1.5">
        <div className="relative min-w-[200px] flex-1"><Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search files..." aria-label="Search files" className="h-9 rounded-full pl-8 text-[13px] md:text-[13px]" /></div>
        <label className="flex items-center gap-2 font-mono text-[10px] text-muted">Min rot <input type="range" min="0" max="100" value={minRot} onChange={(event) => setMinRot(Number(event.target.value))} className="w-20" /><span>{minRot}</span></label>
        <div className="hidden lg:flex items-center gap-3 font-mono text-[10px] text-muted border-l border-hairline pl-3">
          <span className="flex items-center gap-1.5"><span className="rounded-full bg-emerald px-2 py-0.5 text-[9px] font-semibold text-white">Green</span> Healthy (&lt;40)</span>
          <span className="flex items-center gap-1.5"><span className="rounded-full bg-amber px-2 py-0.5 text-[9px] font-semibold text-white">Orange</span> Warning (40–69)</span>
          <span className="flex items-center gap-1.5"><span className="rounded-full bg-crimson px-2 py-0.5 text-[9px] font-semibold text-white">Red</span> Critical (≥70)</span>
        </div>
        <button type="button" onClick={() => animateCamera({ ...camera, scale: Math.min(1.5, camera.scale + 0.1) })} className="rounded-full border border-hairline p-2" aria-label="Zoom in"><ZoomIn size={14} /></button><button type="button" onClick={() => animateCamera({ ...camera, scale: Math.max(0.35, camera.scale - 0.1) })} className="rounded-full border border-hairline p-2" aria-label="Zoom out"><ZoomOut size={14} /></button>
        <button type="button" onClick={() => animateCamera({ x: 0, y: 20, scale: 0.92 })} className="rounded-full border border-hairline p-2" aria-label="Fit graph"><Maximize2 size={14} /></button>
        <button type="button" onClick={() => exportReport('md')} className="flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-[12px] font-normal"><Download size={13} />Export MD</button><button type="button" onClick={() => exportReport('json')} className="rounded-full border border-hairline px-2 py-0.5 text-[12px] font-normal">JSON</button>
        <button type="button" onClick={loadPreviousAudit} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-normal ${showComparison ? 'border-ink bg-ink text-white' : 'border-hairline'}`}><GitCompare size={13} />Compare</button>
      </div>}
      {showComparison && specimen && <div className="z-10 border-b border-hairline bg-surface px-5 py-2 text-xs text-muted">Current audit: <strong className="text-ink">{specimen.nodes.length} files, {Math.round(specimen.nodes.reduce((sum, node) => sum + node.rotScore, 0) / Math.max(1, specimen.nodes.length))} average rot</strong>{previousAudit ? <> · Previous: <strong className="text-ink">{previousAudit.files} files, {previousAudit.averageRot} average rot</strong></> : ' · No previous audit for this repository yet.'}</div>}

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
              spotlightNodeIds={spotlightNodeIds}
              camera={camera}
              visibleNodeIds={visibleNodeIds}
              onCameraChange={setCamera}
              onSelectNode={selectNode}
              isolateHotspots={isolateHotspots}
            />
            {selectedNodeId && <SeanceConsole specimen={specimen} selectedNodeId={selectedNodeId} onSpotlight={({ nodeIds, selectedNodeId: responseSelection }) => {
              setSpotlightNodeIds(nodeIds);
              if (responseSelection) setSelectedNodeId(responseSelection);
            }} />}
          </div>
          {selectedNodeId && <DetailPanel specimen={specimen} selectedNodeId={selectedNodeId} onBlastRadius={analyzeBlastRadius} onSelectNode={selectNode} onClose={() => setSelectedNodeId(null)} />}
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




