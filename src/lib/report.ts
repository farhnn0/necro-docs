/**
 * Autopsy report export: one model, three renderings (Markdown, JSON, printable HTML for PDF).
 * Pure functions only; the workspace page handles the download and print dialog.
 */
import { rotScoreMeta } from '@/lib/conversion/helpers';
import type { Specimen, WorkspaceNode } from '@/lib/conversion/types';
import type { RepoCoverage } from '@/lib/repoAnalyzer';
import { isPatchable } from '@/lib/types';

export const REPORT_SCHEMA = 'necro-docs/autopsy-report@1';
const PRIORITY_FILES = 10;
const HUB_FILES = 5;

export type ReportStatus = 'CRITICAL' | 'WARNING' | 'HEALTHY';

export interface ReportFinding {
  line: number | null;
  kind: string;
  text: string;
  suggestion: string;
  /** `static` is scanner-confirmed; `ai-unverified` was added by the model; `sample` comes from a demo specimen. */
  source: 'static' | 'ai-unverified' | 'sample';
  patchable: boolean;
}

export interface ReportFile {
  path: string;
  rot: number;
  status: ReportStatus;
  loc: number;
  importedBy: string[];
  imports: string[];
  findings: ReportFinding[];
  summary: string;
  recommendation: string;
}

export interface AutopsyReport {
  schema: typeof REPORT_SCHEMA;
  generatedAt: string;
  repository: { title: string; url: string | null; branch: string | null; source: 'github' | 'sample' };
  verdict: { overallRot: number; status: ReportStatus; summary: string };
  totals: {
    files: number;
    loc: number;
    findings: number;
    patchable: number;
    aiUnverified: number;
    status: Record<ReportStatus, number>;
  };
  coverage: RepoCoverage | null;
  findingsByKind: { kind: string; count: number; patchable: number }[];
  priorities: string[];
  hubs: { path: string; importedBy: number }[];
  files: ReportFile[];
  edges: { from: string; to: string }[];
}

const statusOf = (score: number) => rotScoreMeta(score).label as ReportStatus;

function findingsOf(node: WorkspaceNode): ReportFinding[] {
  if (node.kind === 'preset') {
    return node.findings.map((text) => ({ line: null, kind: 'observation', text, suggestion: '', source: 'sample', patchable: false }));
  }
  return node.findings.map((f) => ({
    line: f.line,
    kind: f.kind,
    text: f.text,
    suggestion: f.suggestion,
    source: f.source === 'static' ? 'static' : 'ai-unverified',
    patchable: isPatchable(f),
  }));
}

function overallRotOf(specimen: Specimen): number {
  if (specimen.kind === 'ingested') return specimen.overallRot;
  const stated = Number.parseInt(specimen.summary, 10);
  if (Number.isFinite(stated)) return stated;
  const loc = specimen.nodes.reduce((sum, n) => sum + n.linesOfCode, 0);
  return loc ? Math.round(specimen.nodes.reduce((sum, n) => sum + n.rotScore * n.linesOfCode, 0) / loc) : 0;
}

export function buildAutopsyReport(specimen: Specimen, generatedAt: Date = new Date()): AutopsyReport {
  const pathOf = new Map<string, string>(specimen.nodes.map((n) => [n.id, n.path]));
  const edges = specimen.edges.flatMap((e) => {
    const from = pathOf.get(e.source);
    const to = pathOf.get(e.target);
    return from && to ? [{ from, to }] : [];
  });

  const files: ReportFile[] = specimen.nodes
    .map((node) => ({
      path: node.path,
      rot: node.rotScore,
      status: statusOf(node.rotScore),
      loc: node.linesOfCode,
      importedBy: edges.filter((e) => e.to === node.path).map((e) => e.from),
      imports: edges.filter((e) => e.from === node.path).map((e) => e.to),
      findings: findingsOf(node),
      summary: node.kind === 'ingested' ? node.summary : '',
      recommendation: node.kind === 'ingested' ? node.recommendation : '',
    }))
    .sort((a, b) => b.rot - a.rot || a.path.localeCompare(b.path));

  const all = files.flatMap((f) => f.findings);
  const byKind = new Map<string, { kind: string; count: number; patchable: number }>();
  for (const f of all) {
    const entry = byKind.get(f.kind) ?? { kind: f.kind, count: 0, patchable: 0 };
    entry.count += 1;
    if (f.patchable) entry.patchable += 1;
    byKind.set(f.kind, entry);
  }
  const overallRot = overallRotOf(specimen);
  const status: Record<ReportStatus, number> = { CRITICAL: 0, WARNING: 0, HEALTHY: 0 };
  for (const f of files) status[f.status] += 1;

  return {
    schema: REPORT_SCHEMA,
    generatedAt: generatedAt.toISOString(),
    repository: specimen.kind === 'ingested'
      ? { title: specimen.title, url: specimen.repositoryUrl, branch: specimen.defaultBranch, source: 'github' }
      : { title: specimen.title, url: null, branch: null, source: 'sample' },
    verdict: { overallRot, status: statusOf(overallRot), summary: specimen.kind === 'ingested' ? specimen.summary : specimen.description },
    totals: {
      files: files.length,
      loc: files.reduce((sum, f) => sum + f.loc, 0),
      findings: all.length,
      patchable: all.filter((f) => f.patchable).length,
      aiUnverified: all.filter((f) => f.source === 'ai-unverified').length,
      status,
    },
    coverage: specimen.kind === 'ingested' ? specimen.coverage : null,
    findingsByKind: [...byKind.values()].sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
    priorities: files.slice(0, PRIORITY_FILES).map((f) => f.path),
    hubs: files
      .filter((f) => f.importedBy.length > 0)
      .map((f) => ({ path: f.path, importedBy: f.importedBy.length }))
      .sort((a, b) => b.importedBy - a.importedBy || a.path.localeCompare(b.path))
      .slice(0, HUB_FILES),
    files,
    edges,
  };
}

// ---------------------------------------------------------------------------
// Shared wording
// ---------------------------------------------------------------------------

const fmtDate = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const fmtInt = (n: number) => n.toLocaleString('en-US');
const prioritiesOf = (r: AutopsyReport) => r.priorities.map((p) => r.files.find((f) => f.path === p)!).filter(Boolean);
const lineLabel = (f: ReportFinding) => (f.line === null ? 'file' : `L${f.line}`);
// Findings repeat their line number in the text ("Line 42: ..."); the report shows it in its own column.
const findingText = (f: ReportFinding) => f.text.replace(/^Lines?\s+\d+(?:\s*(?:[-–]|to)\s*\d+)?(?::\s*|\s*-\s*|\s+)/i, '');
const sourceLabel: Record<ReportFinding['source'], string> = { static: 'Static', 'ai-unverified': 'AI (unverified)', sample: 'Sample' };

export function reportFileName(r: AutopsyReport, ext: 'md' | 'json' | 'pdf'): string {
  const slug = r.repository.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'repository';
  return `necro-autopsy-${slug}-${r.generatedAt.slice(0, 10)}.${ext}`;
}

function coverageLines(c: RepoCoverage): [string, string][] {
  const skipped = Object.entries(c.skipped).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
  return [
    ['Source files found', fmtInt(c.totalFiles)],
    ['Analyzed', fmtInt(c.analyzed)],
    ['AI-explained (key files)', fmtInt(c.featured)],
    ['Skipped', skipped.length ? skipped.join(', ') : 'none'],
    ['File limit', `${fmtInt(c.fileLimit)} per analysis${c.treeTruncated ? ' (GitHub truncated the tree)' : ''}`],
  ];
}

const METHOD = [
  'Static findings come from the Necro-Docs scanner (TypeScript compiler AST for JS/TS, control-flow scanning for Python and Go) and are the source of truth.',
  'AI observations are labeled "AI (unverified)" and never change the rot score.',
  'The rot score (0-100) sums capped components: volume, nesting, branching, silent failures and coupling. The repository score is LOC-weighted.',
  'Auto-fixable findings (secret, eval, empty/placeholder catch, unsafe HTML, @ts-ignore, any) can be patched by Surgical Patch; every patch is re-scanned before it is offered.',
  'Structural findings (size, nesting, duplication, coupling) are review signals that need a planned refactor, not an automatic patch.',
];

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

export function reportToMarkdown(r: AutopsyReport): string {
  const out: string[] = [];
  const repo = r.repository.url ? `[${r.repository.title}](${r.repository.url})` : `${r.repository.title} (sample specimen)`;
  out.push(`# Codebase Autopsy: ${r.repository.title}`, '');
  out.push(`> **Verdict: ${r.verdict.status}, overall rot ${r.verdict.overallRot}/100.** ${cell(r.verdict.summary)}`, '');
  out.push('| | |', '|---|---|', `| Repository | ${repo} |`);
  if (r.repository.branch) out.push(`| Branch | \`${r.repository.branch}\` |`);
  out.push(`| Generated | ${fmtDate(r.generatedAt)} |`, `| Generator | Necro-Docs |`, '');

  out.push('## Key numbers', '', '| Metric | Value |', '|---|---|');
  out.push(`| Files analyzed | ${fmtInt(r.totals.files)} |`, `| Lines of code | ${fmtInt(r.totals.loc)} |`);
  out.push(`| Findings | ${fmtInt(r.totals.findings)} |`, `| Auto-fixable | ${fmtInt(r.totals.patchable)} |`);
  if (r.totals.aiUnverified) out.push(`| AI (unverified) observations | ${fmtInt(r.totals.aiUnverified)} |`);
  out.push(`| Critical / warning / healthy files | ${r.totals.status.CRITICAL} / ${r.totals.status.WARNING} / ${r.totals.status.HEALTHY} |`, '');

  const priorities = prioritiesOf(r);
  out.push('## Top priorities', '', '| # | File | Rot | Status | Findings | Auto-fixable | Imported by |', '|---|---|---|---|---|---|---|');
  priorities.forEach((f, i) => out.push(`| ${i + 1} | \`${cell(f.path)}\` | ${f.rot} | ${f.status} | ${f.findings.length} | ${f.findings.filter((x) => x.patchable).length} | ${f.importedBy.length} |`));
  out.push('');

  if (r.findingsByKind.length) {
    out.push('## Findings by kind', '', '| Kind | Count | Auto-fixable |', '|---|---|---|');
    for (const k of r.findingsByKind) out.push(`| \`${k.kind}\` | ${k.count} | ${k.patchable || '-'} |`);
    out.push('');
  }

  if (r.hubs.length) {
    out.push('## Blast radius hubs', '', 'Files most imported by others. A change here reaches the most code.', '');
    for (const h of r.hubs) out.push(`- \`${h.path}\`: imported by ${h.importedBy} file${h.importedBy === 1 ? '' : 's'}`);
    out.push('');
  }

  out.push('## Findings in priority files', '');
  for (const f of priorities) {
    out.push(`### \`${f.path}\``, '', `**${f.status}**, rot ${f.rot}/100, ${fmtInt(f.loc)} LOC, imported by ${f.importedBy.length}, imports ${f.imports.length}.`, '');
    if (f.summary) out.push(cell(f.summary), '');
    if (f.findings.length) {
      out.push('| Line | Kind | Finding | Next step | Source |', '|---|---|---|---|---|');
      for (const x of f.findings) out.push(`| ${lineLabel(x)} | \`${x.kind}\`${x.patchable ? ' (auto-fixable)' : ''} | ${cell(findingText(x))} | ${cell(x.suggestion) || '-'} | ${sourceLabel[x.source]} |`);
    } else {
      out.push('No findings.');
    }
    if (f.recommendation) out.push('', `**Recommendation:** ${cell(f.recommendation)}`);
    out.push('');
  }

  if (r.coverage) {
    out.push('## Coverage', '', '| | |', '|---|---|');
    for (const [k, v] of coverageLines(r.coverage)) out.push(`| ${k} | ${v} |`);
    out.push('');
  }
  out.push('## Methodology', '', ...METHOD.map((m) => `- ${m}`), '', '---', '', `_Generated by Necro-Docs on ${fmtDate(r.generatedAt)}._`, '');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

export const reportToJson = (r: AutopsyReport): string => JSON.stringify(r, null, 2);

// ---------------------------------------------------------------------------
// Printable HTML (saved as PDF through the browser print dialog)
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const tone: Record<ReportStatus, string> = { CRITICAL: 'crit', WARNING: 'warn', HEALTHY: 'ok' };

const CSS = `
@page { size: A4; margin: 16mm 14mm 18mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 10pt/1.5 "Plus Jakarta Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111113; }
code, .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 8.5pt; }
h1 { font-size: 22pt; line-height: 1.15; margin: 4px 0 6px; letter-spacing: -0.02em; }
h2 { font-size: 12.5pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #E8E9ED; break-after: avoid; }
h3 { font-size: 10.5pt; margin: 0; word-break: break-all; }
p { margin: 0 0 6px; }
.muted { color: #686A72; }
.eyebrow { font: 600 7.5pt/1 "JetBrains Mono", monospace; letter-spacing: .12em; text-transform: uppercase; color: #686A72; }
.cover { display: flex; justify-content: space-between; gap: 18px; padding: 18px 20px; border: 1px solid #E8E9ED; border-radius: 12px; background: #F6F7F9; }
.meta { margin-top: 8px; display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; font-size: 8.5pt; }
.meta dt { color: #686A72; } .meta dd { margin: 0; word-break: break-all; }
.score { text-align: center; min-width: 120px; }
.score .num { font-size: 34pt; font-weight: 700; line-height: 1; }
.pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font: 600 7.5pt/1.4 "JetBrains Mono", monospace; letter-spacing: .06em; }
.crit { color: #E11D48; } .warn { color: #D97706; } .ok { color: #059669; }
.pill.crit { background: #FFE4EA; } .pill.warn { background: #FEF3C7; } .pill.ok { background: #D1FAE5; }
.pill.fix { color: #1D4ED8; background: #DBEAFE; } .pill.ai { color: #686A72; background: #EEEFF2; }
.verdict { margin: 12px 0 0; font-size: 10pt; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
.kpi { border: 1px solid #E8E9ED; border-radius: 10px; padding: 10px 12px; }
.kpi b { display: block; font-size: 16pt; line-height: 1.1; }
.bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: #EEEFF2; margin: 10px 0 4px; }
.bar span { display: block; height: 100%; } .bar .crit { background: #E11D48; } .bar .warn { background: #D97706; } .bar .ok { background: #059669; }
.legend { display: flex; gap: 14px; font-size: 8.5pt; color: #686A72; }
.legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
th { text-align: left; font: 600 7.5pt/1.4 "JetBrains Mono", monospace; letter-spacing: .06em; text-transform: uppercase; color: #686A72; padding: 6px 8px; border-bottom: 1px solid #E8E9ED; background: #F6F7F9; }
td { padding: 6px 8px; border-bottom: 1px solid #F0F1F4; vertical-align: top; }
tr { break-inside: avoid; }
td.num, th.num { text-align: right; white-space: nowrap; }
td.path { word-break: break-all; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.file { border: 1px solid #E8E9ED; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; break-inside: avoid-page; }
.file header { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 6px; }
.file .stats { font-size: 8.5pt; color: #686A72; margin-bottom: 6px; }
.file .rec { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: #F6F7F9; font-size: 9pt; }
.finding td:first-child { white-space: nowrap; }
.next { color: #686A72; display: block; margin-top: 2px; }
ul.method { margin: 0; padding-left: 16px; } ul.method li { margin-bottom: 4px; }
footer.end { margin-top: 24px; padding-top: 8px; border-top: 1px solid #E8E9ED; font-size: 8pt; color: #686A72; display: flex; justify-content: space-between; }
.break { break-before: page; }
`;

function htmlFinding(x: ReportFinding): string {
  const tags = [x.patchable ? '<span class="pill fix">AUTO-FIXABLE</span>' : '', x.source === 'ai-unverified' ? '<span class="pill ai">AI · UNVERIFIED</span>' : ''].join(' ');
  return `<tr class="finding"><td class="mono">${lineLabel(x)}</td><td><code>${esc(x.kind)}</code></td><td>${esc(findingText(x))}${x.suggestion ? `<span class="next">→ ${esc(x.suggestion)}</span>` : ''}</td><td>${tags}</td></tr>`;
}

export function reportToHtml(r: AutopsyReport): string {
  const t = r.totals;
  const pct = (n: number) => (t.files ? (n / t.files) * 100 : 0).toFixed(2);
  const priorities = prioritiesOf(r);
  const meta: [string, string][] = [
    ['Repository', r.repository.url ? r.repository.url : `${r.repository.title} (sample specimen)`],
    ...(r.repository.branch ? [['Branch', r.repository.branch] as [string, string]] : []),
    ['Generated', fmtDate(r.generatedAt)],
    ['Scope', `${fmtInt(t.files)} files · ${fmtInt(t.loc)} lines of code`],
  ];

  const body = `
<section class="cover">
  <div>
    <div class="eyebrow">Necro-Docs · Codebase autopsy report</div>
    <h1>${esc(r.repository.title)}</h1>
    <dl class="meta">${meta.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  </div>
  <div class="score">
    <div class="eyebrow">Overall rot</div>
    <div class="num ${tone[r.verdict.status]}">${r.verdict.overallRot}</div>
    <div class="muted" style="font-size:8pt">out of 100</div>
    <div style="margin-top:6px"><span class="pill ${tone[r.verdict.status]}">${r.verdict.status}</span></div>
  </div>
</section>
${r.verdict.summary ? `<p class="verdict"><b>Verdict.</b> ${esc(r.verdict.summary)}</p>` : ''}

<div class="kpis">
  <div class="kpi"><span class="eyebrow">Files</span><b>${fmtInt(t.files)}</b></div>
  <div class="kpi"><span class="eyebrow">Findings</span><b>${fmtInt(t.findings)}</b></div>
  <div class="kpi"><span class="eyebrow">Auto-fixable</span><b>${fmtInt(t.patchable)}</b></div>
  <div class="kpi"><span class="eyebrow">Critical files</span><b class="crit">${fmtInt(t.status.CRITICAL)}</b></div>
</div>

<h2>File health</h2>
<div class="bar"><span class="crit" style="width:${pct(t.status.CRITICAL)}%"></span><span class="warn" style="width:${pct(t.status.WARNING)}%"></span><span class="ok" style="width:${pct(t.status.HEALTHY)}%"></span></div>
<div class="legend"><span><i style="background:#E11D48"></i>Critical (70+) ${t.status.CRITICAL}</span><span><i style="background:#D97706"></i>Warning (40-69) ${t.status.WARNING}</span><span><i style="background:#059669"></i>Healthy (&lt;40) ${t.status.HEALTHY}</span>${t.aiUnverified ? `<span>${t.aiUnverified} AI observations (unverified)</span>` : ''}</div>

<h2>Top priorities</h2>
<table>
  <thead><tr><th>#</th><th>File</th><th class="num">Rot</th><th>Status</th><th class="num">Findings</th><th class="num">Auto-fix</th><th class="num">Imported by</th></tr></thead>
  <tbody>${priorities.map((f, i) => `<tr><td class="mono">${String(i + 1).padStart(2, '0')}</td><td class="path"><code>${esc(f.path)}</code></td><td class="num"><b class="${tone[f.status]}">${f.rot}</b></td><td><span class="pill ${tone[f.status]}">${f.status}</span></td><td class="num">${f.findings.length}</td><td class="num">${f.findings.filter((x) => x.patchable).length}</td><td class="num">${f.importedBy.length}</td></tr>`).join('')}</tbody>
</table>

<div class="two">
  <div>
    <h2>Findings by kind</h2>
    ${r.findingsByKind.length ? `<table><thead><tr><th>Kind</th><th class="num">Count</th><th class="num">Auto-fix</th></tr></thead><tbody>${r.findingsByKind.map((k) => `<tr><td><code>${esc(k.kind)}</code></td><td class="num">${k.count}</td><td class="num">${k.patchable || '–'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No findings.</p>'}
  </div>
  <div>
    <h2>Blast radius hubs</h2>
    ${r.hubs.length ? `<table><thead><tr><th>File</th><th class="num">Imported by</th></tr></thead><tbody>${r.hubs.map((h) => `<tr><td class="path"><code>${esc(h.path)}</code></td><td class="num">${h.importedBy}</td></tr>`).join('')}</tbody></table><p class="muted" style="margin-top:6px;font-size:8.5pt">A change to these files reaches the most code.</p>` : '<p class="muted">No import edges were found.</p>'}
  </div>
</div>

<h2 class="break">Findings in priority files</h2>
${priorities.map((f) => `<article class="file">
  <header><h3><code>${esc(f.path)}</code></h3><span class="pill ${tone[f.status]}">${f.status} · ${f.rot}</span></header>
  <div class="stats">${fmtInt(f.loc)} LOC · imported by ${f.importedBy.length} · imports ${f.imports.length} · ${f.findings.length} finding${f.findings.length === 1 ? '' : 's'}</div>
  ${f.summary ? `<p>${esc(f.summary)}</p>` : ''}
  ${f.findings.length ? `<table><thead><tr><th>Line</th><th>Kind</th><th>Finding and next step</th><th></th></tr></thead><tbody>${f.findings.map(htmlFinding).join('')}</tbody></table>` : '<p class="muted">No findings.</p>'}
  ${f.recommendation ? `<div class="rec"><b>Recommendation.</b> ${esc(f.recommendation)}</div>` : ''}
</article>`).join('\n')}

${r.coverage ? `<h2>Coverage</h2><table><tbody>${coverageLines(r.coverage).map(([k, v]) => `<tr><td style="width:36%" class="muted">${k}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}

<h2>Methodology</h2>
<ul class="method">${METHOD.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>

<footer class="end"><span>Generated by Necro-Docs · ${fmtDate(r.generatedAt)}</span><span>${esc(r.repository.title)}</span></footer>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(reportFileName(r, 'pdf').replace(/\.pdf$/, ''))}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}
