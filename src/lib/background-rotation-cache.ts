import { createJsonStore } from '@/lib/json-store';
import type { ScreenConfiguration } from '@/types/config';


export interface RotationCacheEntry {
  path: string;
  /** Every source the screen's rotation was configured to draw from at fetch time, stable-sorted-JSON. */
  sources: string;
  query: string;
  fetchedAt: number;
  intervalMinutes: number;
  immichFilters?: string;
  icloudAlbum?: string;
  localFolder?: string;
  canvas?: string;
  unsplashCollections?: string;
  unsplashMode?: string;
  /** Stable selections for enabled starter source groups. */
  starterSelections?: string;
  /** Stable list of the Unsplash photos picked by hand. */
  unsplashPicks?: string;
}

export type BackgroundCache = Record<string, RotationCacheEntry>;

/** Atomic writes prevent concurrent rotations from clobbering each other. */
export const rotationCacheStore = createJsonStore<BackgroundCache>({
  path: 'data/background-cache.json',
  defaultValue: {},
  transient: true,
});

/** Only files the rotation savers wrote themselves (top-level, this prefix);
 *  user uploads and iCloud imports never carry it, so pruning can't touch
 *  them and the library page never lists them. */
export const ROTATION_FILE_RE = /^rotation-/;

/** Library-relative path a cached serve URL points at, or null. */
export function rotationCacheFileName(servePath: string): string | null {
  try {
    return new URL(servePath, 'http://local').searchParams.get('file');
  } catch {
    return null;
  }
}

/** Top-level rotation files some screen's cache entry still names. */
export function referencedRotationFiles(cache: BackgroundCache): Set<string> {
  const referenced = new Set<string>();
  for (const entry of Object.values(cache)) {
    const name = rotationCacheFileName(entry.path);
    if (name) referenced.add(name);
  }
  return referenced;
}

/** True for a library-relative path the rotation feature owns. */
export function isRotationFile(libraryPath: string): boolean {
  return !libraryPath.includes('/') && ROTATION_FILE_RE.test(libraryPath);
}

/** Photos picked by hand in Unsplash Search mode live under this name, so they stay out of every library list. */
export const UNSPLASH_PICK_PREFIX = 'rotation-unsplash-pick-';

/** Photos picked by hand in Immich Pick mode live under this name, so they stay out of every library list. */
export const IMMICH_PICK_PREFIX = 'rotation-immich-pick-';

/** True for a rotation file that holds a hand-picked photo (Unsplash or Immich). */
export function isPickFile(name: string): boolean {
  return name.startsWith(UNSPLASH_PICK_PREFIX) || name.startsWith(IMMICH_PICK_PREFIX);
}

/** Top-level rotation files some screen's settings still name as a hand-picked photo. */
export function referencedPickFiles(config: Pick<ScreenConfiguration, 'screens' | 'displays'>): Set<string> {
  const referenced = new Set<string>();
  const screens = [...(config.screens ?? []), ...(config.displays ?? []).flatMap((display) => display.screens ?? [])];
  for (const screen of screens) {
    const rotation = screen.backgroundRotation;
    for (const url of [...(rotation?.unsplashImages ?? []), ...(rotation?.immichImages ?? [])]) {
      const name = rotationCacheFileName(url);
      if (name) referenced.add(name);
    }
  }
  return referenced;
}
