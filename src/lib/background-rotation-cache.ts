import { createJsonStore } from '@/lib/json-store';

/**
 * The background-rotation cache (`data/background-cache.json`): one entry per
 * screen naming the rotation file it currently shows. Shared by the rotate
 * route that writes it and the library routes that must not list or delete a
 * rotation file a screen is still showing.
 */

export interface RotationCacheEntry {
  /** Serve URL (or bundled path) of the picture the screen shows; empty when none has come yet. */
  path: string;
  /** `rotationCacheKey` of the sources it came from; a different key means start over. */
  sourceKey: string;
  fetchedAt: number;
  intervalMinutes: number;
  /** The caption shown on the wall, set by sources that ask for credit (art). */
  credit?: { name: string; source: string };
  /** When every source last failed to answer; the sources rest until the back-off has passed. */
  failedAt?: number;
  /** When the editor last forced a refresh; the next forced one waits a few seconds. */
  forcedAt?: number;
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
