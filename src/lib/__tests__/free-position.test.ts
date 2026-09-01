import { describe, it, expect } from 'vitest';
import { findFreePosition, EDGE_INSET } from '../free-position';
import { GRID_SIZE } from '../constants';

const CANVAS = { width: 1080, height: 1920 };
const box = (x: number, y: number, w: number, h: number) => ({ position: { x, y }, size: { w, h } });

describe('findFreePosition', () => {
  it('starts an empty screen one inset in from the corner, on the grid', () => {
    const pos = findFreePosition([], { w: 400, h: 200 }, CANVAS);
    expect(pos).toEqual({ x: EDGE_INSET, y: EDGE_INSET });
    expect(pos.x % GRID_SIZE).toBe(0);
  });

  it('places the next module beside an existing one with a grid cell of gap', () => {
    const first = box(EDGE_INSET, EDGE_INSET, 400, 200);
    const pos = findFreePosition([first], { w: 400, h: 200 }, CANVAS);
    // Same row, to the right of the first box plus one gutter.
    expect(pos).toEqual({ x: EDGE_INSET + 400 + GRID_SIZE, y: EDGE_INSET });
  });

  it('wraps to the next row when the row is full', () => {
    const wide = box(EDGE_INSET, EDGE_INSET, 1000, 200);
    const pos = findFreePosition([wide], { w: 400, h: 200 }, CANVAS);
    expect(pos.y).toBe(EDGE_INSET + 200 + GRID_SIZE);
    expect(pos.x).toBe(EDGE_INSET);
  });

  it('never overlaps any existing module', () => {
    const modules = [
      box(0, 0, 1080, 300),
      box(0, 320, 500, 500),
      box(540, 320, 540, 500),
      box(0, 900, 1080, 100),
    ];
    const size = { w: 300, h: 300 };
    const pos = findFreePosition(modules, size, CANVAS);
    for (const m of modules) {
      const overlaps =
        pos.x < m.position.x + m.size.w && pos.x + size.w > m.position.x &&
        pos.y < m.position.y + m.size.h && pos.y + size.h > m.position.y;
      expect(overlaps).toBe(false);
    }
  });

  it('falls back to a clamped cascade when nothing fits', () => {
    const full = box(0, 0, 1080, 1920);
    const pos = findFreePosition([full], { w: 400, h: 200 }, CANVAS);
    expect(pos).toEqual({ x: EDGE_INSET + GRID_SIZE, y: EDGE_INSET + GRID_SIZE });
    const second = findFreePosition([full, full], { w: 400, h: 200 }, CANVAS);
    expect(second.x).toBeGreaterThan(pos.x);
  });

  it('clamps to the canvas when the module is bigger than the display', () => {
    const pos = findFreePosition([], { w: 2000, h: 200 }, CANVAS);
    expect(pos).toEqual({ x: 0, y: EDGE_INSET });
  });
});
