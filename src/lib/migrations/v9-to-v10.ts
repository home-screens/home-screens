/**
 * Migration 010 — news modules follow a list of feeds.
 *
 * `NewsConfig.feedUrl` (one string; empty meant the BBC default baked into
 * the API route) becomes `feeds: NewsFeedSource[]`. The route no longer has
 * a default, so an empty `feedUrl` is written out as the BBC preset it used
 * to stand for. Modules that already carry `feeds` are left alone.
 */

import type { ScreenConfiguration } from '@/types/config';
import { mapConfigModules } from './module-walk';

/** Frozen copy of the old route default, deliberately not imported from live code. */
const LEGACY_DEFAULT_FEED_URL = 'https://feeds.bbci.co.uk/news/rss.xml';

export const v9ToV10 = {
  version: 10,
  description: 'News modules follow a list of feeds instead of one feedUrl',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    version: 10,
    ...mapConfigModules(config, (mod) => {
      if (mod.type !== 'news') return mod;
      const cfg = mod.config as Record<string, unknown> | undefined;
      if (!cfg || typeof cfg !== 'object') return mod;
      if (Array.isArray(cfg.feeds)) {
        if (!('feedUrl' in cfg)) return mod;
        const { feedUrl: _dropped, ...rest } = cfg;
        return { ...mod, config: rest } as typeof mod;
      }
      const { feedUrl, ...rest } = cfg;
      const url = typeof feedUrl === 'string' && feedUrl.trim() ? feedUrl.trim() : LEGACY_DEFAULT_FEED_URL;
      const label = url === LEGACY_DEFAULT_FEED_URL ? 'BBC News' : undefined;
      return {
        ...mod,
        config: { ...rest, feeds: [{ id: `${mod.id}-feed-1`, url, ...(label ? { label } : {}) }] },
      } as typeof mod;
    }),
  }),
};
