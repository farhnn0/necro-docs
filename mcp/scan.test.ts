import { describe, expect, it } from 'vitest';
import { scanSource } from '@/lib/repoAnalyzer';
import { scanCode } from './scan';

const deep = (n: number, open: string, close: string, body: string) =>
  Array.from({ length: n }, () => open).join('') + body + Array.from({ length: n }, () => close).join('');

const samples: Record<string, string> = {
  'src/a.ts': `// TODO: fix this\nconst key = "AKIAABCDEFGHIJKLMNOP";\nexport function f(x: any) {\n  try { eval(x); } catch (e) {}\n  console.log(x);\n  return x as any;\n}\n`,
  'src/b.js': `// FIXME later\nvar password = "hunter2hunter2";\nfunction g(a) {\n  try { return JSON.parse(a); } catch (e) {}\n  ${deep(6, 'if (a) {', '}', 'console.log(a);')}\n}\n`,
  'src/c.py': `# TODO: clean up\npassword = "hunter2hunter2"\ndef h(x):\n    try:\n        return eval(x)\n    except:\n        pass\n`,
  'src/d.go': `package main\n// TODO: handle\nfunc main() {\n\t_ = doThing()\n\tpanic("x")\n}\n`,
};

const clean: Record<string, string> = {
  'ok.ts': 'export const a = 1;\n',
  'ok.js': 'module.exports = 1;\n',
  'ok.py': 'A = 1\n',
  'ok.go': 'package main\n',
  'empty.ts': '',
  'readme.unknown': 'TODO everything\n',
};

describe('scan_code parity with scanSource', () => {
  it.each(Object.entries(samples))('projects %s findings field-for-field', (path, code) => {
    const expected = scanSource(path, code);
    const result = scanCode(path, code);
    expect(result.path).toBe(path);
    expect(result.findings).toHaveLength(expected.length);
    result.findings.forEach((f, i) => {
      expect(f.kind).toBe(expected[i].kind);
      expect(f.line).toBe(expected[i].line ?? null);
      expect(f.text).toBe(expected[i].text);
      expect(f.suggestion).toBe(expected[i].suggestion);
      expect(f.source).toBe('static');
    });
  });

  it('exercises at least one finding across the representative inputs', () => {
    const total = Object.entries(samples).reduce((n, [p, c]) => n + scanSource(p, c).length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it.each(Object.entries(clean))('returns an explicit empty list matching scanSource for %s', (path, code) => {
    expect(scanSource(path, code)).toEqual([]);
    expect(scanCode(path, code)).toEqual({ path, findings: [] });
  });
});
