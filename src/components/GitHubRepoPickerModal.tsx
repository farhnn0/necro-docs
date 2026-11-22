'use client';

import { useMemo, useState } from 'react';
import {
  ExternalLink,
  FolderGit2,
  GitBranch,
  Loader2,
  Lock,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { GitHubRepoSummary } from '@/lib/auth/github-app';

interface GitHubRepoPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositories: GitHubRepoSummary[];
  loading: boolean;
  error?: string | null;
  installationId?: string | null;
  onSelectRepo: (fullName: string) => void;
  onRefresh: () => void;
}

export function GitHubRepoPickerModal({
  open,
  onOpenChange,
  repositories,
  loading,
  error,
  installationId,
  onSelectRepo,
  onRefresh,
}: GitHubRepoPickerModalProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return repositories;
    return repositories.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
    );
  }, [repositories, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden rounded-2xl bg-canvas border-hairline shadow-2xl">
        <div className="p-6 pb-4 border-b border-hairline bg-surface/50">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
                  <FolderGit2 className="h-4 w-4" />
                </div>
                <div>
                  <DialogTitle className="font-display text-base font-bold text-ink">
                    Select GitHub Repository
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted">
                    Pick a repository granted via the GitHub App (includes private repos).
                  </DialogDescription>
                </div>
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                title="Refresh repositories"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-canvas text-muted hover:text-ink hover:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-skyAccent"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </DialogHeader>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter repositories..."
              className="w-full rounded-xl border border-hairline bg-canvas pl-9 pr-4 py-2 font-mono text-xs text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-skyAccent"
            />
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto p-3 divide-y divide-hairline/60">
          {loading && repositories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted">
              <Loader2 className="h-6 w-6 animate-spin text-ink mb-2" />
              <p className="font-mono text-xs">Fetching repositories from GitHub...</p>
            </div>
          ) : error ? (
            <div className="p-4 text-center">
              <p className="font-mono text-xs text-crimson mb-2">{error}</p>
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-full bg-surface border border-hairline px-3 py-1 font-mono text-xs hover:bg-hairline"
              >
                Try again
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted">
              <p className="font-mono text-xs">
                {search ? 'No repositories match your filter.' : 'No accessible repositories found.'}
              </p>
              {installationId && (
                <a
                  href={`https://github.com/settings/installations/${installationId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-skyAccent hover:underline"
                >
                  Configure app permissions on GitHub <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ) : (
            filtered.map((repo) => (
              <button
                key={repo.id}
                type="button"
                onClick={() => onSelectRepo(repo.fullName)}
                className="w-full flex items-start justify-between gap-3 p-3 text-left rounded-xl hover:bg-surface transition-colors duration-100 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {repo.private ? (
                      <span
                        title="Private repository"
                        className="inline-flex items-center gap-1 rounded border border-hairline bg-surface px-1.5 py-0.5 text-[10px] font-mono font-medium text-ink"
                      >
                        <Lock className="h-2.5 w-2.5 text-muted" />
                        Private
                      </span>
                    ) : (
                      <span
                        title="Public repository"
                        className="inline-flex items-center gap-1 rounded bg-emerald/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-emerald"
                      >
                        <GitBranch className="h-2.5 w-2.5" />
                        Public
                      </span>
                    )}
                    <span className="truncate font-mono text-xs font-semibold text-ink group-hover:text-skyAccent">
                      {repo.fullName}
                    </span>
                  </div>
                  {repo.description && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted">
                      {repo.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-mono text-[10px] text-muted group-hover:text-ink">
                  Select →
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-hairline bg-surface/30 px-6 py-3 font-mono text-[11px] text-muted">
          <span>
            {repositories.length} {repositories.length === 1 ? 'repo' : 'repos'} accessible
          </span>
          <div className="flex items-center gap-4">
            {installationId && (
              <a
                href={`https://github.com/settings/installations/${installationId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-muted hover:text-ink"
              >
                Add more repos <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <a
              href="/api/auth/github/install?add=1"
              className="text-skyAccent hover:underline"
            >
              Reinstall / Switch
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

