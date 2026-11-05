import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_EFFECT_DEFAULTS,
  buildBackgroundEffectsFilter,
  normalizeBackgroundEffects,
  withBackgroundEffects,
} from '@/lib/background-effects';

describe('background effects', () => {
  it('treats the defaults, an empty set and no set as no filter', () => {
    expect(buildBackgroundEffectsFilter(BACKGROUND_EFFECT_DEFAULTS)).toBeUndefined();
    expect(buildBackgroundEffectsFilter({})).toBeUndefined();
    expect(buildBackgroundEffectsFilter(undefined)).toBeUndefined();
  });

  it('builds one CSS filter chain, with warmth as a tinted sepia', () => {
    expect(buildBackgroundEffectsFilter({ brightness: 120, contrast: 90, saturation: 130, warmth: 40 })).toBe(
      'brightness(1.20) contrast(0.90) saturate(1.30) sepia(0.18) hue-rotate(-7.2deg) saturate(1.032)',
    );
    expect(buildBackgroundEffectsFilter({ warmth: -50 })).toBe(
      'brightness(1.00) contrast(1.00) saturate(1.00) sepia(0.225) hue-rotate(9deg) saturate(0.97)',
    );
  });

  it('fills a missing field from its default and keeps a value inside its range', () => {
    expect(normalizeBackgroundEffects({ brightness: 110 })).toEqual({ brightness: 110, contrast: 100, saturation: 100, warmth: 0 });
    expect(normalizeBackgroundEffects({ brightness: 900, warmth: -400, contrast: Number.NaN })).toEqual({
      brightness: 200, contrast: 100, saturation: 100, warmth: -100,
    });
  });

  describe('withBackgroundEffects', () => {
    it('lands one changed field on the live set', () => {
      expect(withBackgroundEffects({ brightness: 120 }, { warmth: 30 })).toEqual({ brightness: 120, warmth: 30 });
    });

    it('drops a field put back at its default, and the whole set once nothing is left', () => {
      expect(withBackgroundEffects({ brightness: 120, warmth: 30 }, { warmth: 0 })).toEqual({ brightness: 120 });
      expect(withBackgroundEffects({ brightness: 120 }, { brightness: 100 })).toBeUndefined();
      expect(withBackgroundEffects(undefined, { contrast: 100 })).toBeUndefined();
    });

    it('starts a set from nothing', () => {
      expect(withBackgroundEffects(undefined, { saturation: 80 })).toEqual({ saturation: 80 });
    });
  });
});
