import type { Screen } from '@/types/config';
import { FETCH_KEY_REGISTRY } from './fetch-keys';
import { isModuleEnabled, isModuleVisible } from './schedule';
import { displayCache } from './display-cache';

/** Get prefetch-able URLs for a screen's currently-visible modules */
function getScreenFetchUrls(
  screen: Screen,
  now: Date,
): { url: string; ttlMs: number }[] {
  const seen = new Set<string>();
  const urls: { url: string; ttlMs: number }[] = [];
  for (const mod of screen.modules) {
    if (!isModuleEnabled(mod)) continue;
    if (!isModuleVisible(mod.schedule, now)) continue;
    const entry = FETCH_KEY_REGISTRY[mod.type];
    if (!entry) continue;
    const url = entry.buildUrl(mod.config);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push({ url, ttlMs: entry.ttlMs });
    }
  }
  return urls;
}

/** Prefetch all stale/missing URLs for a screen */
export async function prefetchScreen(
  screen: Screen,
  now: Date,
): Promise<void> {
  const urls = getScreenFetchUrls(screen, now);
  await Promise.all(urls.map(({ url, ttlMs }) => displayCache.prefetch(url, ttlMs)));
}
