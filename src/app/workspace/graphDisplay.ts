import { layoutWithExtras } from '@/lib/graphLayout';
import type { Specimen, WorkspaceNode } from '@/lib/conversion/types';

/**
 * Which files the dependency graph draws. Every analyzed file stays in the specimen (search, blast
 * radius, export, Seance), but the canvas starts with the key files only and reveals others on demand.
 */
export type GraphScope = 'key' | 'all';

/** Search can reveal at most this many hidden files at once, so a one-letter query cannot flood the canvas. */
export const MAX_REVEALED = 60;

export const NODE_WIDTH = 226;
export const NODE_HEIGHT = 132;
export const MIN_SCALE = 0.2;
export const DEFAULT_SCALE = 0.92;
/** Default camera.y: keeps the graph clear of the floating toolbar. */
export const CAMERA_TOP_OFFSET = 20;

export type Camera = { x: number; y: number; scale: number };

/** Ids of the key files. Presets and older analyses without the flag count every file as key. */
export function keyFileIds(specimen: Specimen): Set<string> {
  if (specimen.kind === 'preset') return new Set(specimen.nodes.map((node) => node.id));
  return new Set(specimen.nodes.filter((node) => node.featured !== false).map((node) => node.id));
}

/** Number of analyzed files the key view hides. */
export function hiddenFileCount(specimen: Specimen): number {
  return specimen.nodes.length - keyFileIds(specimen).size;
}

/**
 * The specimen as the canvas should draw it. In the key view the key files keep a stable layout and
 * revealed files (search hits, the selection, a blast radius) are added in columns to the right, so
 * nothing already on screen moves. The all-files view uses the analyzer's layout of every file.
 */
export function buildDisplaySpecimen(specimen: Specimen, scope: GraphScope, reveal: Iterable<string>): Specimen {
  const keys = keyFileIds(specimen);
  if (scope === 'all' || keys.size === specimen.nodes.length) return specimen;
  const known = new Set(specimen.nodes.map((node) => node.id));
  const extras = [...new Set(reveal)].filter((id) => known.has(id) && !keys.has(id));
  const shown = new Set([...keys, ...extras]);
  const edges = specimen.edges.filter((edge) => shown.has(edge.source) && shown.has(edge.target));
  const positions = layoutWithExtras([...keys], extras, edges.map((edge) => ({ from: edge.source, to: edge.target })));
  const nodes = specimen.nodes
    .filter((node) => shown.has(node.id))
    .map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }));
  return { ...specimen, nodes, edges } as Specimen;
}

function bounds(nodes: readonly Pick<WorkspaceNode, 'position'>[]) {
  const xs = nodes.map((node) => node.position.x);
  const ys = nodes.map((node) => node.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs) + NODE_WIDTH;
  const maxY = Math.max(...ys) + NODE_HEIGHT;
  return { width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/**
 * Camera that fits every drawn node into `viewport`. The graph transform centres the node bounding
 * box at camera (0, 0), so only the scale needs computing.
 */
export function fitCamera(nodes: readonly Pick<WorkspaceNode, 'position'>[], viewport: { width: number; height: number }): Camera {
  if (nodes.length === 0) return { x: 0, y: CAMERA_TOP_OFFSET, scale: DEFAULT_SCALE };
  const box = bounds(nodes);
  const scale = Math.min(DEFAULT_SCALE, Math.max(MIN_SCALE, Math.min(viewport.width / box.width, viewport.height / box.height)));
  return { x: 0, y: CAMERA_TOP_OFFSET, scale: Math.round(scale * 100) / 100 };
}

/** Camera that zooms to fit `focus` (a subset of the drawn nodes `all`) and centres it. */
export function fitFocusCamera(
  all: readonly Pick<WorkspaceNode, 'position'>[],
  focus: readonly Pick<WorkspaceNode, 'position'>[],
  viewport: { width: number; height: number },
): Camera {
  if (focus.length === 0) return fitCamera(all, viewport);
  return focusCamera(all, focus, fitCamera(focus, viewport).scale);
}

/** Camera that centres `focus` (a subset of `all`) at `scale`. */
export function focusCamera(all: readonly Pick<WorkspaceNode, 'position'>[], focus: readonly Pick<WorkspaceNode, 'position'>[], scale: number): Camera {
  if (all.length === 0 || focus.length === 0) return { x: 0, y: CAMERA_TOP_OFFSET, scale };
  const whole = bounds(all);
  const part = bounds(focus);
  return { x: scale * (whole.cx - part.cx), y: CAMERA_TOP_OFFSET + scale * (whole.cy - part.cy), scale };
}
