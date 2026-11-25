import { describe, expect, it } from 'vitest';
import {
  analyzeRepoSchema,
  getFindingsSchema,
  scanCodeSchema,
  synthesizePatchSchema,
} from './schemas';
import { INPUT_LIMITS } from './types';

const url = 'https://github.com/a/b';

/** Returns the argument names named in the validation error paths. */
function badArgs(result: { success: boolean; error?: { issues: { path: PropertyKey[]; keys?: string[] }[] } }) {
  expect(result.success).toBe(false);
  return result.error!.issues.flatMap((i) => (i.keys ? i.keys : [String(i.path[0])]));
}

describe('mcp schemas', () => {
  it('accepts valid inputs and trims strings', () => {
    expect(analyzeRepoSchema.parse({ repoUrl: `  ${url} ` })).toEqual({ repoUrl: url });
    expect(getFindingsSchema.parse({ repoUrl: url, path: 'src/a.ts' }).path).toBe('src/a.ts');
    expect(scanCodeSchema.parse({ path: 'a.ts', code: '  x  ' }).code).toBe('  x  ');
    expect(
      synthesizePatchSchema.parse({ path: 'a.ts', code: 'x', dependencies: ['react'], importedBy: ['b.ts'] }),
    ).toMatchObject({ dependencies: ['react'] });
  });

  it('rejects empty and whitespace-only strings, naming the argument', () => {
    expect(badArgs(analyzeRepoSchema.safeParse({ repoUrl: '   ' }))).toContain('repoUrl');
    expect(badArgs(getFindingsSchema.safeParse({ repoUrl: url, path: '' }))).toContain('path');
    expect(badArgs(scanCodeSchema.safeParse({ path: 'a.ts', code: '' }))).toContain('code');
  });

  it('rejects missing and non-string values, naming the argument', () => {
    expect(badArgs(analyzeRepoSchema.safeParse({}))).toContain('repoUrl');
    expect(badArgs(scanCodeSchema.safeParse({ path: 5, code: 'x' }))).toContain('path');
  });

  it('rejects oversized url, path, and code', () => {
    expect(badArgs(analyzeRepoSchema.safeParse({ repoUrl: 'a'.repeat(INPUT_LIMITS.repoUrl + 1) }))).toContain('repoUrl');
    expect(badArgs(getFindingsSchema.safeParse({ repoUrl: url, path: 'a'.repeat(INPUT_LIMITS.path + 1) }))).toContain('path');
    expect(badArgs(scanCodeSchema.safeParse({ path: 'a', code: 'x'.repeat(INPUT_LIMITS.code + 1) }))).toContain('code');
    expect(scanCodeSchema.safeParse({ path: 'a', code: 'x'.repeat(INPUT_LIMITS.code) }).success).toBe(true);
  });

  it('rejects unknown keys, naming them', () => {
    expect(badArgs(analyzeRepoSchema.safeParse({ repoUrl: url, autoApprove: true }))).toContain('autoApprove');
    expect(badArgs(synthesizePatchSchema.safeParse({ path: 'a', code: 'x', findings: [] }))).toContain('findings');
  });

  it('bounds the optional arrays and their items', () => {
    const base = { path: 'a', code: 'x' };
    expect(synthesizePatchSchema.safeParse(base).success).toBe(true);
    expect(synthesizePatchSchema.safeParse({ ...base, dependencies: [], importedBy: [] }).success).toBe(true);
    const many = (n: number) => Array.from({ length: n }, (_, i) => `d${i}`);
    expect(synthesizePatchSchema.safeParse({ ...base, dependencies: many(INPUT_LIMITS.dependencies) }).success).toBe(true);
    expect(badArgs(synthesizePatchSchema.safeParse({ ...base, dependencies: many(INPUT_LIMITS.dependencies + 1) }))).toContain('dependencies');
    expect(badArgs(synthesizePatchSchema.safeParse({ ...base, importedBy: many(INPUT_LIMITS.importedBy + 1) }))).toContain('importedBy');
    expect(badArgs(synthesizePatchSchema.safeParse({ ...base, dependencies: [''] }))).toContain('dependencies');
    expect(
      badArgs(synthesizePatchSchema.safeParse({ ...base, dependencies: ['a'.repeat(INPUT_LIMITS.dependencyName + 1)] })),
    ).toContain('dependencies');
    expect(
      badArgs(synthesizePatchSchema.safeParse({ ...base, importedBy: ['a'.repeat(INPUT_LIMITS.importerPath + 1)] })),
    ).toContain('importedBy');
  });
});

describe('synthesizePatchSchema: exactly one of code or repoUrl', () => {
  it('accepts { path, code } and { repoUrl, path }', () => {
    expect(synthesizePatchSchema.safeParse({ path: 'a.ts', code: 'x' }).success).toBe(true);
    expect(synthesizePatchSchema.parse({ repoUrl: ` ${url} `, path: 'a.ts' })).toEqual({ repoUrl: url, path: 'a.ts' });
  });

  it('rejects both or neither, naming the argument', () => {
    expect(badArgs(synthesizePatchSchema.safeParse({ path: 'a.ts', code: 'x', repoUrl: url }))).toContain('code');
    expect(badArgs(synthesizePatchSchema.safeParse({ path: 'a.ts' }))).toContain('repoUrl');
  });

  it('rejects caller-supplied context together with repoUrl', () => {
    expect(badArgs(synthesizePatchSchema.safeParse({ path: 'a.ts', repoUrl: url, importedBy: ['b.ts'] }))).toContain('importedBy');
    expect(badArgs(synthesizePatchSchema.safeParse({ path: 'a.ts', repoUrl: url, dependencies: ['react'] }))).toContain('dependencies');
  });
});
