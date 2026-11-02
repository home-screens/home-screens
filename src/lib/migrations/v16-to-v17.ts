/**
 * Migration 017: every stream of pictures names its source with one
 * `photoSource` object.
 *
 * Photo Slideshow and Full-screen Photo used to carry a flat set of fields
 * per source (`source`, `directory`, `immichAlbumId`, `immichPersonId`,
 * `immichFavoritesOnly`, `icloudAlbumUrl`, `onedriveFolderId`,
 * `onedriveFolderName`) plus a count per source (`immichCount`,
 * `onedriveCount`). A screen's `backgroundRotation` had its own spelling of
 * the same idea (`source: 'nasa-apod'`, `query`, `immich*`,
 * `icloudAlbumUrl`). All three now read `photoSource` (see PhotoSource), and
 * the two modules one `count`.
 *
 * Each source keeps exactly what it showed: the same folder, album, person,
 * link or search words. A module whose `source` was missing or unknown
 * played its library folder, so it becomes a library source; a rotation
 * whose `source` was missing searched Unsplash. A library folder loses any
 * leading or trailing slash: the library never accepted one (a bundled
 * template's `/photos` listed nothing). Full-screen Photo's `file` stays.
 * Shapes that are not objects pass through untouched.
 */

import type { ScreenConfiguration, PhotoSource } from '@/types/config';
import { mapConfigModules, mapConfigScreens } from './module-walk';

const MODULE_FIELDS = [
  'source', 'directory', 'immichAlbumId', 'immichPersonId', 'immichFavoritesOnly', 'immichCount',
  'icloudAlbumUrl', 'onedriveFolderId', 'onedriveFolderName', 'onedriveCount',
];
const ROTATION_FIELDS = ['source', 'query', 'immichAlbumId', 'immichPersonId', 'immichFavoritesOnly', 'icloudAlbumUrl'];

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function immichSource(cfg: Record<string, unknown>): PhotoSource {
  return {
    kind: 'immich',
    ...(text(cfg.immichAlbumId) ? { albumId: text(cfg.immichAlbumId) } : {}),
    ...(text(cfg.immichPersonId) ? { personId: text(cfg.immichPersonId) } : {}),
    ...(cfg.immichFavoritesOnly === true ? { favoritesOnly: true } : {}),
  };
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

function rotationSource(rotation: Record<string, unknown>): PhotoSource {
  switch (rotation.source) {
    case 'nasa-apod': return { kind: 'nasa' };
    case 'immich': return immichSource(rotation);
    case 'icloud': return { kind: 'icloud', albumUrl: text(rotation.icloudAlbumUrl) };
    default: return { kind: 'unsplash', query: text(rotation.query) };
  }
}

function without(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));
}

export const v16ToV17 = {
  version: 17,
  description: 'Photo sources: slideshow, full-screen photo and background rotation name their source with photoSource',
  up: (config: ScreenConfiguration): ScreenConfiguration => {
    const withModules = {
      ...config,
      ...mapConfigModules(config, (mod) => {
        if (mod.type !== 'photo-slideshow' && mod.type !== 'fullscreen-photo') return mod;
        if (!mod.config || typeof mod.config !== 'object') return mod;
        const cfg = mod.config as Record<string, unknown>;
        if (cfg.photoSource && typeof cfg.photoSource === 'object') return mod;
        const count = moduleCount(cfg);
        const next = { ...without(cfg, MODULE_FIELDS), photoSource: moduleSource(cfg), ...(count !== undefined ? { count } : {}) };
        return { ...mod, config: next as typeof mod.config };
      }),
    };
    const screens = mapConfigScreens(withModules, (screen) => {
      const rotation = screen.backgroundRotation as unknown;
      if (!rotation || typeof rotation !== 'object') return screen;
      const r = rotation as Record<string, unknown>;
      if (r.photoSource && typeof r.photoSource === 'object') return screen;
      return {
        ...screen,
        backgroundRotation: { ...without(r, ROTATION_FIELDS), photoSource: rotationSource(r) } as unknown as typeof screen.backgroundRotation,
      };
    });
    return { ...withModules, ...screens, version: 17 };
  },
};
