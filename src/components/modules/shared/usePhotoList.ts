'use client';

import { useMemo } from 'react';
import type { MediaListItem, PhotoSlideshowConfig, FullscreenPhotoConfig } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
import { DISPLAY_FETCH_LONG_TIMEOUT_MS } from '@/lib/display-fetch';
import { photoSlideshowUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useMediaRotation } from '@/hooks/useRotatingIndex';
import { useModuleCommand } from '@/hooks/useModuleCommand';
import { handleSlideshowCommand } from './slideshow-commands';
import { useCrossfadeLayers } from './useCrossfadeLayers';
import { stripMediaToken } from '@/lib/media-url';

const NO_ITEMS: MediaListItem[] = [];

/** How long a slide stays up when the module sets no interval. */
export const DEFAULT_SLIDE_INTERVAL_MS = 30_000;

/** One asset, whatever access token its address carries this time. */
const assetKey = (item: MediaListItem) => `${item.type} ${stripMediaToken(item.url)}`;

/**
 * The slides on screen, each swapped for the newest read's entry for the
 * same asset.
 *
 * A film's address, a Live Photo's clip and a poster carry an access token
 * that runs out after a few hours, and every list read mints new ones. The
 * pass being played holds the read it was dealt from until it wraps, which
 * for a big folder or a paused slideshow is longer than a token lasts, so the
 * clips of a long pass stopped loading partway through. Swapping the entries
 * here, where they are handed to the layers, keeps the tokens fresh without
 * touching the pass: dealing the newer read into it would send the crossfade
 * down its first-load path and cut a fade that is waiting on its picture.
 *
 * A slide the newest read no longer lists stays as it was dealt.
 */
export function withNewestTokens<T extends MediaListItem>(
  sources: [T | null, T | null],
  newest: ReadonlyMap<string, T>,
): [T | null, T | null] {
  const freshen = (item: T | null) => (item ? newest.get(assetKey(item)) ?? item : item);
  const next: [T | null, T | null] = [freshen(sources[0]), freshen(sources[1])];
  return next[0] === sources[0] && next[1] === sources[1] ? sources : next;
}

interface PhotoListOptions {
  /** The module's id on a real display: it carries the position across the screen rotating away and back. */
  moduleId?: string;
  /** Whether video slides play (a real display) or rotate on the photo timer (the editor). */
  playVideos: boolean;
  /** No list at all: the module is showing one chosen picture. */
  single?: boolean;
}

/**
 * The list a photo module plays and where it is in it: the read of its
 * `photoSource`, the rotation, the phone's back / next / pause / play, and
 * the two crossfade layers.
 */
export function usePhotoList(
  moduleType: 'photo-slideshow' | 'fullscreen-photo',
  config: Pick<PhotoSlideshowConfig | FullscreenPhotoConfig, 'photoSource' | 'count' | 'mediaTypes' | 'intervalMs' | 'refreshIntervalMs' | 'shuffle'>,
  { moduleId, playVideos, single = false }: PhotoListOptions,
) {
  const listUrl = single ? '' : photoSlideshowUrl(config);
  // A cloud source the hub has not read yet can take most of a minute to list.
  const refreshMs = config.refreshIntervalMs ?? FETCH_KEY_REGISTRY[moduleType]?.ttlMs ?? 600_000;
  const [data, error] = useFetchData<MediaListItem[]>(listUrl, refreshMs, { timeoutMs: DISPLAY_FETCH_LONG_TIMEOUT_MS });
  const items = single ? NO_ITEMS : data ?? NO_ITEMS;

  // Per-item rotation: photos advance on the timer, videos on onEnded, so
  // an all-photo list degenerates to the plain fixed-interval rotation.
  // The list URL keys the batch, so a periodic refresh is held until the
  // current pass completes instead of re-dealing mid-slideshow.
  const [batch, index, advance, controls] = useMediaRotation(items, config.intervalMs ?? DEFAULT_SLIDE_INTERVAL_MS, config.shuffle ?? false, playVideos, listUrl, moduleId);
  // Back, next, pause and play from the phone's Control tab.
  useModuleCommand(moduleType, (action) => handleSlideshowCommand(controls, action));

  // The swap waits for the incoming image: see useCrossfadeLayers.
  const currentItem = batch.length === 0 ? null : batch[index % batch.length] ?? null;
  const layers = useCrossfadeLayers(currentItem, index, advance);

  // Where the slideshow is, for the wall's "3 of 5".
  const position = batch.length > 1 ? { at: (index % batch.length) + 1, of: batch.length } : null;

  const newest = useMemo(() => new Map(items.map((item) => [assetKey(item), item])), [items]);
  const sources = useMemo(() => withNewestTokens(layers.sources, newest), [layers.sources, newest]);

  return { data, error, items, batch, advance, controls, position, ...layers, sources };
}
