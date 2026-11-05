import { createWriteStream, promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import { BACKGROUNDS_DIR } from './constants';
import { mediaKindOf } from './media-formats';
import { isRotationFile } from './background-rotation-cache';
import { readImageDimensions } from './image-dimensions';
import type { MediaInventoryDirectory, MediaInventoryItem, MediaInventoryStorage } from './media-inventory';

/**
 * Shared filesystem plumbing for the media library (public/backgrounds).
 * Every writer — user uploads and iCloud imports alike — goes through the
 * same traversal guard and the same streaming write, so the anti-OOM and
 * anti-escape properties can't drift between entry points.
 */

/** Absolute path of the media library root. Computed per call so tests that
 *  override process.cwd() (or the vitest sandbox chdir) always resolve into
 *  their own isolated library. */
export function libraryRoot(): string {
  return path.join(process.cwd(), BACKGROUNDS_DIR);
}

/** Validate and resolve a library-relative path, preventing directory traversal. */
export function safeLibraryPath(relativePath: string): string | null {
  const root = libraryRoot();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

/**
 * What the library shows the file at a library-relative path as: a picture,
 * a video, or nothing. Top-level `rotation-` downloads belong to the
 * background rotation and are nothing here. Every listing and count of the
 * library reads files through this, so a folder's number is always the
 * number of pictures its grid draws.
 */
export function libraryMediaKind(libraryPath: string): 'image' | 'video' | null {
  if (isRotationFile(libraryPath) || isPlaceholderFile(libraryPath)) return null;
  return mediaKindOf(libraryPath);
}

/**
 * The app's own placeholder picture ships in the library root, so an
 * installed hub has it among the family's files; it is never one of theirs
 * to list, pick or back up.
 */
export function isPlaceholderFile(libraryPath: string): boolean {
  return libraryPath === 'default.svg';
}

/**
 * Library paths of the pictures and videos directly inside one folder ('' for
 * the top level), the same set the inventory lists for it (`libraryMediaKind`).
 * A missing or unreadable folder holds nothing.
 */
export async function listLibraryFolder(folder: string): Promise<string[]> {
  const abs = folder === '' ? libraryRoot() : safeLibraryPath(folder);
  if (!abs) return [];
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const libraryPath = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isFile() && libraryMediaKind(libraryPath)) out.push(libraryPath);
  }
  return out;
}

/**
 * Stream a web ReadableStream to a library file in chunks — never the whole
 * asset in memory, because the hub is often a Raspberry Pi and imports
 * include videos of tens to hundreds of MB. Enforces the byte cap WHILE
 * writing (a Content-Length header can lie or be absent).
 *
 * The bytes go to a temporary name beside the file and take the final name
 * only once the whole body has landed, so the library never holds truncated
 * media under a name the wall would serve: not after an overflow or a
 * dropped connection (the partial file is removed), not after a power cut
 * mid-write (the stray `.tmp` is never served), and a replacement keeps the
 * old picture whole until the new one is complete.
 */
export async function writeLibraryFile(
  filePath: string,
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<void> {
  const tmp = await writeLibraryFileTemp(filePath, body, maxBytes);
  try {
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => { /* nothing to clean */ });
    throw err;
  }
}

/**
 * The first half of `writeLibraryFile`: the whole body lands under a
 * temporary name beside `filePath` and that name is returned, so a caller
 * with several files to place (a backup restore) can write them all before
 * renaming any, and remove the temporary files if something before the
 * renames fails. A `.tmp` name is never served or listed.
 */
export async function writeLibraryFileTemp(
  filePath: string,
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string> {
  if (!body) throw new Error('empty response body');
  let written = 0;
  const cap = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      written += chunk.length;
      if (written > maxBytes) callback(new Error(`file exceeds the ${maxBytes} byte limit`));
      else callback(null, chunk);
    },
  });
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await pipeline(
      Readable.fromWeb(body as import('stream/web').ReadableStream),
      cap,
      createWriteStream(tmp),
    );
    return tmp;
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => { /* nothing to clean */ });
    throw err;
  }
}

/** Dimensions are re-read only when a file's size or mtime changes; a page
 *  refresh after one delete must not re-parse every header in the library.
 *  Bounded by a full clear so a churning library cannot grow it forever. */
const DIMENSION_CACHE_MAX = 5000;
interface DimensionCacheEntry {
  size: number;
  mtimeMs: number;
  dims: { width: number; height: number } | undefined;
}
const dimensionCache = new Map<string, DimensionCacheEntry>();

/** Stable output order regardless of readdir ordering. */
function byPath<T extends { path: string }>(a: T, b: T): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

async function cachedImageDimensions(
  full: string,
  stat: { size: number; mtimeMs: number },
): Promise<{ width: number; height: number } | undefined> {
  const hit = dimensionCache.get(full);
  if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) return hit.dims;
  const dims = await readImageDimensions(full, stat.size);
  if (dimensionCache.size >= DIMENSION_CACHE_MAX) dimensionCache.clear();
  dimensionCache.set(full, { size: stat.size, mtimeMs: stat.mtimeMs, dims });
  return dims;
}

export interface LibraryWalk {
  items: MediaInventoryItem[];
  directories: MediaInventoryDirectory[];
  /** Top-level rotation files: on disk, so not "missing", but never listed. */
  hidden: string[];
}

/**
 * Walk the library two folder levels deep (root files, subfolder files, and
 * one nesting below that, the same shape `scanDirectories` covers). Every
 * image-or-video file becomes an item; every subfolder becomes a directory
 * entry, empty folders included. Symlinks are skipped, as the picker listing
 * skips them, and so are the top-level rotation files the background
 * rotation writes and prunes on its own. A missing or unreadable folder
 * contributes nothing rather than failing the request. The inventory page
 * and a backup's picture list both read the library through this, so they
 * can never disagree about what the library holds.
 */
export async function walkLibrary(): Promise<LibraryWalk> {
  const items: MediaInventoryItem[] = [];
  const directories: MediaInventoryDirectory[] = [];
  const hidden: string[] = [];

  async function scan(dir: string, rel: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Folders live at most two deep; a third level is never listed.
        if (depth >= 2) continue;
        const relDir = rel ? `${rel}/${entry.name}` : entry.name;
        await scan(full, relDir, depth + 1);
        directories.push({ name: entry.name, path: relDir });
        continue;
      }
      if (!entry.isFile()) continue;
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const kind = libraryMediaKind(relPath);
      if (!kind) {
        // Not listed, but a picture the rotation is showing is not missing.
        if (isRotationFile(relPath)) hidden.push(relPath);
        continue;
      }
      let stat;
      try {
        stat = await fs.stat(full);
      } catch {
        continue;
      }
      const item: MediaInventoryItem = {
        path: relPath,
        kind,
        bytes: stat.size,
        mtimeMs: Math.round(stat.mtimeMs),
      };
      if (kind === 'image') {
        const dims = await cachedImageDimensions(full, stat);
        if (dims) {
          item.width = dims.width;
          item.height = dims.height;
        }
      }
      items.push(item);
    }
  }

  await scan(libraryRoot(), '', 0);
  items.sort(byPath);
  directories.sort(byPath);
  return { items, directories, hidden };
}

/** Free space on the volume holding the library; absent when the platform
 *  cannot say (statfs is best-effort, never a reason to fail the page). */
export async function volumeSpace(): Promise<Pick<MediaInventoryStorage, 'freeBytes' | 'totalBytes'>> {
  try {
    const stats = await fs.statfs(libraryRoot());
    return { freeBytes: stats.bsize * stats.bavail, totalBytes: stats.bsize * stats.blocks };
  } catch {
    return {};
  }
}
