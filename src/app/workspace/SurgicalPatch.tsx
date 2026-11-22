'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  GitPullRequest,
  KeyRound,
  Loader2,
  RotateCw,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { diffHunks, diffLines, unifiedDiff } from '@/lib/diff';
import { isPatchable, type RepoFinding } from '@/lib/types';

export type CachedPatch = {
  summary: string;
  patchedCode: string;
  provider: 'ai' | 'static-fallback';
  /** Findings the second scan confirmed as resolved, and fixable findings still present. */
  fixed?: string[];
  remaining?: string[];
};

type PrState =
  | { status: 'idle' }
  | { status: 'creating' }
  | { status: 'error'; message: string }
  | { status: 'done'; number: number; url: string };

/** Codes that mean "this token cannot do it": the user can supply another token or push by hand. */
const AUTH_CODES = new Set(['MISSING_TOKEN', 'INVALID_TOKEN', 'NO_PUSH_ACCESS']);

/** Text that is safe inside double quotes in Bash, PowerShell and CMD (no $, `, ", %, !, \). */
const safeText = (text: string) => text.replace(/[^\w .()[\]/-]/g, '_');
/** Path argument: plain when it only has safe characters, otherwise double-quoted. */
const cliArg = (path: string) => (/^[\w./-]+$/.test(path) ? path : `"${safeText(path)}"`);

function GithubMark({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

type PatchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ({ status: 'ready' } & CachedPatch);

/**
 * Asks POST /api/patch for a verified fix of the locally fixable findings in `code` and shows a real line diff.
 * `findings` is only known for analyzed files; without it the server decides whether anything is fixable.
 * Render it with `key={path}` so a patch never carries over to another file.
 */
export function SurgicalPatch({
  path,
  code,
  findings,
  importedBy = [],
  dependencies = [],
  repositoryUrl = null,
  rotScore,
  initialPatch = null,
  onSynthesized,
}: {
  path: string;
  code: string;
  findings?: RepoFinding[];
  /** Paths of the files that import this one, and the repository's package names: context for the model. */
  importedBy?: string[];
  dependencies?: string[];
  repositoryUrl?: string | null;
  rotScore?: number;
  initialPatch?: CachedPatch | null;
  onSynthesized?: (patch: CachedPatch) => void;
}) {
  const [state, setState] = useState<PatchState>(() => {
    if (initialPatch) {
      return { status: 'ready', ...initialPatch };
    }
    return { status: 'idle' };
  });
  const [copied, setCopied] = useState<'diff' | 'file' | 'cli' | null>(null);
  const [pr, setPr] = useState<PrState>({ status: 'idle' });
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [customToken, setCustomToken] = useState('');
  // Fixed per mounted patch so the copied CLI commands and the dialog agree on the branch name.
  const [cliBranch] = useState(() => `necro/fix-${(path.split('/').pop() ?? 'file').replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file'}-${Date.now().toString(36)}`);

  const patchedCode = state.status === 'ready' ? state.patchedCode : null;
  const hunks = useMemo(() => (patchedCode === null ? [] : diffHunks(diffLines(code, patchedCode))), [code, patchedCode]);
  const added = hunks.reduce((sum, hunk) => sum + hunk.lines.filter((line) => line.kind === 'add').length, 0);
  const removed = hunks.reduce((sum, hunk) => sum + hunk.lines.filter((line) => line.kind === 'del').length, 0);
  const nothingFixable = findings !== undefined && !findings.some(isPatchable);

  const patchFileName = `${cliBranch.replace('necro/', 'necro-')}.patch`;
  // One command set that runs unchanged in Bash, zsh, PowerShell and CMD: no heredoc, no single quotes.
  const cliCommands = patchedCode === null ? '' : [
    `git checkout -b ${cliBranch}`,
    // --ignore-whitespace: the diff is built from LF text, so without it CRLF files and files without a final newline fail to apply.
    `git apply --ignore-whitespace --whitespace=nowarn ${patchFileName}`,
    `git add -- ${cliArg(path)}`,
    `git commit -m "fix(forensics): remediate code rot in ${safeText(path.split('/').pop() ?? path)} [NecroDocs Autopsy]"`,
    `git push -u origin ${cliBranch}`,
  ].join('\n');

  const createPr = async (token?: string) => {
    if (state.status !== 'ready' || !repositoryUrl) return;
    setPr({ status: 'creating' });
    try {
      const response = await fetch('/api/pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'x-github-token': token } : {}) },
        body: JSON.stringify({ repositoryUrl, filePath: path, originalCode: code, patchedCode: state.patchedCode, summary: state.summary, rotScore }),
      });
      const payload = await response.json() as { success?: boolean; data?: { prNumber?: number; prUrl?: string }; error?: { code?: string; message?: string } };
      if (response.ok && payload.success && typeof payload.data?.prNumber === 'number' && payload.data.prUrl?.startsWith('https://github.com/')) {
        setPr({ status: 'done', number: payload.data.prNumber, url: payload.data.prUrl });
        setFallbackReason(null);
        setCustomToken('');
        return;
      }
      const message = payload.error?.message ?? 'The pull request could not be created.';
      if (payload.error?.code && AUTH_CODES.has(payload.error.code)) {
        setFallbackReason(message);
        setPr({ status: 'idle' });
      } else {
        setPr({ status: 'error', message });
      }
    } catch {
      setPr({ status: 'error', message: 'The server could not be reached.' });
    }
  };

  const downloadPatch = () => {
    if (patchedCode === null) return;
    const url = URL.createObjectURL(new Blob([unifiedDiff(path, code, patchedCode)], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = patchFileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyCli = async () => {
    if (!cliCommands || !navigator.clipboard) return;
    await navigator.clipboard.writeText(cliCommands);
    setCopied('cli');
    window.setTimeout(() => setCopied(null), 1600);
  };

  const synthesize = async () => {
    setPr({ status: 'idle' });
    setState({ status: 'loading' });
    try {
      const response = await fetch('/api/patch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, code, importedBy, dependencies }) });
      const data = (await response.json()) as { summary?: string; patchedCode?: string; provider?: string; fixed?: string[]; remaining?: string[]; error?: string };
      if (!response.ok || typeof data.patchedCode !== 'string') {
        setState({ status: 'error', message: data.error ?? 'The patch could not be generated.' });
        return;
      }
      const patch: CachedPatch = {
        summary: data.summary ?? '',
        patchedCode: data.patchedCode,
        provider: data.provider === 'ai' ? 'ai' : 'static-fallback',
        fixed: Array.isArray(data.fixed) ? data.fixed : [],
        remaining: Array.isArray(data.remaining) ? data.remaining : [],
      };
      setState({ status: 'ready', ...patch });
      // An unchanged file is not a patch: caching it would mark the node PATCH READY.
      if (patch.patchedCode !== code) onSynthesized?.(patch);
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

  const buttonClass = 'rounded-lg border border-hairline bg-white px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent';

  return (
    <section aria-labelledby="surgical-patch-title" className="rounded-xl border border-hairline bg-surface/50 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles size={14} className="text-ink shrink-0" />
          <h3 id="surgical-patch-title" className="font-display text-[13px] font-semibold text-ink truncate">Surgical patch</h3>
          {state.status === 'ready' && hunks.length > 0 && (
            <span className="shrink-0 rounded-full bg-emerald px-2 py-0.5 font-mono text-[9px] font-bold text-white shadow-2xs">
              SYNTHESIZED
            </span>
          )}
        </div>
        {state.status === 'ready' && hunks.length > 0 && (
          <span className="font-mono text-[10px] shrink-0"><span className="text-emerald">+{added}</span> <span className="text-crimson">−{removed}</span></span>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-normal text-muted">
        {state.status === 'ready' && hunks.length > 0
          ? 'Synthesized AI patch is loaded and ready. Stored in session cache (0 extra tokens).'
          : nothingFixable
            ? 'Nothing here can be fixed by a local edit. Size, nesting, duplication and debt findings need a planned refactor, so no automatic patch is offered.'
            : 'Fixes the findings a local edit can resolve (swallowed errors, unsafe HTML, eval, type suppressions, hard-coded secrets), then re-scans the result before showing it.'}
      </p>

      {state.status === 'idle' && !nothingFixable && (
        <button type="button" onClick={synthesize} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-medium text-white shadow-xs transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">
          <Sparkles size={12} className="text-white/80" />
          <span>Synthesize Surgical Patch</span>
        </button>
      )}
      {state.status === 'loading' && <p role="status" className="mt-2 text-[12px] text-muted">Synthesizing a minimal patch…</p>}
      {state.status === 'error' && (
        <div role="alert" className="mt-2 text-[12px]">
          <p className="text-crimson">{state.message}</p>
          <button type="button" onClick={synthesize} className={`mt-2 ${buttonClass}`}>Try again</button>
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">{state.summary}</p>
          {hunks.length === 0 ? (
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              {state.provider === 'ai' ? 'The AI returned the file unchanged, so there is nothing to apply.' : 'No changes were made to the file.'}
            </p>
          ) : (
            <div className="mt-2.5 max-h-72 overflow-auto rounded-lg border border-hairline bg-white font-mono text-[10px] leading-5" tabIndex={0} aria-label={`Diff for ${path}`}>
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
          {(state.fixed?.length ?? 0) + (state.remaining?.length ?? 0) > 0 && (
            <ul className="mt-2 space-y-1 text-[11px] leading-[1.4]" aria-label="Verification result">
              {state.fixed?.map((text) => <li key={text} className="flex gap-1.5 text-emerald"><Check size={12} className="mt-0.5 shrink-0" /><span>Verified fixed: {text}</span></li>)}
              {state.remaining?.map((text) => <li key={text} className="flex gap-1.5 text-amber"><AlertTriangle size={12} className="mt-0.5 shrink-0" /><span>Still open: {text}</span></li>)}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => copy('diff')} disabled={hunks.length === 0} className={buttonClass} title="Unified diff of the changed lines, for git apply">
              {copied === 'diff' ? 'Copied' : 'Copy patch'}
            </button>
            <button type="button" onClick={() => copy('file')} disabled={hunks.length === 0} className={buttonClass} title="The entire patched file, line 1 to the end">
              {copied === 'file' ? 'Copied' : 'Copy full file'}
            </button>
            <button
              type="button"
              onClick={synthesize}
              disabled={pr.status === 'creating'}
              className={`flex items-center gap-1 ${buttonClass}`}
              title="Re-run AI synthesis to generate a new patch"
            >
              <RotateCw size={10} />
              <span>Regenerate</span>
            </button>
          </div>
          {repositoryUrl && hunks.length > 0 && (
            <div className="mt-2">
              {pr.status === 'done' ? (
                <a href={pr.url} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald bg-emerald/10 px-3 py-1.5 text-[11px] font-medium text-emerald hover:bg-emerald/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">
                  <GithubMark size={12} />
                  <span>View PR #{pr.number} on GitHub ↗</span>
                </a>
              ) : (
                <button type="button" onClick={() => void createPr()} disabled={pr.status === 'creating'} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-medium text-white shadow-xs transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent">
                  {pr.status === 'creating' ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <GithubMark size={12} />}
                  <span>{pr.status === 'creating' ? 'Creating branch & opening PR…' : 'Create Pull Request'}</span>
                </button>
              )}
              {pr.status === 'creating' && <p role="status" className="sr-only">Creating branch and opening pull request</p>}
              {pr.status === 'error' && <p role="alert" className="mt-1.5 text-[11px] leading-[1.4] text-crimson">{pr.message}</p>}
            </div>
          )}
          <Dialog open={fallbackReason !== null} onOpenChange={(open) => { if (!open) setFallbackReason(null); }}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden rounded-2xl border border-hairline bg-white p-5 sm:p-6 shadow-2xl">
              <DialogHeader className="w-full min-w-0 space-y-3 text-left">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber/30 bg-amber/10 text-amber">
                    <GitPullRequest size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-base font-semibold tracking-tight text-ink">
                      Could not open pull request
                    </DialogTitle>
                    <DialogDescription className="mt-0.5 break-words text-xs leading-relaxed text-muted">
                      {fallbackReason}
                    </DialogDescription>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl border border-amber/25 bg-amber/5 p-3 text-[11px] leading-relaxed text-amber-950">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber" />
                  <span>
                    Use a personal access token with repo write access. For fine-grained tokens, enable{' '}
                    <strong>Contents (Read & Write)</strong> and <strong>Pull Requests (Read & Write)</strong>.
                  </span>
                </div>
              </DialogHeader>

              <form onSubmit={(event) => { event.preventDefault(); if (customToken.trim()) void createPr(customToken.trim()); }} className="w-full min-w-0 space-y-2 pt-1">
                <label htmlFor="pr-token" className="flex items-center gap-1.5 text-xs font-medium text-ink">
                  <KeyRound size={13} className="text-muted" />
                  <span>Use personal access token</span>
                </label>
                <div className="flex w-full min-w-0 gap-2">
                  <input
                    id="pr-token"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={customToken}
                    onChange={(event) => setCustomToken(event.target.value)}
                    placeholder="ghp_… or github_pat_…"
                    className="h-9 w-full min-w-0 flex-1 rounded-xl border border-hairline bg-surface/50 px-3 font-mono text-xs text-ink placeholder:text-muted/60 transition-colors focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
                  />
                  <button
                    type="submit"
                    disabled={!customToken.trim() || pr.status === 'creating'}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-ink px-4 text-xs font-medium text-white shadow-xs transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
                  >
                    {pr.status === 'creating' && <Loader2 size={13} className="animate-spin" />}
                    <span>Retry PR</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted">Token is transmitted securely once for this API call and is never stored.</p>
              </form>

              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-hairline" />
                </div>
                <div className="relative flex justify-center text-[10px] font-mono uppercase tracking-wider">
                  <span className="bg-white px-2.5 text-muted">Or apply via Git CLI</span>
                </div>
              </div>

              <ol className="w-full min-w-0 space-y-3">
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[10px] font-semibold text-white">1</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] font-medium text-ink">Download the patch file</p>
                      <button type="button" onClick={downloadPatch} className={`inline-flex items-center gap-1 ${buttonClass}`}>
                        <Download size={11} aria-hidden="true" />
                        <span>Download .patch</span>
                      </button>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted">Move <code className="font-mono text-ink">{patchFileName}</code> into the root folder of your local clone.</p>
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[10px] font-semibold text-white">2</span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-[12px] font-medium text-ink">Run these commands in that folder</p>
                <div className="overflow-hidden rounded-xl border border-hairline bg-[#18181b] shadow-xs">
                  <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-3 py-1.5">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
                      <Terminal size={12} className="text-zinc-400" />
                      <span>terminal</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyCli()}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                    >
                      {copied === 'cli' ? <Check size={11} className="text-emerald" /> : <Copy size={11} />}
                      <span>{copied === 'cli' ? 'Copied' : 'Copy commands'}</span>
                    </button>
                  </div>
                  <pre
                    tabIndex={0}
                    aria-label="Git CLI commands"
                    className="max-h-44 w-full min-w-0 overflow-x-auto overflow-y-auto p-3 font-mono text-[10px] leading-relaxed text-zinc-300 whitespace-pre selection:bg-zinc-700"
                  >
                    {cliCommands}
                  </pre>
                </div>
                    <p className="text-[11px] text-muted">Works in PowerShell, CMD, Git Bash, macOS and Linux.</p>
                  </div>
                </li>
              </ol>
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}
