import { describe, it, expect } from 'vitest';
import {
  parseHexToRgb,
  parseCssColorToRgb,
  parseCssColorAlpha,
  parseEditableColor,
  withCssColorAlpha,
  withAlpha,
} from '@/lib/hex-color';

describe('parseHexToRgb', () => {
  it('reads 3-, 6- and 8-digit hex', () => {
    expect(parseHexToRgb('#f00')).toEqual([255, 0, 0]);
    expect(parseHexToRgb('#ff8800')).toEqual([255, 136, 0]);
    expect(parseHexToRgb('#ff880066')).toEqual([255, 136, 0]);
  });

  it('refuses anything else', () => {
    expect(parseHexToRgb('rebeccapurple')).toBeNull();
    expect(parseHexToRgb('#ff88')).toBeNull();
  });
});

describe('parseCssColorToRgb', () => {
  it('reads the functional notations too', () => {
    expect(parseCssColorToRgb('rgb(1, 2, 3)')).toEqual([1, 2, 3]);
    expect(parseCssColorToRgb('rgba(0, 0, 0, 0.4)')).toEqual([0, 0, 0]);
    expect(parseCssColorToRgb('rgb(37 99 235)')).toEqual([37, 99, 235]);
    expect(parseCssColorToRgb('  #abc  ')).toEqual([170, 187, 204]);
  });

  it('refuses notations the renderers cannot reason about', () => {
    expect(parseCssColorToRgb('hsl(200 50% 50%)')).toBeNull();
    expect(parseCssColorToRgb(undefined)).toBeNull();
  });
});

describe('parseCssColorAlpha', () => {
  it('reads the alpha an rgba() carries', () => {
    expect(parseCssColorAlpha('rgba(0, 0, 0, 0.4)')).toBe(0.4);
    expect(parseCssColorAlpha('rgba(0,0,0,.25)')).toBe(0.25);
    expect(parseCssColorAlpha('rgba(0, 0, 0, 1)')).toBe(1);
  });

  it('reads the alpha an 8-digit hex carries', () => {
    expect(parseCssColorAlpha('#000000ff')).toBe(1);
    expect(parseCssColorAlpha('#00000000')).toBe(0);
    expect(parseCssColorAlpha('#00000080')).toBeCloseTo(0.5, 2);
  });

  it('treats a colour with no alpha as fully opaque', () => {
    expect(parseCssColorAlpha('#112233')).toBe(1);
    expect(parseCssColorAlpha('rgb(1, 2, 3)')).toBe(1);
  });

  /* Nine modules ship `backgroundColor: 'transparent'`, so the colour controls
   * meet it constantly; CSS says it is rgba(0, 0, 0, 0). */
  it('reads transparent as fully see-through', () => {
    expect(parseCssColorAlpha('transparent')).toBe(0);
    expect(parseCssColorAlpha('  TRANSPARENT ')).toBe(0);
  });

  it('refuses a colour it cannot parse', () => {
    expect(parseCssColorAlpha('rebeccapurple')).toBeNull();
    expect(parseCssColorAlpha(undefined)).toBeNull();
  });
});

describe('parseEditableColor', () => {
  it('splits a colour into channels and alpha', () => {
    expect(parseEditableColor('#112233')).toEqual({ rgb: [17, 34, 51], alpha: 1 });
    expect(parseEditableColor('rgba(0, 0, 0, 0.4)')).toEqual({ rgb: [0, 0, 0], alpha: 0.4 });
  });

  /* The swatch drew white for a transparent background, so a module whose
   * default is transparent looked like a white card in the picker. */
  it('gives transparent black channels to edit from', () => {
    expect(parseEditableColor('transparent')).toEqual({ rgb: [0, 0, 0], alpha: 0 });
  });

  it('refuses a colour it cannot parse', () => {
    expect(parseEditableColor('rebeccapurple')).toBeNull();
    expect(parseEditableColor(undefined)).toBeNull();
  });
});

describe('withCssColorAlpha', () => {
  /* Fully opaque stays the tidy hex people recognize; anything else has to be
   * rgba(), which is the notation every renderer downstream can read. */
  it('writes a plain hex at full opacity', () => {
    expect(withCssColorAlpha('#112233', 1)).toBe('#112233');
    expect(withCssColorAlpha('rgba(17, 34, 51, 0.4)', 1)).toBe('#112233');
  });

  it('writes rgba() below full opacity', () => {
    expect(withCssColorAlpha('#000000', 0.4)).toBe('rgba(0, 0, 0, 0.4)');
    expect(withCssColorAlpha('rgb(255, 136, 0)', 0)).toBe('rgba(255, 136, 0, 0)');
  });

  it('rounds to two decimals rather than storing slider noise', () => {
    expect(withCssColorAlpha('#000000', 0.3333333)).toBe('rgba(0, 0, 0, 0.33)');
  });

  it('clamps out-of-range alpha', () => {
    expect(withCssColorAlpha('#000000', 2)).toBe('#000000');
    expect(withCssColorAlpha('#000000', -1)).toBe('rgba(0, 0, 0, 0)');
  });

  /* Turning a transparent background up has to give it a colour to be; CSS
   * transparent is black at zero alpha, so that is the one it already was. */
  it('turns transparent up into black', () => {
    expect(withCssColorAlpha('transparent', 0.4)).toBe('rgba(0, 0, 0, 0.4)');
    expect(withCssColorAlpha('transparent', 1)).toBe('#000000');
    expect(withCssColorAlpha('transparent', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  it('refuses a colour it cannot parse', () => {
    expect(withCssColorAlpha('rebeccapurple', 0.5)).toBeNull();
  });
});

describe('withAlpha', () => {
  it('turns hex into rgba at the alpha', () => {
    expect(withAlpha('#3f3f3f', 0.7)).toBe('rgba(63, 63, 63, 0.7)');
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(withAlpha('#3B82F6', 0.2)).toBe('rgba(59, 130, 246, 0.2)');
  });

  it('turns a typed rgb() accent into rgba, which the old hex-suffix idiom could not', () => {
    expect(withAlpha('rgb(255, 0, 0)', 0.2)).toBe('rgba(255, 0, 0, 0.2)');
    expect(withAlpha('rgb(100, 200, 50)', 0.8)).toBe('rgba(100, 200, 50, 0.8)');
    expect(withAlpha('rgb(37 99 235)', 0.25)).toBe('rgba(37, 99, 235, 0.25)');
  });

  it('multiplies the alpha an rgba() or 8-digit hex already carries', () => {
    expect(withAlpha('rgba(0, 0, 0, 0.4)', 0.5)).toBe('rgba(0, 0, 0, 0.2)');
    expect(withAlpha('rgba(0, 0, 0, 0.4)', 1)).toBe('rgba(0, 0, 0, 0.4)');
    expect(withAlpha('#00000080', 0.5)).toBe('rgba(0, 0, 0, 0.251)');
  });

  it('falls back to color-mix for colours it cannot parse, so the alpha still applies', () => {
    expect(withAlpha('red', 0.5)).toBe('color-mix(in srgb, red 50%, transparent)');
    expect(withAlpha('hsl(50 90% 60%)', 0.85)).toBe('color-mix(in srgb, hsl(50 90% 60%) 85%, transparent)');
    expect(withAlpha('var(--accent)', 0.125)).toBe('color-mix(in srgb, var(--accent) 12.5%, transparent)');
  });

  it('clamps the alpha and keeps the number short', () => {
    expect(withAlpha('#000000', 2)).toBe('rgba(0, 0, 0, 1)');
    expect(withAlpha('#000000', -1)).toBe('rgba(0, 0, 0, 0)');
    expect(withAlpha('#000000', 0.1 + 0.2)).toBe('rgba(0, 0, 0, 0.3)');
  });
});
