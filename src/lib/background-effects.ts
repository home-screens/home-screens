import type { BackgroundEffects } from '@/types/config';

export const BACKGROUND_EFFECT_DEFAULTS: BackgroundEffects = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
};

export function normalizeBackgroundEffects(effects: Partial<BackgroundEffects> | undefined): BackgroundEffects {
  return {
    brightness: effects?.brightness ?? BACKGROUND_EFFECT_DEFAULTS.brightness,
    contrast: effects?.contrast ?? BACKGROUND_EFFECT_DEFAULTS.contrast,
    saturation: effects?.saturation ?? BACKGROUND_EFFECT_DEFAULTS.saturation,
    warmth: effects?.warmth ?? BACKGROUND_EFFECT_DEFAULTS.warmth,
  };
}

function warmthFilters(warmth: number): string[] {
  if (!Number.isFinite(warmth) || warmth === 0) return [];
  const amount = Math.min(100, Math.max(-100, warmth));
  const normalized = Math.abs(amount) / 100;
  const sepia = Number((normalized * 0.45).toFixed(3));
  const hueRotate = amount > 0
    ? Number((-18 * normalized).toFixed(2))
    : Number((18 * normalized).toFixed(2));
  const saturate = amount > 0
    ? Number((1 + normalized * 0.08).toFixed(3))
    : Number((1 - normalized * 0.06).toFixed(3));
  return [
    `sepia(${sepia})`,
    `hue-rotate(${hueRotate}deg)`,
    `saturate(${saturate})`,
  ];
}

export function buildBackgroundEffectsFilter(effects: BackgroundEffects | undefined): string | undefined {
  if (!effects) return undefined;
  const normalized = normalizeBackgroundEffects(effects);
  if (
    normalized.brightness === BACKGROUND_EFFECT_DEFAULTS.brightness
    && normalized.contrast === BACKGROUND_EFFECT_DEFAULTS.contrast
    && normalized.saturation === BACKGROUND_EFFECT_DEFAULTS.saturation
    && normalized.warmth === BACKGROUND_EFFECT_DEFAULTS.warmth
  ) return undefined;
  return [
    `brightness(${(normalized.brightness / 100).toFixed(2)})`,
    `contrast(${(normalized.contrast / 100).toFixed(2)})`,
    `saturate(${(normalized.saturation / 100).toFixed(2)})`,
    ...warmthFilters(normalized.warmth),
  ].join(' ');
}
