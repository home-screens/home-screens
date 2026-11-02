import { describe, it, expect } from 'vitest';
import { dayGridFontSize } from '../day-grid-type';
import { getDensityMultiplier, getTypoMultiplier } from '../fullscreen-themes';

/** A full-screen Month grid of `weeks` rows on a `w` x `h` wall, as the view measures its cells. */
function month(w: number, h: number, typography: string, weeks = 5, density = 'cozy') {
  const bu = Math.min(w, h) / 100;
  const textScale = getTypoMultiplier(typography) * getDensityMultiplier(density);
  return dayGridFontSize({ width: w / 7, height: (h - bu * 7) / weeks, textScale, settingFont: bu * textScale });
}

/** Event names are drawn at 0.55 of the grid's type. */
const name = (font: number) => font * 0.55;

describe('dayGridFontSize', () => {
  it('draws event names readably at Medium on a portrait and a landscape wall', () => {
    // Before: 10.8 * 1.2 * 0.55 = about 7 px on both.
    expect(name(month(1080, 1920, 'medium'))).toBeGreaterThanOrEqual(14);
    expect(name(month(1920, 1080, 'medium'))).toBeGreaterThanOrEqual(14);
    expect(name(month(1920, 1080, 'medium', 6))).toBeGreaterThanOrEqual(13);
  });

  it('still grows with the text size, a step at a time', () => {
    const steps = ['small', 'medium', 'large', 'extra-large', '2x-large'].map((s) => month(1080, 1920, s));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });

  it('keeps 4X Large inside the cell: a quarter of its width, a fifth of its height', () => {
    const portrait = month(1080, 1920, '4x-large');
    expect(portrait).toBeLessThanOrEqual(1080 / 7 / 4);
    const landscape = month(1920, 1080, '4x-large', 6);
    expect(landscape).toBeLessThanOrEqual((1080 - 10.8 * 7) / 6 / 5);
  });

  it('never draws smaller than the text setting alone did', () => {
    // A small module whose cells are tiny keeps its old size.
    const bu = 3;
    expect(dayGridFontSize({ width: 40, height: 30, textScale: 2, settingFont: bu * 2 })).toBe(6);
    expect(month(1080, 1920, '4x-large')).toBeGreaterThanOrEqual(10.8 * 2.15 * 1.2);
  });

  it('falls back to the text setting before the cell has a size', () => {
    expect(dayGridFontSize({ width: 0, height: 0, textScale: 1, settingFont: 10.8 })).toBe(10.8);
  });
});
