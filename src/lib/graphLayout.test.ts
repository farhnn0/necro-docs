import { describe, expect, it } from 'vitest';
import { LAYOUT, layoutGraph, layoutWithExtras } from './graphLayout';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `f${String(i).padStart(3, '0')}`);
const overlaps = (points: { x: number; y: number }[]) => new Set(points.map((p) => `${p.x},${p.y}`)).size !== points.length;

describe('layoutGraph', () => {
  it('keeps the classic four columns for small graphs: importer left, sink right', () => {
    const pos = layoutGraph(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]);
    // Levels 0, 1, 2 map onto bands round(level * 3 / 2): columns 0, 2, 3 (same as the original layout).
    expect([pos.get('a')!.x, pos.get('b')!.x, pos.get('c')!.x]).toEqual([110, 670, 950]);
  });

  it('wraps large bands into extra columns instead of one tall strip, without overlaps', () => {
    const all = ids(400);
    const edges = all.slice(1).map((id) => ({ from: all[0], to: id })); // one hub importing 399 files
    const pos = layoutGraph(all, edges);
    const points = [...pos.values()];
    expect(points).toHaveLength(400);
    expect(overlaps(points)).toBe(false);
    const rows = Math.max(...points.map((p) => p.y)) / LAYOUT.ROW_GAP;
    expect(rows).toBeLessThanOrEqual(21); // about sqrt(400) rows, not 399
    expect(pos.get(all[0])!.x).toBeLessThan(Math.min(...all.slice(1).map((id) => pos.get(id)!.x)));
  });

  it('adds revealed files to the right without moving the base layout', () => {
    const base = ['a', 'b', 'c'];
    const edges = [{ from: 'a', to: 'b' }, { from: 'x', to: 'a' }];
    const before = layoutGraph(base, edges);
    const after = layoutWithExtras(base, ['x', 'y'], edges);
    for (const id of base) expect(after.get(id)).toEqual(before.get(id));
    const right = Math.max(...base.map((id) => before.get(id)!.x));
    expect(after.get('x')!.x).toBeGreaterThan(right);
    expect(overlaps([...after.values()])).toBe(false);
  });
});
