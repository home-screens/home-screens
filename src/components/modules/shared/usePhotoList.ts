'use client';

import type { MediaListItem, PhotoSlideshowConfig, FullscreenPhotoConfig } from '@/types/config';
import { useFetchData } from '@/hooks/useFetchData';
import { DISPLAY_FETCH_LONG_TIMEOUT_MS } from '@/lib/display-fetch';
import { photoSlideshowUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useMediaRotation } from '@/hooks/useRotatingIndex';
import { useModuleCommand } from '@/hooks/useModuleCommand';
import { handleSlideshowCommand } from './slideshow-commands';
import { useCrossfadeLayers } from './useCrossfadeLayers';

const NO_ITEMS: MediaListItem[] = [];

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
  const [batch, index, advance, controls] = useMediaRotation(items, config.intervalMs ?? 30000, config.shuffle ?? false, playVideos, listUrl, moduleId);
  // Back, next, pause and play from the phone's Control tab.
  useModuleCommand(moduleType, (action) => handleSlideshowCommand(controls, action));

  // The swap waits for the incoming image: see useCrossfadeLayers.
  const currentItem = batch.length === 0 ? null : batch[index % batch.length] ?? null;
  const layers = useCrossfadeLayers(currentItem, index, advance);

  return { data, error, items, batch, advance, ...layers };
}
