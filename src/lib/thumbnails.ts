import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { Sharp } from 'sharp';
import { getDataRoot } from '@/lib/data-root';
import type { PictureBox } from '@/lib/media-paths';

type SharpModule = typeof import('sharp').default;

/**
 * Smaller copies of library pictures, made by the serve route on first ask:
 *
 * - Grid thumbnails: small WebP copies for the Pictures & videos grid and the
 *   photo pickers, so opening a grid costs a few hundred KB instead of the
 *   originals (a phone JPEG is 3 MB or more, and a library holds dozens).
 * - Wall copies: the picture resized to still cover the box it is shown in
 *   (a screen, a slideshow card), so the wall never decodes a 12 to 48
 *   megapixel camera original to paint a 2 megapixel panel.
 *
 * Copies live under `data/thumbnails/`, named by a hash of the library path,
 * the kind and size of copy, and the size and mtime of the original: any
 * change to the file produces a new name, and the stale sibling is removed
 * the next time that copy is made. Nothing here is durable data: a wiped
 * folder is rebuilt on demand and it is never part of a backup.
 */

export const THUMBNAIL_DIR = 'data/thumbnails';

/** The only widths the serve route will produce, so a client cannot fill
 *  the disk by asking for every size in turn. */
export const THUMBNAIL_WIDTHS: readonly number[] = [320, 480, 640];

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

// ── One resize at a time ─────────────────────────────────────────────

/**
 * Wall copies go first: a slideshow waiting on its next photo matters more
 * than a grid tile, and the first look at a big folder queues dozens of those.
 */
type ResizePriority = 'wall' | 'grid';

/**
 * Resizes run one at a time, each on one libvips thread. On a Pi a resize is
 * a few hundred milliseconds of a core, and sharp by default takes every core
 * and shares Node's small thread pool with the file reads every wall poll
 * needs: the first look at a folder of 200 photos stalled the hub for
 * minutes. In a queue the wall's own requests keep flowing.
 */
const MAX_ACTIVE_RESIZES = 1;
let activeResizes = 0;
const waiting: Record<ResizePriority, Array<() => void>> = { wall: [], grid: [] };

async function withResizeSlot<T>(priority: ResizePriority, run: () => Promise<T>): Promise<T> {
  if (activeResizes < MAX_ACTIVE_RESIZES) activeResizes++;
  else await new Promise<void>((resolve) => waiting[priority].push(resolve));
  try {
    return await run();
  } finally {
    // Hand the slot straight to the next job, or give it back.
    const next = waiting.wall.shift() ?? waiting.grid.shift();
    if (next) next();
    else activeResizes--;
  }
}

/** Resizes running and waiting, by priority. */
export function __resizeQueueForTests(): { active: number; wall: number; grid: number } {
  return { active: activeResizes, wall: waiting.wall.length, grid: waiting.grid.length };
}

let sharpLoad: Promise<SharpModule> | null = null;

/**
 * Loaded on the first resize, not at the top: a hub whose walls show only
 * starter backgrounds or cloud photos never needs the image library.
 */
function loadSharp(): Promise<SharpModule> {
  sharpLoad ??= import('sharp').then(({ default: sharp }) => {
    // The queue above is the parallelism; libvips' own cache only helps when
    // the same image is processed again in memory, which a copy written to
    // disk never is.
    sharp.concurrency(1);
    sharp.cache(false);
    return sharp;
  });
  return sharpLoad;
}

/** Generation in flight per cache file, so two requests for the same copy
 *  at once share one resize instead of racing over the file. */
const inFlight = new Map<string, Promise<string | null>>();

async function existing(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make one cached copy through the queue. `make` returns the bytes and the
 * extension to store them under, or null to record that the original should
 * be served as it is (an empty marker file, so the answer survives a restart
 * without loading the image library again).
 */
async function cachedCopy(
  stem: string,
  prefix: string,
  priority: ResizePriority,
  make: (sharp: SharpModule) => Promise<{ buffer: Buffer; ext: string } | null>,
): Promise<string | null> {
  const pending = inFlight.get(stem);
  if (pending) return pending;
  const job = withResizeSlot(priority, async () => {
    const root = thumbnailRoot();
    await fs.mkdir(root, { recursive: true });
    const made = await make(await loadSharp());
    const name = made ? `${stem}${made.ext}` : `${stem}${ORIGINAL_MARKER}`;
    const target = path.join(root, name);
    // Write beside, then rename, so a concurrent reader never sees a partial file.
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, made ? made.buffer : '');
    await fs.rename(tmp, target);
    // The original changed (new size or mtime): its previous copies of this
    // kind are dead weight now.
    await pruneSiblings(root, prefix, name);
    return made ? target : null;
  });
  inFlight.set(stem, job);
  try {
    return await job;
  } finally {
    inFlight.delete(stem);
  }
}

// ── Grid thumbnails ──────────────────────────────────────────────────

/**
 * Absolute path of the cached thumbnail for `absPath` at `width`, generating
 * it when missing. Throws when the original cannot be decoded; the caller
 * falls back to serving the original.
 */
export async function thumbnailPath(absPath: string, libraryPath: string, width: number): Promise<string> {
  const stat = await fs.stat(absPath);
  const prefix = `${hashOf(libraryPath)}-w${width}-`;
  const stem = `${prefix}${stat.size}-${Math.round(stat.mtimeMs)}`;
  const target = path.join(thumbnailRoot(), `${stem}.webp`);
  if (await existing(target)) return target;
  const made = await cachedCopy(stem, prefix, 'grid', async (sharp) => ({
    buffer: await sharp(absPath)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer(),
    ext: '.webp',
  }));
  return made ?? target;
}

// ── Wall copies ──────────────────────────────────────────────────────

/** Marks a wall copy that would not be worth making: serve the original. */
const ORIGINAL_MARKER = '.orig';
const WALL_COPY_EXTS = ['.jpg', '.webp', ORIGINAL_MARKER] as const;

/**
 * An original no more than this much larger than the box on its tighter side
 * is served as it is: a copy would save little and cost a re-encode.
 */
const KEEP_ORIGINAL_SCALE = 0.8;

/** EXIF orientations 5 to 8 turn the picture a quarter, swapping its sides. */
function orientedSize(meta: { width?: number; height?: number; orientation?: number }): { w: number; h: number } {
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  return (meta.orientation ?? 1) >= 5 ? { w: h, h: w } : { w, h };
}

async function wallCopy(image: Sharp, box: PictureBox): Promise<{ buffer: Buffer; ext: string } | null> {
  const meta = await image.metadata();
  // An animated WebP or AVIF would lose its animation in a still copy.
  if ((meta.pages ?? 1) > 1) return null;
  const { w, h } = orientedSize(meta);
  if (!w || !h) return null;
  // Cover-fit: the side that needs the most pixels decides.
  if (Math.max(box.w / w, box.h / h) >= KEEP_ORIGINAL_SCALE) return null;
  const resized = image
    .rotate()
    .resize({ width: box.w, height: box.h, fit: 'outside', withoutEnlargement: true });
  // JPEG decodes fastest on a Pi; a picture with transparency (a logo in an
  // image card) keeps it as WebP.
  return meta.hasAlpha
    ? { buffer: await resized.webp({ quality: 82 }).toBuffer(), ext: '.webp' }
    : { buffer: await resized.jpeg({ quality: 82 }).toBuffer(), ext: '.jpg' };
}

/**
 * Absolute path of a copy of `absPath` that still covers `box` (both sides at
 * least as large, whatever the picture's shape, so `cover` and `contain` both
 * stay sharp), generating it when missing. Null means serve the original: it
 * is already about the size of the box, or animated. Throws when the original
 * cannot be decoded; the caller falls back to serving the original.
 */
export async function wallCopyPath(absPath: string, libraryPath: string, box: PictureBox): Promise<string | null> {
  const stat = await fs.stat(absPath);
  const prefix = `${hashOf(libraryPath)}-c${box.w}x${box.h}-`;
  const stem = `${prefix}${stat.size}-${Math.round(stat.mtimeMs)}`;
  const root = thumbnailRoot();
  for (const ext of WALL_COPY_EXTS) {
    if (await existing(path.join(root, `${stem}${ext}`))) {
      return ext === ORIGINAL_MARKER ? null : path.join(root, `${stem}${ext}`);
    }
  }
  return cachedCopy(stem, prefix, 'wall', (sharp) => wallCopy(sharp(absPath), box));
}

// ── Clean-up ─────────────────────────────────────────────────────────

async function pruneSiblings(root: string, prefix: string, keep: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }
  await Promise.all(entries
    .filter((entry) => entry.startsWith(prefix) && entry !== keep && !entry.endsWith('.tmp'))
    .map((entry) => fs.unlink(path.join(root, entry)).catch(() => { /* raced */ })));
}

/** Drop every cached copy of one library file; called when it is deleted. */
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
