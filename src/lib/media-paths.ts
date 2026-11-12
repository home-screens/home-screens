/**
 * Library path helpers shared by the server (inventory, usage scan) and the
 * editor (grid, viewer). Nothing here touches the DOM or the filesystem.
 * A library path is `folder/name` with posix separators and no leading slash.
 */

/** Width of the WebP copy a grid tile asks the serve route for: tiles are
 *  168px and up, so this covers a 2x screen without fetching originals. */
export const TILE_THUMBNAIL_WIDTH = 480;

/**
 * `width` asks for the small copy the grid shows; `version` (the file's
 * modified time) is ignored by the server and exists so a replaced file gets
 * a new URL, since an <img> or <video> never re-requests an unchanged one.
 */
export function serveUrlFor(libraryPath: string, options?: { width?: number; version?: number }): string {
  let url = `/api/backgrounds/serve?file=${encodeURIComponent(libraryPath)}`;
  if (options?.width) url += `&w=${options.width}`;
  if (options?.version) url += `&v=${options.version}`;
  return url;
}

/** Only files the rotation savers wrote themselves (top-level, this prefix);
 *  user uploads and iCloud imports never carry it, so pruning can't touch
 *  them and the library page never lists them. */
export const ROTATION_FILE_RE = /^rotation-/;

/** True for a library-relative path the rotation feature owns. */
export function isRotationFile(libraryPath: string): boolean {
  return !libraryPath.includes('/') && ROTATION_FILE_RE.test(libraryPath);
}

const SERVE_PREFIX = '/api/backgrounds/serve?';

/** Formats the serve route can make smaller copies of. GIF stays whole (it
 *  may animate) and SVG is already small and scales itself. */
const RESIZABLE_RE = /\.(jpe?g|jfif|pjpeg|pjp|png|webp|avif)$/i;

export function canResizePicture(libraryPath: string): boolean {
  return RESIZABLE_RE.test(libraryPath);
}

/**
 * The grid-tile copy of a library picture from its serve URL, for grids built
 * from URLs the list route hands out rather than from library paths. Anything
 * that is not a library picture comes back unchanged.
 */
export function tileThumbnailUrl(url: string): string {
  if (!url.startsWith(SERVE_PREFIX)) return url;
  const params = new URLSearchParams(url.slice(SERVE_PREFIX.length));
  if (params.has('w') || params.has('mt')) return url;
  return `${url}&w=${TILE_THUMBNAIL_WIDTH}`;
}

/**
 * Box sizes the wall asks for a library picture at. A request is rounded up
 * to the next step on each side, so one picture has a handful of cached
 * copies at most (the serve route refuses anything off this list) and the
 * common panel sides (1080, 1920, 2160, 3840) are steps of their own.
 */
export const DISPLAY_SIZE_STEPS: readonly number[] = [240, 360, 480, 720, 1080, 1440, 1920, 2160, 2560, 3840];

export interface PictureBox {
  w: number;
  h: number;
}

function sizeStep(px: number): number {
  return DISPLAY_SIZE_STEPS.find((step) => px <= step) ?? DISPLAY_SIZE_STEPS[DISPLAY_SIZE_STEPS.length - 1];
}

/**
 * A library picture's serve URL asking for a copy that still covers `box`
 * (canvas pixels) instead of the original, which is often a 12 to 48
 * megapixel camera file the wall would decode on every show. Everything else
 * (static paths, cloud sources, videos, GIF and SVG) comes back unchanged.
 */
export function displaySizedUrl(url: string | undefined, box: PictureBox | undefined): string | undefined {
  if (!url || !box || !url.startsWith(SERVE_PREFIX)) return url;
  if (!(box.w > 0 && box.h > 0)) return url;
  const params = new URLSearchParams(url.slice(SERVE_PREFIX.length));
  const file = params.get('file');
  if (!file || params.has('w') || params.has('mt') || !canResizePicture(file)) return url;
  return `${url}&w=${sizeStep(box.w)}&h=${sizeStep(box.h)}`;
}

/**
 * The size a `width` x `height` picture is drawn at when it has to fit whole
 * inside `box` (object-fit: contain), never enlarged. A viewer asks for a copy
 * of this size: a sized copy covers the box it is asked for, so asking with
 * the screen itself would fetch far more picture than a contained photo shows.
 */
export function fitInside(width: number, height: number, box: PictureBox): PictureBox {
  const scale = Math.min(box.w / width, box.h / height, 1);
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

/** The box a `w`/`h` pair names, or null unless both are listed steps. */
export function displaySizeBox(w: string | null, h: string | null): PictureBox | null {
  const width = Number(w);
  const height = Number(h);
  if (!DISPLAY_SIZE_STEPS.includes(width) || !DISPLAY_SIZE_STEPS.includes(height)) return null;
  return { w: width, h: height };
}

export function fileNameOf(libraryPath: string): string {
  return libraryPath.slice(libraryPath.lastIndexOf('/') + 1);
}

/** Folder a file sits directly in: '' for the library's top level. */
export function folderOf(libraryPath: string): string {
  const idx = libraryPath.lastIndexOf('/');
  return idx === -1 ? '' : libraryPath.slice(0, idx);
}

/** Lower-case extension including the dot, '' when there is none. */
export function extensionOf(libraryPath: string): string {
  const name = fileNameOf(libraryPath);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/** Upper-case extension, the tag a tile and the viewer show for the format. */
export function typeTagOf(libraryPath: string): string {
  return extensionOf(libraryPath).slice(1).toUpperCase();
}

/**
 * A library picture's name as a person reads it. A picture picked from
 * Immich, Unsplash or NASA is stored as `<title>--<source>-<id>.<ext>` (the
 * id keeps a repeat pick from making a duplicate); the id part is left out
 * here, so "colors-of-the-moon--nasa-2026-11-01.jpg" reads as
 * "colors-of-the-moon.jpg". Any other file reads as its file name.
 */
export function pictureDisplayName(libraryPath: string): string {
  const name = fileNameOf(libraryPath);
  const titled = /^(.+?)--(?:immich|unsplash|nasa)-.+?(\.[^.]+)$/.exec(name);
  return titled ? `${titled[1]}${titled[2]}` : name;
}
