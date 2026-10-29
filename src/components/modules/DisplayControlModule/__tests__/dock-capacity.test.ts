import { describe, it, expect } from 'vitest';
import { dockCapacity, dockMetrics } from '../metrics';

// Display Control is cardless, so the box is the whole module.
const box = { w: 820, h: 160, extras: false, pickerH: 0 };

/** Tiles fully in view from the start of the pill, as the wall lays them out. */
function tilesInView(b: typeof box, count: number): number {
  const m = dockMetrics({ ...b, count, compact: false });
  let n = 0;
  for (let i = 0; i < count; i += 1) {
    const left = m.padIn + i * (m.slot + m.gap) + (m.slot - m.tile) / 2;
    if (left + m.tile <= m.along + 0.5) n += 1;
  }
  return n;
}

describe('dockCapacity', () => {
  it('counts the tiles fully in view, matched against two docks measured in a browser', () => {
    // 820 x 160: 72 px tiles, six in view. 860 x 280: 128 px tiles, four in view.
    expect(dockCapacity(box)).toEqual({ fits: 6, names: true });
    expect(dockCapacity({ ...box, w: 860, h: 280 })).toEqual({ fits: 4, names: true });
  });
  it('agrees with the layout: that many tiles are in view, one more is not, and that many do not scroll', () => {
    for (const b of [box, { ...box, w: 860, h: 280 }, { ...box, w: 300, h: 72 }, { ...box, w: 1040, h: 150 }]) {
      const { fits } = dockCapacity(b);
      expect(tilesInView(b, fits)).toBe(fits);
      expect(tilesInView(b, fits + 1)).toBe(fits);
      expect(dockMetrics({ ...b, count: fits, compact: false }).overflow).toBe(false);
    }
  });
  it('keeps one tile size whatever the count: a crowded dock scrolls at the sparse dock\'s size, names kept', () => {
    const one = dockMetrics({ ...box, count: 1, compact: false });
    for (const count of [5, 12, 13, 17, 44]) {
      const m = dockMetrics({ ...box, count, compact: false });
      expect(m.tile).toBe(one.tile);
      expect(m.showWords).toBe(true);
    }
    expect(dockMetrics({ ...box, count: 44, compact: false }).overflow).toBe(true);
  });
  it('gives the extras their two places and the divider first', () => {
    const plain = dockCapacity(box).fits;
    const withExtras = dockCapacity({ ...box, extras: true }).fits;
    expect(withExtras).toBeLessThanOrEqual(plain - 2);
    expect(withExtras).toBeGreaterThanOrEqual(plain - 3);
  });
  it('says when the box is too short for names', () => {
    expect(dockCapacity({ ...box, h: 60 }).names).toBe(false);
  });
  it('holds more down a tall box than across a short one of the same width', () => {
    expect(dockCapacity({ ...box, w: 170, h: 560 }).fits).toBeGreaterThan(dockCapacity({ ...box, w: 170, h: 120 }).fits);
  });
});
