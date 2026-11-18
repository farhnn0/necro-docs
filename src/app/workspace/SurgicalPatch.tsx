'use client';

import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { diffHunks, diffLines, unifiedDiff } from '@/lib/diff';

type PatchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; summary: string; patchedCode: string; provider: 'ai' | 'static-fallback' };

/**
 * Asks POST /api/patch for a fix of `findings` in `code` and shows a real line diff.
 * Render it with `key={path}` so a patch never carries over to another file.
 */
export function SurgicalPatch({ path, code, findings }: { path: string; code: string; findings: string[] }) {
  const [state, setState] = useState<PatchState>({ status: 'idle' });
  const [copied, setCopied] = useState<'diff' | 'file' | null>(null);

  const patchedCode = state.status === 'ready' ? state.patchedCode : null;
  const hunks = useMemo(() => (patchedCode === null ? [] : diffHunks(diffLines(code, patchedCode))), [code, patchedCode]);
  const added = hunks.reduce((sum, hunk) => sum + hunk.lines.filter((line) => line.kind === 'add').length, 0);
  const removed = hunks.reduce((sum, hunk) => sum + hunk.lines.filter((line) => line.kind === 'del').length, 0);
  const countLines = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').length;
  // A model that skips code ("// rest unchanged") makes the full-file copy destructive, so flag big shrinkage.
  const suspiciouslyShort = patchedCode !== null && countLines(patchedCode) < countLines(code) * 0.8;

  const synthesize = async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/patch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, code, findings }) });
      const data = (await response.json()) as { summary?: string; patchedCode?: string; provider?: string; error?: string };
      if (!response.ok || typeof data.patchedCode !== 'string') {
        setState({ status: 'error', message: data.error ?? 'The patch could not be generated.' });
        return;
      }
      setState({ status: 'ready', summary: data.summary ?? '', patchedCode: data.patchedCode, provider: data.provider === 'ai' ? 'ai' : 'static-fallback' });
    } catch {
      setState({ status: 'error', message: 'The server could not be reached.' });
    }
  };

  const copy = async (kind: 'diff' | 'file') => {
    if (patchedCode === null || !navigator.clipboard) return;
    await navigator.clipboard.writeText(kind === 'diff' ? unifiedDiff(path, code, patchedCode) : patchedCode);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const buttonClass = 'rounded-full border border-hairline bg-white px-3 py-1 text-[10px] text-muted hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent';

  return (
    <section aria-labelledby="surgical-patch-title" className="rounded-xl border border-hairline bg-surface/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-ink" />
          <h3 id="surgical-patch-title" className="font-display text-[13px] font-semibold text-ink">Surgical patch</h3>
        </div>
        {state.status === 'ready' && hunks.length > 0 && (
          <span className="font-mono text-[10px]"><span className="text-emerald">+{added}</span> <span className="text-crimson">−{removed}</span></span>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-normal text-muted">
        Synthesizes a targeted AI diff patch to refactor high-rot hotspots.
      </p>

      {state.status === 'idle' && (
        <button type="button" onClick={synthesize} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-medium text-white shadow-xs transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">
          <Sparkles size={13} className="text-white/80" />
          <span>Synthesize Surgical Patch</span>
        </button>
      )}
      {state.status === 'loading' && <p role="status" className="mt-2 text-[13px] text-muted">Synthesizing a minimal patch…</p>}
      {state.status === 'error' && (
        <div role="alert" className="mt-2 text-[13px]">
          <p className="text-crimson">{state.message}</p>
          <button type="button" onClick={synthesize} className={`mt-2 ${buttonClass}`}>Try again</button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <p className="mt-2 text-[13px] leading-[1.45] text-muted">{state.summary}</p>
          {hunks.length === 0 ? (
            <p className="mt-2 text-[13px] leading-[1.45] text-muted">
              {state.provider === 'ai' ? 'The AI returned the file unchanged, so there is nothing to apply.' : 'No changes were made to the file.'}
            </p>
          ) : (
            <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-hairline bg-white font-mono text-[10px] leading-5" tabIndex={0} aria-label={`Diff for ${path}`}>
              {hunks.map((hunk) => (
                <div key={`${hunk.oldStart}:${hunk.newStart}`} className="min-w-max">
                  <div className="sticky left-0 bg-surface px-2 text-muted">@@ −{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@</div>
                  {hunk.lines.map((line) => (
                    <div
                      key={`${line.kind}:${line.oldNo ?? ''}:${line.newNo ?? ''}`}
                      className={`flex ${line.kind === 'del' ? 'bg-crimson/10' : line.kind === 'add' ? 'bg-emerald/10' : ''}`}
                    >
                      <span aria-hidden="true" className="w-8 shrink-0 select-none pr-1 text-right text-muted/60">{line.oldNo ?? ''}</span>
                      <span aria-hidden="true" className="w-8 shrink-0 select-none pr-1 text-right text-muted/60">{line.newNo ?? ''}</span>
                      <span className={`w-4 shrink-0 select-none text-center ${line.kind === 'del' ? 'text-crimson' : line.kind === 'add' ? 'text-emerald' : 'text-muted/40'}`}>
                        {line.kind === 'del' ? '−' : line.kind === 'add' ? '+' : ' '}
                      </span>
                      <span className="whitespace-pre pr-3 text-ink">{line.text || ' '}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {suspiciouslyShort && (
            <p role="alert" className="mt-2 rounded-md bg-amber/10 px-2 py-1.5 text-[11px] leading-[1.4] text-amber">
              The patched file is much shorter than the original. The AI may have dropped code, so review the diff before copying the full file.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => copy('diff')} disabled={hunks.length === 0} className={buttonClass} title="Unified diff of the changed lines, for git apply">
              {copied === 'diff' ? 'Copied' : 'Copy patch'}
            </button>
            <button type="button" onClick={() => copy('file')} disabled={hunks.length === 0} className={buttonClass} title="The entire patched file, line 1 to the end">
              {copied === 'file' ? 'Copied' : 'Copy full file'}
            </button>
            <button type="button" onClick={synthesize} className={buttonClass}>Regenerate</button>
          </div>
        </>
      )}
    </section>
  );
}
