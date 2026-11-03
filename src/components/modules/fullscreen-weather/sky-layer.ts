/**
 * Condition + sun-elevation reactive background wash.
 *
 * The sky is painted *behind* every card, never on one, so it can never move
 * text contrast. That separation is what lets one design ship six looks: the
 * fullscreen theme owns structure (surfaces, borders, text), the sky owns mood.
 *
 * Light and dark theme groups get different gradient sets — a wash that reads
 * as "overcast" on Linen reads as mud on Midnight.
 */

export type SkyCondition = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'night';

/**
 * The daytime sky family for each normalised weather icon id.
 *
 * An explicit map over the closed `WeatherIconId` vocabulary rather than
 * substring matching: 'cloud-hail' contains neither "rain" nor "storm", so a
 * substring matcher silently files hail under "cloudy".
 */
const ICON_SKY: Record<string, SkyCondition> = {
  'sun': 'clear',
  'moon': 'clear',
  'cloud': 'cloudy',
  'cloud-sun': 'cloudy',
  'cloud-moon': 'cloudy',
  'cloud-fog': 'cloudy',
  'cloud-rain': 'rain',
  'cloud-drizzle': 'rain',
  'cloud-snow': 'snow',
  'snowflake': 'snow',
  'cloud-lightning': 'storm',
  'cloud-hail': 'storm',
  'thermometer': 'clear', // the provider fallback icon
};

/**
 * Resolve a sky family from an icon id and daylight state.
 *
 * Precipitation outranks night — rain at 2am should still read as rain — but
 * night outranks clear and cloudy, because an overcast night still looks like
 * night on a wall display.
 */
export function resolveSkyCondition(iconId: string | undefined, isNight: boolean): SkyCondition {
  const base = ICON_SKY[iconId ?? ''] ?? 'clear';
  if (base === 'rain' || base === 'snow' || base === 'storm') return base;
  return isNight ? 'night' : base;
}

const GRADIENTS: Record<SkyCondition, { light: string; dark: string }> = {
  clear: {
    light:
      'radial-gradient(150% 62% at 82% -6%, rgba(251,191,36,.42), transparent 60%),' +
      'radial-gradient(150% 88% at 6% 4%, rgba(56,189,248,.34), transparent 62%),' +
      'linear-gradient(180deg, rgba(186,230,253,.30), transparent 46%)',
    dark:
      'radial-gradient(150% 60% at 82% -8%, rgba(245,158,11,.30), transparent 58%),' +
      'radial-gradient(150% 90% at 4% 2%, rgba(14,165,233,.22), transparent 62%)',
  },
  cloudy: {
    light:
      'radial-gradient(160% 70% at 50% -10%, rgba(148,163,184,.40), transparent 62%),' +
      'linear-gradient(180deg, rgba(203,213,225,.34), transparent 40%)',
    dark: 'radial-gradient(160% 70% at 50% -10%, rgba(100,116,139,.30), transparent 62%)',
  },
  rain: {
    light:
      'radial-gradient(160% 72% at 30% -8%, rgba(56,189,248,.34), transparent 62%),' +
      'radial-gradient(140% 60% at 88% 4%, rgba(71,85,105,.30), transparent 58%),' +
      'linear-gradient(180deg, rgba(148,163,184,.30), transparent 44%)',
    dark:
      'radial-gradient(160% 72% at 30% -8%, rgba(14,116,144,.34), transparent 62%),' +
      'radial-gradient(140% 60% at 88% 2%, rgba(51,65,85,.40), transparent 58%)',
  },
  storm: {
    light:
      'radial-gradient(140% 60% at 74% -8%, rgba(167,139,250,.44), transparent 56%),' +
      'radial-gradient(160% 76% at 16% 6%, rgba(51,65,85,.40), transparent 60%),' +
      'linear-gradient(180deg, rgba(100,116,139,.34), transparent 46%)',
    dark:
      'radial-gradient(140% 58% at 74% -8%, rgba(139,92,246,.42), transparent 56%),' +
      'radial-gradient(160% 80% at 12% 4%, rgba(30,41,59,.70), transparent 62%)',
  },
  snow: {
    light:
      'radial-gradient(160% 74% at 50% -12%, rgba(191,219,254,.60), transparent 64%),' +
      'linear-gradient(180deg, rgba(226,232,240,.44), transparent 46%)',
    dark:
      'radial-gradient(160% 74% at 50% -12%, rgba(96,165,250,.26), transparent 62%),' +
      'linear-gradient(180deg, rgba(148,163,184,.16), transparent 44%)',
  },
  night: {
    light:
      'radial-gradient(150% 70% at 78% -8%, rgba(129,140,248,.38), transparent 60%),' +
      'radial-gradient(150% 84% at 8% 6%, rgba(30,58,138,.28), transparent 62%),' +
      'linear-gradient(180deg, rgba(99,102,241,.20), transparent 46%)',
    dark:
      'radial-gradient(150% 70% at 78% -8%, rgba(79,70,229,.38), transparent 58%),' +
      'radial-gradient(150% 86% at 6% 4%, rgba(30,27,75,.75), transparent 64%)',
  },
};

/** Per-theme-group wash strength. Dark themes carry the glow at full weight. */
export function skyBackground(condition: SkyCondition, isDark: boolean): string {
  return GRADIENTS[condition][isDark ? 'dark' : 'light'];
}

/** Accent colour the hero art and now-markers pick up, per condition. */
export const SKY_ACCENT: Record<SkyCondition, string> = {
  clear: '#f59e0b',
  cloudy: '#94a3b8',
  rain: '#38bdf8',
  storm: '#a78bfa',
  snow: '#bfdbfe',
  night: '#818cf8',
};


// ── Living sky ─────────────────────────────────────────────────────────────

/** Where the sun is: high, within a few degrees of the horizon, or below it. */
export type SunPhase = 'day' | 'golden' | 'night';

/**
 * The sun's phase from its altitude above the horizon in degrees. Golden hour
 * runs from 6° above the horizon down to the end of civil twilight, so dawn
 * and dusk both get the warm sky and a wall never jumps from full day to
 * full night in one step.
 */
export function sunPhase(altitudeDeg: number | null): SunPhase {
  if (altitudeDeg == null) return 'day';
  if (altitudeDeg > 6) return 'day';
  if (altitudeDeg > -6) return 'golden';
  return 'night';
}

/** The sky's cloud palette: the light and shade colours the sprites are tinted between. */
export type CloudPalette = 'day' | 'golden' | 'night' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';

/** The base gradient behind every layer. */
export type SkyBase = 'day' | 'golden' | 'night' | 'cloudy' | 'cloudy-night' | 'fog' | 'fog-night' | 'rain' | 'storm' | 'snow';

/**
 * What a living sky is made of. Every layer here is a CSS element moved by
 * transform or opacity only; the renderer (`LivingSky`) draws from this and
 * nothing else, so a scene is a plain object a test can assert on.
 */
export interface SkyScene {
  /** Stable name, for `data-scene` and tests. */
  key: string;
  base: SkyBase;
  palette: CloudPalette;
  /** Opacity per cloud sprite layer; `veil` is the thin stratus of a night sky. */
  clouds: Partial<Record<'far' | 'mid' | 'near' | 'veil', number>>;
  /** A flat sheet of cloud across the top, for overcast and precipitation. */
  deck: boolean;
  stars: boolean;
  moon: boolean;
  sun: 'high' | 'low' | null;
  /** Fog wisps and ground haze. */
  mist: boolean;
  rain: boolean;
  lightning: boolean;
  snow: boolean;
}

const NO_CLOUDS = {} as const;

/**
 * Pick the scene for an icon and a sun phase.
 *
 * Precipitation and fog outrank the sun: rain at 2am is rain. Clear and
 * cloudy skies follow the sun, so the same partly-cloudy day looks different
 * at noon, at dusk and at midnight.
 */
export function skyScene(iconId: string | undefined, phase: SunPhase): SkyScene {
  const icon = iconId ?? 'sun';
  const night = phase === 'night';
  const common = { deck: false, stars: false, moon: false, sun: null, mist: false, rain: false, lightning: false, snow: false } as const;

  if (icon === 'cloud-lightning' || icon === 'cloud-hail') {
    return { ...common, key: 'storm', base: 'storm', palette: 'storm', clouds: { far: .85, mid: .95, near: 1 }, deck: true, rain: true, lightning: true };
  }
  if (icon === 'cloud-rain' || icon === 'cloud-drizzle') {
    return { ...common, key: 'rain', base: 'rain', palette: 'rain', clouds: { far: .85, mid: .95, near: 1 }, deck: true, rain: true };
  }
  if (icon === 'cloud-snow' || icon === 'snowflake') {
    return { ...common, key: 'snow', base: 'snow', palette: 'snow', clouds: { far: .85, mid: .95 }, deck: true, snow: true };
  }
  if (icon === 'cloud-fog') {
    return night
      ? { ...common, key: 'fog-night', base: 'fog-night', palette: 'fog', clouds: NO_CLOUDS, mist: true, stars: false }
      : { ...common, key: 'fog', base: 'fog', palette: 'fog', clouds: NO_CLOUDS, mist: true };
  }
  if (icon === 'cloud') {
    return night
      ? { ...common, key: 'overcast-night', base: 'cloudy-night', palette: 'night', clouds: { veil: .95, far: .5, mid: .55 }, deck: true }
      : { ...common, key: 'overcast', base: 'cloudy', palette: 'cloudy', clouds: { far: .85, mid: .95, near: 1 }, deck: true };
  }
  if (icon === 'cloud-sun' || icon === 'cloud-moon') {
    // Night clouds are veils, not cumulus: thin streaks the moon and stars show through.
    if (night) return { ...common, key: 'partly-night', base: 'night', palette: 'night', clouds: { veil: .9, far: .22 }, stars: true, moon: true };
    if (phase === 'golden') return { ...common, key: 'partly-golden', base: 'golden', palette: 'golden', clouds: { far: .85, mid: .95, near: 1 }, sun: 'low' };
    return { ...common, key: 'partly-day', base: 'day', palette: 'day', clouds: { far: .85, mid: .95, near: 1 }, sun: 'high' };
  }
  // sun, moon, thermometer (the provider fallback) and anything unknown: clear.
  if (night) return { ...common, key: 'clear-night', base: 'night', palette: 'night', clouds: { veil: .28 }, stars: true, moon: true };
  if (phase === 'golden') return { ...common, key: 'golden', base: 'golden', palette: 'golden', clouds: { far: .85, mid: .7 }, sun: 'low' };
  return { ...common, key: 'clear-day', base: 'day', palette: 'day', clouds: { far: .35 }, sun: 'high' };
}

/** The base gradient of each sky, top to bottom. */
export const SKY_BASES: Record<SkyBase, string> = {
  day: 'linear-gradient(180deg, #1e5aa8 0%, #4a8dd4 48%, #8cbfea 100%)',
  golden: 'linear-gradient(180deg, #27336b 0%, #7c4b7a 35%, #d2745f 68%, #f2b36a 100%)',
  night: 'linear-gradient(180deg, #151833 0%, #232849 55%, #353a60 100%)',
  cloudy: 'linear-gradient(180deg, #343c4a 0%, #5f6a7c 50%, #8a94a6 100%)',
  'cloudy-night': 'linear-gradient(180deg, #111426 0%, #1e2340 55%, #2b3052 100%)',
  fog: 'linear-gradient(180deg, #5f6878 0%, #7f8897 50%, #9aa3b1 100%)',
  'fog-night': 'linear-gradient(180deg, #1a1e2c 0%, #2c3242 50%, #3d4456 100%)',
  rain: 'linear-gradient(180deg, #1b2330 0%, #2e3a4c 55%, #43506a 100%)',
  storm: 'linear-gradient(180deg, #0c0f1f 0%, #22263f 55%, #3a3f66 100%)',
  snow: 'linear-gradient(180deg, #45546f 0%, #7b89a4 50%, #b4bfd3 100%)',
};

/** Light and shade colours the grey cloud sprites are tinted between, per palette. */
export const CLOUD_PALETTES: Record<CloudPalette, { light: [number, number, number]; shade: [number, number, number] }> = {
  day: { light: [255, 255, 255], shade: [150, 168, 200] },
  golden: { light: [255, 236, 218], shade: [186, 112, 136] },
  night: { light: [104, 112, 158], shade: [24, 27, 58] },
  cloudy: { light: [222, 227, 236], shade: [78, 88, 108] },
  rain: { light: [130, 140, 162], shade: [38, 44, 62] },
  storm: { light: [98, 104, 130], shade: [20, 23, 42] },
  snow: { light: [246, 248, 252], shade: [136, 148, 172] },
  fog: { light: [220, 224, 232], shade: [140, 148, 164] },
};
