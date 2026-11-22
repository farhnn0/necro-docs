/**
 * Real-time GitHub repository analysis ("Repository Analysis & Code-Rot Engine").
 *
 * Zero-clone pipeline, see `public/panduan_master_prompt_analisis_repo.md`:
 *   1. parse the URL and resolve the default branch  (GET /repos/{owner}/{repo})
 *   2. fetch the recursive file tree and pick every source file within the file and byte budgets
 *   3. fetch raw file contents with bounded concurrency (raw.githubusercontent.com)
 *   4. scan each file: dependency edges + code-rot score + findings with line numbers
 *   5. mark the key files (hotspots, hubs, entry points); only those get AI explanations
 *   6. lay the nodes out in layered columns (see graphLayout.ts)
 *
 * Server-only: import types from here with `import type` in client code.
 *
 * TypeScript/JavaScript are tokenized by the TypeScript compiler (astScan.ts), so comments, strings,
 * regex literals and JSX text are exact; the checks then run on those views.
 * shortcut: Python and Go still use the character scanner (`splitCode`), which can miscount keywords
 * inside unusual string forms. Upgrade to tree-sitter if those languages need the same precision.
 */
import { posix } from 'node:path';
import ts from 'typescript';
import { INGEST_CONFIG } from '@/lib/constants';
import type { LanguageFamily } from '@/lib/ingest/analyze';
import { IngestError } from '@/lib/ingest/errors';
import { mapGitHubError } from '@/lib/ingest/github';
import { detectRelations, resolveImport } from '@/lib/ingest/relations';
import { layoutGraph } from '@/lib/graphLayout';
import { scanAst, type AstScan } from '@/lib/astScan';
import type { FindingKind, RepoFinding } from '@/lib/types';

// ============================================================================
// Public types (the JSON contract returned by POST /api/ingest)
// ============================================================================

export interface RepoNode {
  id: string;
  name: string;
  path: string;
  loc: number;
  rot: number;
  lastCommit: string;
  x: number;
  y: number;
  /** Scanner findings first (always kept), then observations the AI added about lines it was shown. */
  findings: RepoFinding[];
  /** Neutral facts and remarks that are not problems (a healthy file has notes and no findings). */
  notes: string[];
  summary: string;
  recommendation: string;
  code: string;
  /** One of the key files the workspace shows first (hotspots, hubs, entry points). */
  featured: boolean;
  /** Who wrote the summary and recommendation. Only key files are sent to the AI provider. */
  explainedBy: 'ai' | 'static';
}

export interface RepoEdge {
  from: string;
  to: string;
}

/** What was and was not analyzed, so the UI can state its coverage honestly. */
export interface RepoCoverage {
  /** Supported source files in the repository tree (.ts/.tsx/.js/.jsx/.py/.go, excluding .d.ts). */
  totalFiles: number;
  analyzed: number;
  featured: number;
  skipped: {
    tests: number;
    config: number;
    /** node_modules, dist, build, vendor and dot-folders. */
    generated: number;
    tooLarge: number;
    /** Eligible files beyond the file-count or byte budget. */
    overLimit: number;
    /** Selected but GitHub did not return the file. */
    unreadable: number;
  };
  /** GitHub cut the recursive tree short (very large repositories). */
  treeTruncated: boolean;
  fileLimit: number;
}

export interface RepoAnalysis {
  title: string;
  defaultBranch: string;
  rotSummary: string;
  overallRot: number;
  nodes: RepoNode[];
  edges: RepoEdge[];
  coverage: RepoCoverage;
  /** Package names from the root package.json, so a generated patch knows what it may import. */
  dependencies: string[];
}

export interface AnalyzeOptions {
  /** GitHub token. Falls back to `process.env.GITHUB_TOKEN`; pass `''` to force anonymous. */
  token?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

// ============================================================================
// Tunables
// ============================================================================

// Static analysis covers the whole codebase up to these budgets; only FEATURED_FILES go to the AI.
// ponytail: the byte budget keeps the response small enough for sessionStorage (~5 MB). Upgrade
// path for bigger repositories: keep `code` server-side and load it per file on demand.
const MAX_FILES = 400;
const MAX_TOTAL_BYTES = 3_500_000;
const FEATURED_FILES = 30;
const FETCH_CONCURRENCY = 12;
const MAX_FILE_BYTES = 250_000; // skips bundles / generated files
const SNIPPET_LINES = 40;
const LONG_FUNCTION_LINES = 60;
/** Control-flow depth (if/loop/try inside each other) at which nesting is reported. */
const DEEP_NESTING = 4;
/** Decision points per code line at which branching is called high (same cut as the summary text). */
const HIGH_BRANCH_DENSITY = 0.30;
const HIGH_BRANCH_MIN_LOC = 60;
const HIGH_BRANCH_MIN_COUNT = 25;
/** Consecutive normalized lines that must match before a block counts as duplicated. */
const DUPLICATE_WINDOW = 6;
const RAW_HOST = 'https://raw.githubusercontent.com';

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go'] as const;
const EXCLUDED_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'vendor', '.git', '__pycache__', '__tests__', 'tests', 'test']);
const PRIORITY_DIRS = new Set(['src', 'app', 'lib', 'server', 'core']);

/** Code-rot weights; the four components add up to at most 100. */
const ROT = {
  VOLUME_FREE_LOC: 300,
  VOLUME_FULL_LOC: 1000,
  VOLUME_MAX: 25,
  NESTING_FREE_DEPTH: 2,
  NESTING_PER_LEVEL: 3,
  NESTING_MAX: 15,
  BRANCH_PER_PERCENT: 0.75, // points per branch per 100 LOC
  BRANCH_MAX: 15,
  EMPTY_CATCH: 18,
  SOFT_CATCH: 6,
  SECRET: 20,
  DUPLICATE: 6,
  WEAK_TYPING: 10,
  DEBT_COMMENT: 8,
  SILENT_MAX: 30,
  COUPLING_PER_LINK: 2.5,
  COUPLING_MAX: 15,
} as const;

type Lang = 'js' | 'py' | 'go';

// ============================================================================
// 1. URL parsing
// ============================================================================

const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Accepts `https://github.com/owner/repo`, `github.com/owner/repo` and `owner/repo`.
 * Trailing `.git`, `/tree/...`, query strings and slashes are ignored.
 */
export function parseGitHubUrl(input: unknown): { owner: string; repo: string } {
  if (typeof input !== 'string') throw new IngestError('INVALID_URL_FORMAT', 'Repository URL must be a string');
  let value = input.trim();
  if (!value) throw new IngestError('MISSING_REPOSITORY_URL', 'Repository URL is required');

  const protocol = /^([a-z][a-z\d+.-]*):\/\//i.exec(value);
  if (protocol) {
    if (!/^https?$/i.test(protocol[1])) throw new IngestError('INVALID_URL_FORMAT', 'Repository URL must use http or https');
    value = value.slice(protocol[0].length);
  }
  const segments = value.replace(/[?#].*$/, '').split('/').filter(Boolean);
  // GitHub user names cannot contain dots, so a dotted first segment is a host name.
  if (protocol || segments[0]?.includes('.')) {
    const host = (segments.shift() ?? '').toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
      throw new IngestError('NON_GITHUB_REPOSITORY', 'Only github.com repositories are supported');
    }
  }
  const [owner, rawRepo] = segments;
  if (!owner || !rawRepo) throw new IngestError('INVALID_URL_FORMAT', 'Repository URL must include owner and repository');
  const repo = rawRepo.replace(/\.git$/i, '');
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || /^\.+$/.test(repo)) {
    throw new IngestError('INVALID_URL_FORMAT', 'Owner or repository name contains invalid characters');
  }
  return { owner, repo };
}

// ============================================================================
// 2-3. GitHub access
// ============================================================================

interface Ctx {
  token?: string;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
}

interface TreeEntry {
  path: string;
  type: string;
  mode?: string;
  size?: number;
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

function transportError(e: unknown, signal: AbortSignal): IngestError {
  if (signal.aborted) return new IngestError('REQUEST_TIMEOUT', 'The request timed out');
  return new IngestError('GITHUB_API_ERROR', 'Failed to reach GitHub', {
    error: e instanceof Error ? e.message : String(e),
  });
}

async function githubJson<T>(path: string, ctx: Ctx): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': INGEST_CONFIG.GITHUB_API_VERSION,
    'User-Agent': INGEST_CONFIG.USER_AGENT,
  };
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;

  let res: Response;
  try {
    res = await ctx.fetchImpl(`${INGEST_CONFIG.GITHUB_API_BASE}${path}`, { headers, signal: ctx.signal });
  } catch (e) {
    throw transportError(e, ctx.signal);
  }
  if (!res.ok) {
    let message: string | undefined;
    try {
      const body = (await res.json()) as { message?: unknown };
      if (typeof body.message === 'string') message = body.message;
    } catch {
      /* body is not JSON */
    }
    throw mapGitHubError({ status: res.status, headers: res.headers, message }, 'repository');
  }
  try {
    return (await res.json()) as T;
  } catch (e) {
    if (ctx.signal.aborted) throw transportError(e, ctx.signal);
    throw new IngestError('GITHUB_API_ERROR', 'GitHub returned an unparseable response');
  }
}

type RawResult = { ok: true; text: string } | { ok: false; status: number };

async function fetchRaw(owner: string, repo: string, branch: string, path: string, ctx: Ctx): Promise<RawResult> {
  const headers: Record<string, string> = { 'User-Agent': INGEST_CONFIG.USER_AGENT };
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;
  try {
    const res = await ctx.fetchImpl(`${RAW_HOST}/${owner}/${repo}/${encodePath(branch)}/${encodePath(path)}`, {
      headers,
      signal: ctx.signal,
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return { ok: false, status: res.status };
    }
    return { ok: true, text: await res.text() };
  } catch (e) {
    if (ctx.signal.aborted) throw transportError(e, ctx.signal);
    return { ok: false, status: 0 };
  }
}

function langOf(path: string): Lang | null {
  const lower = path.toLowerCase();
  if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(lower)) return 'js';
  if (lower.endsWith('.py')) return 'py';
  if (lower.endsWith('.go')) return 'go';
  return null;
}

const TEST_FILE_RE = /\.(?:test|spec)\.[^./]+$|^test_.+\.py$|_test\.(?:py|go)$|^conftest\.py$/;
const CONFIG_FILE_RE = /\.config\.[cm]?[jt]sx?$|^\.[\w.-]*rc\.[cm]?[jt]s$|^setup\.py$/;

const TEST_DIRS = new Set(['__tests__', 'tests', 'test']);

/** Why a tree entry is or is not analyzed. `null` means it is not a supported source file at all. */
type EntryClass = 'code' | 'test' | 'config' | 'generated' | 'tooLarge';

function classifyEntry(entry: TreeEntry): EntryClass | null {
  if (entry.type !== 'blob' || entry.mode === '120000') return null;
  const segments = entry.path.split('/');
  const name = segments[segments.length - 1];
  if (!EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)) || /\.d\.ts$/i.test(name)) return null;
  const dirs = segments.slice(0, -1);
  if (TEST_FILE_RE.test(name) || dirs.some((dir) => TEST_DIRS.has(dir))) return 'test';
  if (dirs.some((dir) => EXCLUDED_DIRS.has(dir) || dir.startsWith('.'))) return 'generated';
  if (CONFIG_FILE_RE.test(name)) return 'config';
  if (!entry.size) return null;
  if (entry.size > MAX_FILE_BYTES) return 'tooLarge';
  return 'code';
}

/**
 * Every eligible source file, core folders first, then shallow paths, then smaller files (so the byte
 * budget covers as many files as possible); ties break on path. Also counts what was left out and why.
 */
function selectFiles(entries: TreeEntry[]): { selected: TreeEntry[]; coverage: Omit<RepoCoverage, 'analyzed' | 'featured' | 'treeTruncated'> } {
  const tier = (path: string) => {
    const dirs = path.split('/').slice(0, -1);
    return PRIORITY_DIRS.has(dirs[0] ?? '') ? 0 : dirs.some((d) => PRIORITY_DIRS.has(d)) ? 1 : 2;
  };
  const skipped = { tests: 0, config: 0, generated: 0, tooLarge: 0, overLimit: 0, unreadable: 0 };
  const candidates: TreeEntry[] = [];
  let totalFiles = 0;
  for (const entry of entries) {
    const kind = classifyEntry(entry);
    if (kind === null) continue;
    totalFiles++;
    if (kind === 'code') candidates.push(entry);
    else if (kind === 'test') skipped.tests++;
    else skipped[kind]++;
  }
  candidates.sort(
    (a, b) =>
      tier(a.path) - tier(b.path) ||
      a.path.split('/').length - b.path.split('/').length ||
      (a.size ?? 0) - (b.size ?? 0) ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
  const selected: TreeEntry[] = [];
  let bytes = 0;
  for (const entry of candidates) {
    if (selected.length >= MAX_FILES || bytes + (entry.size ?? 0) > MAX_TOTAL_BYTES) {
      skipped.overLimit++;
      continue;
    }
    selected.push(entry);
    bytes += entry.size ?? 0;
  }
  return { selected, coverage: { totalFiles, skipped, fileLimit: MAX_FILES } };
}

/** Runs `fn` over `items` with at most `limit` calls in flight; results keep the input order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ============================================================================
// 4. Static scanner
// ============================================================================

type IssueKind = FindingKind;

/**
 * Default ranking. An empty, undocumented catch stays near the top, but a catch that only returns a
 * default or carries a comment explaining the ignore ranks below structural problems.
 */
const SEVERITY: Record<IssueKind, number> = {
  secret: 100,
  eval: 95,
  'empty-catch': 90,
  'unsafe-html': 85,
  'ts-ignore': 80,
  'deep-nesting': 75,
  any: 70,
  'long-function': 70,
  debt: 65,
  duplicate: 60,
  'default-catch': 55,
  branching: 50,
  monolith: 55,
  'prompt-drift': 30,
  'ignored-catch': 25,
  'fallback-chain': 20,
  'html-notice': 15,
};

interface Issue {
  kind: IssueKind;
  /** Higher sorts first when picking the 2-4 reported findings. */
  severity: number;
  line: number | null;
  /** Every affected line once repeats are merged. */
  lines?: number[];
  text: string;
  /** Concrete next step. When this issue ranks first it replaces the generic recommendation. */
  suggestion?: string;
}

const issue = (kind: IssueKind, line: number | null, text: string, severity = SEVERITY[kind]): Issue => ({ kind, severity, line, text });

/**
 * One finding per kind: repeats of the same problem become "(N places: lines a, b)" on the first one,
 * so a file with three swallowed catches still leaves room for its other problems.
 */
function mergeByKind(issues: Issue[]): Issue[] {
  const groups = new Map<IssueKind, Issue[]>();
  for (const item of issues) groups.set(item.kind, [...(groups.get(item.kind) ?? []), item]);
  return [...groups.values()].map((group) => {
    const sorted = [...group].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    const [first] = sorted;
    if (sorted.length === 1) return first;
    const lines = sorted.flatMap((item) => item.lines ?? (item.line === null ? [] : [item.line]));
    const shown = lines.slice(0, 5).join(', ') + (lines.length > 5 ? ', …' : '');
    return { ...first, lines, severity: Math.max(...sorted.map((item) => item.severity)), text: `${first.text.replace(/\.$/, '')} (${sorted.length} places: lines ${shown}).` };
  });
}

interface Scanned {
  path: string;
  name: string;
  lang: Lang;
  lines: string[];
  codeText: string;
  loc: number;
  codeLoc: number;
  branches: number;
  depth: number;
  issues: Issue[];
  /** Points from silent failures and technical debt, before the cap. */
  silent: number;
  /** From the AST pass; empty for Python and Go. */
  stringLines: Set<number>;
  declaredTypes: string[];
  promptTypeRefs: Array<{ name: string; line: number }>;
}

/**
 * Splits a file into per-line views, one entry per source line so line numbers stay real:
 * - `code`:    comments removed, string literals kept (used to read import specifiers)
 * - `bare`:    like `code` but string contents blanked 1:1 (used for counting and brace matching)
 * - `comment`: comment text (Python docstrings count as comments)
 */
function splitCode(content: string, lang: Lang): { lines: string[]; code: string[]; bare: string[]; comment: string[] } {
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const code: string[] = [];
  const bare: string[] = [];
  const comment: string[] = [];
  let inBlock = false;
  let triple: string | null = null;
  // Only template literals continue across lines; an unclosed ' or " is reset at the line end.
  let quote: string | null = null;

  for (const line of lines) {
    let c = '';
    let b = '';
    let m = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inBlock) {
        if (ch === '*' && line[i + 1] === '/') {
          inBlock = false;
          i++;
        } else m += ch;
        continue;
      }
      if (triple) {
        if (line.startsWith(triple, i)) {
          triple = null;
          i += 2;
        } else m += ch;
        continue;
      }
      if (quote) {
        c += ch;
        b += ' ';
        if (ch === '\\' && i + 1 < line.length) {
          c += line[i + 1];
          b += ' ';
          i++;
        } else if (ch === quote) {
          quote = null;
          b = b.slice(0, -1) + ch;
        }
        continue;
      }
      if (lang === 'py') {
        if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
          triple = line.slice(i, i + 3);
          i += 2;
          continue;
        }
        if (ch === '#') {
          m += line.slice(i + 1);
          break;
        }
      } else {
        if (ch === '/' && line[i + 1] === '/') {
          m += line.slice(i + 2);
          break;
        }
        if (ch === '/' && line[i + 1] === '*') {
          inBlock = true;
          i++;
          continue;
        }
      }
      if (ch === '"' || ch === "'" || (ch === '`' && lang !== 'py')) quote = ch;
      c += ch;
      b += ch;
    }
    if (quote !== '`') quote = null;
    code.push(c);
    bare.push(b);
    comment.push(m);
  }
  return { lines, code, bare, comment };
}
/** Index of the bracket closing the one at `openIdx`, or -1. Skips string literals. */
function matchClose(text: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote || (ch === '\n' && quote !== '`')) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return i;
  }
  return -1;
}

function lineIndex(text: string): { lineAt: (idx: number) => number; offsets: number[] } {
  const offsets = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') offsets.push(i + 1);
  const lineAt = (idx: number) => {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1; // 1-based
  };
  return { lineAt, offsets };
}

const BRANCH_RE: Record<Lang, RegExp> = {
  js: /\b(?:if|switch|case|for|while|catch)\b|&&|\|\||(?<!\?)\?(?![.?:])/g,
  go: /\b(?:if|switch|case|select|for)\b|&&|\|\|/g,
  py: /\b(?:if|elif|for|while|except|and|or)\b/g,
};

/** Actionable debt markers: at the start of a comment (or JSDoc `*` line), or followed by `:` anywhere. */
const DEBT_RE = /^\s*\*?\s*(?:(TODO|FIXME|HACK|XXX)(?:\s*\([^)]*\))?(?:[:\-\s]|$)|(UNSAFE)(?:\s*\([^)]*\))?[:\-])|\b(TODO|FIXME|HACK|XXX|UNSAFE)(?:\s*\([^)]*\))?:/;
const KEYWORDS_NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'with']);

/** A catch body that only returns a placeholder value (`return null`, `return []`, `return None`, ...). */
const DEFAULT_RETURN_RE = {
  js: /^return\b\s*(?:null|undefined|false|true|0|-1|(['"`])\s*\1|\[\s*\]|\{\s*\})?\s*;?$/,
  py: /^return(?:\s+(?:None|False|True|0|-1|\[\]|\{\}|(['"])\s*\1))?$/,
};

/**
 * Classifies each catch/except body:
 * - empty, no comment          -> `empty-catch` (the error disappears)
 * - empty with a comment       -> `ignored-catch` (deliberate, low severity)
 * - only returns a placeholder -> `default-catch` (caller cannot tell failure from "no data")
 * - anything else              -> not reported: rethrowing, logging, using the error, or running a
 *                                 fallback (retry, alternative parse, assignment) is error handling.
 */
function scanCatchBlocks(lang: Lang, bare: string[], bareText: string, comment: string[], lineAt: (i: number) => number): Issue[] {
  const issues: Issue[] = [];
  const word = lang === 'py' ? 'except' : 'catch';
  const documented = (from: number, to: number) => comment.slice(from - 1, to).some((text) => text.trim() !== '');
  const classify = (line: number, endLine: number, body: string, defaultReturn: RegExp) => {
    if (body === '' || (lang === 'py' && /^(?:pass|\.\.\.)$/.test(body))) {
      issues.push(
        documented(line, endLine)
          ? issue('ignored-catch', line, `Line ${line}: ${word} block deliberately ignores the error (a comment explains why); check that only the expected error type is ignored.`)
          : issue('empty-catch', line, `Line ${line}: Empty ${word} block swallows exceptions silently.`),
      );
    } else if (defaultReturn.test(body) && !documented(line, endLine)) {
      issues.push(issue('default-catch', line, `Line ${line}: ${word} block returns a placeholder value without logging or a comment; if that fallback is intentional, document why—otherwise callers cannot tell a failure from an empty result.`));
    }
  };

  if (lang === 'js') {
    for (const m of bareText.matchAll(/\bcatch\b\s*(?:\(([^)]*)\))?\s*\{/g)) {
      const open = m.index + m[0].length - 1;
      const close = matchClose(bareText, open, '{', '}');
      if (close < 0) continue;
      classify(lineAt(m.index), lineAt(close), bareText.slice(open + 1, close).trim(), DEFAULT_RETURN_RE.js);
    }
  } else if (lang === 'py') {
    bare.forEach((raw, i) => {
      const m = /^(\s*)except\b([^:]*):(.*)$/.exec(raw);
      if (!m) return;
      const indent = m[1].length;
      const body: string[] = [m[3]];
      let last = i;
      for (let j = i + 1; j < bare.length; j++) {
        const next = bare[j];
        if (next.trim() !== '' && next.length - next.trimStart().length <= indent) break;
        body.push(next);
        if (next.trim() !== '') last = j;
      }
      classify(i + 1, last + 1, body.join('\n').trim(), DEFAULT_RETURN_RE.py);
    });
  }
  return issues;
}

// ponytail: control-flow depth, not indentation, so JSX and object literals do not count as nesting.
// Brace languages tag every `{` as control or not; Python stacks control headers by indent.
const CONTROL_AFTER_PAREN = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
const CONTROL_WORD = new Set(['else', 'try', 'finally', 'do', 'catch']);

function wordBefore(text: string, end: number): { word: string; start: number } {
  let j = end;
  while (j >= 0 && /\s/.test(text[j])) j--;
  const stop = j;
  while (j >= 0 && /[\w$]/.test(text[j])) j--;
  return { word: text.slice(j + 1, stop + 1), start: j + 1 };
}

function isControlBrace(lang: Lang, text: string, brace: number): boolean {
  if (lang === 'go') {
    const head = text.slice(text.lastIndexOf('\n', brace - 1) + 1, brace);
    return /^\s*(?:\}\s*)?(?:else\s+)?(?:if|for|switch|select)\b/.test(head) || /^\s*\}?\s*else\s*$/.test(head);
  }
  let j = brace - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  if (text[j] !== ')') return CONTROL_WORD.has(wordBefore(text, j).word);
  // Walk back over the balanced condition; strings are already blanked in `bare`.
  let depth = 0;
  for (; j >= 0; j--) {
    if (text[j] === ')') depth++;
    else if (text[j] === '(' && --depth === 0) break;
  }
  if (j < 0) return false;
  const before = wordBefore(text, j - 1);
  const word = before.word === 'await' ? wordBefore(text, before.start - 1).word : before.word;
  return CONTROL_AFTER_PAREN.has(word);
}

function controlDepth(lang: Lang, bare: string[], bareText: string, lineAt: (i: number) => number): { depth: number; line: number } {
  let best = { depth: 0, line: 1 };
  if (lang === 'py') {
    const stack: number[] = [];
    bare.forEach((raw, i) => {
      if (raw.trim() === '') return;
      const indent = raw.length - raw.trimStart().length;
      while (stack.length && indent <= stack[stack.length - 1]) stack.pop();
      if (/^\s*(?:async\s+)?(?:if|elif|else|for|while|try|except|finally|with|match|case)\b.*:\s*$/.test(raw)) {
        stack.push(indent);
        if (stack.length > best.depth) best = { depth: stack.length, line: i + 1 };
      }
    });
    return best;
  }
  const open: boolean[] = [];
  let depth = 0;
  for (let i = 0; i < bareText.length; i++) {
    const ch = bareText[i];
    if (ch === '{') {
      const control = isControlBrace(lang, bareText, i);
      open.push(control);
      if (control && ++depth > best.depth) best = { depth, line: lineAt(i) };
    } else if (ch === '}' && open.pop()) depth--;
  }
  return best;
}

/** Credential formats that are unambiguous enough to report without false alarms on placeholders. */
const SECRET_RE = /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{50,}|sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}|gsk_[A-Za-z0-9]{40,}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{10,})\b|-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/;

/** Longest function body in lines, with its 1-based start line and name. */
function longestFunction(
  lang: Lang,
  bare: string[],
  bareText: string,
  offsets: number[],
  lineAt: (i: number) => number,
): { name: string; line: number; length: number } | null {
  let best: { name: string; line: number; length: number } | null = null;
  const consider = (name: string, startLine: number, endLine: number) => {
    const length = endLine - startLine + 1;
    if (length >= LONG_FUNCTION_LINES && (!best || length > best.length)) best = { name: name || 'anonymous', line: startLine, length };
  };

  if (lang === 'py') {
    bare.forEach((raw, i) => {
      const m = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/.exec(raw);
      if (!m) return;
      let last = i;
      for (let j = i + 1; j < bare.length; j++) {
        if (bare[j].trim() === '') continue;
        if (bare[j].length - bare[j].trimStart().length <= m[1].length) break;
        last = j;
      }
      consider(m[2], i + 1, last + 1);
    });
    return best;
  }

  const patterns: RegExp[] =
    lang === 'go'
      ? [/^\s*func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(/]
      : [
          /\bfunction\b\s*\*?\s*([\w$]*)\s*\(/,
          /\b(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^={]+)?=>\s*\{/,
          /^\s*(?:(?:public|private|protected|static|async|get|set|override)\s+)*([\w$]+)\s*\([^)]*\)\s*(?::\s*[^{=]+)?\{\s*$/,
        ];
  bare.forEach((raw, i) => {
    for (const re of patterns) {
      const m = re.exec(raw);
      if (!m || KEYWORDS_NOT_METHODS.has(m[1])) continue;
      // Find the body brace: skip the balanced parameter list, then take the next `{`.
      const paren = bareText.indexOf('(', offsets[i] + m.index + m[0].indexOf(m[1]));
      const closeParen = paren < 0 ? -1 : matchClose(bareText, paren, '(', ')');
      const open = closeParen < 0 ? -1 : bareText.indexOf('{', closeParen);
      if (open < 0) continue;
      const close = matchClose(bareText, open, '{', '}');
      if (close >= 0) consider(m[1], i + 1, lineAt(close));
      break;
    }
  });
  return best;
}

function scanFile(path: string, content: string, lang: Lang): Scanned {
  // TypeScript/JavaScript get an AST pass: it supplies the line views and the checks that need context.
  // A parse failure must never fail the analysis, so the character scanner stays as the fallback.
  let ast: AstScan | null = null;
  if (lang === 'js') {
    try { ast = scanAst(path, content); } catch { ast = null; }
  }
  const { lines, code, bare, comment } = ast?.views ?? splitCode(content, lang);
  const codeText = code.join('\n');
  const bareText = bare.join('\n');
  const { lineAt, offsets } = lineIndex(bareText);
  const loc = lines.length;
  const codeLoc = code.filter((l) => l.trim() !== '').length;
  const branches = ast ? ast.branches : (bareText.match(BRANCH_RE[lang]) ?? []).length;
  const { depth, line: depthLine } = controlDepth(lang, bare, bareText, lineAt);
  const issues: Issue[] = [];
  let silent = 0;

  // Hard-coded credentials (+20 once). The value itself is never echoed into the finding.
  const secretLines = lines.flatMap((l, i) => (SECRET_RE.test(l) ? [i + 1] : []));
  if (secretLines.length > 0) {
    silent += ROT.SECRET;
    issues.push({ ...issue('secret', secretLines[0], `Line ${secretLines[0]}: Hard-coded credential (API key or private key format) is committed to the repository.`), lines: secretLines });
  }

  // Catch blocks: empty (+18 once) or returning a placeholder (+6 once). Documented ignores add nothing.
  // An empty catch that is only the first stage of a fallback (a later step retries or repairs) is not swallowing.
  const catches = scanCatchBlocks(lang, bare, bareText, comment, lineAt).map((c) =>
    c.kind === 'empty-catch' && c.line !== null && ast?.fallbackCatchLines.has(c.line)
      ? issue('fallback-chain', c.line, `Line ${c.line}: catch is the first stage of a multi-stage fallback (a later step retries or repairs); consider logging the first failure at debug level.`)
      : c,
  );
  if (catches.some((c) => c.kind === 'empty-catch')) silent += ROT.EMPTY_CATCH;
  else if (catches.some((c) => c.kind === 'default-catch')) silent += ROT.SOFT_CATCH;
  issues.push(...catches);

  // Weak typing: `any`, @ts-ignore, eval (+10 once).
  let weak = false;
  const firstLine = (re: RegExp, source: string[]) => {
    const hits = source.flatMap((l, i) => (re.test(l) ? [i + 1] : []));
    return { count: hits.length, line: hits[0] ?? 0, lines: hits };
  };
  if (lang === 'js') {
    // Only a comment that starts with the directive suppresses checking; prose that mentions it does not.
    const ignored = ast?.suppressionLines ?? firstLine(/^[\s/*]*@ts-(?:ignore|nocheck)\b/, comment).lines;
    const ignores = { count: ignored.length, line: ignored[0] ?? 0, lines: ignored };
    if (ignores.count > 0) {
      weak = true;
      issues.push({ ...issue('ts-ignore', ignores.line, `Line ${ignores.line}: @ts-ignore suppresses type checking${ignores.count > 1 ? ` (${ignores.count} places)` : ''}.`), lines: ignores.lines });
    }
    if (/\.tsx?$/i.test(path)) {
      const anyRe = /(?::\s*any\b|\bas\s+any\b|<any>|\bany\[\])/g;
      const hits = ast?.anyLines ?? bare.flatMap((l, i) => (l.match(anyRe) ?? []).map(() => i + 1));
      if (hits.length >= 3) {
        weak = true;
        issues.push({ ...issue('any', hits[0], `Line ${hits[0]}: \`any\` is used ${hits.length} times, which disables type checking.`), lines: hits });
      }
    }
    // Raw HTML injection is an XSS risk unless the value is sanitized first. React's dangerouslySetInnerHTML is
    // judged by the AST pass (sanitizer / static dictionary / unsafe); the regex only keeps it when the AST is unavailable.
    const sinks = ast
      ? /\.(?:inner|outer)HTML\s*=(?!=)|\bdocument\.write\s*\(|\.insertAdjacentHTML\s*\(/
      : /\bdangerouslySetInnerHTML\b|\.(?:inner|outer)HTML\s*=(?!=)|\bdocument\.write\s*\(|\.insertAdjacentHTML\s*\(/;
    const html = firstLine(sinks, bare);
    if (html.count > 0) {
      issues.push({ ...issue('unsafe-html', html.line, `Line ${html.line}: Raw HTML is injected into the page${html.count > 1 ? ` (${html.count} places)` : ''}; unsanitized input here is an XSS risk.`), lines: html.lines });
    }
    for (const finding of ast?.findings ?? []) {
      issues.push({ ...issue(finding.kind, finding.line, finding.text), ...(finding.suggestion ? { suggestion: finding.suggestion } : {}) });
    }
  }
  if (lang !== 'go') {
    const evals = firstLine(lang === 'py' ? /\b(?:eval|exec)\s*\(/ : /\beval\s*\(|\bnew\s+Function\s*\(/, bare);
    if (evals.count > 0) {
      weak = true;
      const call = /\bnew\s+Function\b/.test(bare[evals.line - 1]) ? 'new Function()' : lang === 'py' && /\bexec\s*\(/.test(bare[evals.line - 1]) ? 'exec()' : 'eval()';
      issues.push({ ...issue('eval', evals.line, `Line ${evals.line}: ${call} runs dynamic code and is unsafe.`), lines: evals.lines });
    }
  }
  if (weak) silent += ROT.WEAK_TYPING;

  // Technical-debt comments (+8 each). mergeByKind folds them into one finding with every line.
  comment.forEach((text, i) => {
    const m = DEBT_RE.exec(text);
    if (!m) return;
    silent += ROT.DEBT_COMMENT;
    const tag = (m[1] ?? m[2] ?? m[3]).toUpperCase();
    const note = text.trim().replace(/\s+/g, ' ').slice(0, 70);
    issues.push(issue('debt', i + 1, `Line ${i + 1}: ${tag} comment marks unresolved technical debt: "${note}".`));
  });

  const longest = ast ? ast.longestFunction : longestFunction(lang, bare, bareText, offsets, lineAt);
  const long = longest && longest.length >= LONG_FUNCTION_LINES ? longest : null;
  if (long) {
    issues.push(issue('long-function', long.line, `Line ${long.line}: ${long.name}() spans ${long.length} lines; consider splitting independent steps into smaller helpers if it is hard to follow.`));
  }
  if (depth >= DEEP_NESTING) {
    issues.push({
      ...issue('deep-nesting', depthLine, `Line ${depthLine}: Control flow is nested ${depth} levels deep (if/loop/try inside each other).`, depth > DEEP_NESTING ? SEVERITY['deep-nesting'] : 60),
      ...(ast?.nestingHint ? { suggestion: ast.nestingHint } : {}),
    });
  }
  // Density, not a raw count: small route handlers with guard clauses or sparse branches over large files are not complex.
  if (codeLoc >= HIGH_BRANCH_MIN_LOC && branches >= HIGH_BRANCH_MIN_COUNT && branches / codeLoc >= HIGH_BRANCH_DENSITY) {
    issues.push(issue('branching', null, `High branching density: ${branches} decision points across ${codeLoc} code lines (review whether complex conditionals can be simplified; expected in parsers or dispatchers).`));
  }

  const name = path.split('/').pop() ?? path;
  return {
    path, name, lang, lines, codeText, loc, codeLoc, branches, depth, issues: mergeByKind(issues), silent,
    stringLines: ast?.stringLines ?? new Set(), declaredTypes: ast?.declaredTypes ?? [], promptTypeRefs: ast?.promptTypeRefs ?? [],
  };
}

/**
 * A type declared in one file and re-typed inside a string literal (usually an AI prompt that shows the model
 * its output schema). That is not duplicated code; it is a schema that silently drifts when the type changes.
 */
function markPromptDrift(files: Scanned[]): void {
  const owners = new Map<string, string>();
  for (const f of files) for (const type of f.declaredTypes) if (!owners.has(type)) owners.set(type, f.path);
  for (const f of files) {
    const hits = f.promptTypeRefs.filter((ref) => owners.has(ref.name) && !f.declaredTypes.includes(ref.name));
    if (hits.length === 0) continue;
    const [first] = hits;
    f.issues = mergeByKind([
      ...f.issues,
      issue('prompt-drift', first.line, `Line ${first.line}: Prompt Schema Drift Risk: the text of \`${first.name}\` (declared in ${owners.get(first.name)}) is copied into a string literal, so the prompt and the type can change apart.`),
    ]);
  }
}

// ============================================================================
// Edges, score, layout
// ============================================================================

/** Import aliases of the root tsconfig.json / jsconfig.json, as [pattern, targets relative to the repository root]. */
type Aliases = { baseUrl: string | null; paths: Array<[string, string[]]> };

// shortcut: root config only and `extends` is not followed, so monorepo packages and package.json "imports"
// (#lib/x) stay unresolved. Upgrade to ts.parseJsonConfigFileContent with a virtual host when users hit that.
function readAliases(configText: string): Aliases {
  const options = (ts.parseConfigFileTextToJson('tsconfig.json', configText).config as { compilerOptions?: { baseUrl?: unknown; paths?: unknown } } | undefined)?.compilerOptions;
  const baseUrl = typeof options?.baseUrl === 'string' ? options.baseUrl : null;
  const paths = options?.paths !== null && typeof options?.paths === 'object' ? Object.entries(options.paths as Record<string, unknown>) : [];
  // TypeScript picks an exact pattern first, then the wildcard with the longest prefix, whatever the order in the file.
  const rank = (pattern: string) => (pattern.includes('*') ? pattern.indexOf('*') : pattern.length + 1);
  return {
    baseUrl,
    paths: paths.flatMap(([pattern, targets]): Array<[string, string[]]> =>
      Array.isArray(targets) ? [[pattern, targets.filter((t): t is string => typeof t === 'string').map((t) => posix.join(baseUrl ?? '.', t))]] : [])
      .sort((a, b) => rank(b[0]) - rank(a[0])),
  };
}

/** Root-relative candidates for a non-relative specifier: tsconfig `paths` first, then `baseUrl`, then the `@/` convention. */
function aliasCandidates(specifier: string, aliases: Aliases): string[] {
  const out: string[] = [];
  for (const [pattern, targets] of aliases.paths) {
    const star = pattern.indexOf('*');
    const [head, tail] = star === -1 ? [pattern, ''] : [pattern.slice(0, star), pattern.slice(star + 1)];
    const matches = star === -1 ? specifier === pattern : specifier.length >= head.length + tail.length && specifier.startsWith(head) && specifier.endsWith(tail);
    if (matches) out.push(...targets.map((target) => target.replace('*', specifier.slice(head.length, specifier.length - tail.length))));
  }
  if (aliases.baseUrl !== null) out.push(posix.join(aliases.baseUrl, specifier));
  // `@/x` conventionally maps to `src/x`, otherwise to the repository root.
  if (/^[@~]\//.test(specifier)) out.push(`src/${specifier.slice(2)}`, specifier.slice(2));
  return out;
}

function resolveEdges(files: Scanned[], aliases: Aliases): RepoEdge[] {
  const selected = new Set(files.map((f) => f.path));
  const edges = new Map<string, RepoEdge>();
  for (const file of files) {
    if (file.lang === 'go') continue;
    const family: LanguageFamily = file.lang === 'py' ? 'py' : 'js';
    for (const imp of detectRelations(file.codeText, family).imports) {
      let target = resolveImport(imp, file.path, family, selected);
      if (!target && family === 'js' && !imp.specifier.startsWith('.')) {
        for (const candidate of aliasCandidates(imp.specifier, aliases)) {
          target = resolveImport({ ...imp, specifier: `./${candidate}` }, '_.ts', 'js', selected);
          if (target) break;
        }
      }
      if (target && target !== file.path) edges.set(`${file.path}\u0000${target}`, { from: file.path, to: target });
    }
  }
  return [...edges.values()].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
}

/**
 * Copy-paste across the analyzed files: the first block of DUPLICATE_WINDOW normalized lines that also
 * appears elsewhere (another file, or a non-overlapping spot in the same file). Adds one finding and
 * ROT.DUPLICATE per affected file. Short lines, braces and imports are ignored so boilerplate never matches.
 */
// ponytail: exact-match sliding window over <= 22 files. Upgrade path: token-based clone detection.
function markDuplicates(files: Scanned[]): void {
  // Meaningful lines only, keeping their real line numbers: `try {`, `} catch {` and blank lines are
  // skipped instead of breaking the window, so two copies of a try/catch block still line up.
  const meaningful = files.map((f) =>
    f.codeText.split('\n').flatMap((l, i) => {
      // Text inside a multi-line string/template (an AI prompt, SQL, a schema) is data, not duplicated code.
      if (f.stringLines.has(i + 1)) return [];
      const text = l.trim().replace(/\s+/g, ' ');
      return text.length >= 10 && !/^(?:import|export \{|export \* from|from |require\(|\}|\{|\)|\]|<\/)/.test(text) ? [{ text, line: i + 1 }] : [];
    }),
  );
  const seen = new Map<string, Array<{ file: number; line: number; end: number }>>();
  meaningful.forEach((rows, file) => {
    for (let i = 0; i + DUPLICATE_WINDOW <= rows.length; i++) {
      const window = rows.slice(i, i + DUPLICATE_WINDOW);
      const key = window.map((row) => row.text).join('\n');
      seen.set(key, [...(seen.get(key) ?? []), { file, line: window[0].line, end: window[DUPLICATE_WINDOW - 1].line }]);
    }
  });
  const reported = new Set<number>();
  for (const spots of seen.values()) {
    for (const spot of spots) {
      if (reported.has(spot.file)) continue;
      const other = spots.find((o) => o.file !== spot.file || o.line > spot.end || o.end < spot.line);
      if (!other) continue;
      reported.add(spot.file);
      const f = files[spot.file];
      const where = other.file === spot.file ? `line ${other.line} of this file` : `${files[other.file].path} (line ${other.line})`;
      f.issues = mergeByKind([...f.issues, issue('duplicate', spot.line, `Line ${spot.line}: The same ${DUPLICATE_WINDOW}+ line block also appears in ${where}; a fix in one copy will miss the other.`)]);
      f.silent += ROT.DUPLICATE;
    }
  }
}

function rotScore(f: Scanned, degree: number): number {
  const volume =
    f.codeLoc > ROT.VOLUME_FREE_LOC
      ? Math.min(ROT.VOLUME_MAX, ((f.codeLoc - ROT.VOLUME_FREE_LOC) / (ROT.VOLUME_FULL_LOC - ROT.VOLUME_FREE_LOC)) * ROT.VOLUME_MAX)
      : 0;
  const nesting = Math.min(ROT.NESTING_MAX, Math.max(0, f.depth - ROT.NESTING_FREE_DEPTH) * ROT.NESTING_PER_LEVEL);
  const branching = Math.min(ROT.BRANCH_MAX, (f.branches / Math.max(f.codeLoc, 1)) * 100 * ROT.BRANCH_PER_PERCENT);
  const silent = Math.min(ROT.SILENT_MAX, f.silent);
  // Being imported a lot is only a risk when there is logic to break; type and constant files get 0.
  const coupling = f.branches > 0 ? Math.min(ROT.COUPLING_MAX, degree * ROT.COUPLING_PER_LINK) : 0;
  return Math.max(0, Math.min(100, Math.round(volume + nesting + branching + silent + coupling)));
}

const ENTRY_RE = /(?:^|\/)(?:page|route|layout|main|index|server|app)\.[^/]+$|(?:^|\/)(?:controllers?|routes?|routers?|pages)\/|\.(?:controller|routes?)\.[^/]+$/i;

/**
 * The key files the workspace shows first: the worst hotspots, the files most of the codebase
 * depends on, and entry points, then the best remaining mix of rot and coupling. Deterministic.
 */
function pickFeatured(nodes: Array<{ path: string; rot: number }>, degree: Map<string, { in: number; out: number }>): Set<string> {
  if (nodes.length <= FEATURED_FILES) return new Set(nodes.map((n) => n.path));
  const deg = (path: string) => degree.get(path) ?? { in: 0, out: 0 };
  const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const hotspots = nodes.filter((n) => n.rot > 0).sort((a, b) => b.rot - a.rot || byPath(a, b));
  const hubs = nodes.filter((n) => deg(n.path).in > 0).sort((a, b) => deg(b.path).in - deg(a.path).in || b.rot - a.rot || byPath(a, b));
  const entries = nodes.filter((n) => ENTRY_RE.test(n.path)).sort((a, b) => deg(b.path).out - deg(a.path).out || byPath(a, b));
  const rest = [...nodes].sort((a, b) => b.rot + 4 * (deg(b.path).in + deg(b.path).out) - (a.rot + 4 * (deg(a.path).in + deg(a.path).out)) || byPath(a, b));

  const picked = new Set<string>();
  const take = (list: Array<{ path: string }>, quota: number) => {
    for (const { path } of list) {
      if (quota <= 0 || picked.size >= FEATURED_FILES) return;
      if (!picked.has(path)) {
        picked.add(path);
        quota--;
      }
    }
  };
  take(hotspots, 14);
  take(hubs, 8);
  take(entries, 4);
  take(rest, FEATURED_FILES);
  return picked;
}

/** 30-45 lines centred on the most severe finding, or the top of the file. */
function snippet(f: Scanned, anchor: number | null): string {
  const total = f.lines.length;
  let start = 1;
  if (anchor !== null) start = Math.max(1, anchor - 12);
  const end = Math.min(total, start + SNIPPET_LINES - 1);
  start = Math.max(1, Math.min(start, end - SNIPPET_LINES + 1));
  return f.lines
    .slice(start - 1, end)
    .map((l) => (l.length > 200 ? `${l.slice(0, 200)}…` : l))
    .join('\n');
}

// ============================================================================
// Optional batch explanation
// ============================================================================

interface Explanation {
  summary: string;
  findings: string[];
  recommendation: string;
}

/** Every scanner issue of a file as a structured finding, most severe first. */
function toFindings(f: Scanned): RepoFinding[] {
  return [...f.issues]
    .sort((a, b) => b.severity - a.severity || (a.line ?? 0) - (b.line ?? 0))
    .map((item) => ({
      kind: item.kind,
      line: item.line,
      lines: item.lines ?? (item.line === null ? [] : [item.line]),
      text: item.text,
      suggestion: item.suggestion ?? RECOMMENDATIONS[item.kind](item.line),
      source: 'static',
    }));
}

/**
 * Scanner findings always stay. What the model adds becomes a note when it cites no line, or a line it was
 * shown that the scanner has not already reported; anything else is dropped.
 */
function mergeAiFindings(node: { findings: RepoFinding[]; notes: string[] }, ai: Partial<Explanation>, shown: ReadonlySet<number>): { findings: RepoFinding[]; notes: string[] } {
  // What the model adds cannot be verified, so it is shown as a note and never counted as a finding.
  const remarks = (ai.findings ?? []).filter((text) => {
    const line = Number(/^Lines?\s+(\d+)/i.exec(text)?.[1] ?? 0);
    return line === 0 || (shown.has(line) && !node.findings.some((finding) => finding.lines.includes(line)));
  }).map((text) => `AI (unverified): ${text}`);
  return { findings: node.findings, notes: [...remarks, ...node.notes].slice(0, 3) };
}

/** Path-based role hints. First match wins, so specific folders come before generic ones. */
const ROLE_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:^|\/)controllers?\/|\.controller\.[^/]+$/i, 'HTTP controller'],
  [/(?:^|\/)(?:routes?|routers?)\/|\.routes?\.[^/]+$/i, 'route definition'],
  [/(?:^|\/)middlewares?\/|\.middleware\.[^/]+$/i, 'middleware'],
  [/(?:^|\/)(?:models?|schemas?|entities)\/|\.(?:model|schema|entity)\.[^/]+$/i, 'data model'],
  [/(?:^|\/)services?\/|\.service\.[^/]+$/i, 'service'],
  [/(?:^|\/)(?:stores?|slices?|redux)\/|\.(?:store|slice)\.[^/]+$/i, 'state store'],
  [/(?:^|\/)hooks?\/|(?:^|\/)use[A-Z]\w*\.[jt]sx?$/, 'React hook'],
  [/(?:^|\/)(?:pages|views|screens)\//i, 'page view'],
  [/(?:^|\/)components?\//i, 'UI component'],
  [/(?:^|\/)(?:config|configs|settings)\/|(?:^|\/)config\.[^/]+$/i, 'configuration module'],
  [/(?:^|\/)(?:utils?|helpers?|lib)\//i, 'utility module'],
  [/(?:^|\/)(?:index|main|server|app)\.[^/]+$/i, 'entry point'],
];

function roleOf(path: string): string {
  return ROLE_RULES.find(([re]) => re.test(path))?.[1] ?? 'module';
}

/** Public symbols a file exposes; used to describe what it offers to the rest of the codebase. */
function exportedNames(f: Scanned): string[] {
  const names = new Set<string>();
  const add = (name?: string) => {
    const n = name?.trim();
    if (n && n !== 'default' && /^[A-Za-z_$][\w$]*$/.test(n)) names.add(n);
  };
  const text = f.codeText;
  if (f.lang === 'js') {
    for (const m of text.matchAll(/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
    for (const m of text.matchAll(/\b(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) add(m[1]);
    for (const m of text.matchAll(/\bmodule\.exports\s*=\s*\{([^}]*)\}/g)) m[1].split(',').forEach((part) => add(part.split(':')[0]));
    for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}/g)) m[1].split(',').forEach((part) => add(part.trim().split(/\s+as\s+/).pop()));
    add(/\bmodule\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;?\s*$/m.exec(text)?.[1]);
    add(/\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m.exec(text)?.[1]);
  } else if (f.lang === 'py') {
    for (const m of text.matchAll(/^(?:async\s+)?def\s+([A-Za-z]\w*)|^class\s+([A-Za-z]\w*)/gm)) add(m[1] ?? m[2]);
  } else {
    for (const m of text.matchAll(/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm)) add(m[1]);
  }
  return [...names];
}

function listNames(names: string[], max = 3): string {
  const shown = names.slice(0, max).map((n) => `${n}()`);
  if (names.length > max) return `${shown.join(', ')} and ${names.length - max} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0] ?? '';
}

const RECOMMENDATIONS: Record<IssueKind, (line: number | null) => string> = {
  secret: (l) => `Move the credential at line ${l} into an environment variable and rotate it, because anyone with repository access can read it.`,
  eval: (l) => `Replace the dynamic code execution at line ${l} with explicit parsing or a lookup table.`,
  'empty-catch': (l) => `Log or rethrow the error caught at line ${l} so failures reach the caller instead of disappearing.`,
  'unsafe-html': (l) => `Sanitize the HTML injected at line ${l} (for example with DOMPurify), or render it as text.`,
  'ts-ignore': (l) => `Remove the type-check suppression at line ${l} and fix the underlying type error.`,
  'deep-nesting': (l) => `Flatten the nesting at line ${l} with early returns or by extracting the inner block into a function.`,
  any: (l) => `Replace the \`any\` types starting at line ${l} with concrete types or interfaces.`,
  'long-function': (l) => `Split the long function at line ${l} into smaller helpers, each with a focused test.`,
  debt: (l) => `Resolve the debt comment at line ${l}, or move it into a tracked issue, before changing this module.`,
  duplicate: (l) => `Extract the block duplicated at line ${l} into one shared helper so a fix only has to be made once.`,
  'default-catch': (l) => `Log the error caught at line ${l} before returning the placeholder, or return an explicit error result.`,
  branching: () => 'Extract the branching logic into small, well-named functions to lower cyclomatic complexity.',
  'ignored-catch': (l) => `Narrow the deliberately ignored catch at line ${l} to the one error type that is expected.`,
  monolith: () => 'Split the file by domain and keep it as a barrel that re-exports the pieces, so imports do not change.',
  'prompt-drift': (l) => `Build the schema text at line ${l} from the real type (or validate the model output against it) so the prompt cannot drift from the type.`,
  'fallback-chain': (l) => `Log the first-stage failure at line ${l} at debug level, so a fallback that always fires is visible.`,
  'html-notice': (l) => `Keep the sanitizer or static source at line ${l} on every path that reaches dangerouslySetInnerHTML.`,
};

/** Deterministic explanation used when no AI provider is configured, or when it fails. */
function fallbackExplanation(f: Scanned, degree: { in: number; out: number }, score: number): { summary: string; findings: RepoFinding[]; notes: string[]; recommendation: string } {
  const role = roleOf(f.path);
  const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : 'the repository root';
  const names = exportedNames(f);
  const article = /^[aeiou]/i.test(role) ? 'an' : 'a';
  const exposes = names.length ? ` that exposes ${listNames(names)}` : '';
  const reach =
    degree.in > 0
      ? `${degree.in} indexed file${degree.in === 1 ? ' imports' : 's import'} it, so changes here propagate to ${degree.in === 1 ? 'that caller' : 'those callers'}.`
      : degree.out > 0
        ? `It builds on ${degree.out} indexed module${degree.out === 1 ? '' : 's'}, and nothing in this analysis imports it.`
        : 'It has no import relationships with the other analyzed files.';
  const summary = `${f.name} is ${article} ${role} in ${dir}${exposes}. ${reach}`;

  const density = f.codeLoc ? f.branches / f.codeLoc : 0;
  const level = density < 0.12 ? 'low' : density < HIGH_BRANCH_DENSITY ? 'moderate' : 'high';
  const complexity = `Branching complexity is ${level}: ${f.branches} decision point${f.branches === 1 ? '' : 's'} across ${f.codeLoc} code lines in a ${f.loc}-line file, with control flow nested up to ${f.depth} level${f.depth === 1 ? '' : 's'}.`;
  const findings = toFindings(f);
  // Never restate branching when a branching finding is already shown; use the dependency fact instead.
  const notes = [findings.some((item) => item.kind === 'branching') ? reach : complexity];
  if (findings.length === 0) notes.unshift('No swallowed errors, hard-coded secrets, eval() calls, type suppressions, or debt comments were detected.');

  const recommendation = findings[0]
    ? findings[0].suggestion
    : degree.in > 3
      ? `Keep the exported contract of ${f.name} stable and add contract tests before changing it, because ${degree.in} files depend on it.`
      : score < 30
        ? `No change is needed now; cover ${names.length ? listNames(names, 2) : `${f.name}'s main behavior`} with tests before refactoring.`
        : `Add focused tests around ${f.name} before refactoring its branching logic.`;
  return { summary, findings, notes, recommendation };
}

const EVIDENCE_MAX_LINES = 75;

/**
 * Numbered source evidence for the model: the file header plus a window around each of the top three
 * findings, so the model sees every problem it is told about instead of only the most severe one.
 */
function numberedEvidence(f: Scanned): string {
  const total = f.lines.length;
  const anchors = [...f.issues]
    .sort((a, b) => b.severity - a.severity)
    .flatMap((item) => (item.line === null ? [] : [item.line]))
    .slice(0, 3);
  const ranges: Array<[number, number]> = anchors.length
    ? [[1, Math.min(total, 15)], ...anchors.map((a): [number, number] => [Math.max(1, a - 6), Math.min(total, a + 12)])]
    : [[1, Math.min(total, SNIPPET_LINES)]];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [from, to] of ranges) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  let budget = EVIDENCE_MAX_LINES;
  const parts: string[] = [];
  for (const [from, to] of merged) {
    if (budget <= 0) break;
    const end = Math.min(to, from + budget - 1);
    budget -= end - from + 1;
    parts.push(
      f.lines
        .slice(from - 1, end)
        .map((line, i) => `${from + i}| ${line.length > 160 ? `${line.slice(0, 160)}…` : line}`)
        .join('\n'),
    );
  }
  return parts.join('\n…\n');
}

interface ExplanationInput {
  path: string;
  role: string;
  exports: string[];
  imports: string[];
  importedBy: string[];
  loc: number;
  branches: number;
  nestingDepth: number;
  rot: number;
  staticFindings: string[];
  code: string;
}

const AI_TIMEOUT_MS = 35_000;
const DEFAULT_AI_BATCH_SIZE = 8;

function explanationPrompt(files: ExplanationInput[], language: string): string {
  return [
    'You are a senior software architect writing an autopsy of an inherited codebase for engineers who must change it safely.',
    'For every file below, use ONLY the evidence given: path, role hint, exported symbols, imports, dependents, metrics, static findings, and numbered source lines.',
    'Return JSON shaped exactly as {"files":[{"id":0,"summary":"...","findings":["..."],"recommendation":"..."}]} with one entry per input file and the same ids.',
    '- summary: 1-2 sentences on what the module does in this application and what depends on it. Name concrete responsibilities (for example "validates the JWT before a movie rating is saved"), never line counts.',
    '- findings: 2-3 specific observations about weaknesses, security gaps, or error handling. Start each with "Line N:" or "Line N-M:" when the numbered source supports it, and only cite lines you can see. If the file is healthy, say concretely what it does well.',
    '- Static findings are heuristics, not facts. Check each one against the numbered source and drop it if the code does not support it.',
    '- A catch/except that runs a fallback (retry, alternative parsing, a default with a reason) or has a comment explaining why the error is ignored is deliberate error handling. Do not call it swallowed unless the source shows a real failure being hidden.',
    '- Cover different kinds of weakness (error handling, control-flow complexity, duplication, security, typing, testability) rather than repeating one kind. Never report the same problem twice in one file.',
    '- recommendation: one concrete, actionable fix that names the function or line it applies to.',
    '- Do not invent frameworks, endpoints, data, or vulnerabilities the evidence does not show. Do not restate raw metrics as findings.',
    `- Write summary, findings, and recommendation in ${language}.`,
    '',
    `FILES:\n${JSON.stringify(files.map((file, id) => ({ id, ...file })))}`,
  ].join('\n');
}

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    files: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          summary: { type: 'STRING' },
          findings: { type: 'ARRAY', items: { type: 'STRING' } },
          recommendation: { type: 'STRING' },
        },
        required: ['id', 'summary', 'findings', 'recommendation'],
      },
    },
  },
  required: ['files'],
} as const;

/** Complete objects inside the first JSON array, so a truncated reply still yields the files it finished. */
function salvageObjects(text: string): unknown[] {
  const open = text.indexOf('[');
  if (open < 0) return [];
  const out: unknown[] = [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = open + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        try {
          out.push(JSON.parse(text.slice(objectStart, i + 1)));
        } catch {
          /* skip a malformed entry, keep the rest */
        }
        objectStart = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }
  return out;
}

/** Accepts plain JSON, fenced JSON, a bare array, or a truncated reply. */
function parseExplanationRows(text: string): unknown[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[{[]/);
  const json = start >= 0 ? body.slice(start) : body;
  try {
    const value: unknown = JSON.parse(json);
    if (Array.isArray(value)) return value;
    const files = value !== null && typeof value === 'object' ? (value as Record<string, unknown>).files : undefined;
    if (Array.isArray(files)) return files;
  } catch {
    /* fall through to salvage */
  }
  return salvageObjects(json);
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
}

const normalizePath = (path: string) => path.replace(/\\/g, '/').replace(/^\.?\/+/, '').trim().toLowerCase();

/** Prefer a path match (models occasionally renumber ids), then fall back to the id. */
function matchInput(item: Record<string, unknown>, inputs: ExplanationInput[]): ExplanationInput | undefined {
  const raw = item.path ?? item.file ?? item.filePath;
  if (typeof raw === 'string' && raw.trim()) {
    const wanted = normalizePath(raw);
    const byPath =
      inputs.find((input) => normalizePath(input.path) === wanted) ??
      inputs.find((input) => normalizePath(input.path).endsWith(`/${wanted}`) || wanted.endsWith(`/${normalizePath(input.path)}`));
    if (byPath) return byPath;
  }
  const id = typeof item.id === 'number' ? item.id : typeof item.id === 'string' && /^\d+$/.test(item.id) ? Number(item.id) : NaN;
  return Number.isInteger(id) ? inputs[id] : undefined;
}

function toPartialExplanation(item: Record<string, unknown>): Partial<Explanation> {
  const rawFindings = Array.isArray(item.findings) ? item.findings : typeof item.findings === 'string' ? [item.findings] : [];
  const findings = rawFindings
    .map((finding) =>
      cleanText(
        typeof finding === 'object' && finding !== null
          ? ((finding as Record<string, unknown>).text ?? (finding as Record<string, unknown>).description ?? (finding as Record<string, unknown>).finding)
          : finding,
        400,
      ),
    )
    .filter((finding): finding is string => Boolean(finding))
    .slice(0, 4);
  return {
    summary: cleanText(item.summary ?? item.purpose, 600),
    findings: findings.length ? findings : undefined,
    recommendation: cleanText(item.recommendation ?? item.recommendedAction, 500),
  };
}

type ProviderCall = (prompt: string, signal: AbortSignal) => Promise<string>;

async function chatCompletion(url: string, key: string | undefined, model: string, prompt: string, signal: AbortSignal): Promise<string> {
  const send = (structured: boolean) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        ...(structured ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: 'You return only valid JSON, with no prose and no code fences.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
  let response = await send(true);
  // Some OpenAI-compatible gateways reject response_format; the parser copes with plain text.
  if (response.status === 400) response = await send(false);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error('empty response');
  return text;
}

async function geminiCompletion(key: string, model: string, prompt: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    // Header, not query string, so the key never shows up in URLs or error messages.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    signal,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_SCHEMA,
        temperature: 0.2,
        maxOutputTokens: 8192,
        // Thinking tokens add latency and eat the output budget; this task does not need them.
        ...(/gemini-2\.5-flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as {
    candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  };
  const candidate = payload.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).filter((part) => !part.thought && part.text).map((part) => part.text).join('');
  if (!text) throw new Error(`empty response (${candidate?.finishReason ?? 'no candidate'})`);
  return text;
}

/** First configured provider: OpenCode-compatible endpoint, then Gemini, then OpenAI. */
function configuredProvider(): { name: string; call: ProviderCall } | null {
  const env = (name: string) => process.env[name]?.trim() || undefined;
  const opencodeModel = env('OPENCODE_MODEL');
  const opencodeBase = env('OPENCODE_BASE_URL');
  const opencodeUrl = env('OPENCODE_CHAT_COMPLETIONS_URL') ?? (opencodeBase ? `${opencodeBase.replace(/\/+$/, '')}/chat/completions` : undefined);
  if (opencodeUrl && opencodeModel) {
    const key = env('OPENCODE_API_KEY');
    return { name: `opencode/${opencodeModel}`, call: (prompt, signal) => chatCompletion(opencodeUrl, key, opencodeModel, prompt, signal) };
  }
  const geminiKey = env('GEMINI_API_KEY');
  if (geminiKey) {
    const model = env('GEMINI_MODEL') ?? 'gemini-2.5-flash';
    return { name: `gemini/${model}`, call: (prompt, signal) => geminiCompletion(geminiKey, model, prompt, signal) };
  }
  const openAiKey = env('OPENAI_API_KEY');
  if (openAiKey) {
    const model = env('OPENAI_MODEL') ?? 'gpt-4o-mini';
    return { name: `openai/${model}`, call: (prompt, signal) => chatCompletion('https://api.openai.com/v1/chat/completions', openAiKey, model, prompt, signal) };
  }
  return null;
}

/**
 * AI explanations keyed by file path. Files are sent in parallel batches so one slow or truncated
 * reply only affects its own batch. Missing fields fall back to the static explanation per file.
 */
async function requestBatchExplanation(inputs: ExplanationInput[], signal: AbortSignal): Promise<Map<string, Partial<Explanation>> | null> {
  const provider = configuredProvider();
  if (!provider || inputs.length === 0) return null;
  const language = process.env.AI_EXPLANATION_LANGUAGE?.trim() || 'English';
  const size = Math.max(1, Math.min(22, Number(process.env.AI_BATCH_SIZE) || DEFAULT_AI_BATCH_SIZE));
  const aiSignal = AbortSignal.any([signal, AbortSignal.timeout(AI_TIMEOUT_MS)]);
  const batches: ExplanationInput[][] = [];
  for (let i = 0; i < inputs.length; i += size) batches.push(inputs.slice(i, i + size));

  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      const rows = parseExplanationRows(await provider.call(explanationPrompt(batch, language), aiSignal));
      const explained = new Map<string, Partial<Explanation>>();
      for (const row of rows) {
        if (row === null || typeof row !== 'object') continue;
        const input = matchInput(row as Record<string, unknown>, batch);
        if (input) explained.set(input.path, toPartialExplanation(row as Record<string, unknown>));
      }
      return explained;
    }),
  );

  const merged = new Map<string, Partial<Explanation>>();
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      result.value.forEach((value, path) => merged.set(path, value));
      if (result.value.size < batches[i].length) {
        console.warn(`[ingest] ${provider.name} explained ${result.value.size}/${batches[i].length} files in batch ${i + 1}; the rest use static analysis.`);
      }
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn(`[ingest] ${provider.name} batch ${i + 1}/${batches.length} failed (${reason}); using static analysis for it.`);
    }
  });
  return merged;
}


export async function analyzeRepository(repoUrl: string, options: AnalyzeOptions = {}): Promise<RepoAnalysis> {
  const { owner, repo } = parseGitHubUrl(repoUrl);
  const ctx: Ctx = {
    token: options.token !== undefined ? options.token || undefined : process.env.GITHUB_TOKEN?.trim() || undefined,
    signal: options.signal ?? AbortSignal.timeout(INGEST_CONFIG.TIMEOUT_MS),
    fetchImpl: options.fetchImpl ?? fetch,
  };

  const meta = await githubJson<{ default_branch?: unknown; full_name?: unknown }>(`/repos/${owner}/${repo}`, ctx);
  if (typeof meta.default_branch !== 'string' || !meta.default_branch) {
    throw new IngestError('GITHUB_API_ERROR', 'GitHub response is missing default_branch');
  }
  const defaultBranch = meta.default_branch;
  const title = typeof meta.full_name === 'string' && meta.full_name ? meta.full_name : `${owner}/${repo}`;

  const tree = await githubJson<{ tree?: TreeEntry[]; truncated?: unknown }>(
    `/repos/${owner}/${repo}/git/trees/${encodePath(defaultBranch)}?recursive=1`,
    ctx,
  );
  if (!Array.isArray(tree.tree)) throw new IngestError('GITHUB_API_ERROR', 'GitHub tree response is malformed');
  const { selected, coverage: selection } = selectFiles(tree.tree);
  if (selected.length === 0) {
    throw new IngestError('NO_CODE_FILES_FOUND', 'No supported source files found in this repository', {
      treeEntries: tree.tree.length,
    });
  }

  // Root project files: import aliases for the dependency graph, package names for patch context. Both are optional.
  const rootText = async (...names: string[]): Promise<string | null> => {
    const name = names.find((candidate) => tree.tree!.some((entry) => entry.type === 'blob' && entry.path === candidate));
    const result = name ? await fetchRaw(owner, repo, defaultBranch, name, ctx) : null;
    return result?.ok ? result.text : null;
  };
  const [fetched, configText, packageText] = await Promise.all([
    mapLimit(selected, FETCH_CONCURRENCY, (entry) => fetchRaw(owner, repo, defaultBranch, entry.path, ctx)),
    rootText('tsconfig.json', 'jsconfig.json'),
    rootText('package.json'),
  ]);
  const aliases = configText ? readAliases(configText) : { baseUrl: null, paths: [] };
  let dependencies: string[] = [];
  try {
    const pkg = JSON.parse(packageText ?? '{}') as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
    dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 200);
  } catch {
    // A malformed package.json only costs the patch prompt its dependency list.
  }
  const files: Scanned[] = [];
  let rateLimited = false;
  selected.forEach((entry, i) => {
    const result = fetched[i];
    if (!result.ok) {
      rateLimited ||= result.status === 429;
      selection.skipped.unreadable++;
      return;
    }
    const lang = langOf(entry.path);
    if (lang) files.push(scanFile(entry.path, result.text, lang));
  });
  if (files.length === 0) {
    if (rateLimited) throw new IngestError('GITHUB_RATE_LIMIT', 'GitHub rate limit exceeded while reading files');
    throw new IngestError('NO_CODE_FILES_FOUND', 'No source files could be fetched', { selected: selected.length });
  }

  markDuplicates(files);
  markPromptDrift(files);
  const edges = resolveEdges(files, aliases);
  const degree = new Map<string, { in: number; out: number }>(files.map((f) => [f.path, { in: 0, out: 0 }]));
  for (const e of edges) {
    degree.get(e.from)!.out++;
    degree.get(e.to)!.in++;
  }
  const positions = layoutGraph(files.map((f) => f.path), edges);

  type StaticNode = Omit<RepoNode, 'featured' | 'explainedBy'> & { staticFindings: string[] };
  const staticNodes: StaticNode[] = files
    .map((f): StaticNode => {
      const d = degree.get(f.path)!;
      const score = rotScore(f, d.in + d.out);
      const ranked = [...f.issues].sort((a, b) => b.severity - a.severity || (a.line ?? 0) - (b.line ?? 0));
      const staticFindings = ranked.slice(0, 4).map((issue) => issue.text);
      const facts = [
        `${f.loc} lines (${f.codeLoc} code lines) with ${f.branches} decision points and a maximum nesting depth of ${f.depth}.`,
        `Imports ${d.out} module${d.out === 1 ? '' : 's'} and is imported by ${d.in} file${d.in === 1 ? '' : 's'} in this analysis.`,
      ];
      for (let i = 0; staticFindings.length < 2 && i < facts.length; i++) staticFindings.push(facts[i]);
      const anchor = ranked.find((issue) => issue.line !== null)?.line ?? null;
      const { x, y } = positions.get(f.path)!;
      const fallback = fallbackExplanation(f, d, score);
      return {
        id: f.path, name: f.name, path: f.path, loc: f.loc, rot: score,
        lastCommit: 'Active branch', x, y, findings: fallback.findings, notes: fallback.notes,
        summary: fallback.summary, recommendation: fallback.recommendation,
        code: f.lines.join('\n'), staticFindings,
      };
    });

  const byPath = new Map(files.map((f) => [f.path, f]));
  const featured = pickFeatured(staticNodes, degree);
  /** Source lines each file's evidence showed the model; an AI finding about any other line is a guess. */
  const shownLines = new Map<string, Set<number>>();
  const explanations = await requestBatchExplanation(
    staticNodes.filter((node) => featured.has(node.path)).map((node): ExplanationInput => {
      const f = byPath.get(node.path)!;
      const code = numberedEvidence(f);
      shownLines.set(node.path, new Set([...code.matchAll(/^(\d+)\| /gm)].map((m) => Number(m[1]))));
      return {
        path: node.path,
        role: roleOf(node.path),
        exports: exportedNames(f).slice(0, 12),
        imports: edges.filter((e) => e.from === node.path).map((e) => e.to),
        importedBy: edges.filter((e) => e.to === node.path).map((e) => e.from),
        loc: f.loc,
        branches: f.branches,
        nestingDepth: f.depth,
        rot: node.rot,
        staticFindings: node.staticFindings,
        code,
      };
    }),
    ctx.signal,
  );
  // Summary and recommendation: whatever the model returned wins, the static text fills any gap.
  const nodes: RepoNode[] = staticNodes.map(({ staticFindings: _staticFindings, ...node }): RepoNode => {
    const ai = explanations?.get(node.path);
    const base = { ...node, featured: featured.has(node.path) };
    if (!ai) return { ...base, explainedBy: 'static' };
    const recommendation = ai.recommendation ?? node.recommendation;
    return { ...base, explainedBy: 'ai', summary: ai.summary ?? node.summary, recommendation, ...mergeAiFindings(node, ai, shownLines.get(node.path) ?? new Set()) };
  }).sort((a, b) => (a.path < b.path ? -1 : 1));

  const weight = nodes.reduce((sum, n) => sum + Math.max(n.loc, 1), 0);
  const overallRot = Math.round(nodes.reduce((sum, n) => sum + n.rot * Math.max(n.loc, 1), 0) / weight);
  const coverage: RepoCoverage = { ...selection, analyzed: nodes.length, featured: featured.size, treeTruncated: tree.truncated === true };
  return { title, defaultBranch, rotSummary: `${overallRot}% infected`, overallRot, nodes, edges, coverage, dependencies };
}

/** Single-file scan with the same rules as the repository analysis; cross-file checks (duplicates, prompt drift) need the whole repository. */
export function scanSource(path: string, content: string): RepoFinding[] {
  const lang = langOf(path);
  return lang ? toFindings(scanFile(path, content, lang)) : [];
}
