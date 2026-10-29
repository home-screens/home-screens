import { describe, it, expect } from 'vitest';
import { dockCapacity, dockMetrics } from '../metrics';

const box = { w: 720 - 34, h: 200 - 34, extras: false, pickerH: 0 };

describe('dockCapacity', () => {
  it('counts the tiles a box holds with names and with icons only, by the wall metrics', () => {
    const cap = dockCapacity(box);
    expect(cap.withNames).toBeGreaterThan(0);
    expect(cap.iconsOnly).toBeGreaterThanOrEqual(cap.withNames);
    // The capacities are exactly where the metrics flip.
    expect(dockMetrics({ ...box, count: cap.withNames, compact: false }).showWords).toBe(true);
    expect(dockMetrics({ ...box, count: cap.withNames + 1, compact: false }).showWords).toBe(false);
    expect(dockMetrics({ ...box, count: cap.iconsOnly, compact: false }).overflow).toBe(false);
    expect(dockMetrics({ ...box, count: cap.iconsOnly + 1, compact: false }).overflow).toBe(true);
  });
  it('gives the extras their two tiles first', () => {
    const plain = dockCapacity(box);
    const withExtras = dockCapacity({ ...box, extras: true });
    expect(withExtras.iconsOnly).toBeLessThan(plain.iconsOnly);
    expect(withExtras.withNames).toBeLessThan(plain.withNames);
  });
  it('shrinks tiles only while that makes the dock fit; past that it keeps them comfortable, with names, and scrolls', () => {
    const cap = dockCapacity(box);
    const one = dockMetrics({ ...box, count: 1, compact: false });
    const squeezed = dockMetrics({ ...box, count: cap.withNames, compact: false });
    expect(squeezed.tile).toBeLessThan(one.tile);
    const crowd = dockMetrics({ ...box, count: 44, compact: false });
    expect(crowd.overflow).toBe(true);
    expect(crowd.showWords).toBe(true);
    expect(crowd.tile).toBe(one.tile);
    // Icons only still gets the comfortable tile when it scrolls.
    const crowdCompact = dockMetrics({ ...box, count: 44, compact: true });
    expect(crowdCompact.overflow).toBe(true);
    expect(crowdCompact.tile).toBe(dockMetrics({ ...box, count: 1, compact: true }).tile);
  });
  it('holds more down a tall box than across a short one of the same width', () => {
    expect(dockCapacity({ ...box, w: 170, h: 560 }).iconsOnly).toBeGreaterThan(dockCapacity({ ...box, w: 170, h: 120 }).iconsOnly);
  });
});
