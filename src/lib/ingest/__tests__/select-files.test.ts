import { describe, expect, it } from 'vitest';

import { INGEST_CONFIG } from '@/lib/constants';

import { IngestError } from '../errors';
import type { TreeEntry } from '../github';
import { selectCodeFiles } from '../select-files';

const blob = (path: string, size: number, mode = '100644'): TreeEntry => ({
  path,
  type: 'blob',
  mode,
  size,
});

describe('selectCodeFiles', () => {
  it('throws NO_CODE_FILES_FOUND with treeEntries and criteria when nothing is eligible', () => {
    const entries: TreeEntry[] = [
      blob('README.md', 100),
      blob('src/empty.ts', 0),
      blob('src/link.ts', 20, '120000'),
      blob('node_modules/pkg/index.js', 50),
      { path: 'src', type: 'tree', mode: '040000' },
    ];

    let caught: unknown;
    try {
      selectCodeFiles(entries);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(IngestError);
    const err = caught as IngestError;
    expect(err.code).toBe('NO_CODE_FILES_FOUND');
    expect(err.status).toBe(422);
    expect(err.details).toHaveProperty('treeEntries');
    expect(err.details).toHaveProperty('criteria');
    // Actual value is the entry count, not the array itself (see src/lib/ingest/select-files.ts).
    expect(err.details.treeEntries).toBe(entries.length);
    expect(err.details.criteria).toMatchObject({
      extensions: [...INGEST_CONFIG.SUPPORTED_EXTENSIONS],
      sortBy: 'size-asc',
      limit: 25,
      eligibleCount: 0,
      selectedCount: 0,
    });
  });

  it('returns criteria with extensions, exclusions, sortBy, limit, and counts', () => {
    const entries: TreeEntry[] = [
      blob('src/big.tsx', 900),
      blob('src/small.ts', 10),
      blob('app/main.py', 300),
      blob('src/app.test.ts', 5), // excluded by name pattern
      blob('src/__tests__/a.ts', 5), // excluded by directory
      blob('vite.config.ts', 5), // excluded by name pattern
      blob('docs/readme.md', 5), // unsupported extension
    ];

    const { files, criteria } = selectCodeFiles(entries);

    expect(files.map((f) => f.path)).toEqual(['src/small.ts', 'app/main.py', 'src/big.tsx']);
    expect(criteria.extensions).toEqual(['.ts', '.tsx', '.js', '.jsx', '.py']);
    expect(criteria.excludePatterns).toEqual(
      expect.arrayContaining(['node_modules/*', '__tests__/*', '*.test.*', '*.config.*']),
    );
    expect(criteria.sortBy).toBe('size-asc');
    expect(criteria.limit).toBe(25);
    expect(criteria.eligibleCount).toBe(3);
    expect(criteria.selectedCount).toBe(3);
  });

  it('caps the selection at 25 while reporting the full eligible count', () => {
    const entries = Array.from({ length: 30 }, (_, i) =>
      blob(`src/f${String(i).padStart(2, '0')}.ts`, i + 1),
    );

    const { files, criteria } = selectCodeFiles(entries);

    expect(files).toHaveLength(25);
    expect(files[0].size).toBe(1);
    expect(files[24].size).toBe(25);
    expect(criteria.eligibleCount).toBe(30);
    expect(criteria.selectedCount).toBe(25);
  });
});
