import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { detectRelations, type RawImport } from '@/lib/ingest/relations';

/**
 * Feature: github-ingest-coderot, Property 15: Import detection round trip
 *
 * Renders generated import/export statements one per line, then checks that
 * detectRelations recovers every specifier with the correct type, in source order.
 * Commented-out statements (decoys) must not be reported.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 9.1, 9.5**
 */

const seg = fc.stringMatching(/^[a-z][a-z0-9_-]{0,6}$/);

// ---------- JS / TS ----------

type JsKind = 'static' | 'side' | 'dynamic' | 'require' | 'exportFrom' | 'exportStar';

interface JsStmt {
  kind: JsKind;
  spec: string;
  commented: boolean;
}

const jsSpec = fc
  .tuple(fc.constantFrom('./', '../', ''), fc.array(seg, { minLength: 1, maxLength: 3 }))
  .map(([prefix, segs]) => prefix + segs.join('/'));

const jsStmtArb: fc.Arbitrary<JsStmt> = fc
  .record({
    kind: fc.constantFrom<JsKind>('static', 'side', 'dynamic', 'require', 'exportFrom', 'exportStar'),
    spec: jsSpec,
    commented: fc.boolean(),
  })
  .map((s) => {
    // Only forms anchored at line start can be commented out without
    // also matching the unanchored require/dynamic patterns.
    const commentable = s.kind === 'static' || s.kind === 'side' || s.kind === 'exportFrom' || s.kind === 'exportStar';
    return { ...s, commented: commentable && s.commented };
  });

function renderJs(s: JsStmt): string {
  switch (s.kind) {
    case 'static':
      return `import x from '${s.spec}';`;
    case 'side':
      return `import '${s.spec}';`;
    case 'dynamic':
      return `const m = import('${s.spec}');`;
    case 'require':
      return `const r = require('${s.spec}');`;
    case 'exportFrom':
      return `export { a } from '${s.spec}';`;
    case 'exportStar':
      return `export * from '${s.spec}';`;
  }
}

const jsTypeOf: Record<JsKind, RawImport['type']> = {
  static: 'import',
  side: 'import',
  dynamic: 'import',
  require: 'require',
  exportFrom: 'export',
  exportStar: 'export',
};

// ---------- Python ----------

type PyKind = 'import' | 'importAs' | 'from' | 'fromRel' | 'fromDots';

interface PyStmt {
  kind: PyKind;
  mod: string; // dotted module path (no leading dots)
  dots: number; // leading dots for relative forms
  name: string;
  commented: boolean;
}

const pyIdent = fc.stringMatching(/^[a-z_][a-z0-9_]{0,6}$/);
const pyMod = fc.array(pyIdent, { minLength: 1, maxLength: 3 }).map((s) => s.join('.'));

const pyStmtArb: fc.Arbitrary<PyStmt> = fc.record({
  kind: fc.constantFrom<PyKind>('import', 'importAs', 'from', 'fromRel', 'fromDots'),
  mod: pyMod,
  dots: fc.integer({ min: 1, max: 3 }),
  name: pyIdent,
  commented: fc.boolean(),
});

function renderPy(s: PyStmt): string {
  const dots = '.'.repeat(s.dots);
  switch (s.kind) {
    case 'import':
      return `import ${s.mod}`;
    case 'importAs':
      return `import ${s.mod} as ${s.name}`;
    case 'from':
      return `from ${s.mod} import ${s.name}`;
    case 'fromRel':
      return `from ${dots}${s.mod} import ${s.name}`;
    case 'fromDots':
      return `from ${dots} import ${s.name}`;
  }
}

/** Specifier as detectRelations should report it. */
function expectedPySpecifier(s: PyStmt): string {
  switch (s.kind) {
    case 'import':
    case 'importAs':
    case 'from':
      return s.mod;
    case 'fromRel':
      return '.'.repeat(s.dots) + s.mod;
    case 'fromDots':
      return '.'.repeat(s.dots) + s.name;
  }
}

describe('detectRelations round trip (Property 15)', () => {
  it('recovers every rendered JS/TS specifier with the correct type, in order', () => {
    fc.assert(
      fc.property(fc.array(jsStmtArb, { minLength: 1, maxLength: 15 }), (stmts) => {
        const lines = stmts.map((s) => (s.commented ? `// ${renderJs(s)}` : renderJs(s)));
        const expected: RawImport[] = stmts
          .filter((s) => !s.commented)
          .map((s) => ({ specifier: s.spec, type: jsTypeOf[s.kind] }));
        const expectedExports = stmts.filter((s) => !s.commented && jsTypeOf[s.kind] === 'export').length;

        const result = detectRelations(lines.join('\n'), 'js');

        expect(result.imports).toEqual(expected);
        expect(result.exportCount).toBe(expectedExports);
      }),
      { numRuns: 200 },
    );
  });

  it('recovers every rendered Python specifier as an import, in order', () => {
    fc.assert(
      fc.property(fc.array(pyStmtArb, { minLength: 1, maxLength: 15 }), (stmts) => {
        const lines = stmts.map((s) => (s.commented ? `# ${renderPy(s)}` : renderPy(s)));
        const expected: RawImport[] = stmts
          .filter((s) => !s.commented)
          .map((s) => ({ specifier: expectedPySpecifier(s), type: 'import' }));

        const result = detectRelations(lines.join('\n'), 'py');

        expect(result.imports).toEqual(expected);
        expect(result.exportCount).toBe(0);
      }),
      { numRuns: 200 },
    );
  });
});
