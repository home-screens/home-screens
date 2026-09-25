import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { getDataRoot } from '@/lib/data-root';

/**
 * Small WebP copies of library pictures for the Pictures & videos grid, so
 * opening the page costs a few hundred KB instead of the originals (a phone
 * JPEG is 3 MB or more, and a library holds dozens).
 *
 * Copies live under `data/thumbnails/`, named by a hash of the library path
 * plus the width, size and mtime of the original: any change to the file
 * produces a new name, and the stale sibling is removed the next time the
 * picture is thumbnailed. Nothing here is durable data: a wiped folder is
 * rebuilt on demand and it is never part of a backup.
 */

export const THUMBNAIL_DIR = 'data/thumbnails';

/** The only widths the serve route will produce, so a client cannot fill
 *  the disk by asking for every size in turn. */
export const THUMBNAIL_WIDTHS: readonly number[] = [320, 480, 640];

/** Formats sharp resizes into a still WebP. GIF stays whole (it may animate)
 *  and SVG is already small and scales itself. */
const RESIZABLE_RE = /\.(jpe?g|jfif|pjpeg|pjp|png|webp|avif)$/i;

export function canThumbnail(libraryPath: string): boolean {
  return RESIZABLE_RE.test(libraryPath);
}

export function thumbnailWidth(raw: string | null): number | null {
  if (!raw) return null;
  const width = Number(raw);
  return THUMBNAIL_WIDTHS.includes(width) ? width : null;
}

function thumbnailRoot(): string {
  return path.join(getDataRoot(), THUMBNAIL_DIR);
}

function hashOf(libraryPath: string): string {
  return createHash('sha1').update(libraryPath).digest('hex').slice(0, 20);
}

/** Generation in flight per cache file, so two tiles asking for the same
 *  picture at once share one resize instead of racing over the file. */
const inFlight = new Map<string, Promise<string>>();

/**
 * Absolute path of the cached thumbnail for `absPath` at `width`, generating
 * it when missing. Throws when the original cannot be decoded; the caller
 * falls back to serving the original.
 */
export async function thumbnailPath(absPath: string, libraryPath: string, width: number): Promise<string> {
  const stat = await fs.stat(absPath);
  const prefix = `${hashOf(libraryPath)}-w${width}-`;
  const name = `${prefix}${stat.size}-${Math.round(stat.mtimeMs)}.webp`;
  const root = thumbnailRoot();
  const target = path.join(root, name);
  try {
    await fs.access(target);
    return target;
  } catch {
    // Not cached yet.
  }
  const pending = inFlight.get(target);
  if (pending) return pending;
  const job = (async () => {
    await fs.mkdir(root, { recursive: true });
    // Loaded here, not at the top: the serve route that imports this file is
    // what every wall with a library background asks, and walls never want
    // a thumbnail, so they should not pay for loading the image library.
    const { default: sharp } = await import('sharp');
    const buffer = await sharp(absPath)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    // Write beside, then rename, so a concurrent reader never sees a partial file.
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, buffer);
    await fs.rename(tmp, target);
    // The original changed (new size or mtime): its previous copies at this
    // width are dead weight now.
    await pruneSiblings(root, prefix, name);
    return target;
  })();
  inFlight.set(target, job);
  try {
    return await job;
  } finally {
    inFlight.delete(target);
  }
}

async function pruneSiblings(root: string, prefix: string, keep: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }
  await Promise.all(entries
    .filter((entry) => entry.startsWith(prefix) && entry !== keep && entry.endsWith('.webp'))
    .map((entry) => fs.unlink(path.join(root, entry)).catch(() => { /* raced */ })));
}

/** Drop every cached size of one library file; called when it is deleted. */
export async function removeThumbnails(libraryPath: string): Promise<void> {
  const root = thumbnailRoot();
  const prefix = `${hashOf(libraryPath)}-`;
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }
  await Promise.all(entries
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => fs.unlink(path.join(root, entry)).catch(() => { /* raced */ })));
}
