import { describe, it, expect } from 'vitest';
import { presetShape, quickTimerMetrics } from '../metrics';

/** The box a module gets at the registry's default size. */
const DEFAULT_BOX = { w: 260, h: 150, presets: 4, running: false };

describe('presetShape', () => {
  it('puts four presets in a row only when the box is wide enough for four', () => {
    expect(presetShape(4, 3.0)).toEqual([4, 1]);
    expect(presetShape(4, 1.6)).toEqual([2, 2]);
  });

  it('stacks them in a tall strip', () => {
    expect(presetShape(4, 0.3)).toEqual([1, 4]);
  });

  it('keeps six readable by going three across rather than six', () => {
    expect(presetShape(6, 1.2)).toEqual([3, 2]);
  });

  it('never divides a single preset', () => {
    expect(presetShape(1, 0.2)).toEqual([1, 1]);
    expect(presetShape(1, 9)).toEqual([1, 1]);
  });
});

describe('quickTimerMetrics', () => {
  it('fills the default box with a readable number on every preset', () => {
    const m = quickTimerMetrics(DEFAULT_BOX);
    expect(m.cols * m.rows).toBeGreaterThanOrEqual(4);
    expect(m.number).toBeGreaterThan(16);
    expect(m.unit).toBeGreaterThan(0);
  });

  it('drops the unit word before the numbers in a corner tile', () => {
    const tile = quickTimerMetrics({ w: 140, h: 94, presets: 4, running: false });
    expect(tile.unit).toBe(0);
    expect(tile.head).toBe(0);
    expect(tile.number).toBeGreaterThan(10);
  });

  it('grows the number with the box instead of pinning it to a wall size', () => {
    const small = quickTimerMetrics({ w: 200, h: 120, presets: 4, running: false });
    const large = quickTimerMetrics({ w: 700, h: 460, presets: 4, running: false });
    expect(large.number).toBeGreaterThan(small.number * 2);
    expect(large.head).toBeGreaterThan(0);
  });

  it('scales every type size with the card Text size, and nothing else', () => {
    const plain = quickTimerMetrics(DEFAULT_BOX);
    const big = quickTimerMetrics({ ...DEFAULT_BOX, textScale: 1.5 });
    expect(big.number).toBeCloseTo(plain.number * 1.5);
    expect(big.unit).toBeCloseTo(plain.unit * 1.5);
    expect(big.gap).toBe(plain.gap);
    expect(big.cols).toBe(plain.cols);
  });

  it('reserves a control row and a countdown while something is running', () => {
    const m = quickTimerMetrics({ ...DEFAULT_BOX, running: true });
    expect(m.time).toBeGreaterThan(15);
    expect(m.ctrlH).toBeGreaterThanOrEqual(26);
    expect(m.number).toBe(0);
  });

  it('keeps the countdown and controls inside the box they were given', () => {
    for (const box of [
      { w: 180, h: 110 }, { w: 260, h: 150 }, { w: 520, h: 300 }, { w: 900, h: 180 },
    ]) {
      const m = quickTimerMetrics({ ...box, presets: 4, running: true });
      const used = (m.head ? m.head + m.gap : 0) + m.time + m.name
        + (m.bar ? m.bar + m.gap : 0) + m.ctrlH + m.gap;
      expect(used, `${box.w}x${box.h}`).toBeLessThanOrEqual(box.h);
    }
  });

  it('falls back to the default box when nothing has been measured yet', () => {
    // jsdom reports zero, and so does the first frame before the observer runs.
    expect(quickTimerMetrics({ w: 0, h: 0, presets: 4, running: false }))
      .toEqual(quickTimerMetrics(DEFAULT_BOX));
  });

  it('treats an empty preset list as one button rather than dividing by zero', () => {
    const m = quickTimerMetrics({ ...DEFAULT_BOX, presets: 0 });
    expect(m.cols).toBe(1);
    expect(m.rows).toBe(1);
    expect(Number.isFinite(m.number)).toBe(true);
  });
});
