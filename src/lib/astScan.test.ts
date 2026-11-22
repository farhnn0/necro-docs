import { describe, expect, it } from 'vitest';
import { scanAst } from './astScan';

const src = (...lines: string[]) => lines.join('\n');
const html = (value: string) => scanAst('c.tsx', src('export const C = (p: any) => <div dangerouslySetInnerHTML={{ __html: ' + value + ' }} />;')).findings[0];

describe('1. string / template literals are data, not code', () => {
  const file = src(
    'import type { AnalysisResult } from "./types";', // 1
    'export interface Local { a: string }', // 2
    'export const prompt = `Return JSON shaped as:', // 3
    'interface AnalysisResult {', // 4
    '  totalFiles: number;', // 5
    '  languages: Record<string, number>;', // 6
    '}', // 7
    'Answer only with JSON.`;', // 8
    'export const after = 1;', // 9
  );
  const ast = scanAst('ai.ts', file);

  it('masks the inside lines of a multi-line template and reports the copied type with its real line', () => {
    expect([...ast.stringLines].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8]);
    expect(ast.promptTypeRefs).toEqual([{ name: 'AnalysisResult', line: 4 }]);
  });

  it('does not count a real declaration, and does not mask code after the literal', () => {
    expect(ast.declaredTypes).toEqual(['Local']);
    expect(ast.stringLines.has(9)).toBe(false);
  });
});

describe('2. multi-stage fallback vs swallowed error', () => {
  const caught = (body: string) => scanAst('p.ts', body).fallbackCatchLines;

  it('treats an empty catch followed by a repair + second parse as the first stage of a fallback', () => {
    const lines = caught(src(
      'export function parse(raw: string) {', // 1
      '  let parsed: unknown;', // 2
      '  try { parsed = JSON.parse(raw); } catch (_err) {}', // 3
      '  if (!parsed) { parsed = JSON.parse(repair(raw)); }', // 4
      '  return parsed;', // 5
      '}',
    ));
    expect([...lines]).toEqual([3]);
  });

  it('recognises a second try, a recovery helper, and a tested result', () => {
    expect(caught('function a(r: string) { try { JSON.parse(r); } catch {} try { JSON.parse(fix(r)); } catch {} }').size).toBe(1);
    expect(caught('function b(r: string) { let x; try { x = load(r); } catch {} return recoverFrom(r); }').size).toBe(1);
    expect(caught('function c(r: string) { let x; try { x = load(r); } catch {} return x ?? DEFAULT; }').size).toBe(1);
  });

  it('keeps a genuinely swallowed error: nothing after it retries, repairs or checks the result', () => {
    expect(caught('function d(r: string) { try { JSON.parse(r); } catch (_err) {} return 1; }').size).toBe(0);
    expect(caught('function e(r: string) { try { audit(r); } catch {} log("done"); return r; }').size).toBe(0);
    expect(caught('function f(r: string) { try { JSON.parse(r); } catch {} }').size).toBe(0);
  });

  it('ignores catches that already do something', () => {
    expect(caught('function g(r: string) { try { JSON.parse(r); } catch (e) { report(e); } JSON.parse(r); }').size).toBe(0);
  });
});

describe('3. dangerouslySetInnerHTML is judged by what it receives', () => {
  it('sanitized input is an informational notice, with the sanitizer named', () => {
    for (const value of ['safeSanitize(html)', 'DOMPurify.sanitize(props.html)', 'sanitizeHtml(post.body)']) {
      const finding = html(value);
      expect(finding.kind).toBe('html-notice');
      expect(finding.text).toContain('sanitized by');
    }
    expect(html('DOMPurify.sanitize(x)').text).toContain('DOMPurify.sanitize()');
  });

  it('static strings and i18n dictionaries are a notice, not an alert', () => {
    for (const value of ['"<b>Hi</b>"', 't.about.body', 'dict["terms"]', "t('privacy')", 'messages.terms ?? "<p>n/a</p>"']) expect(html(value).kind).toBe('html-notice');
  });

  it('follows one same-file const hop', () => {
    const safe = scanAst('c.tsx', src('const clean = DOMPurify.sanitize(raw);', 'export const C = () => <div dangerouslySetInnerHTML={{ __html: clean }} />;')).findings[0];
    expect(safe.kind).toBe('html-notice');
    const raw = scanAst('c.tsx', src('const bio = user.bio;', 'export const C = () => <div dangerouslySetInnerHTML={{ __html: bio }} />;')).findings[0];
    expect(raw.kind).toBe('unsafe-html');
  });

  it('keeps the alert for anything unsanitized, including a template that mixes in raw input', () => {
    for (const value of ['props.html', 'user.bio', 'marked(md)', '`<p>${comment.body}</p>`', 'sanitize2 + props.html']) {
      expect(html(value).kind).toBe('unsafe-html');
    }
    expect(html('`<p>${DOMPurify.sanitize(a)}</p>`').kind).toBe('html-notice');
    const spread = scanAst('c.tsx', 'export const C = (p: any) => <div dangerouslySetInnerHTML={p.markup} />;').findings[0];
    expect(spread.kind).toBe('unsafe-html');
  });

  it('puts the line number on the attribute', () => {
    const finding = scanAst('c.tsx', src('export const C = () => (', '  <div>', '    <p dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(x) }} />', '  </div>', ');')).findings[0];
    expect(finding.line).toBe(3);
  });
});

describe('4. actionable suggestions', () => {
  it('suggests a guard clause when the whole function body is wrapped in one if', () => {
    const hint = scanAst('n.ts', src(
      'export function save(user: User, rows: Row[]) {', // 1
      '  if (user.active) {', // 2
      '    for (const row of rows) {', // 3
      '      try {', // 4
      '        if (row.ok) { store(row); }', // 5
      '      } catch (e) { report(e); }', // 6
      '    }', // 7
      '  }', // 8
      '}',
    )).nestingHint;
    expect(hint).toContain('save() reaches 4 levels'); // if > for > try > if
    expect(hint).toContain('`if` at line 2');
    expect(hint).toContain('guard clause');
  });

  it('suggests extracting the loop body when there is no wrapping if', () => {
    const hint = scanAst('n.ts', src(
      'export function run(rows: Row[]) {',
      '  log(rows.length);',
      '  for (const row of rows) {', // 3
      '    if (row.a) { while (row.b) { try { step(row); } catch (e) { report(e); } } }',
      '  }',
      '  return 1;',
      '}',
    )).nestingHint;
    expect(hint).toContain('loop at line 3');
    expect(hint).toContain('`continue`');
  });

  it('gives no hint for flat code', () => {
    expect(scanAst('n.ts', 'export function f(a: number) { if (a) { return 1; } return 2; }').nestingHint).toBeNull();
  });

  it('plans a split for a monolithic file by the noun left after the leading verb', () => {
    const fns = ['createOrder', 'updateOrder', 'deleteOrder', 'approveOrder', 'createUser', 'updateUser', 'listUser', 'syncStock'];
    const body = fns.map((name) => `export async function ${name}(id: string) {\n  return id;\n}\n${'// filler\n'.repeat(190)}`).join('\n');
    const finding = scanAst('actions.ts', body).findings.find((f) => f.kind === 'monolith')!;
    expect(finding.text).toMatch(/^Line 1: \d+ lines and 8 top-level declarations/);
    expect(finding.text).toContain('heuristic');
    expect(finding.suggestion).toContain('order.ts (createOrder, updateOrder, deleteOrder, +1 more)');
    expect(finding.suggestion).toContain('user.ts (createUser, updateUser, listUser)');
    expect(finding.suggestion).toContain('barrel');
    expect(scanAst('small.ts', 'export const a = 1;\n').findings).toEqual([]);
  });

  it('counts exact AST branches and ignores optional types and keyword-named properties', () => {
    const scan = scanAst('types.ts', src(
      'export interface Opts { a?: string; b?: number; if?: boolean; case?: string }',
      'export function run(o: Opts) {',
      '  let x = o.if && o.case ? 1 : 0;',
      '  x ||= 2;',
      '  x &&= 3;',
      '  if (x) return o.a ?? "ok";',
      '  return "";',
      '}',
    ));
    // && (1) + ternary (1) + ||= (1) + &&= (1) + if (1) = 5; optional `?`, `o.if`, `o.case`, and `??` are not branches.
    expect(scan.branches).toBe(5);
  });
});
