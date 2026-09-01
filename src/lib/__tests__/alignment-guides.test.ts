import { describe, it, expect } from 'vitest';
import { resolveDragPosition, ALIGNMENT_THRESHOLD } from '@/lib/alignment-guides';
import type { ModuleInstance } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';

const DIMS = { width: 1080, height: 1920 };

function neighbour(x: number, y: number, w: number, h: number): ModuleInstance {
  return {
    id: `n-${x}-${y}`, type: 'clock', position: { x, y }, size: { w, h },
    zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE },
  };
}

describe('resolveDragPosition', () => {
  it('grid-snaps when no neighbour is in range', () => {
    const { x, y, guides } = resolveDragPosition({ w: 400, h: 200 }, 111, 333, [], DIMS, true);
    expect({ x, y }).toEqual({ x: 120, y: 340 });
    expect(guides).toEqual([]);
  });

  it('rounds without snapping when snap is off', () => {
    const { x, y } = resolveDragPosition({ w: 400, h: 200 }, 111.4, 333.6, [], DIMS, false);
    expect({ x, y }).toEqual({ x: 111, y: 334 });
  });

  it('clamps to the canvas', () => {
    const { x, y } = resolveDragPosition({ w: 400, h: 200 }, 5000, -50, [], DIMS, true);
    expect({ x, y }).toEqual({ x: 680, y: 0 });
  });

  it('snaps a left edge to a neighbour left edge and reports the guide', () => {
    // Neighbour at x=600; drag to x=594 (within threshold of 600).
    const others = [neighbour(600, 1000, 300, 300)];
    const { x, guides } = resolveDragPosition({ w: 400, h: 200 }, 594, 0, others, DIMS, true);
    expect(x).toBe(600);
    expect(guides).toContainEqual({ axis: 'x', value: 600 });
  });

  it('aligns centers grid snap alone cannot reach (580-wide onto 600-wide)', () => {
    // Neighbour 600 wide at x=0 → centerX 300. A 580-wide module centered
    // there sits at x=10, which grid snap would pull to 0 or 20.
    const others = [neighbour(0, 1000, 600, 300)];
    const { x, guides } = resolveDragPosition({ w: 580, h: 200 }, 14, 0, others, DIMS, true);
    expect(x).toBe(10);
    expect(guides).toContainEqual({ axis: 'x', value: 300 });
  });

  it('snaps a right edge to a neighbour right edge', () => {
    const others = [neighbour(100, 1000, 500, 300)]; // right edge 600
    const { x, guides } = resolveDragPosition({ w: 400, h: 200 }, 195, 0, others, DIMS, true);
    expect(x).toBe(200); // 600 - 400
    expect(guides).toContainEqual({ axis: 'x', value: 600 });
  });

  it('snaps both axes independently', () => {
    const others = [neighbour(500, 700, 300, 300)];
    const { x, y, guides } = resolveDragPosition({ w: 300, h: 300 }, 497, 703, others, DIMS, true);
    expect({ x, y }).toEqual({ x: 500, y: 700 });
    expect(guides).toHaveLength(2);
  });

  it('picks the closest edge when several are in range', () => {
    const others = [neighbour(100, 0, 300, 100), neighbour(103, 500, 300, 100)];
    const { x } = resolveDragPosition({ w: 200, h: 100 }, 102, 900, others, DIMS, true);
    expect(x).toBe(103);
  });

  it('ignores alignment that would push the module off-canvas', () => {
    // Neighbour hugging the right edge; aligning our left edge to its right
    // edge (x=1080) is impossible for a 400-wide module.
    const others = [neighbour(1076, 1000, 4, 300)];
    const { x } = resolveDragPosition({ w: 400, h: 200 }, 680, 0, others, DIMS, true);
    expect(x).toBe(680);
  });

  it('does not snap past the threshold', () => {
    const others = [neighbour(600, 1000, 300, 300)];
    const raw = 600 - ALIGNMENT_THRESHOLD - 5;
    const { x, guides } = resolveDragPosition({ w: 300, h: 200 }, raw, 0, others, DIMS, false);
    expect(x).toBe(raw);
    expect(guides).toEqual([]);
  });
});
