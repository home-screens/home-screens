import { folderOf } from '@/lib/media-paths';
import { slideshowPlays, type SlideshowFolder } from '@/lib/media-usage';
import type { MediaInventoryDirectory, MediaInventoryItem } from '@/lib/media-inventory';

/**
 * How the phone's Photos tab reads the library: which walls show each folder,
 * the order its folder chips go in, and what each folder holds. Pure, so the
 * rules are tested once and the tab only draws them.
 */

/** One folder as the phone lists it. */
export interface PhotoFolder {
  /** Library-relative path; '' is the library's top level ("Main folder"). */
  path: string;
  /** The last segment, drawn after `parent` so two folders named 2025 in
   *  different places never look alike. */
  name: string;
  /** The folder it sits inside ('' at the top level). */
  parent: string;
  /** A slideshow on some wall plays this folder. */
  onWall: boolean;
  /** The folder is in the library. One a slideshow names but nobody has made
   *  yet (the Photo Frame template's) is listed so a picture can go there,
   *  and the first one added makes it. */
  exists: boolean;
  images: number;
  videos: number;
  /** It has folders inside it, which also stop it being deleted. */
  hasSubfolders: boolean;
}

/**
 * Every folder the phone offers, in chip order: the ones a wall shows first
 * (in the order the walls list them), then the top level, then the rest by
 * path. A folder a slideshow plays is listed even when it does not exist yet,
 * since adding a picture there is how it starts showing anything.
 *
 * A folder holding nothing but other folders (Trips, around Trips/2025) is
 * left out: each folder inside it already shows its whole path, so its chip
 * would only ever open onto an empty grid. It comes back once it holds a
 * picture of its own, or is on a wall, or `keep` names it (the one open).
 */
export function photoFolders(
  items: readonly MediaInventoryItem[],
  directories: readonly MediaInventoryDirectory[],
  slideshows: readonly SlideshowFolder[],
  keep?: string,
): PhotoFolder[] {
  const counts = new Map<string, { images: number; videos: number }>();
  for (const item of items) {
    const folder = folderOf(item.path);
    const count = counts.get(folder) ?? { images: 0, videos: 0 };
    if (item.kind === 'image') count.images += 1;
    else count.videos += 1;
    counts.set(folder, count);
  }
  const exists = new Set(['', ...directories.map((d) => d.path)]);
  const onWall = new Set(slideshows.map((s) => s.folder));
  const paths = [...new Set([...exists, ...onWall])];
  const withSubfolders = new Set(directories.map((d) => folderOf(d.path)));

  const build = (path: string): PhotoFolder => {
    const count = counts.get(path) ?? { images: 0, videos: 0 };
    return {
      path,
      name: path.slice(path.lastIndexOf('/') + 1),
      parent: folderOf(path),
      onWall: onWall.has(path),
      exists: exists.has(path),
      images: count.images,
      videos: count.videos,
      hasSubfolders: withSubfolders.has(path),
    };
  };

  const ordered: string[] = [];
  for (const slideshow of slideshows) {
    if (onWall.has(slideshow.folder) && !ordered.includes(slideshow.folder)) ordered.push(slideshow.folder);
  }
  if (!ordered.includes('')) ordered.push('');
  const rest = paths.filter((p) => p !== '' && !ordered.includes(p)).sort((a, b) => a.localeCompare(b));
  return [...ordered, ...rest]
    .map(build)
    .filter((f) => f.path === '' || f.path === keep || f.onWall || f.images + f.videos > 0 || !f.hasSubfolders);
}

/**
 * The name a family knows a wall by. With several displays that is the
 * display ("Kitchen"); with one, the screen the slideshow sits on, since the
 * lone display has no name of its own.
 */
export function wallName(slideshow: SlideshowFolder, multiDisplay: boolean): string | undefined {
  return (multiDisplay ? slideshow.displayName : undefined) ?? slideshow.use.name;
}

/**
 * The walls that play a folder, each named once, in config order. With
 * `kinds`, only walls whose slideshow plays at least one of those kinds (a
 * photos-only slideshow never shows the video just added to its folder).
 * A wall with no name at all reads as `unnamed`.
 */
export function wallsShowing(
  folder: string,
  slideshows: readonly SlideshowFolder[],
  multiDisplay: boolean,
  unnamed: string,
  kinds?: ReadonlyArray<'image' | 'video'>,
): string[] {
  const names: string[] = [];
  for (const slideshow of slideshows) {
    if (slideshow.folder !== folder) continue;
    if (kinds && !kinds.some((kind) => slideshowPlays(slideshow.shows, kind))) continue;
    const name = wallName(slideshow, multiDisplay) || unnamed;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}
