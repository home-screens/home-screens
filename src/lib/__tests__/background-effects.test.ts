import { describe, expect, it } from 'vitest';
import { BACKGROUND_EFFECT_DEFAULTS, buildBackgroundEffectsFilter, normalizeBackgroundEffects } from '@/lib/background-effects';

describe('background effects helpers', () => {
  it('treats the neutral defaults as no filter', () => {
    expect(buildBackgroundEffectsFilter(BACKGROUND_EFFECT_DEFAULTS)).toBeUndefined();
    expect(buildBackgroundEffectsFilter(undefined)).toBeUndefined();
  });

  it('builds a CSS filter chain from primitives and warmth approximation', () => {
    expect(buildBackgroundEffectsFilter({ brightness: 120, contrast: 90, saturation: 130, warmth: 40 })).toBe(
      'brightness(1.20) contrast(0.90) saturate(1.30) sepia(0.18) hue-rotate(-7.2deg) saturate(1.032)'
    );
  });

  it('fills missing fields from defaults', () => {
    expect(normalizeBackgroundEffects({ brightness: 110 } as never)).toEqual({
      brightness: 110,
      contrast: 100,
      saturation: 100,
      warmth: 0,
    });
  });
});
