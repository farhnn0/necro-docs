import { describe, expect, it } from 'vitest';
import { PRESET_SPECIMENS } from '@/lib/conversion/specimens';
import type { IngestedSpecimen, IngestedWorkspaceNode } from '@/lib/conversion/types';
import {
  buildDisplaySpecimen,
  CAMERA_TOP_OFFSET,
  fitCamera,
  fitFocusCamera,
  hiddenFileCount,
  initialGraphCamera,
  INITIAL_READABLE_SCALE,
  MIN_SCALE,
} from './graphDisplay';

const node = (id: string, featured: boolean): IngestedWorkspaceNode => ({
  kind: 'ingested', id, name: id, path: id, linesOfCode: 10, rotScore: 0, position: { x: 0, y: 0 },
  lastCommit: '', findings: [], summary: '', recommendation: '', codeExcerpt: '', featured, explainedBy: 'static',
});
const repo = (featured: string[], hidden: string[]): IngestedSpecimen => ({
  kind: 'ingested', title: 'acme/oms', summary: '', defaultBranch: 'main', repositoryUrl: 'https://github.com/acme/oms', overallRot: 0, coverage: null,
  nodes: [...featured.map((id) => node(id, true)), ...hidden.map((id) => node(id, false))],
  edges: [{ id: 'a->h1', source: 'a', target: 'h1' }, { id: 'a->b', source: 'a', target: 'b' }],
});

describe('buildDisplaySpecimen', () => {
  it('draws only key files by default and reveals others without moving the key files', () => {
    const specimen = repo(['a', 'b'], ['h1', 'h2']);
    expect(hiddenFileCount(specimen)).toBe(2);
    const key = buildDisplaySpecimen(specimen, 'key', []);
    expect(key.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(key.edges.map((e) => e.id)).toEqual(['a->b']);

    const revealed = buildDisplaySpecimen(specimen, 'key', ['h1', 'unknown']);
    expect(revealed.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'h1']);
    expect(revealed.edges.map((e) => e.id).sort()).toEqual(['a->b', 'a->h1']);
    for (const id of ['a', 'b']) {
      expect(revealed.nodes.find((n) => n.id === id)!.position).toEqual(key.nodes.find((n) => n.id === id)!.position);
    }
  });

  it('returns the specimen unchanged for the all-files view, presets, and analyses without key flags', () => {
    const specimen = repo(['a'], ['h1']);
    expect(buildDisplaySpecimen(specimen, 'all', [])).toBe(specimen);
    expect(buildDisplaySpecimen(PRESET_SPECIMENS.payment, 'key', [])).toBe(PRESET_SPECIMENS.payment);
    const legacy = repo(['a', 'b', 'h1'], []);
    expect(buildDisplaySpecimen(legacy, 'key', [])).toBe(legacy);
  });
});

describe('camera', () => {
  const grid = Array.from({ length: 100 }, (_, i) => ({ position: { x: (i % 10) * 280, y: Math.floor(i / 10) * 170 } }));

  it('zooms out to fit a large graph but never below the minimum scale', () => {
    const fit = fitCamera(grid, { width: 1200, height: 700 });
    expect(fit.x).toBe(0);
    expect(fit.y).toBe(CAMERA_TOP_OFFSET);
    expect(fit.scale).toBeLessThan(0.5);
    expect(fitCamera(grid, { width: 10, height: 10 }).scale).toBe(MIN_SCALE);
  });

  it('centres a focused subset: the subset centre lands on the screen centre', () => {
    const focus = grid.slice(0, 1); // top-left node
    const cam = fitFocusCamera(grid, focus, { width: 1200, height: 700 });
    // Screen offset of a point p is camera + scale * (p - centre of all nodes).
    const allCx = (0 + 9 * 280 + 226) / 2;
    const focusCx = (0 + 226) / 2;
    expect(cam.x + cam.scale * (focusCx - allCx)).toBeCloseTo(0, 5);
  });

  it('guarantees a comfortable readable scale on initial entry for large graphs', () => {
    const initCam = initialGraphCamera(grid, { width: 1200, height: 700 });
    expect(initCam.scale).toBe(INITIAL_READABLE_SCALE);
    expect(initCam.scale).toBeGreaterThanOrEqual(0.75);
    expect(initCam.x).toBe(0);
    expect(initCam.y).toBeGreaterThan(CAMERA_TOP_OFFSET);
  });
});
