import { createWriteStream, promises as fs } from 'fs';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import path from 'path';
import { BACKGROUNDS_DIR } from './constants';

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

/** Size caps shared by uploads and imports. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image file
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB per video file

/** Validate and resolve a library-relative path, preventing directory traversal. */
export function safeLibraryPath(relativePath: string): string | null {
  const root = libraryRoot();
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

/**
 * Stream a web ReadableStream to a library file in chunks — never the whole
 * asset in memory, because the hub is often a Raspberry Pi and imports
 * include videos of tens to hundreds of MB. Enforces the byte cap WHILE
 * writing (a Content-Length header can lie or be absent); on overflow or any
 * mid-stream failure the partial file is removed so the library never holds
 * truncated media.
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
  try {
    await pipeline(
      Readable.fromWeb(body as import('stream/web').ReadableStream),
      cap,
      createWriteStream(filePath),
    );
  } catch (err) {
    await fs.rm(filePath, { force: true }).catch(() => { /* nothing to clean */ });
    throw err;
  }
}
