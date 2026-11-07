import { describe, it, expect } from 'vitest';
import { WANDER_REACH_X_PX, WANDER_REACH_Y_PX, PIXEL_SHIFT_PITCH_PX, PIXEL_SHIFT_POSITIONS, PIXEL_SHIFT_REACH_PX, pixelShiftMinute, pixelShiftOffset, pixelShiftTransform, wanderOffset } from '../pixel-shift';

describe('pixel shift lattice', () => {
  it('visits 25 distinct spots within two pitches of centre', () => {
    const seen = new Set(PIXEL_SHIFT_POSITIONS.map((p) => `${p.x},${p.y}`));
    expect(seen.size).toBe(25);
    for (const { x, y } of PIXEL_SHIFT_POSITIONS) {
      expect(Math.abs(x)).toBeLessThanOrEqual(2 * PIXEL_SHIFT_PITCH_PX);
      expect(Math.abs(y)).toBeLessThanOrEqual(2 * PIXEL_SHIFT_PITCH_PX);
      expect(Math.abs(x % PIXEL_SHIFT_PITCH_PX)).toBe(0);
      expect(Math.abs(y % PIXEL_SHIFT_PITCH_PX)).toBe(0);
    }
  });

  it('moves exactly one pitch between consecutive minutes, including the wrap', () => {
    // A bigger jump is what a viewer would notice; the walk stays a shuffle.
    const n = PIXEL_SHIFT_POSITIONS.length;
    for (let i = 0; i < n - 1; i++) {
      const a = pixelShiftOffset(i);
      const b = pixelShiftOffset(i + 1);
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(PIXEL_SHIFT_PITCH_PX);
    }
    expect(pixelShiftOffset(n)).toEqual(pixelShiftOffset(0));
    expect(pixelShiftOffset(-1)).toEqual(pixelShiftOffset(n - 1));
  });

  it('is balanced: the spots average out to centre', () => {
    const sum = PIXEL_SHIFT_POSITIONS.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    expect(sum).toEqual({ x: 0, y: 0 });
  });

  it('reads the minute off the clock so every display agrees', () => {
    expect(pixelShiftMinute(0)).toBe(0);
    expect(pixelShiftMinute(59_999)).toBe(0);
    expect(pixelShiftMinute(60_000)).toBe(1);
    const t = Date.parse('2026-11-05T15:30:20Z');
    expect(pixelShiftOffset(pixelShiftMinute(t))).toEqual(pixelShiftOffset(pixelShiftMinute(t + 30_000)));
    expect(pixelShiftOffset(pixelShiftMinute(t))).not.toEqual(pixelShiftOffset(pixelShiftMinute(t + 60_000)));
  });

  it('enlarges the box by its reach so no edge is ever uncovered', () => {
    // Portrait 1080x1920: the short side decides, 12px over 1080.
    expect(pixelShiftTransform({ x: -6, y: 3 }, 1080, 1920)).toBe(`translate(-6px, 3px) scale(${1 + 12 / 1080})`);
    // Each side must gain at least the reach: (s - 1) * short / 2 >= reach.
    for (const [w, h] of [[1080, 1920], [1920, 1080], [800, 480]]) {
      const s = Number(pixelShiftTransform({ x: 0, y: 0 }, w, h).match(/scale\(([^)]+)\)/)![1]);
      expect(((s - 1) * Math.min(w, h)) / 2).toBeGreaterThanOrEqual(PIXEL_SHIFT_REACH_PX - 1e-9);
      expect(s).toBeLessThan(1.03);
    }
    expect(PIXEL_SHIFT_REACH_PX).toBe(2 * PIXEL_SHIFT_PITCH_PX);
  });

  it('only translates until the viewport is measured', () => {
    expect(pixelShiftTransform({ x: 3, y: -3 }, 0, 0)).toBe('translate(3px, -3px)');
  });
});

describe('wander from the start', () => {
  const RX = WANDER_REACH_X_PX;
  const RY = WANDER_REACH_Y_PX;

  it('moves one pixel a minute on each axis and stays inside its rectangle', () => {
    for (let m = 0; m < 4 * RX * 4 * RY; m++) {
      const a = wanderOffset(m, RX, RY);
      const b = wanderOffset(m + 1, RX, RY);
      expect(Math.abs(a.x - b.x)).toBe(1);
      expect(Math.abs(a.y - b.y)).toBe(1);
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(2 * RX);
      expect(Math.abs(a.y)).toBeLessThanOrEqual(RY);
    }
  });

  it('starts at rest, only drifts to the right, and covers every spot of the rectangle', () => {
    expect(wanderOffset(0, RX, RY)).toEqual({ x: RX, y: 0 });
    const xs = new Set<number>();
    const ys = new Set<number>();
    for (let m = 0; m < 4 * RX * 4 * RY; m++) {
      const { x, y } = wanderOffset(m, RX, RY);
      xs.add(x);
      ys.add(y);
    }
    expect(xs.size).toBe(2 * RX + 1);
    expect(ys.size).toBe(2 * RY + 1);
  });

  it('collapses an axis with no room and wraps for negative minutes', () => {
    expect(wanderOffset(17, 0, RY).x).toBe(0);
    expect(wanderOffset(17, RX, 0).y).toBe(0);
    expect(wanderOffset(-1, RX, RY)).toEqual(wanderOffset(4 * RX * 4 * RY - 1, RX, RY));
  });});

describe('centred wander', () => {
  const RX = WANDER_REACH_X_PX;
  const RY = WANDER_REACH_Y_PX;
  const centre = (m: number, rx = RX, ry = RY) => wanderOffset(m, rx, ry, 'centre');

  it('starts at rest and moves one pixel a minute on each axis, either way of centre', () => {
    expect(centre(0)).toEqual({ x: 0, y: 0 });
    const xs = new Set<number>();
    for (let m = 0; m < 4 * RX * 4 * RY; m++) {
      const a = centre(m);
      const b = centre(m + 1);
      expect(Math.abs(a.x - b.x)).toBe(1);
      expect(Math.abs(a.y - b.y)).toBe(1);
      expect(Math.abs(a.x)).toBeLessThanOrEqual(RX);
      expect(Math.abs(a.y)).toBeLessThanOrEqual(RY);
      xs.add(a.x);
    }
    expect(Math.min(...xs)).toBe(-RX);
    expect(Math.max(...xs)).toBe(RX);
    expect(xs.size).toBe(2 * RX + 1);
  });

  it('is the start wave moved back by its reach, so both anchors take the same path', () => {
    for (let m = 0; m < 200; m++) {
      const s = wanderOffset(m, 7, 3);
      const c = centre(m, 7, 3);
      expect(c.x).toBe(s.x - 7);
      expect(c.y).toBe(s.y);
    }
  });

  it('holds still on an axis with no room', () => {
    for (let m = 0; m < 50; m++) {
      expect(centre(m, 0, RY).x).toBe(0);
      expect(centre(m, RX, 0).y).toBe(0);
    }
  });
});
