import { INGEST_CONFIG } from '@/lib/constants';
import type { SelectionCriteria } from '@/lib/types';

import { IngestError } from './errors';
import type { TreeEntry } from './github';

export interface Selection {
  files: TreeEntry[];
  criteria: SelectionCriteria;
}

const globToRegExp = (g: string): RegExp =>
  new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');

const NAME_PATTERNS = INGEST_CONFIG.EXCLUDED_NAME_PATTERNS.map(globToRegExp);
const EXCLUDED_DIRS = new Set<string>(INGEST_CONFIG.EXCLUDED_DIRS);

function isEligible(e: TreeEntry): boolean {
  if (e.type !== 'blob' || e.mode === '120000' || !e.size || e.size <= 0) return false;
  const segments = e.path.split('/');
  const name = segments[segments.length - 1];
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  if (!(INGEST_CONFIG.SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) return false;
  if (segments.slice(0, -1).some((s) => EXCLUDED_DIRS.has(s))) return false;
  return !NAME_PATTERNS.some((re) => re.test(name));
}

/** Picks up to MAX_FILES eligible code files, smallest first (ties by path). Throws NO_CODE_FILES_FOUND if none. */
export function selectCodeFiles(entries: TreeEntry[]): Selection {
  const eligible = entries
    .filter(isEligible)
    .sort((a, b) => a.size! - b.size! || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const files = eligible.slice(0, INGEST_CONFIG.MAX_FILES);
  const criteria: SelectionCriteria = {
    extensions: [...INGEST_CONFIG.SUPPORTED_EXTENSIONS],
    excludePatterns: [
      ...INGEST_CONFIG.EXCLUDED_DIRS.map((d) => `${d}/*`),
      ...INGEST_CONFIG.EXCLUDED_NAME_PATTERNS,
    ],
    sortBy: 'size-asc',
    limit: INGEST_CONFIG.MAX_FILES,
    eligibleCount: eligible.length,
    selectedCount: files.length,
  };
  if (files.length === 0) {
    throw new IngestError('NO_CODE_FILES_FOUND', 'No code files found after filtering', {
      treeEntries: entries.length,
      criteria,
    });
  }
  return { files, criteria };
}
