'use client';

import { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileMinus2,
  FilePlus2,
  GitBranch,
  Minus,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  formatRelativeTime,
  type AuditComparison,
  type AuditSnapshot,
  type FileAuditDelta,
} from '@/lib/auditCompare';

const INITIAL_VISIBLE_FILES = 5;

function splitPath(path: string): { dir: string; name: string } {
  const idx = path.lastIndexOf('/');
  if (idx === -1) return { dir: '', name: path };
  return { dir: path.slice(0, idx + 1), name: path.slice(idx + 1) };
}

function DeltaBadge({
  delta,
  lowerIsBetter = true,
  suffix = '',
}: {
  delta: number;
  lowerIsBetter?: boolean;
  suffix?: string;
}) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] font-medium text-muted">
        <Minus size={10} aria-hidden="true" />
        0{suffix}
      </span>
    );
  }
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  const label = `${delta > 0 ? '+' : '−'}${Math.abs(delta)}${suffix}`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${
        good ? 'bg-emerald/10 text-emerald' : 'bg-crimson/10 text-crimson'
      }`}
    >
      <Icon size={11} aria-hidden="true" />
      {label}
    </span>
  );
}

function FileDeltaRow({
  item,
  tone,
  onSelect,
}: {
  item: FileAuditDelta;
  tone: 'worsened' | 'improved';
  onSelect: (path: string) => void;
}) {
  const { dir, name } = splitPath(item.path);
  const accent = tone === 'worsened' ? 'text-crimson' : 'text-emerald';
  const ring =
    tone === 'worsened'
      ? 'hover:border-crimson/30 hover:bg-crimson/[0.02]'
      : 'hover:border-emerald/30 hover:bg-emerald/[0.02]';

  return (
    <button
      type="button"
      onClick={() => onSelect(item.path)}
      className={`group w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-left transition ${ring} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink group-hover:underline" title={item.path}>
            {name}
          </p>
          {dir && (
            <p className="truncate font-mono text-[10px] text-muted" title={item.path}>
              {dir}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
          <span className="text-muted">{item.previousRot}</span>
          <span className="text-muted/50" aria-hidden="true">→</span>
          <span className={`font-semibold ${accent}`}>{item.currentRot}</span>
          {item.rotDelta !== 0 && <DeltaBadge delta={item.rotDelta} />}
        </div>
      </div>

      {item.kindDeltas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.kindDeltas.slice(0, 4).map(({ kind, delta }) => (
            <span
              key={kind}
              className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                delta > 0
                  ? 'bg-crimson/10 text-crimson'
                  : 'bg-emerald/10 text-emerald'
              }`}
            >
              {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`} {kind}
            </span>
          ))}
          {item.kindDeltas.length > 4 && (
            <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
              +{item.kindDeltas.length - 4} more
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function FileColumn({
  title,
  tone,
  items,
  emptyLabel,
  onSelectFile,
}: {
  title: string;
  tone: 'worsened' | 'improved';
  items: readonly FileAuditDelta[];
  emptyLabel: string;
  onSelectFile: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, INITIAL_VISIBLE_FILES);
  const dotColor = tone === 'worsened' ? 'bg-crimson' : 'bg-emerald';

  return (
    <div className="flex flex-col rounded-2xl border border-hairline bg-surface/50 p-3">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotColor}`} />
          <h3 className="font-display text-xs font-semibold text-ink">{title}</h3>
        </div>
        <span className="font-mono text-[10px] text-muted">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline bg-white/70 px-3 py-5 text-center text-xs text-muted">
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <FileDeltaRow key={item.path} item={item} tone={tone} onSelect={onSelectFile} />
          ))}
          {items.length > INITIAL_VISIBLE_FILES && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="w-full rounded-lg py-1.5 text-center font-mono text-[10px] font-medium text-muted transition hover:bg-white hover:text-ink"
            >
              {expanded ? 'Show fewer' : `Show all ${items.length} files`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AuditComparePanel({
  current,
  comparison,
  canReanalyze,
  onReanalyze,
  onSelectFile,
  onClose,
}: {
  current: AuditSnapshot;
  comparison: AuditComparison | null;
  canReanalyze: boolean;
  onReanalyze?: () => void;
  onSelectFile: (path: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const verdictMeta = comparison
    ? comparison.verdict === 'improved'
      ? {
          label: 'Codebase improved',
          pill: 'bg-emerald/10 text-emerald border-emerald/20',
        }
      : comparison.verdict === 'worsened'
        ? {
            label: 'Rot increased',
            pill: 'bg-crimson/10 text-crimson border-crimson/20',
          }
        : {
            label: 'No change',
            pill: 'bg-surface text-muted border-hairline',
          }
    : null;

  const hasFileChanges =
    comparison !== null &&
    (comparison.worsened.length > 0 ||
      comparison.improved.length > 0 ||
      comparison.files.added.length > 0 ||
      comparison.files.removed.length > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-compare-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px] sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-hairline bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-medium tracking-wider text-muted">
              AUDIT COMPARISON · SINCE LAST SNAPSHOT
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2
                id="audit-compare-title"
                className="truncate font-display text-lg font-medium text-ink"
              >
                {current.repository}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-2 py-0.5 font-mono text-[10px] text-muted">
                <GitBranch size={10} aria-hidden="true" />
                {current.branch}
              </span>
              {verdictMeta && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${verdictMeta.pill}`}
                >
                  {verdictMeta.label}
                </span>
              )}
            </div>
            {comparison && (
              <p
                className="mt-1 flex items-center gap-1.5 text-xs text-muted"
                title={new Date(comparison.previousSavedAt).toLocaleString()}
              >
                <Clock size={12} aria-hidden="true" />
                <span>
                  Compared against snapshot from{' '}
                  <strong className="font-medium text-ink">
                    {formatRelativeTime(comparison.previousSavedAt)}
                  </strong>
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline text-muted transition hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!comparison ? (
            <div className="rounded-2xl border border-hairline bg-surface/60 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-medium text-ink">
                    Baseline snapshot recorded
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    This is the first audit saved for{' '}
                    <span className="font-mono text-ink">{current.repository}</span> in this
                    browser. Re-analyze after making code changes to see rot deltas, resolved
                    findings, and regressed files.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-hairline bg-white p-3">
                  <p className="font-mono text-[10px] text-muted">OVERALL ROT</p>
                  <p className="mt-1 font-display text-lg font-semibold text-ink">
                    {current.overallRot}%
                  </p>
                </div>
                <div className="rounded-xl border border-hairline bg-white p-3">
                  <p className="font-mono text-[10px] text-muted">STATIC FINDINGS</p>
                  <p className="mt-1 font-display text-lg font-semibold text-ink">
                    {current.findingCount}
                  </p>
                </div>
                <div className="rounded-xl border border-hairline bg-white p-3">
                  <p className="font-mono text-[10px] text-muted">ANALYZED FILES</p>
                  <p className="mt-1 font-display text-lg font-semibold text-ink">
                    {current.fileCount}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 3 KPI Summary Cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Overall Rot */}
                <div className="rounded-2xl border border-hairline bg-surface/40 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-medium text-muted">OVERALL ROT</span>
                    <DeltaBadge delta={comparison.overallRot.delta} suffix="%" />
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5 font-display">
                    <span className="text-sm text-muted">{comparison.overallRot.previous}%</span>
                    <span className="text-xs text-muted/60" aria-hidden="true">→</span>
                    <span className="text-xl font-semibold text-ink">
                      {comparison.overallRot.current}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-hairline/70">
                    <div
                      className={`h-full rounded-full transition-all ${
                        comparison.overallRot.current >= 65
                          ? 'bg-crimson'
                          : comparison.overallRot.current >= 40
                            ? 'bg-amber'
                            : 'bg-emerald'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(2, comparison.overallRot.current))}%` }}
                    />
                  </div>
                </div>

                {/* Static Findings */}
                <div className="rounded-2xl border border-hairline bg-surface/40 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-medium text-muted">
                      STATIC FINDINGS
                    </span>
                    <DeltaBadge delta={comparison.findings.delta} />
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5 font-display">
                    <span className="text-sm text-muted">{comparison.findings.previous}</span>
                    <span className="text-xs text-muted/60" aria-hidden="true">→</span>
                    <span className="text-xl font-semibold text-ink">
                      {comparison.findings.current}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] text-muted">
                    <span className="text-emerald">−{comparison.findings.resolved} resolved</span>
                    <span className="mx-1.5 text-muted/40">·</span>
                    <span className={comparison.findings.introduced > 0 ? 'text-crimson' : ''}>
                      +{comparison.findings.introduced} new
                    </span>
                  </p>
                </div>

                {/* Files */}
                <div className="rounded-2xl border border-hairline bg-surface/40 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-medium text-muted">
                      ANALYZED FILES
                    </span>
                    <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] font-medium text-muted">
                      {comparison.files.delta === 0
                        ? '0'
                        : `${comparison.files.delta > 0 ? '+' : '−'}${Math.abs(comparison.files.delta)}`}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5 font-display">
                    <span className="text-sm text-muted">{comparison.files.previous}</span>
                    <span className="text-xs text-muted/60" aria-hidden="true">→</span>
                    <span className="text-xl font-semibold text-ink">
                      {comparison.files.current}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono text-[10px] text-muted">
                    +{comparison.files.added.length} added
                    <span className="mx-1.5 text-muted/40">·</span>
                    −{comparison.files.removed.length} removed
                  </p>
                </div>
              </div>

              {/* Per-file diff */}
              {!hasFileChanges ? (
                <div className="rounded-2xl border border-hairline bg-surface/50 px-4 py-6 text-center">
                  <p className="text-xs font-medium text-ink">
                    No file-level changes detected
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    All {comparison.unchangedCount} analyzed files match the previous snapshot.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FileColumn
                      title="Worsened"
                      tone="worsened"
                      items={comparison.worsened}
                      emptyLabel="No files regressed since the last audit."
                      onSelectFile={onSelectFile}
                    />
                    <FileColumn
                      title="Improved"
                      tone="improved"
                      items={comparison.improved}
                      emptyLabel="No files improved since the last audit."
                      onSelectFile={onSelectFile}
                    />
                  </div>

                  {(comparison.files.added.length > 0 || comparison.files.removed.length > 0) && (
                    <div className="rounded-2xl border border-hairline bg-surface/40 p-3.5">
                      <p className="font-mono text-[10px] font-medium text-muted">
                        ADDED &amp; REMOVED FILES
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {comparison.files.added.map((file) => (
                          <button
                            key={`add:${file.path}`}
                            type="button"
                            onClick={() => onSelectFile(file.path)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-2.5 py-1 font-mono text-[11px] text-ink transition hover:border-ink/40"
                            title={`${file.path} (${file.rotScore} rot, ${file.findings} findings)`}
                          >
                            <FilePlus2 size={12} className="text-emerald" aria-hidden="true" />
                            <span className="max-w-[280px] truncate">{file.path}</span>
                            <span className="text-[10px] text-muted">{file.rotScore}</span>
                          </button>
                        ))}
                        {comparison.files.removed.map((file) => (
                          <span
                            key={`rem:${file.path}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-2.5 py-1 font-mono text-[11px] text-muted line-through"
                            title={`Removed: ${file.path} (was ${file.rotScore} rot)`}
                          >
                            <FileMinus2 size={12} className="text-muted" aria-hidden="true" />
                            <span className="max-w-[280px] truncate">{file.path}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-surface/50 px-5 py-3">
          <p className="text-[11px] text-muted">
            {comparison
              ? 'Click any file to inspect it on the dependency graph.'
              : 'Snapshots are saved locally in this browser (last 2 per repo).'}
          </p>
          <div className="flex items-center gap-2">
            {canReanalyze && onReanalyze && (
              <button
                type="button"
                onClick={onReanalyze}
                className="inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
              >
                <RefreshCw size={12} aria-hidden="true" />
                Re-analyze now
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-ink px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
