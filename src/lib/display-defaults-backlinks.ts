import type { DisplayNodeSettings, ScreenConfiguration } from '@/types/config';

/**
 * Summary of which fields a single display overrides relative to the
 * shared Defaults page being viewed. Used to render the bidirectional
 * backlink banner on each Defaults source-of-truth page:
 *
 *     "Kitchen overrides 3 fields on this page → Open Kitchen"
 *
 * The banner is half of the Phase 4 "no more one-way lookups" guarantee:
 * from any per-display field you can jump to its Defaults page, and from
 * any Defaults page you can see which displays currently override its
 * fields and jump straight to them.
 */
export interface DisplayOverrideSummary {
  displayId: string;
  displayName: string;
  /** The subset of `fields` actually present on this display's overrides. */
  overriddenFields: (keyof DisplayNodeSettings)[];
}

/**
 * Scan `config.displays` and return one summary per display that overrides
 * any of the requested `fields`. Displays that don't override any of them
 * are filtered out entirely so the banner can render without an `if (n>0)`
 * dance at the call site.
 *
 * Detection is shallow: a key being PRESENT in `display.settings` counts
 * as an override, regardless of the value. This matches the contract in
 * `filterConfigForDisplay` — nested objects (sleep, screensaver, alerts)
 * are full-replacement, so "the user overrode sleep" is the same as "the
 * `sleep` key exists in the display.settings object". We deliberately do
 * NOT recurse into the nested object to ask "did the user override the
 * dim time?" — that's not a per-display fork the system supports.
 *
 * Legacy single-display configs (`config.displays` undefined or empty)
 * always return an empty array, since by definition no display can have
 * overrides if no DisplayNodes exist.
 */
export function findDisplaysOverridingFields(
  config: ScreenConfiguration,
  fields: readonly (keyof DisplayNodeSettings)[],
): DisplayOverrideSummary[] {
  const displays = config.displays;
  if (!displays || displays.length === 0) return [];
  if (fields.length === 0) return [];

  const summaries: DisplayOverrideSummary[] = [];
  for (const display of displays) {
    const settings = display.settings;
    if (!settings) continue;
    const overriddenFields: (keyof DisplayNodeSettings)[] = [];
    for (const field of fields) {
      // `in` is the structural check for "key is present in the object."
      // In practice `updateDisplaySettings` deletes the key on reset
      // (not setting it to `undefined`), so `in` and `!== undefined`
      // behave identically — we just prefer `in` because it reads as
      // "the display has an override for this field" without tying the
      // semantics to the reset implementation detail.
      if (field in settings) {
        overriddenFields.push(field);
      }
    }
    if (overriddenFields.length > 0) {
      summaries.push({
        displayId: display.id,
        displayName: display.name,
        overriddenFields,
      });
    }
  }
  return summaries;
}
