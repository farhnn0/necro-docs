import { describe, expect, it } from 'vitest';
import { getPresetSpecimen } from '@/lib/conversion/specimens';
import type { IngestedSpecimen, IngestedWorkspaceNode } from '@/lib/conversion/types';
import { buildAutopsyReport, REPORT_SCHEMA, reportFileName, reportToHtml, reportToJson, reportToMarkdown } from './report';

const node = (id: string, rot: number, findings: IngestedWorkspaceNode['findings']): IngestedWorkspaceNode => ({
  kind: 'ingested', id, name: id.split('/').pop()!, path: id, linesOfCode: 100, rotScore: rot, position: { x: 0, y: 0 },
  lastCommit: 'Active branch', findings, notes: [], summary: '', recommendation: '', codeExcerpt: 'const secret = 1;', featured: true, explainedBy: 'static',
});

const specimen: IngestedSpecimen = {
  kind: 'ingested', title: 'acme/app', summary: '61% infected', defaultBranch: 'main', repositoryUrl: 'https://github.com/acme/app', overallRot: 61,
  nodes: [
    node('src/a.ts', 80, [
      { kind: 'empty-catch', line: 12, lines: [12], text: 'Line 12: catch swallows | errors', suggestion: 'Log and rethrow.', source: 'static' },
      { kind: 'ai', line: 30, lines: [30], text: 'Possible <script> race', suggestion: '', source: 'ai' },
    ]),
    node('src/b.ts', 45, [{ kind: 'long-function', line: 3, lines: [3], text: 'Line 3: run() spans 300 lines', suggestion: 'Split it.', source: 'static' }]),
    node('src/c.ts', 10, []),
  ],
  edges: [{ id: '1', source: 'src/b.ts', target: 'src/a.ts' }, { id: '2', source: 'src/c.ts', target: 'src/a.ts' }],
  coverage: null,
  dependencies: [],
};

describe('buildAutopsyReport', () => {
  const r = buildAutopsyReport(specimen, new Date('2026-11-23T03:04:05Z'));

  it('ranks files, counts findings and marks only scanner-confirmed patchable kinds', () => {
    expect(r.schema).toBe(REPORT_SCHEMA);
    expect(r.priorities).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(r.totals).toMatchObject({ files: 3, findings: 3, patchable: 1, aiUnverified: 1, status: { CRITICAL: 1, WARNING: 1, HEALTHY: 1 } });
    expect(r.files[0].findings.map((f) => [f.kind, f.patchable, f.source])).toEqual([['empty-catch', true, 'static'], ['ai', false, 'ai-unverified']]);
  });

  it('derives importers from edges (source imports target)', () => {
    expect(r.files[0].importedBy).toEqual(['src/b.ts', 'src/c.ts']);
    expect(r.hubs).toEqual([{ path: 'src/a.ts', importedBy: 2 }]);
  });

  it('never includes source code', () => {
    expect(reportToJson(r)).not.toContain('const secret');
  });

  it('handles sample specimens', () => {
    const preset = buildAutopsyReport(getPresetSpecimen('payment'));
    expect(preset.repository.source).toBe('sample');
    expect(preset.verdict.overallRot).toBe(74);
    expect(preset.totals.patchable).toBe(0);
  });

  it('renders markdown tables that survive pipes in finding text', () => {
    const md = reportToMarkdown(r);
    expect(md).toContain('# Codebase Autopsy: acme/app');
    expect(md).toContain('catch swallows \\| errors');
    expect(md).toContain('| 1 | `src/a.ts` | 80 | CRITICAL | 2 | 1 | 2 |');
  });

  it('escapes HTML in the printable report', () => {
    const html = reportToHtml(r);
    expect(html).toContain('Possible &lt;script&gt; race');
    expect(html).not.toContain('<script>');
    expect(html).toContain('AUTO-FIXABLE');
  });

  it('builds a dated, slugged file name', () => {
    expect(reportFileName(r, 'pdf')).toBe('necro-autopsy-acme-app-2026-11-23.pdf');
  });
});
