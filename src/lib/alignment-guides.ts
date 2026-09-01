import type { ModuleInstance, ModuleSize } from '@/types/config';
import { snapToGrid } from '@/lib/constants';

/** A snap line to draw across the canvas while a drag is aligned to it. */
export interface AlignmentGuide {
  axis: 'x' | 'y';
  /** Canvas-space coordinate of the aligned edge/center line. */
  value: number;
}

/** How close (canvas px) a dragged edge must get to a neighbour's edge or
 *  center before it snaps. Under half a grid step, so alignment can win over
 *  grid snap without fighting it. */
export const ALIGNMENT_THRESHOLD = 8;

interface AxisMatch {
  pos: number;
  guide: number;
  dist: number;
}

/** Best edge/center alignment on one axis, or null when nothing is in range.
 *  `edges` are the neighbours' candidate lines; `anchors` are the dragged
 *  module's own offsets (0, size/2, size) measured from its position. */
function bestMatch(clamped: number, anchors: number[], edges: number[], max: number): AxisMatch | null {
  let best: AxisMatch | null = null;
  for (const edge of edges) {
    for (const anchor of anchors) {
      const pos = edge - anchor;
      if (pos < 0 || pos > max) continue;
      const dist = Math.abs(pos - clamped);
      if (dist <= ALIGNMENT_THRESHOLD && (!best || dist < best.dist)) {
        best = { pos, guide: edge, dist };
      }
    }
  }
  return best;
}

/**
 * Resolve where a dragged module should land: clamp to the canvas, then snap
 * each axis to the nearest neighbour edge/center within range (grid snap
 * alone can't line up a 580-wide module with a 600-wide one), falling back
 * to grid snap (or plain rounding when snap is off). Returns the guides to
 * draw for whatever alignment actually won. Used by both the live drag ghost
 * and the drop handler so the ghost never lies about the final position.
 */
export function resolveDragPosition(
  size: ModuleSize,
  rawX: number,
  rawY: number,
  others: ModuleInstance[],
  dims: { width: number; height: number },
  snap: boolean,
): { x: number; y: number; guides: AlignmentGuide[] } {
  const clampedX = Math.max(0, Math.min(dims.width - size.w, rawX));
  const clampedY = Math.max(0, Math.min(dims.height - size.h, rawY));
  const fallback = (v: number) => (snap ? snapToGrid(v) : Math.round(v));

  const xEdges = others.flatMap((o) => [o.position.x, o.position.x + o.size.w / 2, o.position.x + o.size.w]);
  const yEdges = others.flatMap((o) => [o.position.y, o.position.y + o.size.h / 2, o.position.y + o.size.h]);
  const xMatch = bestMatch(clampedX, [0, size.w / 2, size.w], xEdges, dims.width - size.w);
  const yMatch = bestMatch(clampedY, [0, size.h / 2, size.h], yEdges, dims.height - size.h);

  const guides: AlignmentGuide[] = [];
  if (xMatch) guides.push({ axis: 'x', value: xMatch.guide });
  if (yMatch) guides.push({ axis: 'y', value: yMatch.guide });
  return {
    x: xMatch ? Math.round(xMatch.pos) : fallback(clampedX),
    y: yMatch ? Math.round(yMatch.pos) : fallback(clampedY),
    guides,
  };
}
