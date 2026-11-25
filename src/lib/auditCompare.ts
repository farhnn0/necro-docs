import type { Specimen } from '@/lib/conversion/types';

export const AUDIT_HISTORY_STORAGE_KEY = 'necro:audit-history';
const MAX_SNAPSHOTS_PER_REPO = 2;
const MAX_REPOS_STORED = 8;
const DEDUP_WINDOW_MS = 10 * 60_000;

export interface AuditFileSnapshot {
  path: string;
  rotScore: number;
  findings: number;
  /** Static finding counts keyed by kind (excludes ai-unverified). */
  kinds: Record<string, number>;
}

export interface AuditSnapshot {
  version: 2;
  repository: string;
  branch: string;
  savedAt: number;
  overallRot: number;
  fileCount: number;
  findingCount: number;
  files: AuditFileSnapshot[];
}

export interface KindDelta {
  kind: string;
  delta: number;
}

export interface FileAuditDelta {
  path: string;
  previousRot: number;
  currentRot: number;
  rotDelta: number;
  previousFindings: number;
  currentFindings: number;
  findingDelta: number;
  kindDeltas: KindDelta[];
}

export interface AddedOrRemovedFile {
  path: string;
  rotScore: number;
  findings: number;
}

export interface AuditComparison {
  repository: string;
  branch: string;
  previousSavedAt: number;
  currentSavedAt: number;
  verdict: 'improved' | 'worsened' | 'unchanged';
  overallRot: { previous: number; current: number; delta: number };
  findings: {
    previous: number;
    current: number;
    delta: number;
    resolved: number;
    introduced: number;
  };
  files: {
    previous: number;
    current: number;
    delta: number;
    added: AddedOrRemovedFile[];
    removed: AddedOrRemovedFile[];
  };
  worsened: FileAuditDelta[];
  improved: FileAuditDelta[];
  unchangedCount: number;
}

function repoKey(repository: string): string {
  return repository.trim().toLowerCase();
}

function weightedRot(nodes: readonly { rotScore: number; linesOfCode: number }[]): number {
  if (nodes.length === 0) return 0;
  const weight = nodes.reduce((sum, n) => sum + Math.max(n.linesOfCode, 1), 0);
  if (weight === 0) return 0;
  return Math.round(
    nodes.reduce((sum, n) => sum + n.rotScore * Math.max(n.linesOfCode, 1), 0) / weight,
  );
}

export function snapshotFromSpecimen(specimen: Specimen, savedAt = Date.now()): AuditSnapshot {
  const files: AuditFileSnapshot[] = specimen.nodes.map((node) => {
    if (node.kind === 'ingested') {
      const kinds: Record<string, number> = {};
      let count = 0;
      for (const finding of node.findings) {
        if (finding.source !== 'static') continue;
        count += 1;
        kinds[finding.kind] = (kinds[finding.kind] ?? 0) + 1;
      }
      return { path: node.path, rotScore: node.rotScore, findings: count, kinds };
    }
    return {
      path: node.path,
      rotScore: node.rotScore,
      findings: node.findings.length,
      kinds: {},
    };
  });

  const overallRot =
    specimen.kind === 'ingested' ? specimen.overallRot : weightedRot(specimen.nodes);
  const findingCount = files.reduce((sum, f) => sum + f.findings, 0);

  return {
    version: 2,
    repository: specimen.title.trim(),
    branch: specimen.kind === 'ingested' ? specimen.defaultBranch : 'sample',
    savedAt,
    overallRot,
    fileCount: files.length,
    findingCount,
    files,
  };
}

function isAuditSnapshot(value: unknown): value is AuditSnapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<AuditSnapshot>;
  return (
    item.version === 2 &&
    typeof item.repository === 'string' &&
    typeof item.branch === 'string' &&
    typeof item.savedAt === 'number' &&
    typeof item.overallRot === 'number' &&
    typeof item.fileCount === 'number' &&
    typeof item.findingCount === 'number' &&
    Array.isArray(item.files)
  );
}

export function readAuditHistory(raw: string | null): AuditSnapshot[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAuditSnapshot);
  } catch {
    return [];
  }
}

export function recordAuditSnapshot(
  history: readonly AuditSnapshot[],
  snapshot: AuditSnapshot,
  options: { isFreshIngest?: boolean } = {},
): { history: AuditSnapshot[]; previous: AuditSnapshot | null } {
  const key = repoKey(snapshot.repository);
  const sameRepo = history
    .filter((item) => repoKey(item.repository) === key)
    .sort((a, b) => b.savedAt - a.savedAt);
  const others = history.filter((item) => repoKey(item.repository) !== key);

  const latest = sameRepo[0];
  if (
    !options.isFreshIngest &&
    latest &&
    latest.overallRot === snapshot.overallRot &&
    latest.fileCount === snapshot.fileCount &&
    latest.findingCount === snapshot.findingCount &&
    Math.abs(snapshot.savedAt - latest.savedAt) < DEDUP_WINDOW_MS
  ) {
    return { history: [...history], previous: sameRepo[1] ?? null };
  }

  const nextSameRepo = [snapshot, ...sameRepo].slice(0, MAX_SNAPSHOTS_PER_REPO);

  // Keep at most MAX_REPOS_STORED distinct repositories, ordered by most recent snapshot.
  const byRepo = new Map<string, AuditSnapshot[]>();
  byRepo.set(key, nextSameRepo);
  for (const item of [...others].sort((a, b) => b.savedAt - a.savedAt)) {
    const itemKey = repoKey(item.repository);
    const list = byRepo.get(itemKey);
    if (list) {
      if (list.length < MAX_SNAPSHOTS_PER_REPO) list.push(item);
    } else if (byRepo.size < MAX_REPOS_STORED) {
      byRepo.set(itemKey, [item]);
    }
  }

  const nextHistory = [...byRepo.values()].flat();
  return { history: nextHistory, previous: latest ?? null };
}

function diffKinds(
  prev: Record<string, number>,
  curr: Record<string, number>,
): { kindDeltas: KindDelta[]; resolved: number; introduced: number } {
  const keys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const kindDeltas: KindDelta[] = [];
  let resolved = 0;
  let introduced = 0;

  for (const kind of keys) {
    const delta = (curr[kind] ?? 0) - (prev[kind] ?? 0);
    if (delta === 0) continue;
    kindDeltas.push({ kind, delta });
    if (delta > 0) introduced += delta;
    else resolved += -delta;
  }

  kindDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.kind.localeCompare(b.kind));
  return { kindDeltas, resolved, introduced };
}

export function compareAudits(
  previous: AuditSnapshot,
  current: AuditSnapshot,
): AuditComparison {
  const prevMap = new Map(previous.files.map((f) => [f.path, f]));
  const currMap = new Map(current.files.map((f) => [f.path, f]));

  const worsened: FileAuditDelta[] = [];
  const improved: FileAuditDelta[] = [];
  const added: AddedOrRemovedFile[] = [];
  const removed: AddedOrRemovedFile[] = [];
  let unchangedCount = 0;
  let resolved = 0;
  let introduced = 0;

  for (const [path, curr] of currMap) {
    const prev = prevMap.get(path);
    if (!prev) {
      added.push({ path, rotScore: curr.rotScore, findings: curr.findings });
      introduced += curr.findings;
      continue;
    }

    const rotDelta = curr.rotScore - prev.rotScore;
    const findingDelta = curr.findings - prev.findings;
    const hasKinds = Object.keys(prev.kinds).length > 0 || Object.keys(curr.kinds).length > 0;
    const { kindDeltas, resolved: fileResolved, introduced: fileIntroduced } = hasKinds
      ? diffKinds(prev.kinds, curr.kinds)
      : {
          kindDeltas: [],
          resolved: findingDelta < 0 ? -findingDelta : 0,
          introduced: findingDelta > 0 ? findingDelta : 0,
        };

    resolved += fileResolved;
    introduced += fileIntroduced;

    if (rotDelta === 0 && findingDelta === 0 && kindDeltas.length === 0) {
      unchangedCount += 1;
      continue;
    }

    const entry: FileAuditDelta = {
      path,
      previousRot: prev.rotScore,
      currentRot: curr.rotScore,
      rotDelta,
      previousFindings: prev.findings,
      currentFindings: curr.findings,
      findingDelta,
      kindDeltas,
    };

    if (rotDelta > 0 || (rotDelta === 0 && findingDelta > 0)) {
      worsened.push(entry);
    } else if (rotDelta < 0 || (rotDelta === 0 && findingDelta < 0)) {
      improved.push(entry);
    } else {
      // Same rot and total findings, but finding kinds shifted.
      worsened.push(entry);
    }
  }

  for (const [path, prev] of prevMap) {
    if (!currMap.has(path)) {
      removed.push({ path, rotScore: prev.rotScore, findings: prev.findings });
      resolved += prev.findings;
    }
  }

  worsened.sort(
    (a, b) => b.rotDelta - a.rotDelta || b.findingDelta - a.findingDelta || a.path.localeCompare(b.path),
  );
  improved.sort(
    (a, b) => a.rotDelta - b.rotDelta || a.findingDelta - b.findingDelta || a.path.localeCompare(b.path),
  );
  added.sort((a, b) => b.rotScore - a.rotScore || a.path.localeCompare(b.path));
  removed.sort((a, b) => b.rotScore - a.rotScore || a.path.localeCompare(b.path));

  const rotDelta = current.overallRot - previous.overallRot;
  const findingDelta = current.findingCount - previous.findingCount;
  const verdict: AuditComparison['verdict'] =
    rotDelta < 0 || (rotDelta === 0 && findingDelta < 0)
      ? 'improved'
      : rotDelta > 0 || (rotDelta === 0 && findingDelta > 0)
        ? 'worsened'
        : 'unchanged';

  return {
    repository: current.repository,
    branch: current.branch,
    previousSavedAt: previous.savedAt,
    currentSavedAt: current.savedAt,
    verdict,
    overallRot: {
      previous: previous.overallRot,
      current: current.overallRot,
      delta: rotDelta,
    },
    findings: {
      previous: previous.findingCount,
      current: current.findingCount,
      delta: findingDelta,
      resolved,
      introduced,
    },
    files: {
      previous: previous.fileCount,
      current: current.fileCount,
      delta: current.fileCount - previous.fileCount,
      added,
      removed,
    },
    worsened,
    improved,
    unchangedCount,
  };
}

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diffMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
