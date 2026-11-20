/**
 * Migration 021: the full-screen news front page gets a name of its own.
 *
 * The masthead used to be headed with the first feed's label whatever else
 * the page followed, so a page mixing three feeds read as the first one's,
 * and reordering the feeds renamed it. It now reads `title`, then the label
 * of the one feed when there is exactly one, then "News".
 *
 * A page of several feeds whose first feed has a label would lose that
 * heading, so the label is written down as the title. Nothing on a wall
 * changes, and the name is now in the editor to change. It is written for
 * the Story view too, which draws no masthead: switching that module to the
 * front page later gives the heading it would have given before.
 */

import type { ScreenConfiguration } from '@/types/config';
import { mapConfigModules } from './module-walk';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const hasUrl = (feed: unknown): feed is Record<string, unknown> =>
  isRecord(feed) && typeof feed.url === 'string' && feed.url.trim().length > 0;

export const v20ToV21 = {
  version: 21,
  description: 'Full-screen news front pages of several feeds keep their heading as a title',
  up: (config: ScreenConfiguration): ScreenConfiguration => ({
    ...config,
    ...mapConfigModules(config, (mod) => {
      if (mod.type !== 'fullscreen-news' || !isRecord(mod.config)) return mod;
      const { title, feeds } = mod.config;
      // A page that already has a name keeps it.
      if (typeof title === 'string' && title.trim()) return mod;
      const live = Array.isArray(feeds) ? feeds.filter(hasUrl) : [];
      if (live.length < 2) return mod;
      const label = typeof live[0].label === 'string' ? live[0].label.trim() : '';
      if (!label) return mod;
      return { ...mod, config: { ...mod.config, title: label } } as typeof mod;
    }),
    version: 21,
  }),
};
