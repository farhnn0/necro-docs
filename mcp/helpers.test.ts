import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fileContext, projectFinding, projectFindings, summarizeAnalysis } from './helpers';
import type { RepoAnalysis } from './types';

const mkAnalysis = (nodes: Array<{ path: string; rot: number; n?: number }>) =>
  ({
    title: 't',
    defaultBranch: 'main',
    overallRot: 42,
    rotSummary: 's',
    coverage: { analyzed: nodes.length },
    edges: [{ from: 'a', to: 'b' }],
    nodes: nodes.map(({ path, rot, n = 0 }) => ({
      path,
      rot,
      code: 'SECRET CODE',
      notes: 'ai notes',
      recommendations: ['r'],
      findings: Array.from({ length: n }, () => ({})),
    })),
  }) as unknown as RepoAnalysis;

describe('summarizeAnalysis', () => {
  it('keeps top ten by rot desc, ties by path asc, only compact fields', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({ path: `f${String(i).padStart(2, '0')}.ts`, rot: i % 3, n: 2 }));
    const out = summarizeAnalysis(mkAnalysis(nodes));
    expect(out.files).toHaveLength(10);
    expect(out.files[0]).toEqual({ path: 'f02.ts', score: 2, findingCount: 2, patchableCount: 0 });
    expect(Object.keys(out).sort()).toEqual(
      ['coverage', 'defaultBranch', 'files', 'overallRot', 'rotSummary', 'title'],
    );
    expect(JSON.stringify(out)).not.toMatch(/SECRET CODE|ai notes|edges/);
  });

  // Feature: mcp-server, Property 2: Compact analysis output is bounded and redacted
  it('Property 2: bounded, sorted, redacted', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ path: fc.string({ minLength: 1 }), rot: fc.integer({ min: 0, max: 100 }), n: fc.nat(5) }), { maxLength: 30 }),
        (nodes) => {
          const out = summarizeAnalysis(mkAnalysis(nodes));
          expect(out.files.length).toBe(Math.min(10, nodes.length));
          for (let i = 1; i < out.files.length; i++) expect(out.files[i - 1].score).toBeGreaterThanOrEqual(out.files[i].score);
          for (const f of out.files) expect(Object.keys(f).sort()).toEqual(['findingCount', 'patchableCount', 'path', 'score']);
          expect(JSON.stringify(out)).not.toMatch(/SECRET CODE|"edges"|"nodes"/);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('summarizeAnalysis patchableCount', () => {
  it('counts only patchable findings per file', () => {
    const a = {
      nodes: [{
        path: 'a.ts', rot: 1,
        findings: [
          { kind: 'empty-catch', source: 'static', line: 1 },
          { kind: 'deep-nesting', source: 'static', line: 2 },
          { kind: 'any', source: 'ai', line: 3 },
        ],
      }],
    } as unknown as RepoAnalysis;
    expect(summarizeAnalysis(a).files[0]).toMatchObject({ findingCount: 3, patchableCount: 1 });
  });
});

describe('fileContext', () => {
  const node = (id: string) => ({ id, path: `src/${id}.ts` });
  const a = {
    nodes: [node('a'), node('b'), node('c')],
    // a imports b; c imports b; b imports a; ghost endpoints are ignored.
    edges: [{ from: 'a', to: 'b' }, { from: 'c', to: 'b' }, { from: 'b', to: 'a' }, { from: 'ghost', to: 'b' }, { from: 'b', to: 'ghost' }],
  } as unknown as RepoAnalysis;

  it('importedBy = sources of edges targeting the file; imports = targets of edges from it', () => {
    expect(fileContext(a, a.nodes[1])).toEqual({ importedBy: ['src/a.ts', 'src/c.ts'], imports: ['src/a.ts'] });
    expect(fileContext(a, a.nodes[2])).toEqual({ importedBy: [], imports: ['src/b.ts'] });
  });

  it('caps each list at 20', () => {
    const many = {
      nodes: [node('hub'), ...Array.from({ length: 30 }, (_, i) => node(`n${i}`))],
      edges: Array.from({ length: 30 }, (_, i) => ({ from: `n${i}`, to: 'hub' })),
    } as unknown as RepoAnalysis;
    expect(fileContext(many, many.nodes[0]).importedBy).toHaveLength(20);
  });
});

describe('projectFinding', () => {
  const base = { kind: 'k', text: 't', suggestion: 's' };

  it('labels static as static, ai as ai-unverified, drops extras, nulls missing line', () => {
    const p = projectFinding({ ...base, source: 'static', line: 3, lines: [1, 2], code: 'x' } as never);
    expect(p).toEqual({ ...base, line: 3, source: 'static', patchable: false });
    expect(projectFinding({ ...base, source: 'ai' }).source).toBe('ai-unverified');
    expect(projectFinding({ ...base, source: 'ai' }).line).toBeNull();
    expect(projectFinding({ ...base, source: 'static', line: null }).line).toBeNull();
    expect(projectFindings([{ ...base, source: 'ai' }])).toHaveLength(1);
  });

  it('marks only static, line-bearing, patchable kinds as patchable (via isPatchable)', () => {
    const f = { text: 't', suggestion: 's' };
    expect(projectFinding({ ...f, kind: 'empty-catch', source: 'static', line: 2 }).patchable).toBe(true);
    expect(projectFinding({ ...f, kind: 'deep-nesting', source: 'static', line: 2 }).patchable).toBe(false);
    expect(projectFinding({ ...f, kind: 'empty-catch', source: 'ai', line: 2 }).patchable).toBe(false);
    expect(projectFinding({ ...f, kind: 'empty-catch', source: 'static', line: null }).patchable).toBe(false);
  });

  // Feature: mcp-server, Property 4: Finding projection preserves authority labels
  it('Property 4: only five fields, authority preserved', () => {
    fc.assert(
      fc.property(
        fc.record({
          line: fc.option(fc.integer({ min: 1, max: 9999 }), { nil: undefined }),
          kind: fc.string(),
          text: fc.string(),
          suggestion: fc.string(),
          source: fc.constantFrom('static', 'ai'),
          lines: fc.array(fc.nat()),
          code: fc.string(),
        }),
        (f) => {
          const p = projectFinding(f);
          expect(Object.keys(p).sort()).toEqual(['kind', 'line', 'patchable', 'source', 'suggestion', 'text']);
          expect(p.source).toBe(f.source === 'static' ? 'static' : 'ai-unverified');
          expect(p.line).toBe(f.line ?? null);
        },
      ),
      { numRuns: 100 },
    );
  });
});
