import { createTTLCache } from './api-utils';
import { createJsonStore } from './json-store';
import { logger } from './logger';

/**
 * What the hub remembers of each shared album, for both of Apple's album
 * backends (icloud-album.ts and icloud-link.ts).
 *
 * Reading an album is the slow, fallible part of showing it: the legacy
 * backend has been measured at 50 seconds for a mid-sized album, the newer
 * one pages through every item. A wall asks for its list every few minutes
 * and a serve route asks which items exist on every picture, so neither can
 * be made to wait on Apple each time, and neither should lose its album
 * because one read failed. The rules, in one place for both backends:
 *
 *   - A kept copy answers at once. When it has aged, a new read is set off
 *     behind it for the next caller. Only an album the hub has never read is
 *     waited for.
 *   - A copy answers for a day while Apple cannot be read again.
 *   - An album that is gone (the read answered null) is remembered briefly,
 *     so a wall pointed at a dead link does not ask on every poll.
 *   - The lists are also written to `data/icloud-albums.json`, so a hub that
 *     has just restarted shows its albums straight away instead of waiting
 *     on Apple again. What is kept names an album's items and never holds a
 *     link: Apple's links die within minutes.
 */

const log = logger('icloud-album');

/** How old a kept copy may be before the next caller sets off a new read. */
const FRESH_MS = 5 * 60_000;
/** How long a copy answers while Apple cannot be read again. */
const KEEP_MS = 24 * 60 * 60_000;
/** How long an album that is gone stays gone without asking again: long
 *  enough that a wall pointed at a dead link stops asking on every poll,
 *  short enough that a fixed-up album shows within a minute. */
const GONE_MS = 60_000;
/** After a refresh fails, how long before another is tried. */
const RETRY_AFTER_FAILED_REFRESH_MS = 60_000;
/** Albums kept at once, per backend. A household has a handful; the cap is
 *  for a hub that has had many links pasted into it. */
const MAX_KEPT_ALBUMS = 50;
/**
 * A copy on disk is rewritten when the album changed. One that has not
 * changed still needs its date moved along now and then, or a restart would
 * take a copy read minutes ago for one a day old; this is how often, so an
 * album nobody adds to costs the Pi's SD card four small writes a day.
 */
const RESAVE_UNCHANGED_MS = 6 * 60 * 60_000;

interface KeptAlbum<T> {
  entries: T[];
  /** When the read that produced this copy started. */
  readAt: number;
  /** No new read is set off before this. */
  refreshAfter: number;
  /** The `readAt` the copy on disk carries. */
  savedAt: number;
}

interface SavedAlbum {
  entries: unknown[];
  readAt: number;
}

/** `data/icloud-albums.json`: one entry per album, keyed `<backend>:<token>`. */
type SavedAlbums = Record<string, SavedAlbum>;

/**
 * A cache, not household data: nothing backs it up, and losing it costs one
 * slow first read. Held on `globalThis` because route bundles can each carry
 * their own copy of a module (webpack dev does), and two stores writing one
 * file would each queue their own writes.
 */
const storeKey = Symbol.for('home-screens.icloud-albums-store.v1');
type AlbumStore = ReturnType<typeof createJsonStore<SavedAlbums>>;
const globals = globalThis as typeof globalThis & { [storeKey]?: AlbumStore };
const store: AlbumStore = globals[storeKey] ??= createJsonStore<SavedAlbums>({
  path: 'data/icloud-albums.json',
  defaultValue: {},
  transient: true,
});

function isSavedAlbum(value: unknown): value is SavedAlbum {
  const album = value as SavedAlbum | null;
  return typeof album === 'object' && album !== null && Array.isArray(album.entries) && typeof album.readAt === 'number';
}

export interface AlbumKeeperOptions<T> {
  /** Which backend's albums these are; part of each album's key on disk. */
  backend: string;
  /**
   * One uncached read of what an album holds: null when the album is gone,
   * a throw when Apple did not answer properly.
   */
  read(token: string): Promise<T[] | null>;
  /** Whether a value read back from disk is an entry this backend wrote. */
  isEntry(value: unknown): value is T;
  /**
   * Asked before an empty answer replaces a copy that had items: true when
   * Apple still has them, which makes the empty answer a failed read. For a
   * backend whose empty answer cannot be taken at its word.
   */
  stillHasItems?(token: string, kept: T[]): Promise<boolean>;
}

export interface AlbumKeeper<T> {
  /**
   * What an album holds, or null when it is gone. A kept copy answers at
   * once, with a new read set off behind it when it has aged.
   */
  entries(token: string): Promise<T[] | null>;
  /** Read the album from Apple now and keep the answer. Callers who ask
   *  while a read is out share it. */
  refresh(token: string): Promise<T[] | null>;
  /** Test hook: forgets every album, in memory and on disk. */
  clear(): Promise<void>;
}

export function createAlbumKeeper<T>(options: AlbumKeeperOptions<T>): AlbumKeeper<T> {
  const prefix = `${options.backend}:`;
  /** In "least recently read first" order, which is the order they are dropped in. */
  const kept = new Map<string, KeptAlbum<T>>();
  const gone = createTTLCache<true>(GONE_MS);
  const reads = new Map<string, Promise<T[] | null>>();
  /** Bumped by the test hook, so a read still out cannot refill what it cleared. */
  let generation = 0;
  let loaded: Promise<void> | undefined;

  /** The copies a hub that ran before left on disk, once per process. */
  function load(): Promise<void> {
    loaded ??= (async () => {
      const startedIn = generation;
      const saved = await store.read();
      if (startedIn !== generation) return;
      const now = Date.now();
      const mine = Object.entries(saved)
        .filter(([key, album]) => key.startsWith(prefix) && isSavedAlbum(album) && now - album.readAt <= KEEP_MS)
        .sort(([, a], [, b]) => a.readAt - b.readAt)
        .slice(-MAX_KEPT_ALBUMS);
      for (const [key, album] of mine) {
        const token = key.slice(prefix.length);
        // A read may already have landed while the file was being read.
        if (kept.has(token)) continue;
        // Due for a new read at once: the copy only bridges the wait for it.
        kept.set(token, { entries: album.entries.filter(options.isEntry), readAt: album.readAt, refreshAfter: 0, savedAt: album.readAt });
      }
    })();
    return loaded;
  }

  /** Write one album's copy to disk, or take it off (null); other albums'
   *  copies too old to be used again are dropped in passing. */
  async function save(token: string, album: SavedAlbum | null): Promise<void> {
    try {
      await store.updateAtomic((current) => {
        const now = Date.now();
        const next: SavedAlbums = {};
        for (const [key, saved] of Object.entries(current)) {
          if (key !== prefix + token && isSavedAlbum(saved) && now - saved.readAt <= KEEP_MS) next[key] = saved;
        }
        if (album) next[prefix + token] = album;
        return next;
      });
    } catch (error) {
      log.warn('Could not save a shared album\'s list; it will be read from iCloud again after a restart.', error);
    }
  }

  function readAndKeep(token: string): Promise<T[] | null> {
    const reading = reads.get(token);
    if (reading) return reading;

    const startedAt = Date.now();
    const startedIn = generation;
    const read = (async () => {
      try {
        const entries = await options.read(token);
        if (startedIn !== generation) return entries;
        const before = kept.get(token);
        if (entries?.length === 0 && before && before.entries.length > 0 && await options.stillHasItems?.(token, before.entries)) {
          throw new Error('iCloud answered an empty list for an album that still has items');
        }
        if (startedIn !== generation) return entries;

        // Re-inserted so the Map's order is "least recently read first".
        kept.delete(token);
        if (!entries) {
          gone.set(token, true);
          if (before) void save(token, null);
          return entries;
        }
        if (kept.size >= MAX_KEPT_ALBUMS) kept.delete(kept.keys().next().value!);
        const unchanged = before !== undefined && JSON.stringify(before.entries) === JSON.stringify(entries);
        const resave = !unchanged || startedAt - before.savedAt >= RESAVE_UNCHANGED_MS;
        kept.set(token, {
          entries,
          readAt: startedAt,
          refreshAfter: startedAt + FRESH_MS,
          savedAt: resave ? startedAt : before.savedAt,
        });
        if (resave) void save(token, { entries, readAt: startedAt });
        return entries;
      } catch (error) {
        const album = startedIn === generation ? kept.get(token) : undefined;
        if (album) album.refreshAfter = Date.now() + RETRY_AFTER_FAILED_REFRESH_MS;
        throw error;
      }
    })();
    reads.set(token, read);
    const done = () => {
      if (reads.get(token) === read) reads.delete(token);
    };
    read.then(done, done);
    return read;
  }

  return {
    async entries(token) {
      await load();
      const album = kept.get(token);
      const now = Date.now();
      if (album && now - album.readAt <= KEEP_MS) {
        if (now >= album.refreshAfter && !reads.has(token)) {
          readAndKeep(token).catch((error: unknown) => {
            log.warn('Could not refresh a shared album; showing the last copy.', error);
          });
        }
        return album.entries;
      }
      if (gone.get(token)) return null;
      return readAndKeep(token);
    },

    async refresh(token) {
      await load();
      return readAndKeep(token);
    },

    async clear() {
      generation++;
      kept.clear();
      gone.clear();
      reads.clear();
      loaded = undefined;
      await store.write({});
    },
  };
}
