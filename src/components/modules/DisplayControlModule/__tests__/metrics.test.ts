import { describe, it, expect } from 'vitest';
import { controlMetrics, popoverMetrics } from '../metrics';

const panel = (w: number, h: number, over: Partial<Parameters<typeof controlMetrics>[0]> = {}) =>
  controlMetrics({ w, h, layout: 'panel', compact: false, showPicker: false, ...over });

describe('controlMetrics', () => {
  it('drops sub-labels, then labels, then the slider caption as the box shrinks', () => {
    const wall = panel(680, 480);
    expect([wall.showWords, wall.showSubs, wall.showCaption]).toEqual([true, true, true]);

    const tile = panel(340, 240);
    expect([tile.showWords, tile.showSubs, tile.showCaption]).toEqual([true, true, false]);

    const corner = panel(260, 170);
    expect([corner.showWords, corner.showSubs]).toEqual([true, false]);

    const badge = panel(170, 130);
    expect(badge.showWords).toBe(false);
    expect(badge.label).toBe(0);
    expect(badge.sub).toBe(0);
  });

  it('keeps every number inside the box it was given', () => {
    for (const [w, h] of [[170, 130], [260, 170], [340, 240], [440, 320], [680, 480], [1080, 1920]]) {
      const m = panel(w, h);
      // The reserved rows plus the button grid must not exceed the box.
      const used = m.pad * 2 + m.bh * m.rows + m.gap * (m.rows - 1) + (m.sliderH ? m.sliderH + m.gap : 0);
      expect(used).toBeLessThanOrEqual(h + 0.001);
      expect(m.pad * 2 + m.bw * m.cols + m.gap * (m.cols - 1)).toBeLessThanOrEqual(w + 0.001);
      // Words, when shown, fit the button they sit in.
      if (m.showWords) expect(m.icon + m.label + m.sub).toBeLessThan(m.bh);
    }
  });

  it('scales type with the box instead of authoring it at wall size', () => {
    expect(panel(440, 320).label).toBeLessThan(panel(680, 480).label);
    expect(panel(440, 320).pad).toBeLessThan(panel(680, 480).pad);
    expect(panel(440, 320).icon).toBeLessThan(panel(680, 480).icon);
  });

  it('reflows to one row when very wide and one column when very tall', () => {
    expect([panel(900, 190).cols, panel(900, 190).rows]).toEqual([4, 1]);
    expect([panel(210, 620).cols, panel(210, 620).rows]).toEqual([1, 4]);
    expect([panel(440, 320).cols, panel(440, 320).rows]).toEqual([2, 2]);
  });

  it('honours compact at any size', () => {
    const m = panel(340, 240, { compact: true });
    expect(m.showWords).toBe(false);
    // With no words the icon takes the space they would have used.
    expect(m.icon).toBeGreaterThan(panel(340, 240).icon);
    expect(panel(680, 480, { compact: true }).showWords).toBe(false);
  });

  it('reserves the picker row only when the picker is shown', () => {
    expect(panel(440, 320).pickerH).toBe(0);
    expect(panel(440, 320, { showPicker: true }).pickerH).toBeGreaterThan(0);
    expect(panel(440, 320, { showPicker: true }).bh).toBeLessThan(panel(440, 320).bh);
  });

  it('reserves the Brightness row for the pad layout and the slider for the panel', () => {
    const pad = controlMetrics({ w: 440, h: 320, layout: 'pad', compact: false, showPicker: false });
    expect(pad.sliderH).toBe(0);
    expect(pad.brightRowH).toBeGreaterThan(0);
    expect(panel(440, 320).sliderH).toBeGreaterThan(0);
    expect(panel(440, 320).brightRowH).toBe(0);
  });

  it('gives the bar layout five columns and drops words on a narrow strip', () => {
    const wide = controlMetrics({ w: 1024, h: 96, layout: 'bar', compact: false, showPicker: false });
    expect(wide.cols).toBe(5);
    expect(wide.showWords).toBe(true);
    const narrow = controlMetrics({ w: 340, h: 72, layout: 'bar', compact: false, showPicker: false });
    expect(narrow.showWords).toBe(false);
  });

  it('splits the nav layout along the box\'s long axis', () => {
    const wide = controlMetrics({ w: 520, h: 200, layout: 'nav', compact: false, showPicker: false });
    expect([wide.cols, wide.rows]).toEqual([2, 1]);
    expect(wide.showWords).toBe(true);
    const tall = controlMetrics({ w: 200, h: 420, layout: 'nav', compact: false, showPicker: false });
    expect([tall.cols, tall.rows]).toEqual([1, 2]);
  });

  it('carries no brightness or sub-label furniture in the nav layout', () => {
    const m = controlMetrics({ w: 520, h: 200, layout: 'nav', compact: false, showPicker: false });
    expect(m.sliderH).toBe(0);
    expect(m.brightRowH).toBe(0);
    expect(m.sub).toBe(0);
    expect(m.showSubs).toBe(false);
  });

  it('gives the nav layout a bigger arrow than the four-button grid at the same box', () => {
    // Two buttons instead of four, so each one is roughly twice the size.
    const nav = controlMetrics({ w: 440, h: 320, layout: 'nav', compact: false, showPicker: false });
    expect(nav.icon).toBeGreaterThan(panel(440, 320).icon);
  });

  it('assumes the authored box before the first measurement', () => {
    // jsdom (and the first render) report zero; the widget must not paint a
    // hairline version of itself for a frame.
    expect(panel(0, 0)).toEqual(panel(440, 320));
    const bar = controlMetrics({ w: 0, h: 0, layout: 'bar', compact: false, showPicker: false });
    expect(bar.showWords).toBe(true);
  });

  it('gives the bar popover its own legible metrics', () => {
    const m = popoverMetrics();
    expect(m.showCaption).toBe(true);
    expect(m.thumb).toBeGreaterThan(20);
  });
});
