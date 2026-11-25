'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { INGEST_STAGE_INTERVAL_MS, INGEST_STAGES, shouldShowSlowIngest } from '@/lib/conversion/helpers';

/** Progress card for /api/ingest. `children` appear once the request is slow (e.g. sample specimens). */
export function IngestProgress({ repository, onCancel, children }: { repository?: string; onCancel?: () => void; children?: ReactNode }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - start), 500);
    return () => window.clearInterval(timer);
  }, []);
  const stage = Math.min(Math.floor(elapsed / INGEST_STAGE_INTERVAL_MS), INGEST_STAGES.length - 1);
  const slow = shouldShowSlowIngest(elapsed);

  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-xl rounded-2xl border border-hairline bg-white p-4 text-left text-xs shadow-sm">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-hairline border-t-ink" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">Dissecting repository</p>
          {repository && <p className="truncate font-mono text-[11px] text-muted">{repository}</p>}
        </div>
        <span aria-hidden="true" className="font-mono text-[11px] tabular-nums text-muted">{Math.floor(elapsed / 1000)}s</span>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-full border border-hairline px-3 py-1 text-[11px] text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">Cancel</button>}
      </div>
      <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-full bg-hairline">
        <div className="h-full rounded-full bg-ink transition-[width] duration-700" style={{ width: `${((stage + 0.5) / INGEST_STAGES.length) * 100}%` }} />
      </div>
      <ol aria-label="Analysis progress" className="mt-3 grid gap-1 font-mono text-[11px] sm:grid-cols-2">
        {INGEST_STAGES.map((label, index) => {
          const state = index < stage ? 'done' : index === stage ? 'active' : 'pending';
          return <li key={label} aria-current={state === 'active' ? 'step' : undefined} className={state === 'pending' ? 'text-muted/60' : state === 'done' ? 'text-muted' : 'animate-pulse font-semibold text-ink'}>{state === 'done' ? '✓ ' : state === 'active' ? '› ' : '· '}{label}</li>;
        })}
      </ol>
      {slow && (
        <div className="mt-3 border-t border-hairline pt-3 text-muted">
          <p>This is taking longer than usual. Large repositories can take up to a minute, because every source file is read from GitHub.</p>
          {children}
        </div>
      )}
    </div>
  );
}
