import { posix } from 'node:path';
import type { IngestEdgeType } from '@/lib/types';
import type { LanguageFamily } from './analyze';

export interface RawImport {
  specifier: string;
  type: IngestEdgeType;
}
export interface Relations {
  imports: RawImport[];
  exportCount: number;
}

const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

const JS_STATIC = /^\s*import\s+(?:[^'"()]*?\bfrom\s+)?['"]([^'"]+)['"]/gm;
const JS_DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const JS_REQUIRE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const JS_EXPORT_FROM = /^\s*export\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm;
const JS_EXPORT = /^\s*export\b|\bmodule\.exports\b|(?<![.\w])exports\.\w+\s*=/gm;

const PY_IMPORT = /^[ \t]*import[ \t]+([^\n#;]+)/gm;
const PY_FROM = /^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+([^\n#;]+)/gm;

function collect(re: RegExp, text: string, type: IngestEdgeType, out: Array<RawImport & { index: number }>) {
  for (const m of text.matchAll(re)) out.push({ specifier: m[1], type, index: m.index ?? 0 });
}

export function detectRelations(codeText: string, family: LanguageFamily): Relations {
  const found: Array<RawImport & { index: number }> = [];

  if (family === 'js') {
    collect(JS_STATIC, codeText, 'import', found);
    collect(JS_DYNAMIC, codeText, 'import', found);
    collect(JS_REQUIRE, codeText, 'require', found);
    collect(JS_EXPORT_FROM, codeText, 'export', found);
    found.sort((a, b) => a.index - b.index);
    const exportCount = (codeText.match(JS_EXPORT) ?? []).length;
    return { imports: found.map(({ specifier, type }) => ({ specifier, type })), exportCount };
  }

  for (const m of codeText.matchAll(PY_IMPORT)) {
    for (const part of m[1].split(',')) {
      const mod = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[\w.]+$/.test(mod)) found.push({ specifier: mod, type: 'import', index: m.index ?? 0 });
    }
  }
  for (const m of codeText.matchAll(PY_FROM)) {
    const mod = m[1];
    if (/^\.+$/.test(mod)) {
      for (const part of m[2].replace(/[()]/g, '').split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (/^\w+$/.test(name)) found.push({ specifier: mod + name, type: 'import', index: m.index ?? 0 });
      }
    } else {
      found.push({ specifier: mod, type: 'import', index: m.index ?? 0 });
    }
  }
  found.sort((a, b) => a.index - b.index);
  return { imports: found.map(({ specifier, type }) => ({ specifier, type })), exportCount: 0 };
}

function firstIn(selected: ReadonlySet<string>, candidates: string[]): string | null {
  return candidates.find((c) => selected.has(c)) ?? null;
}

function resolveJs(spec: string, source: string, selected: ReadonlySet<string>): string | null {
  if (!(spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../'))) return null;
  const joined = posix.normalize(posix.join(posix.dirname(source), spec));
  if (joined === '..' || joined.startsWith('../') || posix.isAbsolute(joined)) return null;
  const base = joined === '.' ? '' : joined;
  const candidates = [base, ...JS_EXTS.map((e) => base + e), ...JS_EXTS.map((e) => posix.join(base, 'index' + e))];
  const m = /\.(?:jsx?|mjs|cjs)$/.exec(base);
  if (m) {
    const stem = base.slice(0, -m[0].length);
    candidates.push(stem + '.ts', stem + '.tsx');
  }
  return firstIn(selected, candidates.filter(Boolean));
}

function resolvePy(spec: string, source: string, selected: ReadonlySet<string>): string | null {
  const dots = /^\.*/.exec(spec)![0].length;
  const rest = spec.slice(dots).replace(/\./g, '/');
  const modCandidates = (p: string) => (p ? [`${p}.py`, `${p}/__init__.py`] : []);

  if (dots > 0) {
    let base = posix.dirname(source);
    for (let i = 1; i < dots; i++) {
      if (base === '.' || base === '') return null;
      base = posix.dirname(base);
    }
    const prefix = base === '.' ? '' : base;
    const joined = posix.join(prefix, rest);
    const target = rest ? modCandidates(joined) : [prefix ? `${prefix}/__init__.py` : '__init__.py'];
    return firstIn(selected, target);
  }

  if (!rest) return null;
  const exact = firstIn(selected, modCandidates(rest));
  if (exact) return exact;
  const suffixes = modCandidates(rest).map((c) => '/' + c);
  const hits = [...selected].filter((p) => suffixes.some((s) => p.endsWith(s)));
  hits.sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  return hits[0] ?? null;
}

export function resolveImport(
  imp: RawImport,
  sourcePath: string,
  family: LanguageFamily,
  selected: ReadonlySet<string>,
): string | null {
  const source = sourcePath.replace(/\\/g, '/');
  const spec = imp.specifier.replace(/\\/g, '/');
  return family === 'js' ? resolveJs(spec, source, selected) : resolvePy(imp.specifier, source, selected);
}
