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

/** Which particle effect, if any, a condition implies. */
export function particleKind(condition: SkyCondition): 'rain' | 'snow' | null {
  if (condition === 'rain' || condition === 'storm') return 'rain';
  if (condition === 'snow') return 'snow';
  return null;
}
