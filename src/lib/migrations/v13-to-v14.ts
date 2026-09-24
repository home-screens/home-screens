/**
 * Migration 014: an unset clock format now follows the household's language.
 *
 * `settings.timeFormat` absent used to mean 12-hour in every language, and a
 * clock's empty `dateFormat` meant the English "Monday, September 25". Both
 * now mean the formatting language's own: a Danish wall reads 24-hour times
 * and "fredag 25. september" without anyone opening a setting.
 *
 * - A household that never picked 12 or 24 hours gets `12h` written down, so
 *   the clock it has been reading does not change under it. Only new installs
 *   (whose config starts at this version) follow their language.
 * - A clock still on the old default pattern `EEEE, MMMM d` is cleared to the
 *   language's own date. New clocks were placed with that value, and the
 *   picker's label for it shows each language's own order ("Montag, 5.
 *   Januar"), which is what clearing it draws; en-US reads the same either
 *   way. Any other pattern stays.
 */

import type { ScreenConfiguration } from '@/types/config';
import { mapConfigModules } from './module-walk';

/** What every clock was placed with before the date line followed the language. */
const OLD_CLOCK_DATE_DEFAULT = 'EEEE, MMMM d';

export const v13ToV14 = {
  version: 14,
  description: 'Unset time format kept at 12-hour; clocks on the old default date follow the language',
  up: (config: ScreenConfiguration): ScreenConfiguration => {
    const settings = config.settings && typeof config.settings === 'object' && config.settings.timeFormat === undefined
      ? { ...config.settings, timeFormat: '12h' as const }
      : config.settings;
    const modules = mapConfigModules(config, (mod) => {
      if (mod.type !== 'clock' || mod.config?.dateFormat !== OLD_CLOCK_DATE_DEFAULT) return mod;
      return { ...mod, config: { ...mod.config, dateFormat: '' } };
    });
    return { ...config, ...modules, settings, version: 14 };
  },
};
