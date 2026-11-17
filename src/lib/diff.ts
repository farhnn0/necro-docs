/** Line-based diff for showing AI patches. Works the same on server and client. */

export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
  /** 1-based line number in the original file, null for added lines. */
  oldNo: number | null;
  /** 1-based line number in the patched file, null for removed lines. */
  newNo: number | null;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/** CRLF and CR are treated as LF so a line-ending change alone never shows as a diff. */
function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// ponytail: LCS is O(n*m) memory on the changed middle. Above this budget the middle is shown as
// one delete block plus one add block. Upgrade path: Myers' O((n+m)D) diff.
const MAX_LCS_CELLS = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);

  // A surgical patch usually changes a small middle section, so trim the shared prefix and suffix first.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const out: DiffLine[] = [];
  for (let k = 0; k < start; k++) out.push({ kind: 'same', text: a[k], oldNo: k + 1, newNo: k + 1 });

  const n = endA - start;
  const m = endB - start;
  if (n * m > MAX_LCS_CELLS) {
    for (let i = 0; i < n; i++) out.push({ kind: 'del', text: a[start + i], oldNo: start + i + 1, newNo: null });
    for (let j = 0; j < m; j++) out.push({ kind: 'add', text: b[start + j], oldNo: null, newNo: start + j + 1 });
  } else {
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] = a[start + i] === b[start + j]
          ? lcs[(i + 1) * w + j + 1] + 1
          : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        out.push({ kind: 'same', text: a[start + i], oldNo: start + i + 1, newNo: start + j + 1 });
        i++;
        j++;
      } else if (i < n && (j === m || lcs[(i + 1) * w + j] >= lcs[i * w + j + 1])) {
        out.push({ kind: 'del', text: a[start + i], oldNo: start + i + 1, newNo: null });
        i++;
      } else {
        out.push({ kind: 'add', text: b[start + j], oldNo: null, newNo: start + j + 1 });
        j++;
      }
    }
  }

  for (let k = 0; k < a.length - endA; k++) {
    out.push({ kind: 'same', text: a[endA + k], oldNo: endA + k + 1, newNo: endB + k + 1 });
  }
  return out;
}

/** Groups changed lines with `context` unchanged lines around them, like `git diff`. */
export function diffHunks(lines: DiffLine[], context = 3): DiffHunk[] {
  const changed = lines.flatMap((line, index) => (line.kind === 'same' ? [] : [index]));
  if (changed.length === 0) return [];

  const ranges: Array<[number, number]> = [];
  for (const index of changed) {
    const from = Math.max(0, index - context);
    const to = Math.min(lines.length - 1, index + context);
    const last = ranges[ranges.length - 1];
    if (last && from <= last[1] + 1) last[1] = to;
    else ranges.push([from, to]);
  }

  return ranges.map(([from, to]) => {
    const slice = lines.slice(from, to + 1);
    const before = lines.slice(0, from);
    const oldLines = slice.filter((line) => line.kind !== 'add').length;
    const newLines = slice.filter((line) => line.kind !== 'del').length;
    const oldBefore = before.filter((line) => line.kind !== 'add').length;
    const newBefore = before.filter((line) => line.kind !== 'del').length;
    return {
      // Unified diff convention: a zero-length side points at the line before it.
      oldStart: oldLines ? oldBefore + 1 : oldBefore,
      oldLines,
      newStart: newLines ? newBefore + 1 : newBefore,
      newLines,
      lines: slice,
    };
  });
}

/** A unified diff (`git apply` / `patch -p1` format). Empty string when nothing changed. */
export function unifiedDiff(path: string, before: string, after: string, context = 3): string {
  const hunks = diffHunks(diffLines(before, after), context);
  if (hunks.length === 0) return '';
  const prefix = { same: ' ', del: '-', add: '+' } as const;
  const body = hunks.map((hunk) => [
    `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    ...hunk.lines.map((line) => prefix[line.kind] + line.text),
  ].join('\n'));
  return [`--- a/${path}`, `+++ b/${path}`, ...body].join('\n') + '\n';
}
