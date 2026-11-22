import { describe, expect, it } from 'vitest';
import { scanSource } from './repoAnalyzer';

/**
 * Accuracy fixtures: each sample lists exactly the findings the scanner must report, as [kind, line].
 * A missing pair is a false negative, an extra pair is a false positive. Add a sample for every scanner bug.
 */
const src = (...lines: string[]) => lines.join('\n') + '\n';
const big = (n: number) => Array.from({ length: n }, (_, i) => `  const v${i} = ${i};`);

const SAMPLES: Array<{ name: string; path: string; code: string; expected: Array<[string, number | null]> }> = [
  {
    name: 'healthy file reports nothing',
    path: 'src/money.ts',
    code: src('export function total(prices: number[]): number {', '  return prices.reduce((sum, price) => sum + price, 0);', '}'),
    expected: [],
  },
  {
    name: 'a backtick inside a regex literal does not hide the rest of the file',
    path: 'src/a.ts',
    code: src('const fence = /`/;', 'export function run(x: number) {', '  try { work(); } catch (e) {}', '  // TODO handle the failure', '  return x;', '}'),
    expected: [['empty-catch', 3], ['debt', 4]],
  },
  {
    name: 'an apostrophe or emoji in JSX text does not shift what follows',
    path: 'src/Note.tsx',
    code: src("export const Note = () => <p>don't panic 🚀</p>;", 'export function save() { // FIXME 🚀 report failures', '  try { write(); } catch {}', '}'),
    expected: [['empty-catch', 3], ['debt', 2]],
  },
  {
    name: 'keywords and markers inside strings are not code',
    path: 'src/text.ts',
    code: src("export const help = 'try { x } catch (e) {} then eval(input)';", 'export const note = `// TODO is only a word here`;'),
    expected: [],
  },
  {
    name: 'every any counts, including generic arguments',
    path: 'src/loose.ts',
    code: src('export function merge(a: Record<string, any>, b: Array<any>) {', '  return { ...a, list: b as any };', '}'),
    expected: [['any', 1]],
  },
  {
    name: 'two any are below the reporting threshold',
    path: 'src/two.ts',
    code: src('export const pick = (a: any, b: any) => a ?? b;'),
    expected: [],
  },
  {
    name: 'a long arrow function with a multi-line parameter list is measured',
    path: 'src/long.ts',
    code: src('export const build = async (', '  a: number,', '  b: number,', ') => {', ...big(70), '  return a + b;', '};'),
    expected: [['long-function', 1]],
  },
  {
    name: 'a comment that only mentions @ts-ignore is not a suppression',
    path: 'src/doc.ts',
    code: src('// Weak typing: any, @ts-ignore, eval.', 'export const weak = 1;'),
    expected: [],
  },
  {
    name: 'a @ts-ignore directive after another comment on the same line still counts',
    path: 'src/legacy.ts',
    code: src('/* legacy API */ // @ts-ignore', 'export const port: number = process.env.PORT;'),
    expected: [['ts-ignore', 1]],
  },
  {
    name: 'a long constructor counts as a long function',
    path: 'src/store.ts',
    code: src('export class Store {', '  constructor() {', ...big(70), '  }', '}'),
    expected: [['long-function', 2]],
  },
  {
    name: 'eval and @ts-ignore are reported at their own lines',
    path: 'src/dyn.ts',
    code: src('export function calc(input: string) {', '  // @ts-ignore', '  return eval(input);', '}'),
    expected: [['eval', 3], ['ts-ignore', 2]],
  },
  {
    name: 'a catch that returns a placeholder is softer than an empty one',
    path: 'src/load.ts',
    code: src('export function load(raw: string) {', '  try {', '    return JSON.parse(raw);', '  } catch (error) {', '    return null;', '  }', '}'),
    expected: [['default-catch', 4]],
  },
  {
    name: 'a catch that reports the error is fine',
    path: 'src/ok.ts',
    code: src('export function load(raw: string) {', '  try {', '    return JSON.parse(raw);', '  } catch (error) {', "    console.error('load failed', error);", '    throw error;', '  }', '}'),
    expected: [],
  },
  {
    name: 'raw innerHTML assignment is an XSS sink',
    path: 'src/dom.js',
    code: src('export function show(el, html) {', '  el.innerHTML = html;', '}'),
    expected: [['unsafe-html', 2]],
  },
  {
    name: 'a hard-coded key is reported on its line',
    path: 'src/client.ts',
    code: src("const region = 'eu';", `const key = 'sk-proj-${'a'.repeat(40)}';`, 'export const client = { region, key };'),
    expected: [['secret', 2]],
  },
  {
    name: 'comments after code on the same line are still comments',
    path: 'src/tail.tsx',
    code: src('export function send(x: number) { // FIXME retry on failure', '  try { post(x); } catch (e) { /* offline is expected */ }', '  return <p>see // docs</p>;', '}'),
    expected: [['debt', 1], ['ignored-catch', 2]],
  },
  {
    name: 'Python: bare except with pass',
    path: 'app/job.py',
    code: src('def run():', '    try:', '        work()', '    except Exception:', '        pass'),
    expected: [['empty-catch', 4]],
  },
];

describe('scanner accuracy fixtures', () => {
  it.each(SAMPLES)('$name', ({ path, code, expected }) => {
    const found = scanSource(path, code).map((finding) => [finding.kind, finding.line]);
    expect(found).toEqual(expected);
  });
});
