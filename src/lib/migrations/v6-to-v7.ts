/**
 * Migration 007 — idle dimming became an explicit toggle.
 *
 * `useSleepManager` used to suppress all idle-based dim/sleep transitions
 * whenever a dim schedule was configured — an implicit rule that stood in for
 * the `SleepSettings.idleDimEnabled` toggle before it existed. The rule is
 * gone from the runtime (the toggle alone governs idle behavior), so any
 * config that relied on it must be seeded with `idleDimEnabled: false` or its
 * display would start idle-dimming outside the dim window, where it never did
 * before.
 *
 * Seeding only happens when a `dimSchedule` exists AND the field is absent:
 * a config without a dim schedule always had live idle dimming (absent means
 * true, unchanged), and an explicit value of either polarity is the user's
 * own choice and is preserved. Both the global `settings.sleep` and every
 * per-display `settings.sleep` override are walked, since the whole-block
 * override copies the same shape onto display nodes.
 */

import type { ScreenConfiguration, SleepSettings } from '@/types/config';

function seedSleep(sleep: SleepSettings | undefined): SleepSettings | undefined {
  if (!sleep || typeof sleep !== 'object') return sleep;
  if (!sleep.dimSchedule || sleep.idleDimEnabled !== undefined) return sleep;
  return { ...sleep, idleDimEnabled: false };
}

export const v6ToV7 = {
  version: 7,
  description: 'Seed idleDimEnabled: false where a dim schedule implied it',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    version: 7,
    settings: config.settings
      ? { ...config.settings, sleep: seedSleep(config.settings.sleep) }
      : config.settings,
    ...(Array.isArray(config.displays)
      ? {
          displays: config.displays.map((d) =>
            d.settings?.sleep ? { ...d, settings: { ...d.settings, sleep: seedSleep(d.settings.sleep) } } : d,
          ),
        }
      : {}),
  }),
};
