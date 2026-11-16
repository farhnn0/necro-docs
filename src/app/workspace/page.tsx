'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronLeft, Download, GitCompare, Maximize2, Mic, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo } from 'react';
import {
  convertIngestResult,
  createIngestErrorState,
  deriveRepositoryTitle,
  rotScoreTier,
  quickQuestions,
} from '@/lib/conversion/helpers';
import {
  getPresetSpecimen,
  isPresetId,
  PRESET_IDS,
} from '@/lib/conversion/specimens';
import type { IngestErrorState, PresetId, Specimen } from '@/lib/conversion/types';
import type { ApiResponse, IngestResult } from '@/lib/types';
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
              <span className="mt-2 block font-display text-sm font-bold">{specimen.title}</span>
              <span className="mt-2 block text-xs leading-relaxed text-muted">{specimen.description}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

const GRAPH_WIDTH = 1200;
const GRAPH_HEIGHT = 800;
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

function GraphViewport({
  specimen,
  selectedNodeId,
  spotlightNodeIds,
  camera,
  isolateHotspots = false,
  onCameraChange,
  onSelectNode,
}: {
  specimen: Specimen | null;
  selectedNodeId: string | null;
  spotlightNodeIds: string[];
  camera: { x: number; y: number; scale: number };
  isolateHotspots?: boolean;
  onCameraChange: (camera: { x: number; y: number; scale: number }) => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const viewportRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; cameraX: number; cameraY: number } | null>(null);
  const validNodes = specimen?.nodes ?? [];
  const nodeIds = new Set(validNodes.map((node) => node.id));
  const validEdges = (specimen?.edges ?? []).filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
  const positions = new Map(validNodes.map((node) => [node.id, node]));
  const spotlight = new Set(spotlightNodeIds.filter((id) => nodeIds.has(id)));
  const offset = centerOffset(validNodes);

  return (
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
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
        viewportRef.current?.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        onCameraChange({ ...camera, x: drag.cameraX + event.clientX - drag.x, y: drag.cameraY + event.clientY - drag.y });
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        viewportRef.current?.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { dragRef.current = null; }}
      onWheel={(event) => {
        event.preventDefault();
        onCameraChange({
          ...camera,
          x: camera.x - event.deltaX,
          y: camera.y - event.deltaY,
        });
      }}
      data-selected-node={selectedNodeId ?? undefined}
      data-spotlight-count={spotlight.size}
      data-camera-x={camera.x}
      data-camera-y={camera.y}
      data-camera-scale={camera.scale}
      className="paper-grid relative min-h-0 flex-1 select-none touch-none cursor-grab overflow-hidden active:cursor-grabbing"
    >
      {specimen ? (
        <div className="absolute left-1/2 top-1/2 h-[800px] w-[1200px] motion-reduce:transition-none" style={{ willChange: 'transform', transform: `translate(-50%, -50%) translate3d(${camera.x + offset.x}px, ${camera.y + offset.y}px, 0) scale(${camera.scale})` }}>
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} role="img" aria-label="Edges between source files">
            {validEdges.map((edge) => {
              const source = positions.get(edge.source);
              const target = positions.get(edge.target);
              if (!source || !target) return null;
              const sourceX = source.position.x + NODE_WIDTH;
              const sourceY = source.position.y + NODE_HEIGHT / 2;
              const targetX = target.position.x;
              const targetY = target.position.y + NODE_HEIGHT / 2;
              const bend = Math.max(48, Math.abs(targetX - sourceX) * 0.45);
              const active = selectedNodeId === edge.source || selectedNodeId === edge.target || spotlight.has(edge.target);
              return <path key={edge.id} d={`M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`} fill="none" stroke={active ? (spotlight.has(edge.target) ? '#0284C7' : '#111113') : '#D4D4D8'} strokeWidth={selectedNodeId && active ? 1.8 : 1.2} />;
            })}
          </svg>
          {validNodes.map((node) => {
            const selected = node.id === selectedNodeId;
            const isSpotlight = spotlight.has(node.id);
            const dimmed = isolateHotspots && node.rotScore < 70 && !selected && !isSpotlight;
            const scoreClass = rotScoreTier(node.rotScore) === 'crimson' ? 'text-crimson' : 'text-ink';
            return (
              <article
                data-graph-node
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.name}, ${node.rotScore} rot, ${node.linesOfCode} lines of code`}
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
                className={`absolute flex h-[132px] w-[226px] select-text cursor-pointer flex-col justify-between rounded-2xl border bg-white p-4 shadow-sm transition-opacity ${selected ? 'border-2 border-ink' : isSpotlight ? 'border-2 border-skyAccent' : 'border-hairline'} ${dimmed ? 'opacity-[.22]' : 'opacity-100'}`}
                style={{ left: node.position.x, top: node.position.y }}
              >
                <div className="flex items-start justify-between gap-3 font-mono text-[10px] text-muted">
                  <span>{node.linesOfCode} LOC</span>
                  <span className={`shrink-0 font-semibold ${scoreClass}`}>{node.rotScore} rot</span>
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-display text-sm font-bold text-ink" title={node.name}>{node.name}</h3>
                  <p className="truncate font-mono text-[10px] text-muted" title={node.path}>{node.path}</p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <div><p className="font-mono text-xs text-muted">No specimen loaded</p><p className="mt-2 text-sm text-muted">Choose a specimen to begin.</p></div>
        </div>
      )}
    </section>
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
    <section aria-labelledby="seance-title" className="absolute bottom-6 left-1/2 z-10 w-[92%] max-w-xl -translate-x-1/2">
      <div className="acctual-window rounded-3xl bg-white/95 p-4 backdrop-blur-md">
        <h2 id="seance-title" className="sr-only">Seance console</h2>
        <p aria-live="polite" className="px-1 text-xs leading-relaxed text-ink">{transcript}</p>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Quick questions">
          {questions.map(({ question }) => <button key={question} type="button" onClick={() => onQuickQuestion?.(question)} className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-left text-[11px] font-medium text-ink transition-colors hover:bg-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">{question}</button>)}
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
}: {
  specimen: Specimen | null;
  selectedNodeId: string | null;
  onClose: () => void;
}) {
  const node = specimen?.nodes.find((candidate) => candidate.id === selectedNodeId) ?? null;
  const diagnosis = node?.kind === 'preset'
    ? node.findings
    : node && specimen?.kind === 'ingested'
      ? [
          `${node.rotScore >= 75 ? 'High' : 'Moderate'} structural rot score: ${node.rotScore} / 100.`,
          `${node.nestingDepth} levels of nesting and ${(node.commentRatio * 100).toFixed(1)}% comments indicate the current structural shape.`,
          `${specimen.edges.filter((edge) => edge.target === node.id).length} incoming dependencies may be affected by changes here.`,
        ]
      : [];

  return (
    <aside
      aria-label="Specimen detail panel"
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[78vh] w-full flex-col overflow-y-auto border-t border-hairline bg-white p-5 shadow-[0_-12px_30px_rgba(17,17,19,0.08)] sm:static sm:max-h-none sm:w-96 sm:shrink-0 sm:border-l sm:border-t-0 sm:p-6 sm:shadow-none"
    >
      <div className="flex items-start justify-between border-b border-hairline pb-5">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-muted">{node?.path ?? 'Select a file node'}</p>
          <h2 className="mt-0.5 truncate font-display text-lg font-bold">{node?.name ?? 'Specimen detail'}</h2>
          {node && <p className={`mt-2 font-mono text-sm font-bold ${rotScoreTier(node.rotScore) === 'crimson' ? 'text-crimson' : 'text-ink'}`}>{node.rotScore} / 100</p>}
        </div>
        <button type="button" onClick={onClose} className="ml-4 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent sm:hidden">
          Close
        </button>
      </div>

      {node ? (
        <div className="space-y-6 py-5">
          <section aria-labelledby="structural-diagnosis-title">
            <h3 id="structural-diagnosis-title" className="font-display text-sm font-bold">Structural diagnosis</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-relaxed text-muted">
              {diagnosis.map((finding) => <li key={finding}>{finding}</li>)}
            </ul>
          </section>

          <section aria-labelledby="module-telemetry-title">
            <h3 id="module-telemetry-title" className="font-display text-sm font-bold">Module telemetry</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div><dt className="font-mono text-muted">LOC</dt><dd className="mt-1 font-mono">{node.linesOfCode}</dd></div>
              {node.kind === 'preset' ? (
                <div><dt className="font-mono text-muted">Last modified</dt><dd className="mt-1 font-mono">{node.lastModified}</dd></div>
              ) : (
                <>
                  <div><dt className="font-mono text-muted">Nesting depth</dt><dd className="mt-1 font-mono">{node.nestingDepth}</dd></div>
                  <div><dt className="font-mono text-muted">Comment ratio</dt><dd className="mt-1 font-mono">{(node.commentRatio * 100).toFixed(1)}%</dd></div>
                  <div><dt className="font-mono text-muted">Imports</dt><dd className="mt-1 font-mono">{node.importCount}</dd></div>
                  <div><dt className="font-mono text-muted">Exports</dt><dd className="mt-1 font-mono">{node.exportCount}</dd></div>
                  <div><dt className="font-mono text-muted">File size</dt><dd className="mt-1 font-mono">{node.fileSize} bytes</dd></div>
                  <div><dt className="font-mono text-muted">Language</dt><dd className="mt-1 font-mono">{node.language}</dd></div>
                </>
              )}
            </dl>
          </section>

          <section aria-labelledby="source-excerpt-title">
            <h3 id="source-excerpt-title" className="font-display text-sm font-bold">Source excerpt{node.kind === 'ingested' && node.isTruncated ? ' (truncated)' : ''}</h3>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-hairline bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink">{node.kind === 'preset' ? node.codeExcerpt : node.rawContent}</pre>
          </section>
        </div>
      ) : (
        <p className="py-5 text-xs text-muted">Select a file node to inspect its diagnosis and source.</p>
      )}
    </aside>
  );
}

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const [source, setSource] = useState<{ repo: string | null; specimenId: PresetId | null } | null>(null);
  const [specimen, setSpecimen] = useState<Specimen | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [spotlightNodeIds, setSpotlightNodeIds] = useState<string[]>([]);
  const [isolateHotspots, setIsolateHotspots] = useState(false);
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
    const highestRotNode = nextSpecimen?.nodes.reduce((highest, node) => (
      highest === null || node.rotScore > highest.rotScore ? node : highest
    ), null as Specimen['nodes'][number] | null);

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
          body: JSON.stringify({ repositoryUrl: normalizedRepository }),
          signal: controller.signal,
        });
        let payload: ApiResponse<IngestResult>;
        try {
          payload = await response.json() as ApiResponse<IngestResult>;
        } catch {
          if (!controller.signal.aborted) setRequestState(createIngestErrorState(undefined, repo ?? undefined));
          return;
        }
        if (!response.ok || !payload.success || !payload.data) {
          if (!controller.signal.aborted) setRequestState(createIngestErrorState(payload.error?.code, repo ?? undefined));
          return;
        }
        if (controller.signal.aborted) return;
        const ingestedSpecimen = convertIngestResult(payload.data);
        const highestNode = ingestedSpecimen.nodes.reduce((highest, node) => (
          highest === null || node.rotScore > highest.rotScore ? node : highest
        ), null as Specimen['nodes'][number] | null);
        setSpecimen(ingestedSpecimen);
        setSelectedNodeId(null);
        setRequestState({
          status: 'success',
          repository: deriveRepositoryTitle(payload.data.metadata!.repositoryUrl),
          partial: payload.data.metadata!.treeTruncated || payload.data.metadata!.skippedFiles.length > 0,
        });
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


  useEffect(() => {
    const validSpotlightNodes = (specimen?.nodes ?? []).filter((node) => spotlightNodeIds.includes(node.id));
    if (validSpotlightNodes.length === 0) return;
    const center = validSpotlightNodes.reduce(
      (sum, node) => ({ x: sum.x + node.position.x + NODE_WIDTH / 2, y: sum.y + node.position.y + NODE_HEIGHT / 2 }),
      { x: 0, y: 0 },
    );
    const frame = requestAnimationFrame(() => {
      const offset = centerOffset(specimen?.nodes ?? []);
      setCamera({
        x: GRAPH_WIDTH / 2 - center.x / validSpotlightNodes.length - offset.x,
        y: GRAPH_HEIGHT / 2 - center.y / validSpotlightNodes.length - offset.y,
        scale: 1,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [specimen, spotlightNodeIds]);

  useEffect(() => () => window.speechSynthesis.cancel(), []);

  const selectNode = (nodeId: string) => {
    if ((specimen?.nodes ?? []).some((node) => node.id === nodeId)) setSelectedNodeId(nodeId);
  };

  const title = specimen?.title ?? source?.repo ?? 'Necro-Docs workspace';
  const summary = specimen?.summary;

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-canvas font-sans text-ink">
      <h1 ref={lifecycleHeadingRef} tabIndex={-1} className="sr-only">Necro-Docs workspace</h1>
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-hairline bg-white px-5">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">
            <ChevronLeft size={16} aria-hidden="true" />
            <span>Back</span>
          </Link>
          <span aria-hidden="true" className="h-4 w-px bg-hairline" />
          <span className="truncate font-mono text-xs font-semibold" title={title}>{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {summary && <span className="hidden font-mono text-xs text-muted sm:inline">{summary}</span>}
          {requestState.status === 'success' && requestState.partial && <span className="hidden font-mono text-xs text-muted sm:inline">Partial result</span>}
          {requestState.status === 'success' && requestState.showingSample && <span className="hidden font-mono text-xs text-muted sm:inline">Showing sample data</span>}
          <button type="button" aria-pressed={isolateHotspots} onClick={() => setIsolateHotspots((value) => !value)} className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent ${isolateHotspots ? 'border-ink bg-ink text-white' : 'border-hairline text-ink hover:bg-surface'}`}>
            Isolate hotspots
          </button>
          <button type="button" aria-label="Reset graph view" onClick={() => setCamera({ x: 0, y: 20, scale: 0.92 })} className="flex items-center gap-1.5 rounded-full border border-hairline px-3.5 py-1.5 text-xs font-medium text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">
            <RotateCcw size={13} aria-hidden="true" />
            <span>Reset view</span>
          </button>
        </div>
      </header>

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
          <GraphViewport
            specimen={specimen}
            selectedNodeId={selectedNodeId}
            spotlightNodeIds={spotlightNodeIds}
            camera={camera}
            onCameraChange={setCamera}
            onSelectNode={selectNode}
            isolateHotspots={isolateHotspots}
          />
          {selectedNodeId && <SeanceConsole specimen={specimen} selectedNodeId={selectedNodeId} onSpotlight={({ nodeIds, selectedNodeId: responseSelection }) => {
            setSpotlightNodeIds(nodeIds);
            if (responseSelection) setSelectedNodeId(responseSelection);
          }} />}
          {selectedNodeId && <DetailPanel specimen={specimen} selectedNodeId={selectedNodeId} onClose={() => setSelectedNodeId(null)} />}
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
