import { describe, it, expect } from 'vitest';
import { buildModuleShadow, colorWithAlpha, resolveTextScale, resolveModuleStyle, displayTextPercent, moduleBaseFontSize } from '../module-style';
import { DEFAULT_MODULE_STYLE } from '@/types/config';

describe('buildModuleShadow', () => {
  it('returns "none" when shadowSize is 0', () => {
    expect(buildModuleShadow(0)).toBe('none');
  });

  it('returns "none" when shadowSize is negative', () => {
    expect(buildModuleShadow(-5)).toBe('none');
  });

  it('produces three shadow layers for positive shadowSize', () => {
    const result = buildModuleShadow(10);
    // Contains inset highlight, drop shadow, and ambient glow
    expect(result).toContain('inset');
    expect(result).toContain('rgba(0, 0, 0, 0.8)');
    expect(result).toContain('rgba(255, 255, 255, 0.04)');
    expect(result).toContain('rgba(255, 255, 255, 0.12)');
  });

  it('computes correct values for shadowSize=10, scale=1', () => {
    const result = buildModuleShadow(10);
    // offset = round(10/2 * 1) = 5
    // blur = 10 * 1 = 10
    // ambient = round(10/2 * 1) = 5
    expect(result).toBe(
      'inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 5px 10px rgba(0, 0, 0, 0.8), 0 0 5px rgba(255, 255, 255, 0.04)',
    );
  });

  it('applies scale factor to offset, blur, and ambient', () => {
    const result = buildModuleShadow(10, 2);
    // offset = round(10/2 * 2) = 10
    // blur = 10 * 2 = 20
    // ambient = round(10/2 * 2) = 10
    expect(result).toBe(
      'inset 0 2px 0 rgba(255, 255, 255, 0.12), 0 10px 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 255, 255, 0.04)',
    );
  });

  it('defaults scale to 1 when omitted', () => {
    expect(buildModuleShadow(4)).toBe(buildModuleShadow(4, 1));
  });

  it('handles fractional shadowSize with rounding', () => {
    const result = buildModuleShadow(7);
    // offset = round(7/2 * 1) = round(3.5) = 4
    // blur = 7
    // ambient = round(3.5) = 4
    expect(result).toContain('4px 7px');
    expect(result).toContain('0 0 4px');
  });
});

describe('colorWithAlpha', () => {
  it('converts 6-digit hex to rgba', () => {
    expect(colorWithAlpha('#3f3f3f', 0.7)).toBe('rgba(63, 63, 63, 0.7)');
  });

  it('converts 3-digit hex to rgba', () => {
    expect(colorWithAlpha('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
  });

  it('multiplies existing rgba alpha', () => {
    expect(colorWithAlpha('rgba(0, 0, 0, 0.4)', 0.5)).toBe('rgba(0, 0, 0, 0.2)');
  });

  it('preserves rgba alpha when opacity is 1', () => {
    expect(colorWithAlpha('rgba(0, 0, 0, 0.4)', 1)).toBe('rgba(0, 0, 0, 0.4)');
  });

  it('converts rgb to rgba', () => {
    expect(colorWithAlpha('rgb(100, 200, 50)', 0.8)).toBe('rgba(100, 200, 50, 0.8)');
  });

  it('falls back to color-mix for colors it cannot parse, so alpha still applies', () => {
    expect(colorWithAlpha('red', 0.5)).toBe('color-mix(in srgb, red 50%, transparent)');
    expect(colorWithAlpha('hsl(50 90% 60%)', 0.85)).toBe('color-mix(in srgb, hsl(50 90% 60%) 85%, transparent)');
  });
});

describe('resolveTextScale', () => {
  it('reads the percent as a factor and treats absent as 100', () => {
    expect(resolveTextScale({})).toBe(1);
    expect(resolveTextScale({ textScale: 100 })).toBe(1);
    expect(resolveTextScale({ textScale: 150 })).toBe(1.5);
    expect(resolveTextScale({ textScale: 50 })).toBe(0.5);
  });

  it('clamps a hand-edited value to the slider range and ignores nonsense', () => {
    expect(resolveTextScale({ textScale: 900 })).toBe(4.5);
    expect(resolveTextScale({ textScale: 0 })).toBe(0.1);
    expect(resolveTextScale({ textScale: Number.NaN })).toBe(1);
    expect(resolveTextScale({ textScale: undefined })).toBe(1);
  });
});

describe('the one Text size control', () => {
  const base16 = {};
  const base26 = { defaultStyle: { fontSize: 26 } };
  const fitting = { autoSizesText: true };

  it('is 100% of the registry default, which is 16 unless the module says otherwise', () => {
    expect(moduleBaseFontSize(undefined)).toBe(16);
    expect(moduleBaseFontSize(base16)).toBe(16);
    expect(moduleBaseFontSize(base26)).toBe(26);
    expect(moduleBaseFontSize({ defaultStyle: { fontSize: 0 } })).toBe(16);
  });

  it('reads an untouched pixel value as a percent of the base, and renders it unchanged', () => {
    const style = { ...DEFAULT_MODULE_STYLE, fontSize: 34 };
    expect(displayTextPercent(style, base16)).toBe(213);
    // No textScale: the pixel value keeps its meaning, so the wall is untouched.
    expect(resolveModuleStyle(style, base16)).toBe(style);
    expect(displayTextPercent({ ...DEFAULT_MODULE_STYLE, fontSize: 26 }, base26)).toBe(100);
  });

  it('renders base times percent once textScale is set', () => {
    const style = { ...DEFAULT_MODULE_STYLE, fontSize: 16, textScale: 150 };
    expect(resolveModuleStyle(style, base16).fontSize).toBe(24);
    expect(resolveModuleStyle({ ...style, fontSize: 26 }, base26).fontSize).toBe(39);
    expect(displayTextPercent(style, base16)).toBe(150);
  });

  it('leaves a fitting module alone, whose hook applies the percent to the fit', () => {
    const style = { ...DEFAULT_MODULE_STYLE, fontSize: 16, textScale: 300 };
    expect(resolveModuleStyle(style, fitting)).toBe(style);
    expect(displayTextPercent(style, fitting, 40)).toBe(300);
  });

  it('reads an old pixel floor on a fitting module as a percent of the fit', () => {
    // 35px stored on a card that fits 18px: the floor was what showed.
    expect(displayTextPercent({ ...DEFAULT_MODULE_STYLE, fontSize: 35 }, fitting, 18)).toBe(194);
    // 31px stored on a card that fits 34px: the floor never showed.
    expect(displayTextPercent({ ...DEFAULT_MODULE_STYLE, fontSize: 31 }, fitting, 34)).toBe(100);
    // Fit not known yet: the fit is what it shows.
    expect(displayTextPercent({ ...DEFAULT_MODULE_STYLE, fontSize: 31 }, fitting)).toBe(100);
  });

  it('keeps the slider inside its range whatever the file holds', () => {
    expect(displayTextPercent({ ...DEFAULT_MODULE_STYLE, fontSize: 1 }, base16)).toBe(10);
    expect(displayTextPercent({ ...DEFAULT_MODULE_STYLE, fontSize: 200 }, base16)).toBe(450);
    expect(displayTextPercent({ ...DEFAULT_MODULE_STYLE, textScale: Number.NaN, fontSize: 16 }, base16)).toBe(100);
  });
});
