import { describe, it, expect } from 'vitest';
import { presetShape, quickTimerFinishedMetrics, quickTimerMetrics } from '../metrics';

/** The box a module gets at the registry's default size, inside the card's padding. */
const DEFAULT_BOX = { w: 308, h: 168, presets: 4, running: false };

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
  });

  it('drops the unit word rather than draw it too small to read', () => {
    // 8 px under a 29 px number is what a 260 by 150 box used to draw.
    expect(quickTimerMetrics({ w: 228, h: 118, presets: 4, running: false }).unit).toBe(0);
    expect(quickTimerMetrics(DEFAULT_BOX).unit).toBeGreaterThanOrEqual(11);
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

  it('follows the card Text size without changing the layout', () => {
    const plain = quickTimerMetrics({ w: 600, h: 300, presets: 4, running: false });
    const big = quickTimerMetrics({ w: 600, h: 300, presets: 4, running: false, textScale: 1.5 });
    // A bigger heading leaves the buttons a little less height, so the unit
    // grows by slightly under the full half.
    expect(big.unit).toBeGreaterThan(plain.unit * 1.4);
    expect(big.head).toBeCloseTo(plain.head * 1.5);
    expect(big.gap).toBe(plain.gap);
    expect(big.cols).toBe(plain.cols);
  });

  it('never lets a bigger Text size push a number out of its button or the name onto the buttons', () => {
    for (const box of [{ w: 228, h: 118 }, { w: 568, h: 188 }, { w: 138, h: 88 }, { w: 128, h: 468 }, { w: 868, h: 98 }]) {
      for (const textScale of [0.7, 1, 1.5, 2]) {
        const idle = quickTimerMetrics({ ...box, presets: 4, running: false, textScale });
        const headH = idle.head ? idle.head * 1.3 + idle.gap : 0;
        const bh = (box.h - headH - idle.gap * (idle.rows - 1)) / idle.rows;
        const bw = (box.w - idle.gap * (idle.cols - 1)) / idle.cols;
        const where = `${box.w}x${box.h} at ${textScale}`;
        expect(idle.number + (idle.unit ? idle.unit * 1.5 : 0), `idle height, ${where}`).toBeLessThanOrEqual(bh);
        expect(idle.number * 1.45, `idle width, ${where}`).toBeLessThanOrEqual(bw + 0.001);

        const run = quickTimerMetrics({ ...box, presets: 4, running: true, textScale });
        const used = (run.head ? run.head * 1.3 + run.gap : 0) + run.time + (run.name ? run.name * 1.25 + run.gap : 0)
          + (run.bar ? run.bar + run.gap : 0) + run.gap + run.ctrlH * run.ctrlRows + run.gap * (run.ctrlRows - 1);
        expect(used, `running height, ${where}`).toBeLessThanOrEqual(box.h + 0.001);
        expect(run.time * 2.9, `countdown width, ${where}`).toBeLessThanOrEqual(Math.max(box.w, 12 * 2.9) + 0.001);
        expect(run.ctrl, `button words, ${where}`).toBeLessThanOrEqual(run.ctrlH * 0.42 + 0.001);
      }
    }
  });

  it('draws no word smaller than a wall can be read at', () => {
    for (const box of [{ w: 228, h: 118 }, { w: 138, h: 88 }, { w: 868, h: 98 }, { w: 568, h: 188 }]) {
      for (const running of [false, true]) {
        const m = quickTimerMetrics({ ...box, presets: 4, running });
        for (const size of [m.head, m.unit, m.name]) expect(size === 0 || size >= 11, `${box.w}x${box.h}`).toBe(true);
        if (running) expect(m.ctrl).toBeGreaterThanOrEqual(Math.min(11, m.ctrlH * 0.42));
      }
    }
  });

  it('gives a small box Pause and Stop at a finger\'s height, a tall strip two rows, a wide box all four', () => {
    const dropped = quickTimerMetrics({ w: 228, h: 118, presets: 4, running: true });
    expect([dropped.ctrlCols, dropped.ctrlRows, dropped.nudges]).toEqual([2, 1, false]);
    expect(dropped.ctrlH).toBeGreaterThanOrEqual(40);

    const strip = quickTimerMetrics({ w: 128, h: 468, presets: 4, running: true });
    expect([strip.ctrlCols, strip.ctrlRows, strip.nudges]).toEqual([2, 2, true]);
    expect(strip.ctrlH).toBeGreaterThanOrEqual(44);
    expect(strip.ctrlWords).toBe(false);

    const wide = quickTimerMetrics({ w: 568, h: 188, presets: 4, running: true });
    expect([wide.ctrlCols, wide.ctrlRows, wide.nudges, wide.ctrlWords]).toEqual([4, 1, true, true]);
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
      const used = (m.head ? m.head * 1.3 + m.gap : 0) + m.time + (m.name ? m.name * 1.25 + m.gap : 0)
        + (m.bar ? m.bar + m.gap : 0) + m.ctrlH * m.ctrlRows + m.gap;
      expect(used, `${box.w}x${box.h}`).toBeLessThanOrEqual(box.h);
    }
  });

  it('gives the heading\'s line to the box when there is no heading', () => {
    const titled = quickTimerMetrics(DEFAULT_BOX);
    const untitled = quickTimerMetrics({ ...DEFAULT_BOX, heading: false });
    expect(titled.head).toBeGreaterThan(0);
    expect(untitled.head).toBe(0);
    expect(untitled.number).toBeGreaterThan(titled.number);
    const running = quickTimerMetrics({ ...DEFAULT_BOX, running: true, heading: false });
    expect(running.head).toBe(0);
    expect(running.time).toBeGreaterThanOrEqual(quickTimerMetrics({ ...DEFAULT_BOX, running: true }).time);
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

describe('quickTimerFinishedMetrics', () => {
  it('keeps "Time\'s up!" on one line inside the box at any Text size', () => {
    for (const box of [{ w: 308, h: 168 }, { w: 568, h: 188 }, { w: 138, h: 88 }, { w: 128, h: 468 }, { w: 748, h: 98 }]) {
      for (const textScale of [0.7, 1, 1.5, 2]) {
        const f = quickTimerFinishedMetrics({ ...box, textScale });
        const where = `${box.w}x${box.h} at ${textScale}`;
        // The German line is the longest shipped: about 7 type sizes wide.
        expect(f.big * 7, `width, ${where}`).toBeLessThanOrEqual(Math.max(box.w, 11 * 7) + 0.001);
        const used = f.big * 1.2 + (f.name ? f.small * 1.45 : 0) + (f.hint ? f.small * 1.45 : 0);
        expect(used, `height, ${where}`).toBeLessThanOrEqual(box.h);
      }
    }
  });

  it('adds the name and the "Tap to close" line only where there is height for them', () => {
    expect(quickTimerFinishedMetrics({ w: 138, h: 40 })).toMatchObject({ name: false, hint: false });
    expect(quickTimerFinishedMetrics({ w: 138, h: 60 })).toMatchObject({ name: true, hint: false });
    expect(quickTimerFinishedMetrics({ w: 568, h: 188 })).toMatchObject({ name: true, hint: true });
  });
});
