import { createJsonStore } from '@/lib/json-store';

/**
 * The background-rotation cache (`data/background-cache.json`): one entry per
 * screen naming the rotation file it currently shows. Shared by the rotate
 * route that writes it and the library routes that must not list or delete a
 * rotation file a screen is still showing.
 */

export interface RotationCacheEntry {
  /** Serve URL of the picture the screen shows. */
  path: string;
  /** `sourceCacheKey` of the photo source it came from; a different key means start over. */
  sourceKey: string;
  fetchedAt: number;
  intervalMinutes: number;
}

export type BackgroundCache = Record<string, RotationCacheEntry>;

/**
 * Rotation bookkeeping, not durable data: nothing backs it up or restores it,
 * and losing it costs one extra upstream fetch. `transient` gives it the
 * store's per-file queue and atomic rename without taking the global data
 * lock or paying two fsyncs on a path that runs on every screen rotation.
 *
 * It has to be a store rather than a read/modify/write pair because the fetch
 * between the two takes seconds: a plain write-back persisted a snapshot taken
 * before the network call and clobbered any entry another screen's rotation
 * had committed in the meantime.
 */
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
