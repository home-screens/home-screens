import { createWriteStream, promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import { BACKGROUNDS_DIR } from './constants';
import { mediaKindOf } from './media-formats';
import { isRotationFile } from './background-rotation-cache';

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
  if (isRotationFile(libraryPath)) return null;
  return mediaKindOf(libraryPath);
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
    await fs.rename(tmp, filePath);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => { /* nothing to clean */ });
    throw err;
  }
}
