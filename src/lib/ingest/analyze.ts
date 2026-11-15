import { INGEST_CONFIG } from '@/lib/constants';
import type { IngestLanguage } from '@/lib/types';

export type LanguageFamily = 'js' | 'py';

export interface LineStats {
  totalLines: number;
  blankLines: number;
  commentLines: number;
  codeLines: number;
  nestingDepth: number;
  /** Content with comment-only lines removed; input for relation detection. */
  codeText: string;
}

export interface FileMetrics {
  linesOfCode: number;
  nestingDepth: number;
  commentRatio: number;
  totalLines: number;
}

const LANGUAGES: Record<string, { language: IngestLanguage; family: LanguageFamily }> = {
  '.ts': { language: 'TypeScript', family: 'js' },
  '.tsx': { language: 'TypeScript', family: 'js' },
  '.js': { language: 'JavaScript', family: 'js' },
  '.jsx': { language: 'JavaScript', family: 'js' },
  '.py': { language: 'Python', family: 'py' },
};

export function languageOf(path: string): { language: IngestLanguage; family: LanguageFamily } | null {
  const base = path.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot < 0) return null;
  return LANGUAGES[base.slice(dot).toLowerCase()] ?? null;
}

type Kind = 'blank' | 'comment' | 'code';

export function classifyLines(content: string, family: LanguageFamily): LineStats {
  const lines = content.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === '') lines.pop();

  let inBlock = false;
  const kinds: Kind[] = lines.map((line) => {
    const t = line.trim();
    if (t === '') return 'blank';
    if (family === 'py') return t.startsWith('#') ? 'comment' : 'code';
    if (inBlock) {
      const end = t.indexOf('*/');
      if (end < 0) return 'comment';
      inBlock = false;
      return t.slice(end + 2).trim() ? 'code' : 'comment';
    }
    if (t.startsWith('//')) return 'comment';
    if (t.startsWith('/*')) {
      const end = t.indexOf('*/', 2);
      if (end < 0) {
        inBlock = true;
        return 'comment';
      }
      return t.slice(end + 2).trim() ? 'code' : 'comment';
    }
    return 'code';
  });

  const codeLines = lines.filter((_, i) => kinds[i] === 'code');
  const indents = codeLines.map((l) => {
    const ws = /^[ \t]*/.exec(l)![0];
    const tabs = ws.split('\t').length - 1;
    return { tabs, spaces: ws.length - tabs };
  });

  const positive = indents.map((i) => i.spaces).filter((s) => s > 0);
  const unit = positive.length ? Math.min(8, Math.max(2, Math.min(...positive))) : 4;
  const nestingDepth = indents.reduce((m, i) => Math.max(m, i.tabs + Math.floor(i.spaces / unit)), 0);

  const count = (k: Kind) => kinds.filter((x) => x === k).length;
  return {
    totalLines: lines.length,
    blankLines: count('blank'),
    commentLines: count('comment'),
    codeLines: codeLines.length,
    nestingDepth,
    codeText: lines.filter((_, i) => kinds[i] !== 'comment').join('\n'),
  };
}

export function computeMetrics(stats: LineStats): FileMetrics {
  const ratio = stats.totalLines === 0 ? 0 : (stats.commentLines / stats.totalLines) * 100;
  return {
    linesOfCode: stats.codeLines,
    nestingDepth: stats.nestingDepth,
    commentRatio: Math.round(ratio * 100) / 100,
    totalLines: stats.totalLines,
  };
}

export function computeRotScore(m: FileMetrics): number {
  const { SMALL_FILE_LINES, SMALL_FILE_SCORE, ROT: R } = INGEST_CONFIG;
  if (m.totalLines < SMALL_FILE_LINES) return SMALL_FILE_SCORE;
  const raw =
    R.BASE +
    Math.min(m.linesOfCode / R.LOC_DIVISOR, R.LOC_CAP) +
    Math.min(m.nestingDepth / R.NEST_DIVISOR, R.NEST_CAP) -
    Math.min(m.commentRatio / R.COMMENT_DIVISOR, R.COMMENT_CAP);
  return Math.round(Math.min(100, Math.max(0, raw)));
}

/** Truncates to at most `max` UTF-16 units without splitting a surrogate pair. */
export function truncateChars(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  let end = max;
  if (end > 0) {
    const c = s.charCodeAt(end - 1);
    if (c >= 0xd800 && c <= 0xdbff) end -= 1; // high surrogate would be orphaned
  }
  return { text: s.slice(0, end), truncated: true };
}
