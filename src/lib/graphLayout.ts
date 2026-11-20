/**
 * Graph layout shared by the analyzer (server) and the workspace (client). Pure, no DOM.
 *
 * Importers sit on the left, imported modules on the right, in four layered bands. A band with more
 * files than fit in one column wraps into extra columns, so large repositories grow sideways into a
 * roughly 16:9 grid instead of one very tall strip.
 */

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface Point {
  x: number;
  y: number;
}

export const LAYOUT = {
  LEFT: 110,
  TOP: 90,
  COLUMN_GAP: 280,
  ROW_GAP: 170,
  /** Columns never get shorter than this before wrapping. */
  MIN_ROWS: 12,
  BANDS: 4,
} as const;

/** Rows per column: about sqrt(n), which keeps the grid near 16:9 for 280x170 cells. */
const rowsFor = (count: number) => Math.max(LAYOUT.MIN_ROWS, Math.ceil(Math.sqrt(count)));

/** Stacks `columns` left to right from `left`, centring each column on the tallest one. */
function place(columns: string[][], left: number): Map<string, Point> {
  const tallest = Math.max(0, ...columns.map((column) => column.length));
  const positions = new Map<string, Point>();
  columns.forEach((ids, col) => {
    const top = LAYOUT.TOP + ((tallest - ids.length) * LAYOUT.ROW_GAP) / 2;
    ids.forEach((id, row) => positions.set(id, { x: left + col * LAYOUT.COLUMN_GAP, y: Math.round(top + row * LAYOUT.ROW_GAP) }));
  });
  return positions;
}

export function layoutGraph(ids: readonly string[], edges: readonly LayoutEdge[]): Map<string, Point> {
  const n = ids.length;
  if (n === 0) return new Map();
  const known = new Set(ids);
  const inside = edges.filter((e) => known.has(e.from) && known.has(e.to) && e.from !== e.to);
  const ordered = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const rows = rowsFor(n);

  // Without any import flow there is nothing to layer; spread evenly instead of one tall column.
  if (inside.length === 0) {
    const count = Math.max(LAYOUT.BANDS, Math.ceil(n / rows));
    const columns: string[][] = Array.from({ length: count }, () => []);
    ordered.forEach((id, i) => columns[i % count].push(id));
    return place(columns, LAYOUT.LEFT);
  }

  // Longest-path layering; capped passes make import cycles terminate.
  const level = new Map(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < n; pass++) {
    let changed = false;
    for (const e of inside) {
      const next = Math.min(n - 1, (level.get(e.from) ?? 0) + 1);
      if ((level.get(e.to) ?? 0) < next) {
        level.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const maxLevel = Math.max(0, ...level.values());
  const bands: string[][] = Array.from({ length: LAYOUT.BANDS }, () => []);
  for (const id of ordered) {
    const band = maxLevel === 0 ? 0 : Math.round(((level.get(id) ?? 0) * (LAYOUT.BANDS - 1)) / maxLevel);
    bands[band].push(id);
  }
  // A band keeps one column when it fits; otherwise it wraps. Empty bands still reserve their column
  // in the small case so the classic four-column picture stays the same.
  const wraps = bands.some((band) => band.length > rows);
  const columns = bands.flatMap((band) => {
    if (!wraps) return [band];
    if (band.length === 0) return [];
    const chunks: string[][] = [];
    for (let i = 0; i < band.length; i += rows) chunks.push(band.slice(i, i + rows));
    return chunks;
  });
  return place(columns, LAYOUT.LEFT);
}

/**
 * Lays out `base` with layoutGraph and adds `extras` (files revealed on demand) in columns to the
 * right, so revealing a file never moves the files that were already on screen.
 */
export function layoutWithExtras(base: readonly string[], extras: readonly string[], edges: readonly LayoutEdge[]): Map<string, Point> {
  const positions = layoutGraph(base, edges);
  if (extras.length === 0) return positions;
  const right = Math.max(LAYOUT.LEFT - LAYOUT.COLUMN_GAP, ...[...positions.values()].map((p) => p.x)) + LAYOUT.COLUMN_GAP;
  const rows = rowsFor(base.length + extras.length);
  const columns: string[][] = [];
  [...extras].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).forEach((id, i) => {
    if (i % rows === 0) columns.push([]);
    columns[columns.length - 1].push(id);
  });
  place(columns, right).forEach((point, id) => positions.set(id, point));
  return positions;
}
