'use client';

import { Info, Maximize2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RepoCoverage } from '@/lib/repoAnalyzer';
import { MAX_REVEALED, type GraphScope } from './graphDisplay';

interface GraphScopeBarProps {
  scope: GraphScope;
  keyCount: number;
  totalCount: number;
  hiddenCount: number;
  /** Files drawn in the key view on top of the key files (search hits, selection, blast radius). */
  revealedCount: number;
  /** Search hits outside the key files, before the MAX_REVEALED cap. */
  searchHits: number;
  coverage: RepoCoverage | null;
  onScopeChange: (scope: GraphScope) => void;
  onFit: () => void;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Bottom-centre bar of the canvas: switches between the key files and every analyzed file, says what
 * extra files are on screen and why, and explains what the analysis did and did not cover.
 */
export function GraphScopeBar({ scope, keyCount, totalCount, hiddenCount, revealedCount, searchHits, coverage, onScopeChange, onFit }: GraphScopeBarProps) {
  const status = scope === 'key' && searchHits > 0
    ? `${plural(Math.min(searchHits, MAX_REVEALED), 'match')} outside the key files${searchHits > MAX_REVEALED ? ` (first ${MAX_REVEALED} of ${searchHits})` : ''} added on the right`
    : scope === 'key' && revealedCount > 0
      ? `${plural(revealedCount, 'file')} outside the key files shown`
      : coverage
        ? `${coverage.analyzed} of ${plural(coverage.totalFiles, 'source file')} analyzed`
        : `${plural(totalCount, 'file')} analyzed`;
  const showFit = scope === 'key' && revealedCount > 0;

  const skipped = coverage
    ? ([
        ['Test files', coverage.skipped.tests],
        ['Config files', coverage.skipped.config],
        ['Build output, vendored & dot-folders', coverage.skipped.generated],
        ['Larger than 250 KB', coverage.skipped.tooLarge],
        [`Over the ${coverage.fileLimit}-file or size budget`, coverage.skipped.overLimit],
        ['Could not be read from GitHub', coverage.skipped.unreadable],
      ] as const).filter(([, count]) => count > 0)
    : [];

  const tab = (value: GraphScope, label: string, count: number) => (
    <button
      type="button"
      aria-pressed={scope === value}
      onClick={() => onScopeChange(value)}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent ${
        scope === value ? 'bg-white text-ink shadow-xs' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
      <span className={`font-mono text-[10px] ${scope === value ? 'text-muted' : 'text-muted/70'}`}>{count}</span>
    </button>
  );

  return (
    <div
      role="group"
      aria-label="Graph scope"
      className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-hairline bg-white/95 py-1.5 pl-1.5 pr-2 shadow-[0_12px_32px_-4px_rgba(17,17,19,0.10)] backdrop-blur-md"
    >
      {hiddenCount > 0 && (
        <div className="flex shrink-0 rounded-xl border border-hairline bg-surface/70 p-0.5" title="Key files are the worst hotspots, the most imported files and the entry points">
          {tab('key', 'Key files', keyCount)}
          {tab('all', 'All files', totalCount)}
        </div>
      )}
      <span aria-live="polite" className="min-w-0 truncate px-1 text-[11px] text-muted">{status}</span>
      {showFit && (
        <button
          type="button"
          onClick={onFit}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-hairline px-2 py-1 text-[11px] font-medium text-ink transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
        >
          <Maximize2 size={11} aria-hidden="true" />
          Fit view
        </button>
      )}
      {coverage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Analysis coverage"
              title="Analysis coverage"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
            >
              <Info size={14} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="w-72 rounded-xl border-hairline bg-white p-3 text-xs shadow-lg">
            <DropdownMenuLabel className="p-0 font-display text-[13px] font-semibold text-ink">Analysis coverage</DropdownMenuLabel>
            <dl className="mt-2 space-y-1.5">
              <Row label="Source files in repository" value={coverage.totalFiles} />
              <Row label="Analyzed" value={coverage.analyzed} strong />
              <Row label="Key files (shown first)" value={coverage.featured} />
            </dl>
            {skipped.length > 0 && (
              <>
                <DropdownMenuSeparator className="my-2.5 bg-hairline" />
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Not analyzed</p>
                <dl className="mt-1.5 space-y-1.5">
                  {skipped.map(([label, count]) => <Row key={label} label={label} value={count} />)}
                </dl>
              </>
            )}
            {coverage.treeTruncated && (
              <p className="mt-2.5 rounded-lg bg-amber/10 px-2 py-1.5 text-[11px] leading-snug text-amber">
                GitHub truncated the file tree of this very large repository, so some files were never listed.
              </p>
            )}
            <p className="mt-2.5 text-[11px] leading-snug text-muted">
              Rot scores, search and blast radius use every analyzed file. AI explanations cover the key files; the rest use static analysis.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`font-mono ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}
