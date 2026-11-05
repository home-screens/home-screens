import type { BackgroundEffects } from '@/types/config';

/** The value of each field that leaves the picture as it is. */
export const BACKGROUND_EFFECT_DEFAULTS: Required<BackgroundEffects> = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
};

export const BACKGROUND_EFFECT_FIELDS = ['brightness', 'contrast', 'saturation', 'warmth'] as const;

const RANGE: Record<keyof BackgroundEffects, [number, number]> = {
  brightness: [0, 200],
  contrast: [0, 200],
  saturation: [0, 200],
  warmth: [-100, 100],
};

function settled(field: keyof BackgroundEffects, value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return BACKGROUND_EFFECT_DEFAULTS[field];
  const [min, max] = RANGE[field];
  return Math.min(max, Math.max(min, value));
}

/** Every field, with a missing or unusable one at its default. */
export function normalizeBackgroundEffects(effects: BackgroundEffects | undefined): Required<BackgroundEffects> {
  return {
    brightness: settled('brightness', effects?.brightness),
    contrast: settled('contrast', effects?.contrast),
    saturation: settled('saturation', effects?.saturation),
    warmth: settled('warmth', effects?.warmth),
  };
}

/**
 * What an edit does to a screen's effects: the changed fields land on the
 * live set, a field back at its default is dropped, and a set with nothing
 * left in it is removed altogether, so a screen nobody has adjusted carries
 * no `effects` at all.
 */
export function withBackgroundEffects(
  current: BackgroundEffects | undefined,
  updates: Partial<BackgroundEffects>,
): BackgroundEffects | undefined {
  const merged = normalizeBackgroundEffects({ ...current, ...updates });
  const next: BackgroundEffects = {};
  for (const field of BACKGROUND_EFFECT_FIELDS) {
    if (merged[field] !== BACKGROUND_EFFECT_DEFAULTS[field]) next[field] = merged[field];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Warmth has no CSS filter of its own. A warm tint is a touch of sepia pulled
 * toward orange with a small hue rotation; a cool tint is the same sepia
 * pushed the other way. Saturation is nudged so the tint does not read as a
 * fade.
 */
function warmthFilters(warmth: number): string[] {
  if (warmth === 0) return [];
  const amount = Math.abs(warmth) / 100;
  const sepia = Number((amount * 0.45).toFixed(3));
  const hueRotate = Number(((warmth > 0 ? -18 : 18) * amount).toFixed(2));
  const saturate = Number((warmth > 0 ? 1 + amount * 0.08 : 1 - amount * 0.06).toFixed(3));
  return [`sepia(${sepia})`, `hue-rotate(${hueRotate}deg)`, `saturate(${saturate})`];
}

/** The CSS `filter` for a screen's effects, or nothing when every field is at its default. */
export function buildBackgroundEffectsFilter(effects: BackgroundEffects | undefined): string | undefined {
  if (!effects) return undefined;
  const normalized = normalizeBackgroundEffects(effects);
  if (BACKGROUND_EFFECT_FIELDS.every((field) => normalized[field] === BACKGROUND_EFFECT_DEFAULTS[field])) return undefined;
  return [
    `brightness(${(normalized.brightness / 100).toFixed(2)})`,
    `contrast(${(normalized.contrast / 100).toFixed(2)})`,
    `saturate(${(normalized.saturation / 100).toFixed(2)})`,
    ...warmthFilters(normalized.warmth),
  ].join(' ');
}
