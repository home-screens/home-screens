/**
 * Migration 018: every stream of pictures names its sources with
 * `PhotoSource` objects, and a background rotation holds a list of them.
 *
 * Photo Slideshow and Full-screen Photo used to carry a flat set of fields
 * per source (`source`, `directory`, `immichAlbumId`, `immichPersonId`,
 * `immichFavoritesOnly`, `icloudAlbumUrl`, `onedriveFolderId`,
 * `onedriveFolderName`) plus a count per source (`immichCount`,
 * `onedriveCount`). Both now read one `photoSource` and one `count`.
 *
 * A screen's `backgroundRotation` has had three spellings: one `source` id
 * with the fields beside it (`source: 'nasa-apod'`, `query`, `immich*`,
 * `icloudAlbumUrl`), a `sources` list of ids with every provider's fields
 * flat on the rotation (`unsplashCollections`, `immichAlbumIds`,
 * `localImages`, `starterBackgroundIds`, ...), and one `photoSource`
 * object. All three become `sources: PhotoSource[]`, one entry per source,
 * and the `enabled` flag goes: a rotation is on when a source names
 * pictures. Rules, in the order they are tried:
 *
 * - A `sources` list of ids: one entry per known id, from the flat fields.
 *   Hand-picked pictures saved as `rotation-unsplash-pick-<id>` and
 *   `rotation-immich-pick-<id>` files become the picked ids themselves;
 *   chosen library pictures become library paths. A wall group with no
 *   picks takes the whole group, as it meant before walls were opt-in.
 *   The retired `theme` id and anything unknown are dropped. `enabled: false`
 *   empties the list; `enabled: true` with nothing in it rotates Unsplash,
 *   as the hub did for it.
 * - A `photoSource` object: that one source, or none when `enabled` is false.
 * - Otherwise the single `source` id, or Unsplash when it is missing, or
 *   none when `enabled` is false.
 *
 * Each source keeps exactly what it showed: the same folder, album, person,
 * link or search words. A singular Immich `albumId` / `personId` becomes a
 * one-entry list. A module whose `source` was missing or unknown played its
 * library folder, so it becomes a library source. A library folder loses
 * any leading or trailing slash: the library never accepted one. Full-screen
 * Photo's `file` stays. Shapes that are not objects pass through untouched,
 * and a second run changes nothing.
 */

import type { ScreenConfiguration, PhotoSource } from '@/types/config';
import { mapConfigModules, mapConfigScreens } from './module-walk';

const MODULE_FIELDS = [
  'source', 'directory', 'immichAlbumId', 'immichPersonId', 'immichFavoritesOnly', 'immichCount',
  'icloudAlbumUrl', 'onedriveFolderId', 'onedriveFolderName', 'onedriveCount',
];

type WallGroup = 'color' | 'pattern';
const WALL_IDS: Record<WallGroup, string[]> = {
  color: ['midnight', 'dusk', 'forest', 'deep-blue', 'charcoal', 'sunrise', 'plum', 'aurora', 'ocean', 'ember', 'ink', 'moss', 'copper', 'lavender', 'cloud', 'sand', 'sage', 'blush'],
  pattern: ['pattern-dots', 'pattern-grid', 'pattern-diagonal', 'pattern-paper'],
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()) : []);

/** The library-relative file a serve URL names, or the string itself when it is not one. */
function libraryFileOf(servePath: string): string {
  try {
    return new URL(servePath, 'http://local').searchParams.get('file') ?? servePath;
  } catch {
    return servePath;
  }
}

/** The id a hand-picked rotation file was saved under (`rotation-<kind>-pick-<id>.<ext>`), or null. */
function pickedId(servePath: string, prefix: string): string | null {
  const file = libraryFileOf(servePath);
  if (!file.startsWith(prefix)) return null;
  return file.slice(prefix.length).replace(/\.[^.]+$/, '') || null;
}

function immichSource(cfg: Record<string, unknown>): PhotoSource {
  const albumIds = list(cfg.immichAlbumIds).length ? list(cfg.immichAlbumIds) : text(cfg.immichAlbumId) ? [text(cfg.immichAlbumId)] : [];
  const personIds = list(cfg.immichPersonIds).length ? list(cfg.immichPersonIds) : text(cfg.immichPersonId) ? [text(cfg.immichPersonId)] : [];
  const excludePersonIds = list(cfg.immichPersonIdsExclude);
  const assetIds = cfg.immichMode === 'pick'
    ? list(cfg.immichImages).map((url) => pickedId(url, 'rotation-immich-pick-')).filter((id): id is string => id !== null)
    : [];
  return {
    kind: 'immich',
    ...(albumIds.length ? { albumIds } : {}),
    ...(personIds.length ? { personIds } : {}),
    ...(excludePersonIds.length ? { excludePersonIds } : {}),
    ...(cfg.immichFavoritesOnly === true ? { favoritesOnly: true } : {}),
    ...(assetIds.length ? { assetIds } : {}),
  };
}

function unsplashSource(cfg: Record<string, unknown>): Extract<PhotoSource, { kind: 'unsplash' }> {
  const query = text(cfg.query);
  const collections = cfg.unsplashMode === 'collections' || cfg.unsplashMode === undefined ? list(cfg.unsplashCollections) : [];
  const photoIds = list(cfg.unsplashImages).map((url) => pickedId(url, 'rotation-unsplash-pick-')).filter((id): id is string => id !== null);
  return {
    kind: 'unsplash',
    query,
    ...(collections.length ? { collections } : {}),
    ...(photoIds.length ? { photoIds } : {}),
  };
}

function librarySource(cfg: Record<string, unknown>): Extract<PhotoSource, { kind: 'library' }> {
  const folder = text(cfg.localFolder).replace(/^\/+|\/+$/g, '');
  const pictures = cfg.localMode === 'images' ? list(cfg.localImages).map(libraryFileOf) : [];
  // Chosen pictures stand on their own; the folder is not read beside them.
  return pictures.length ? { kind: 'library', folder: '', pictures } : { kind: 'library', folder };
}

function wallSource(cfg: Record<string, unknown>, group: WallGroup): PhotoSource {
  const picks = cfg.starterBackgroundIds && typeof cfg.starterBackgroundIds === 'object'
    ? list((cfg.starterBackgroundIds as Record<string, unknown>)[group]).filter((id) => WALL_IDS[group].includes(id))
    : [];
  // A ticked group with nothing picked meant the whole group before walls were opt-in.
  return { kind: 'wall', group, ids: picks.length ? picks : [...WALL_IDS[group]] };
}

function moduleSource(cfg: Record<string, unknown>): PhotoSource {
  switch (cfg.source) {
    case 'immich': return immichSource(cfg);
    case 'icloud': return { kind: 'icloud', albumUrl: text(cfg.icloudAlbumUrl) };
    case 'onedrive': return {
      kind: 'onedrive',
      folderId: text(cfg.onedriveFolderId),
      ...(text(cfg.onedriveFolderName) ? { folderName: text(cfg.onedriveFolderName) } : {}),
    };
    default: return { kind: 'library', folder: text(cfg.directory).replace(/^\/+|\/+$/g, '') };
  }
}

function moduleCount(cfg: Record<string, unknown>): number | undefined {
  const count = cfg.source === 'immich' ? cfg.immichCount : cfg.source === 'onedrive' ? cfg.onedriveCount : undefined;
  return typeof count === 'number' && Number.isFinite(count) ? count : undefined;
}

/** A `photoSource` written before the Immich lists: its singular fields become one-entry lists. */
function withLists(source: Record<string, unknown>): PhotoSource {
  if (source.kind !== 'immich') return source as unknown as PhotoSource;
  const { albumId, personId, ...rest } = source;
  return {
    ...rest,
    ...(!list(rest.albumIds).length && text(albumId) ? { albumIds: [text(albumId)] } : {}),
    ...(!list(rest.personIds).length && text(personId) ? { personIds: [text(personId)] } : {}),
  } as unknown as PhotoSource;
}

/**
 * One entry per source id of the list shape, in the list's order. A config
 * that also carries a `photoSource` (a hub that ran both shapes) keeps that
 * source's own settings wherever the flat fields say nothing: the search
 * words, the folder, the link, the filters.
 */
function sourcesFromIds(r: Record<string, unknown>, ids: string[]): PhotoSource[] {
  const own = r.photoSource && typeof r.photoSource === 'object' ? withLists(r.photoSource as Record<string, unknown>) : null;
  const sources: PhotoSource[] = [];
  for (const id of ids) {
    switch (id) {
      case 'unsplash': {
        const next = unsplashSource(r);
        sources.push(!next.query && !next.collections && !next.photoIds && own?.kind === 'unsplash' ? own : next);
        break;
      }
      case 'nasa-apod': sources.push({ kind: 'nasa' }); break;
      case 'immich': {
        const next = immichSource(r);
        sources.push(Object.keys(next).length === 1 && own?.kind === 'immich' ? own : next);
        break;
      }
      case 'icloud': sources.push({ kind: 'icloud', albumUrl: text(r.icloudAlbumUrl) || (own?.kind === 'icloud' ? own.albumUrl : '') }); break;
      case 'local': {
        const next = librarySource(r);
        sources.push(!next.folder && !next.pictures && own?.kind === 'library' ? own : next);
        break;
      }
      case 'color': case 'pattern': sources.push(wallSource(r, id)); break;
      default: break;
    }
  }
  return sources;
}

/** The single-id shape, from before several sources could be ticked. */
function sourceFromId(r: Record<string, unknown>): PhotoSource {
  switch (r.source) {
    case 'nasa-apod': return { kind: 'nasa' };
    case 'immich': return immichSource(r);
    case 'icloud': return { kind: 'icloud', albumUrl: text(r.icloudAlbumUrl) };
    default: return { kind: 'unsplash', query: text(r.query) };
  }
}

function rotationSources(r: Record<string, unknown>): PhotoSource[] {
  const off = r.enabled === false;
  const ids = Array.isArray(r.sources) && r.sources.every((entry) => typeof entry === 'string') ? (r.sources as string[]) : null;
  if (ids && ids.length > 0) {
    if (off) return [];
    const sources = sourcesFromIds(r, ids);
    // Only retired ids ticked on an "on" rotation: the hub searched Unsplash for it.
    return sources.length || r.enabled !== true ? sources : [unsplashSource(r)];
  }
  if (r.photoSource && typeof r.photoSource === 'object') {
    return off ? [] : [withLists(r.photoSource as Record<string, unknown>)];
  }
  // An empty list is a rotation with nothing ticked; one marked "on" searched Unsplash on the hub.
  if (ids) return r.enabled === true ? [unsplashSource(r)] : [];
  return off ? [] : [sourceFromId(r)];
}

export const v17ToV18 = {
  version: 18,
  description: 'Photo sources: slideshow and full-screen photo name their source with photoSource; a background rotation holds a list of sources',
  up: (config: ScreenConfiguration): ScreenConfiguration => {
    const withModules = {
      ...config,
      ...mapConfigModules(config, (mod) => {
        if (mod.type !== 'photo-slideshow' && mod.type !== 'fullscreen-photo') return mod;
        if (!mod.config || typeof mod.config !== 'object') return mod;
        const cfg = mod.config as Record<string, unknown>;
        if (cfg.photoSource && typeof cfg.photoSource === 'object') {
          const listed = withLists(cfg.photoSource as Record<string, unknown>);
          return listed === cfg.photoSource ? mod : { ...mod, config: { ...cfg, photoSource: listed } as typeof mod.config };
        }
        const count = moduleCount(cfg);
        const next = { ...without(cfg, MODULE_FIELDS), photoSource: moduleSource(cfg), ...(count !== undefined ? { count } : {}) };
        return { ...mod, config: next as typeof mod.config };
      }),
    };
    const screens = mapConfigScreens(withModules, (screen) => {
      const rotation = screen.backgroundRotation as unknown;
      if (!rotation || typeof rotation !== 'object') return screen;
      const r = rotation as Record<string, unknown>;
      // Already a list of sources: nothing to fold.
      if (Array.isArray(r.sources) && r.sources.every((entry) => entry && typeof entry === 'object') && r.enabled === undefined && !r.photoSource) return screen;
      const intervalMinutes = typeof r.intervalMinutes === 'number' && Number.isFinite(r.intervalMinutes) && r.intervalMinutes > 0 ? r.intervalMinutes : 60;
      return {
        ...screen,
        backgroundRotation: { intervalMinutes, sources: rotationSources(r) },
      };
    });
    return { ...withModules, ...screens, version: 18 };
  },
};

function without(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));
}
