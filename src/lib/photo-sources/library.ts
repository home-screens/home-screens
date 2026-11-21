import { promises as fs } from 'fs';
import { libraryMediaKind, safeLibraryPath, libraryRoot } from '@/lib/library-files';
import { clipIndex } from '@/lib/media-formats';
import { mintMediaToken } from '@/lib/media-token';
import { serveUrlFor } from '@/lib/media-paths';
import { cleanLibraryFolder } from '@/lib/photo-source';
import type { MediaListItem, SlideshowMediaTypes } from '@/types/config';
import type { PhotoSourceAdapter } from './types';

/**
 * Every picture (and, when asked, video) directly inside one library folder,
 * in name order (so "2" comes before "10"), as the wall plays them and as
 * the editor lists them. Videos carry a media token bound
 * to their path, because a bare `<video src>` can't send the display's
 * bearer token. Top-level `rotation-` downloads belong to the background
 * rotation and are never listed. A missing folder holds nothing.
 *
 * Shared by the stream route and `GET /api/backgrounds`, the library's own
 * listing, so the two can never disagree about what a folder holds.
 *
 * `pairLivePhotos` is the slideshow's view of the folder: a still carries
 * the moving half of its Live Photo as `liveUrl`, and that clip is not a
 * slide of its own. The library's own listing leaves it off, because there
 * the clip is a file like any other that a family must be able to see, move
 * and delete.
 */
export async function listLibraryMedia(
  folder: string,
  media: SlideshowMediaTypes,
  { pairLivePhotos = false }: { pairLivePhotos?: boolean } = {},
): Promise<MediaListItem[] | null> {
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
  // readdir answers in whatever order the disk keeps, which on a Pi's ext4
  // is neither by name nor by date.
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  // The moving half of a Live Photo, matched to the still it belongs to.
  // Only when the stills are listed: a slideshow showing videos only has no
  // still to play a clip over, so there every clip is a video like any other.
  const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name);
  const clipFor = pairLivePhotos && media !== 'videos' ? clipIndex(fileNames) : noClip;
  const claimedClips = new Set(fileNames.map(clipFor).filter((name): name is string => !!name));
  const pathOf = (name: string) => (clean ? `${clean}/${name}` : name);

  const items: MediaListItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const libraryPath = pathOf(entry.name);
    const kind = libraryMediaKind(libraryPath);
    // A clip belonging to a picture in this folder is that picture's
    // movement, not a slide of its own, so a slideshow showing photos and
    // videos does not also play it as a three-second film. A clip belonging
    // to no picture is an ordinary video and plays like one.
    if (kind === 'video' && claimedClips.has(entry.name)) continue;
    if (kind === 'image' && media !== 'videos') {
      const item: MediaListItem = { url: serveUrlFor(libraryPath), type: 'image' };
      const companion = clipFor(entry.name);
      if (companion) item.liveUrl = await tokenedServeUrl(pathOf(companion));
      items.push(item);
    } else if (kind === 'video' && media !== 'photos') {
      items.push({ url: await tokenedServeUrl(libraryPath), type: 'video' });
    }
  }
  return items;
}

const noClip = (): string | undefined => undefined;

/**
 * A movie's serve URL with a media token bound to the same `file` value the
 * serve route reads back, because a bare `<video src>` cannot send the
 * display's bearer token.
 */
async function tokenedServeUrl(libraryPath: string): Promise<string> {
  const token = await mintMediaToken(libraryPath);
  return serveUrlFor(libraryPath) + (token ? `&mt=${encodeURIComponent(token)}` : '');
}

export const libraryPhotoSource: PhotoSourceAdapter<'library'> = {
  kind: 'library',

  async list({ source, media }) {
    if (source.pictures) {
      // Chosen pictures play as they are, in the order chosen; videos are never chosen.
      return media === 'videos' ? [] : source.pictures
        .filter((path) => libraryMediaKind(path) === 'image')
        .map((path) => ({ url: serveUrlFor(path), type: 'image' as const }));
    }
    // A folder plays all of itself; it has no per-refresh count.
    return (await listLibraryMedia(source.folder, media, { pairLivePhotos: true })) ?? [];
  },

  async pickOne({ source, previous }) {
    const clean = cleanLibraryFolder(source.folder);
    const pictures = source.pictures
      ? source.pictures.filter((path) => libraryMediaKind(path) === 'image')
      : ((await listLibraryMedia(clean, 'photos')) ?? [])
        .map((item) => new URL(item.url, 'http://local').searchParams.get('file'))
        .filter((file): file is string => !!file);
    if (pictures.length === 0) return null;
    // A rotation that lands on the picture already showing doesn't rotate.
    const others = pictures.length > 1 ? pictures.filter((file) => file !== previous) : pictures;
    return { kind: 'library', path: others[Math.floor(Math.random() * others.length)] };
  },
};
