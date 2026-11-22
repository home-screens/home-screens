import type { DisplayNodeSettings } from '@/types/config';

/**
 * Single source of truth for the per-display-overridable field lists.
 *
 * Both the `Defaults → X` page (which feeds the list to
 * `findDisplaysOverridingFields` to render its backlink banner) and the
 * per-display drill-down page (which renders one `OverrideRow` per field)
 * import from here, so the two surfaces can never list a different set
 * of fields. A drift would manifest as either:
 *   - a backlink banner that says "Kitchen overrides 3 fields" but the
 *     drill-down shows only 2 of them, or
 *   - a drill-down that lets the user override a field that the banner
 *     never reports as overridden.
 *
 * The lists are split by which Defaults page owns each group:
 *   - `DISPLAY_OVERRIDE_FIELDS` → Defaults → Display
 *   - `SLEEP_OVERRIDE_FIELDS`   → Defaults → Sleep
 *   - `ALERT_OVERRIDE_FIELDS`   → Defaults → Alerts
 *   - `CALENDAR_OVERRIDE_FIELDS` → Defaults → Calendar
 *
 * Adding a new override field is a two-step change: add it to
 * `DisplayNodeSettings` in `src/types/config.ts`, then add it to the
 * appropriate list here. The compiler refuses the first step without the
 * second (see `DISPLAY_NODE_SETTINGS_KEYS`), and the merge in
 * `display-filter.ts` then picks it up.
 */

export const DISPLAY_OVERRIDE_FIELDS = [
  'rotationIntervalMs',
  'transitionEffect',
  'transitionDuration',
  'pauseEnabled',
  'pauseTimeoutSeconds',
  'swipeEnabled',
  'setupHintEnabled',
  'showRotationProgress',
  'showPaginationDots',
  'cursorHideSeconds',
  'pixelShift',
  'fullscreenTheme',
] as const satisfies readonly (keyof DisplayNodeSettings)[];

export const SLEEP_OVERRIDE_FIELDS = ['sleep', 'screensaver'] as const satisfies readonly (keyof DisplayNodeSettings)[];

export const ALERT_OVERRIDE_FIELDS = ['alerts'] as const satisfies readonly (keyof DisplayNodeSettings)[];

export const CALENDAR_OVERRIDE_FIELDS = ['calendarWallEntry'] as const satisfies readonly (keyof DisplayNodeSettings)[];

/**
 * Every key a display's `settings` may override, and so the only keys
 * `filterConfigForDisplay` lays over the shared settings. A key the type does
 * not declare, like a `timezone` left in a hand-edited or imported config,
 * never reaches the display: one household runs on one clock, and a stray
 * per-display zone would put that display's sleep and schedules on a clock
 * the editor and the hub never see.
 *
 * The dimension fields come first because they have no settings page of
 * their own; the display's size card writes them.
 */
export const DISPLAY_NODE_SETTINGS_KEYS = [
  'displayWidth',
  'displayHeight',
  'displayTransform',
  ...DISPLAY_OVERRIDE_FIELDS,
  ...SLEEP_OVERRIDE_FIELDS,
  ...ALERT_OVERRIDE_FIELDS,
  ...CALENDAR_OVERRIDE_FIELDS,
] as const satisfies readonly (keyof DisplayNodeSettings)[];

// A `DisplayNodeSettings` key missing from the list above fails to compile
// here, naming the key.
const everyDisplayNodeSettingsKey: Exclude<keyof DisplayNodeSettings, (typeof DISPLAY_NODE_SETTINGS_KEYS)[number]> extends never
  ? true
  : Exclude<keyof DisplayNodeSettings, (typeof DISPLAY_NODE_SETTINGS_KEYS)[number]> = true;
void everyDisplayNodeSettingsKey;

/**
 * Fields that one card forks and resets together, so they are one override
 * to the user. The sleep card writes `sleep` and `screensaver` in the same
 * click; counting them as two ("2 display overrides active", two chips)
 * makes the override model look untrustworthy. The first field of a unit
 * names it everywhere overrides are counted or listed.
 */
const OVERRIDE_UNITS: readonly (readonly (keyof DisplayNodeSettings)[])[] = [SLEEP_OVERRIDE_FIELDS];

/** The field that stands for `field` in override counts and lists (itself unless it belongs to a unit). */
export function overrideUnitOf(field: keyof DisplayNodeSettings): keyof DisplayNodeSettings {
  return OVERRIDE_UNITS.find((unit) => unit.includes(field))?.[0] ?? field;
}

type DisplayOverrideField = (typeof DISPLAY_OVERRIDE_FIELDS)[number];

/**
 * What each Defaults > Screen field is when nothing has been saved for it,
 * which is what the wall does with a missing value. The Defaults page, the
 * per-display override rows and the Overview chips all read it from here, so
 * they cannot name three different defaults for one field. A field missing
 * from this table fails to compile.
 */
export const DISPLAY_FIELD_FALLBACKS: { [K in DisplayOverrideField]: NonNullable<DisplayNodeSettings[K]> } = {
  rotationIntervalMs: 30_000,
  transitionEffect: 'fade',
  transitionDuration: 0.6,
  pauseEnabled: true,
  pauseTimeoutSeconds: 300,
  swipeEnabled: true,
  setupHintEnabled: true,
  showRotationProgress: true,
  showPaginationDots: true,
  cursorHideSeconds: 3,
  pixelShift: false,
  fullscreenTheme: 'linen',
};

/** The shared value for `key`, or its fallback when none was ever saved. */
export function resolveDisplayDefault<K extends DisplayOverrideField>(
  settings: Pick<DisplayNodeSettings, K>,
  key: K,
): NonNullable<DisplayNodeSettings[K]> {
  return (settings[key] ?? DISPLAY_FIELD_FALLBACKS[key]) as NonNullable<DisplayNodeSettings[K]>;
}

/** Seconds a display rotates at when rotation is switched back on. */
export const DEFAULT_ROTATION_SECONDS = DISPLAY_FIELD_FALLBACKS.rotationIntervalMs / 1000;

/**
 * Slider ranges for the fields edited with one, the same on the Defaults
 * page and on a display's own page. Rotation is edited in seconds and may
 * hold a longer saved value, so its slider stretches to fit what is saved.
 */
export const DISPLAY_FIELD_SLIDERS = {
  rotationSeconds: { min: 5, max: 600, step: 5 },
  pauseTimeoutSeconds: { min: 0, max: 600, step: 30 },
  transitionDuration: { min: 0.3, max: 2, step: 0.1 },
  cursorHideSeconds: { min: 1, max: 30, step: 1 },
} as const;
