/**
 * Migration 022: the screensaver's Off choice is folded into Blank.
 *
 * `ScreensaverMode` used to be `clock | blank | off`. Blank and Off drew the
 * same thing over a dimmed display, which is nothing, and nothing else ever
 * read the mode: dim and sleep timing, touch-to-wake, remote brightness and
 * panel power all behave the same for both. Off is gone, so a stored `off`
 * is written down as `blank` here.
 *
 * A mode is saved in two places: the shared `settings.screensaver` and a
 * display's own `settings.screensaver`, which replaces the shared one as a
 * whole. Profiles hold no settings, layout exports leave the screensaver
 * out, and modules never carry one, so there is nothing to walk on screens.
 */

import type { ScreenConfiguration } from '@/types/config';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `settings` with an `off` screensaver made `blank`, or `settings` itself when there is none. */
function blankForOff<T>(settings: T): T {
  if (!isRecord(settings) || !isRecord(settings.screensaver) || settings.screensaver.mode !== 'off') return settings;
  return { ...settings, screensaver: { ...settings.screensaver, mode: 'blank' } };
}

export const v21ToV22 = {
  version: 22,
  description: "The screensaver's Off choice becomes Blank",
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    settings: blankForOff(config.settings),
    ...(Array.isArray(config.displays)
      ? {
          displays: config.displays.map((display) => {
            if (!isRecord(display)) return display;
            const settings = blankForOff(display.settings);
            return settings === display.settings ? display : { ...display, settings };
          }),
        }
      : {}),
    version: 22,
  }),
};
