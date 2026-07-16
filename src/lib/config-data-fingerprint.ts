/**
 * Fingerprint of every config field that can affect a module's FETCHED data.
 *
 * `useLiveConfig` used to run an unconditional `displayCache.clear()` on any
 * config byte change, so editing one module's visibility condition dropped
 * every module's cached data and the whole display refetched. `displayCache`
 * keys are plugin-chosen strings, so per-module scoping isn't tractable —
 * instead, skip the clear when the change cannot affect fetched data: strip
 * the purely presentational / gating fields from each module and compare the
 * rest. Position, size, zIndex, style, schedule, visibility, and enabled
 * never feed a fetch; `config` (and anything else — settings, profiles,
 * rules, display dimensions) conservatively does.
 */

import type { Screen, ScreenConfiguration } from '@/types/config';
import { stableStringify } from '@/lib/stable-stringify';

function stripScreens(screens: Screen[]): unknown[] {
  return screens.map((screen) => ({
    ...screen,
    modules: screen.modules.map((mod) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { position, size, zIndex, style, schedule, visibility, enabled, ...dataFields } = mod;
      return dataFields;
    }),
  }));
}

/**
 * Stable string identity for the data-affecting parts of a config. Two
 * configs with equal fingerprints must produce identical fetch behavior, so
 * the display cache can survive the transition between them.
 */
export function dataFingerprint(cfg: ScreenConfiguration): string {
  return stableStringify({
    ...cfg,
    screens: stripScreens(cfg.screens),
    displays: cfg.displays?.map((d) => ({ ...d, screens: stripScreens(d.screens) })),
  });
}
