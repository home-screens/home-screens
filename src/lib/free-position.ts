import { GRID_SIZE } from './constants';
import type { ModuleInstance, ModulePosition, ModuleSize } from '@/types/config';

/**
 * Where a module lands when it is added without a drop point (a click or
 * Enter on a palette item, rather than a drag onto the canvas).
 *
 * Scans the canvas top-to-bottom, left-to-right on the snap grid and returns
 * the first spot where a `size` box fits without touching an existing module
 * (one grid cell of breathing room on every side). The scan starts one
 * `EDGE_INSET` in from the corner so the first module of an empty screen does
 * not sit flush against the edge of the display.
 *
 * When nothing fits — the screen is packed, or the box is bigger than the
 * canvas — it falls back to a cascade offset by module count, clamped to the
 * canvas, so the new module is still visible and never lands exactly on top
 * of the previous one.
 */
export const EDGE_INSET = GRID_SIZE * 2;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function touches(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

export function findFreePosition(
  modules: ReadonlyArray<Pick<ModuleInstance, 'position' | 'size'>>,
  size: ModuleSize,
  canvas: { width: number; height: number },
): ModulePosition {
  const occupied: Rect[] = modules.map((m) => ({ ...m.position, ...m.size }));
  const maxX = canvas.width - size.w;
  const maxY = canvas.height - size.h;

  if (maxX >= EDGE_INSET && maxY >= EDGE_INSET) {
    for (let y = EDGE_INSET; y <= maxY; y += GRID_SIZE) {
      for (let x = EDGE_INSET; x <= maxX; x += GRID_SIZE) {
        const candidate = { x, y, ...size };
        if (!occupied.some((r) => touches(candidate, r, GRID_SIZE))) {
          return { x, y };
        }
      }
    }
  }

  const offset = EDGE_INSET + modules.length * GRID_SIZE;
  return {
    x: Math.max(0, Math.min(maxX, offset)),
    y: Math.max(0, Math.min(maxY, offset)),
  };
}
