/**
 * Migration 012: the update channel grew from two values to four.
 *
 * `updateChannel` used to be `'stable' | 'dev'`, where `dev` meant "include
 * prereleases", which in practice were release candidates. The channel is
 * now one of `stable | rc | beta | nightly`, and `dev` is not among them, so
 * a stored `dev` is rewritten to `rc` once here rather than coerced on every
 * read. Coercing left the stale value in config.json for good: the picker
 * showed Early access, so choosing it again was a no-op and never wrote the
 * new value, and every other save round-tripped the old one.
 */

import type { ScreenConfiguration } from '@/types/config';

export const v11ToV12 = {
  version: 12,
  description: 'Retired dev update channel renamed to rc',
  up: (config: ScreenConfiguration): ScreenConfiguration => {
    const settings = config.settings as (Omit<typeof config.settings, 'updateChannel'> & { updateChannel?: unknown }) | undefined;
    if (!settings || settings.updateChannel !== 'dev') return { ...config, version: 12 };
    return {
      ...config,
      version: 12,
      settings: { ...settings, updateChannel: 'rc' },
    };
  },
};
