import { describe, expect, it } from 'vitest';
import {
  compareAudits,
  formatRelativeTime,
  readAuditHistory,
  recordAuditSnapshot,
  snapshotFromSpecimen,
  type AuditSnapshot,
} from './auditCompare';
import type { IngestedSpecimen } from '@/lib/conversion/types';

function makeSpecimen(overrides: Partial<IngestedSpecimen> = {}): IngestedSpecimen {
  return {
    kind: 'ingested',
    title: 'acme/app',
    summary: '40% infected',
    defaultBranch: 'main',
    repositoryUrl: 'https://github.com/acme/app',
    overallRot: 40,
    edges: [],
    coverage: null,
    dependencies: [],
    nodes: [
      {
        kind: 'ingested',
        id: 'src/a.ts',
        name: 'a.ts',
        path: 'src/a.ts',
        linesOfCode: 100,
        rotScore: 60,
        position: { x: 0, y: 0 },
        lastCommit: 'Active branch',
        findings: [
          { kind: 'default-catch', line: 10, lines: [10], text: 'catch', suggestion: 'log', source: 'static' },
          { kind: 'any', line: 20, lines: [20], text: 'any', suggestion: 'unknown', source: 'static' },
          { kind: 'ai', line: 30, lines: [30], text: 'ai note', suggestion: '', source: 'ai' },
        ],
        notes: [],
        summary: '',
        recommendation: '',
        codeExcerpt: '',
        featured: true,
        explainedBy: 'static',
      },
      {
        kind: 'ingested',
        id: 'src/b.ts',
        name: 'b.ts',
        path: 'src/b.ts',
        linesOfCode: 100,
        rotScore: 20,
        position: { x: 0, y: 0 },
        lastCommit: 'Active branch',
        findings: [],
        notes: [],
        summary: '',
        recommendation: '',
        codeExcerpt: '',
        featured: true,
        explainedBy: 'static',
      },
    ],
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<AuditSnapshot> = {}): AuditSnapshot {
  return {
    version: 2,
    repository: 'acme/app',
    branch: 'main',
    savedAt: 1_700_000_000_000,
    overallRot: 40,
    fileCount: 2,
    findingCount: 2,
    files: [
      { path: 'src/a.ts', rotScore: 60, findings: 2, kinds: { 'default-catch': 1, any: 1 } },
      { path: 'src/b.ts', rotScore: 20, findings: 0, kinds: {} },
    ],
    ...overrides,
  };
}

describe('snapshotFromSpecimen', () => {
  it('excludes ai-unverified findings and keeps overallRot', () => {
    const snap = snapshotFromSpecimen(makeSpecimen(), 12345);
    expect(snap.overallRot).toBe(40);
    expect(snap.fileCount).toBe(2);
    expect(snap.findingCount).toBe(2);
    expect(snap.files[0].kinds).toEqual({ 'default-catch': 1, any: 1 });
    expect(snap.savedAt).toBe(12345);
  });
});

describe('readAuditHistory', () => {
  it('ignores legacy v1 snapshots and malformed JSON', () => {
    expect(readAuditHistory('not-json')).toEqual([]);
    const legacy = JSON.stringify([
      { repository: 'acme/app', files: 10, averageRot: 30, savedAt: 1000 },
      makeSnapshot(),
    ]);
    const parsed = readAuditHistory(legacy);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].version).toBe(2);
  });
});

describe('recordAuditSnapshot', () => {
  it('returns null on first audit, then returns previous snapshot for the same repo only', () => {
    const first = makeSnapshot({ savedAt: 1_000, overallRot: 45 });
    const otherRepo = makeSnapshot({ repository: 'other/repo', savedAt: 2_000, overallRot: 12 });
    const second = makeSnapshot({ savedAt: 3_000, overallRot: 35 });

    const r1 = recordAuditSnapshot([], first, { isFreshIngest: true });
    expect(r1.previous).toBeNull();

    const r2 = recordAuditSnapshot(r1.history, otherRepo, { isFreshIngest: true });
    expect(r2.previous).toBeNull();

    const r3 = recordAuditSnapshot(r2.history, second, { isFreshIngest: true });
    expect(r3.previous?.savedAt).toBe(1_000);
    expect(r3.previous?.overallRot).toBe(45);
    expect(r3.history.filter((s) => s.repository === 'acme/app')).toHaveLength(2);
  });

  it('does not overwrite the previous baseline on a cached reload', () => {
    const oldSnap = makeSnapshot({ savedAt: 1_000, overallRot: 50 });
    const currSnap = makeSnapshot({ savedAt: 100_000, overallRot: 40 });
    const reloadSnap = makeSnapshot({ savedAt: 105_000, overallRot: 40 });

    const r1 = recordAuditSnapshot([oldSnap], currSnap, { isFreshIngest: true });
    const r2 = recordAuditSnapshot(r1.history, reloadSnap, { isFreshIngest: false });
    expect(r2.previous?.savedAt).toBe(1_000);
    expect(r2.previous?.overallRot).toBe(50);
  });
});

describe('compareAudits', () => {
  it('computes worsened, improved, added, removed files and finding balance', () => {
    const previous = makeSnapshot({
      overallRot: 45,
      fileCount: 3,
      findingCount: 4,
      files: [
        { path: 'src/a.ts', rotScore: 68, findings: 2, kinds: { 'default-catch': 1, duplicate: 1 } },
        { path: 'src/b.ts', rotScore: 30, findings: 1, kinds: { any: 1 } },
        { path: 'src/old.ts', rotScore: 50, findings: 1, kinds: { eval: 1 } },
      ],
    });
    const current = makeSnapshot({
      savedAt: previous.savedAt + 3_600_000,
      overallRot: 36,
      fileCount: 3,
      findingCount: 3,
      files: [
        { path: 'src/a.ts', rotScore: 50, findings: 0, kinds: {} },
        { path: 'src/b.ts', rotScore: 44, findings: 2, kinds: { any: 1, 'long-function': 1 } },
        { path: 'src/new.ts', rotScore: 22, findings: 1, kinds: { 'ts-ignore': 1 } },
      ],
    });

    const diff = compareAudits(previous, current);
    expect(diff.verdict).toBe('improved');
    expect(diff.overallRot).toEqual({ previous: 45, current: 36, delta: -9 });
    expect(diff.findings.resolved).toBe(3); // 2 in a.ts + 1 in removed old.ts
    expect(diff.findings.introduced).toBe(2); // 1 in b.ts + 1 in added new.ts
    expect(previous.findingCount - diff.findings.resolved + diff.findings.introduced).toBe(
      current.findingCount,
    );
    expect(diff.worsened.map((f) => f.path)).toEqual(['src/b.ts']);
    expect(diff.worsened[0].kindDeltas).toEqual([{ kind: 'long-function', delta: 1 }]);
    expect(diff.improved.map((f) => f.path)).toEqual(['src/a.ts']);
    expect(diff.files.added.map((f) => f.path)).toEqual(['src/new.ts']);
    expect(diff.files.removed.map((f) => f.path)).toEqual(['src/old.ts']);
  });
});

describe('formatRelativeTime', () => {
  it('formats elapsed time cleanly', () => {
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(now - 20_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
  });
});
