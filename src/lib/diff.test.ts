import { describe, expect, it } from 'vitest';
import { diffHunks, diffLines, unifiedDiff } from './diff';

const before = ['import a from "a";', '', 'function f() {', '  try {', '    run();', '  } catch (e) {', '  }', '}', 'export { f };'].join('\n');
const after = ['import a from "a";', '', 'function f() {', '  try {', '    run();', '  } catch (e) {', '    console.error(e);', '    throw e;', '  }', '}', 'export { f };'].join('\n');

describe('diffLines', () => {
  it('marks only the lines that actually changed', () => {
    const changed = diffLines(before, after).filter((line) => line.kind !== 'same');
    expect(changed).toEqual([
      { kind: 'add', text: '    console.error(e);', oldNo: null, newNo: 7 },
      { kind: 'add', text: '    throw e;', oldNo: null, newNo: 8 },
    ]);
  });

  it('reports no changes for identical code, even across line-ending styles', () => {
    expect(diffHunks(diffLines(before, before.replace(/\n/g, '\r\n')))).toEqual([]);
  });

  it('pairs a replaced line as delete then add', () => {
    const changed = diffLines('a\nb\nc', 'a\nB\nc').filter((line) => line.kind !== 'same');
    expect(changed.map((line) => `${line.kind}:${line.text}`)).toEqual(['del:b', 'add:B']);
  });
});

describe('unifiedDiff', () => {
  it('produces a git-style hunk with three lines of context', () => {
    expect(unifiedDiff('src/f.js', before, after)).toBe([
      '--- a/src/f.js',
      '+++ b/src/f.js',
      '@@ -4,6 +4,8 @@',
      '   try {',
      '     run();',
      '   } catch (e) {',
      '+    console.error(e);',
      '+    throw e;',
      '   }',
      ' }',
      ' export { f };',
      '',
    ].join('\n'));
  });

  it('splits distant changes into separate hunks', () => {
    const a = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
    const b = [...a];
    b[1] = 'changed 2';
    b[27] = 'changed 28';
    const hunks = diffHunks(diffLines(a.join('\n'), b.join('\n')));
    expect(hunks.map((h) => [h.oldStart, h.oldLines])).toEqual([[1, 5], [25, 6]]);
  });

  it('is empty when nothing changed', () => {
    expect(unifiedDiff('x.js', before, before)).toBe('');
  });
});
