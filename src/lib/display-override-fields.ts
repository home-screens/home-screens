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
 *
 * Adding a new override field is a two-step change: add it to
 * `DisplayNodeSettings` in `src/types/config.ts`, then add it to the
 * appropriate list here. The merge in `display-filter.ts` picks it up
 * automatically since it's a shallow `{ ...global, ...perDisplay }`.
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
  'cursorHideSeconds',
  'fullscreenTheme',
] as const satisfies readonly (keyof DisplayNodeSettings)[];

export const SLEEP_OVERRIDE_FIELDS = ['sleep', 'screensaver'] as const satisfies readonly (keyof DisplayNodeSettings)[];

export const ALERT_OVERRIDE_FIELDS = ['alerts'] as const satisfies readonly (keyof DisplayNodeSettings)[];

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
