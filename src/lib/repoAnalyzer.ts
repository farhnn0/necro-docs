/**
 * Real-time GitHub repository analysis ("Repository Analysis & Code-Rot Engine").
 *
 * Zero-clone pipeline, see `public/panduan_master_prompt_analisis_repo.md`:
 *   1. parse the URL and resolve the default branch  (GET /repos/{owner}/{repo})
 *   2. fetch the recursive file tree and pick up to 22 core source files
 *   3. fetch raw file contents in parallel (raw.githubusercontent.com)
 *   4. scan each file: dependency edges + code-rot score + findings with line numbers
 *   5. lay the nodes out in four layered columns
 *
 * Server-only: import types from here with `import type` in client code.
 *
 * ponytail: the scanner is regex based, not an AST. Known ceiling: keywords inside string or
 * regex literals can be miscounted, and brace matching ignores regex literals. Upgrade path:
 * parse with the TypeScript compiler API / tree-sitter if precision becomes a requirement.
 */
import { INGEST_CONFIG } from '@/lib/constants';
import type { LanguageFamily } from '@/lib/ingest/analyze';
import { IngestError } from '@/lib/ingest/errors';
import { mapGitHubError } from '@/lib/ingest/github';
import { detectRelations, resolveImport } from '@/lib/ingest/relations';

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
  findings: string[];
  code: string;
}

export interface RepoEdge {
  from: string;
  to: string;
}

export interface RepoAnalysis {
  title: string;
  defaultBranch: string;
  rotSummary: string;
  overallRot: number;
  nodes: RepoNode[];
  edges: RepoEdge[];
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

const MAX_FILES = 22;
const MAX_FILE_BYTES = 250_000; // skips bundles / generated files
const SNIPPET_LINES = 40;
const LONG_FUNCTION_LINES = 60;
const RAW_HOST = 'https://raw.githubusercontent.com';
const COLUMN_X = [110, 390, 670, 950] as const;
const ROW_TOP = 80;
const ROW_GAP = 130;

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go'] as const;
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
  if (/\.(?:ts|tsx|js|jsx)$/.test(lower)) return 'js';
  if (lower.endsWith('.py')) return 'py';
  if (lower.endsWith('.go')) return 'go';
  return null;
}

const TEST_FILE_RE = /\.(?:test|spec)\.[^./]+$|^test_.+\.py$|_test\.(?:py|go)$|^conftest\.py$/;
const CONFIG_FILE_RE = /\.config\.[cm]?[jt]sx?$|^\.[\w.-]*rc\.[cm]?[jt]s$|^setup\.py$/;

function isCodeCandidate(entry: TreeEntry): boolean {
  if (entry.type !== 'blob' || entry.mode === '120000') return false;
  if (!entry.size || entry.size > MAX_FILE_BYTES) return false;
  const segments = entry.path.split('/');
  const name = segments[segments.length - 1];
  if (!EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)) || /\.d\.ts$/i.test(name)) return false;
  if (TEST_FILE_RE.test(name) || CONFIG_FILE_RE.test(name)) return false;
  return !segments.slice(0, -1).some((dir) => EXCLUDED_DIRS.has(dir) || dir.startsWith('.'));
}

/** Core folders first, then shallow paths, then bigger files; ties break on path. */
function selectFiles(entries: TreeEntry[]): TreeEntry[] {
  const tier = (path: string) => {
    const dirs = path.split('/').slice(0, -1);
    return PRIORITY_DIRS.has(dirs[0] ?? '') ? 0 : dirs.some((d) => PRIORITY_DIRS.has(d)) ? 1 : 2;
  };
  return entries
    .filter(isCodeCandidate)
    .sort(
      (a, b) =>
        tier(a.path) - tier(b.path) ||
        a.path.split('/').length - b.path.split('/').length ||
        (b.size ?? 0) - (a.size ?? 0) ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    )
    .slice(0, MAX_FILES);
}

// ============================================================================
// 4. Static scanner
// ============================================================================

interface Issue {
  /** Higher sorts first when picking the 2-4 reported findings. */
  severity: number;
  line: number | null;
  text: string;
}

interface Scanned {
  path: string;
  name: string;
  lang: Lang;
  lines: string[];
  codeText: string;
  loc: number;
  branches: number;
  depth: number;
  issues: Issue[];
  /** Points from silent failures and technical debt, before the cap. */
  silent: number;
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

  for (const line of lines) {
    let c = '';
    let b = '';
    let m = '';
    let quote: string | null = null;
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

const LOGGING_RE = /\b(?:console|logger|logging|log|Sentry|print)\b|\.(?:error|warn|report\w*)\s*\(/;
const DEBT_RE = /\b(?:TODO|FIXME|HACK|XXX)\b|\b[Uu]nsafe\b/;
const KEYWORDS_NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'with']);

/** True when a catch/except body neither rethrows, logs, nor looks at the caught error. */
function swallows(body: string, errName: string | undefined, rethrow: RegExp): boolean {
  if (rethrow.test(body) || LOGGING_RE.test(body)) return false;
  return !(errName && new RegExp(`\\b${errName.replace(/\$/g, '\\$')}\\b`).test(body));
}

function scanCatchBlocks(lang: Lang, bare: string[], bareText: string, lineAt: (i: number) => number): Issue[] {
  const issues: Issue[] = [];
  const empty = (line: number): Issue => ({
    severity: 100,
    line,
    text: `Line ${line}: Empty ${lang === 'py' ? 'except' : 'catch'} block swallows exceptions silently.`,
  });
  const dropped = (line: number): Issue => ({
    severity: 100,
    line,
    text: `Line ${line}: ${lang === 'py' ? 'except' : 'catch'} block never rethrows, logs, or uses the caught error.`,
  });

  if (lang === 'js') {
    for (const m of bareText.matchAll(/\bcatch\b\s*(?:\(([^)]*)\))?\s*\{/g)) {
      const open = m.index + m[0].length - 1;
      const close = matchClose(bareText, open, '{', '}');
      if (close < 0) continue;
      const body = bareText.slice(open + 1, close).trim();
      const line = lineAt(m.index);
      const errName = /^[\w$]+/.exec(m[1]?.trim() ?? '')?.[0];
      if (body === '') issues.push(empty(line));
      else if (swallows(body, errName, /\bthrow\b/)) issues.push(dropped(line));
    }
  } else if (lang === 'py') {
    bare.forEach((raw, i) => {
      const m = /^(\s*)except\b([^:]*):(.*)$/.exec(raw);
      if (!m) return;
      const indent = m[1].length;
      const body: string[] = [m[3]];
      for (let j = i + 1; j < bare.length; j++) {
        const next = bare[j];
        if (next.trim() !== '' && next.length - next.trimStart().length <= indent) break;
        body.push(next);
      }
      const text = body.join('\n').trim();
      const errName = /\bas\s+(\w+)/.exec(m[2])?.[1];
      if (text === '' || /^(?:pass|\.\.\.)$/.test(text)) issues.push(empty(i + 1));
      else if (swallows(text, errName, /\braise\b/)) issues.push(dropped(i + 1));
    });
  }
  return issues;
}

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

function indentDepth(code: string[]): { depth: number; line: number } {
  const rows = code
    .map((raw, i) => ({ raw, i }))
    .filter(({ raw }) => raw.trim() !== '')
    .map(({ raw, i }) => {
      const ws = /^[ \t]*/.exec(raw)![0];
      const tabs = ws.split('\t').length - 1;
      return { tabs, spaces: ws.length - tabs, line: i + 1 };
    });
  const positive = rows.map((r) => r.spaces).filter((s) => s > 0);
  const unit = positive.length ? Math.min(8, Math.max(2, Math.min(...positive))) : 4;
  let best = { depth: 0, line: 1 };
  for (const r of rows) {
    const depth = r.tabs + Math.floor(r.spaces / unit);
    if (depth > best.depth) best = { depth, line: r.line };
  }
  return best;
}

function scanFile(path: string, content: string, lang: Lang): Scanned {
  const { lines, code, bare, comment } = splitCode(content, lang);
  const codeText = code.join('\n');
  const bareText = bare.join('\n');
  const { lineAt, offsets } = lineIndex(bareText);
  const loc = code.filter((l) => l.trim() !== '').length;
  const branches = (bareText.match(BRANCH_RE[lang]) ?? []).length;
  const { depth, line: depthLine } = indentDepth(code);
  const issues: Issue[] = [];
  let silent = 0;

  // Empty / swallowed catch (+18 once).
  const catches = scanCatchBlocks(lang, bare, bareText, lineAt);
  if (catches.length > 0) silent += ROT.EMPTY_CATCH;
  issues.push(...catches);

  // Weak typing: `any`, @ts-ignore, eval (+10 once).
  let weak = false;
  const firstLine = (re: RegExp, source: string[]) => {
    const hits = source.flatMap((l, i) => (re.test(l) ? [i + 1] : []));
    return { count: hits.length, line: hits[0] ?? 0 };
  };
  if (lang === 'js') {
    const ignores = firstLine(/@ts-(?:ignore|nocheck)\b/, comment);
    if (ignores.count > 0) {
      weak = true;
      issues.push({
        severity: 85,
        line: ignores.line,
        text: `Line ${ignores.line}: @ts-ignore suppresses type checking${ignores.count > 1 ? ` (${ignores.count} places)` : ''}.`,
      });
    }
    if (/\.tsx?$/i.test(path)) {
      const anyRe = /(?::\s*any\b|\bas\s+any\b|<any>|\bany\[\])/g;
      const hits = bare.flatMap((l, i) => (l.match(anyRe) ?? []).map(() => i + 1));
      if (hits.length >= 3) {
        weak = true;
        issues.push({ severity: 80, line: hits[0], text: `Line ${hits[0]}: \`any\` is used ${hits.length} times, which disables type checking.` });
      }
    }
  }
  if (lang !== 'go') {
    const evals = firstLine(lang === 'py' ? /\b(?:eval|exec)\s*\(/ : /\beval\s*\(/, bare);
    if (evals.count > 0) {
      weak = true;
      issues.push({ severity: 90, line: evals.line, text: `Line ${evals.line}: eval() runs dynamic code and is unsafe.` });
    }
  }
  if (weak) silent += ROT.WEAK_TYPING;

  // Technical-debt comments (+8 each; the two earliest are reported).
  let reported = 0;
  comment.forEach((text, i) => {
    const m = DEBT_RE.exec(text);
    if (!m) return;
    silent += ROT.DEBT_COMMENT;
    if (reported++ >= 2) return;
    const note = text.trim().replace(/\s+/g, ' ').slice(0, 70);
    issues.push({
      severity: 70,
      line: i + 1,
      text: `Line ${i + 1}: ${m[0].toUpperCase()} comment marks unresolved technical debt: "${note}".`,
    });
  });

  const long = longestFunction(lang, bare, bareText, offsets, lineAt);
  if (long) {
    issues.push({
      severity: 60,
      line: long.line,
      text: `Line ${long.line}: ${long.name}() spans ${long.length} lines; split it into smaller functions.`,
    });
  }
  if (depth >= 5) {
    issues.push({ severity: 50, line: depthLine, text: `Line ${depthLine}: Nesting reaches ${depth} levels deep.` });
  }
  if (branches >= 15) {
    issues.push({ severity: 40, line: null, text: `High cyclomatic complexity (${branches} branches across ${loc} LOC).` });
  }

  const name = path.split('/').pop() ?? path;
  return { path, name, lang, lines, codeText, loc, branches, depth, issues, silent };
}

// ============================================================================
// Edges, score, layout
// ============================================================================

function resolveEdges(files: Scanned[]): RepoEdge[] {
  const selected = new Set(files.map((f) => f.path));
  const edges = new Map<string, RepoEdge>();
  for (const file of files) {
    if (file.lang === 'go') continue;
    const family: LanguageFamily = file.lang === 'py' ? 'py' : 'js';
    for (const imp of detectRelations(file.codeText, family).imports) {
      let target: string | null;
      if (family === 'js' && /^[@~]\//.test(imp.specifier)) {
        // `@/x` conventionally maps to `src/x`, otherwise to the repository root.
        const rest = imp.specifier.slice(2);
        target =
          resolveImport({ ...imp, specifier: `./src/${rest}` }, '_.ts', 'js', selected) ??
          resolveImport({ ...imp, specifier: `./${rest}` }, '_.ts', 'js', selected);
      } else {
        target = resolveImport(imp, file.path, family, selected);
      }
      if (target && target !== file.path) edges.set(`${file.path}\u0000${target}`, { from: file.path, to: target });
    }
  }
  return [...edges.values()].sort((a, b) => (a.from + a.to < b.from + b.to ? -1 : 1));
}

function rotScore(f: Scanned, degree: number): number {
  const volume =
    f.loc > ROT.VOLUME_FREE_LOC
      ? Math.min(ROT.VOLUME_MAX, ((f.loc - ROT.VOLUME_FREE_LOC) / (ROT.VOLUME_FULL_LOC - ROT.VOLUME_FREE_LOC)) * ROT.VOLUME_MAX)
      : 0;
  const nesting = Math.min(ROT.NESTING_MAX, Math.max(0, f.depth - ROT.NESTING_FREE_DEPTH) * ROT.NESTING_PER_LEVEL);
  const branching = Math.min(ROT.BRANCH_MAX, (f.branches / Math.max(f.loc, 1)) * 100 * ROT.BRANCH_PER_PERCENT);
  const silent = Math.min(ROT.SILENT_MAX, f.silent);
  const coupling = Math.min(ROT.COUPLING_MAX, degree * ROT.COUPLING_PER_LINK);
  return Math.max(0, Math.min(100, Math.round(volume + nesting + branching + silent + coupling)));
}

/** Importers sit on the left, imported modules on the right; four columns at most. */
function layout(files: Scanned[], edges: RepoEdge[]): Map<string, { x: number; y: number }> {
  const n = files.length;
  const level = new Map(files.map((f) => [f.path, 0]));
  for (let pass = 0; pass < n; pass++) {
    let changed = false;
    for (const e of edges) {
      const next = Math.min(n - 1, (level.get(e.from) ?? 0) + 1);
      if ((level.get(e.to) ?? 0) < next) {
        level.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const maxLevel = Math.max(0, ...level.values());
  const ordered = [...files].sort((a, b) => (a.path < b.path ? -1 : 1));
  const columns: string[][] = [[], [], [], []];
  ordered.forEach((f, i) => {
    // Without any import flow there is nothing to layer; spread evenly instead of one tall column.
    const col = edges.length === 0 ? i % 4 : maxLevel === 0 ? 0 : Math.round(((level.get(f.path) ?? 0) * 3) / maxLevel);
    columns[col].push(f.path);
  });
  const tallest = Math.max(...columns.map((c) => c.length));
  const positions = new Map<string, { x: number; y: number }>();
  columns.forEach((paths, col) => {
    const top = ROW_TOP + ((tallest - paths.length) * ROW_GAP) / 2;
    paths.forEach((path, row) => positions.set(path, { x: COLUMN_X[col], y: Math.round(top + row * ROW_GAP) }));
  });
  return positions;
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
// Entry point
// ============================================================================

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

  const tree = await githubJson<{ tree?: TreeEntry[] }>(
    `/repos/${owner}/${repo}/git/trees/${encodePath(defaultBranch)}?recursive=1`,
    ctx,
  );
  if (!Array.isArray(tree.tree)) throw new IngestError('GITHUB_API_ERROR', 'GitHub tree response is malformed');
  const selected = selectFiles(tree.tree);
  if (selected.length === 0) {
    throw new IngestError('NO_CODE_FILES_FOUND', 'No supported source files found in this repository', {
      treeEntries: tree.tree.length,
    });
  }

  const fetched = await Promise.all(selected.map((entry) => fetchRaw(owner, repo, defaultBranch, entry.path, ctx)));
  const files: Scanned[] = [];
  let rateLimited = false;
  selected.forEach((entry, i) => {
    const result = fetched[i];
    if (!result.ok) {
      rateLimited ||= result.status === 429;
      return;
    }
    const lang = langOf(entry.path);
    if (lang) files.push(scanFile(entry.path, result.text, lang));
  });
  if (files.length === 0) {
    if (rateLimited) throw new IngestError('GITHUB_RATE_LIMIT', 'GitHub rate limit exceeded while reading files');
    throw new IngestError('NO_CODE_FILES_FOUND', 'No source files could be fetched', { selected: selected.length });
  }

  const edges = resolveEdges(files);
  const degree = new Map<string, { in: number; out: number }>(files.map((f) => [f.path, { in: 0, out: 0 }]));
  for (const e of edges) {
    degree.get(e.from)!.out++;
    degree.get(e.to)!.in++;
  }
  const positions = layout(files, edges);

  const nodes: RepoNode[] = files
    .map((f): RepoNode => {
      const d = degree.get(f.path)!;
      const ranked = [...f.issues].sort((a, b) => b.severity - a.severity || (a.line ?? 0) - (b.line ?? 0));
      const findings = ranked.slice(0, 4).map((issue) => issue.text);
      const facts = [
        `${f.loc} LOC with ${f.branches} branches and a maximum nesting depth of ${f.depth}.`,
        `Imports ${d.out} and is imported by ${d.in} file${d.in === 1 ? '' : 's'} in this analysis.`,
      ];
      for (let i = 0; findings.length < 2 && i < facts.length; i++) findings.push(facts[i]);
      const anchor = ranked.find((issue) => issue.line !== null)?.line ?? null;
      const { x, y } = positions.get(f.path)!;
      return {
        id: f.path,
        name: f.name,
        path: f.path,
        loc: f.loc,
        rot: rotScore(f, d.in + d.out),
        lastCommit: 'Active branch',
        x,
        y,
        findings,
        code: snippet(f, anchor),
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1));

  const weight = nodes.reduce((sum, n) => sum + Math.max(n.loc, 1), 0);
  const overallRot = Math.round(nodes.reduce((sum, n) => sum + n.rot * Math.max(n.loc, 1), 0) / weight);
  return { title, defaultBranch, rotSummary: `${overallRot}% infected`, overallRot, nodes, edges };
}
