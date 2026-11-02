import { promises as fs } from 'fs';
import { libraryMediaKind, safeLibraryPath, libraryRoot } from '@/lib/library-files';
import { mintMediaToken } from '@/lib/media-token';
import { serveUrlFor } from '@/lib/media-paths';
import { cleanLibraryFolder } from '@/lib/photo-source';
import type { MediaListItem, SlideshowMediaTypes } from '@/types/config';
import type { PhotoSourceAdapter } from './types';

/**
 * Every picture (and, when asked, video) directly inside one library folder,
 * in folder order, as the wall plays them. Videos carry a media token bound
 * to their path, because a bare `<video src>` can't send the display's
 * bearer token. Top-level `rotation-` downloads belong to the background
 * rotation and are never listed. A missing folder holds nothing.
 *
 * Shared by the stream route and `GET /api/backgrounds`, the library's own
 * listing, so the two can never disagree about what a folder holds.
 */
export async function listLibraryMedia(folder: string, media: SlideshowMediaTypes): Promise<MediaListItem[] | null> {
  const clean = cleanLibraryFolder(folder);
  const dir = clean ? safeLibraryPath(clean) : libraryRoot();
  if (!dir) return null;
  if (!clean) await fs.mkdir(dir, { recursive: true });
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const items: MediaListItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const libraryPath = clean ? `${clean}/${entry.name}` : entry.name;
    const kind = libraryMediaKind(libraryPath);
    if (kind === 'image' && media !== 'videos') {
      items.push({ url: serveUrlFor(libraryPath), type: 'image' });
    } else if (kind === 'video' && media !== 'photos') {
      // Bind the token to the same `file` value the serve route reads back.
      const token = await mintMediaToken(libraryPath);
      items.push({ url: serveUrlFor(libraryPath) + (token ? `&mt=${encodeURIComponent(token)}` : ''), type: 'video' });
    }
  }
  return items;
}

export const libraryPhotoSource: PhotoSourceAdapter<'library'> = {
  kind: 'library',

  async list({ source, media }) {
    // A folder plays all of itself; it has no per-refresh count.
    return (await listLibraryMedia(source.folder, media)) ?? [];
  },

  async pickOne({ source, previous }) {
    const clean = cleanLibraryFolder(source.folder);
    const pictures = ((await listLibraryMedia(clean, 'photos')) ?? [])
      .map((item) => new URL(item.url, 'http://local').searchParams.get('file'))
      .filter((file): file is string => !!file);
    if (pictures.length === 0) return null;
    // A rotation that lands on the picture already showing doesn't rotate.
    const others = pictures.length > 1 ? pictures.filter((file) => file !== previous) : pictures;
    return { kind: 'library', path: others[Math.floor(Math.random() * others.length)] };
  },
};
