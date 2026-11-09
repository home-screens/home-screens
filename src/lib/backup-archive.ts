/**
 * The zip a backup with pictures travels as, both ways.
 *
 * Export: `composeBackupArchive` streams `backup.json` and then every chosen
 * library file, stored, straight from disk, so a gigabyte library never sits
 * in the hub's memory.
 *
 * Restore: the zip is staged whole under `data/restore-staging/` (one
 * request, streamed to disk), its central directory is read once to pull out
 * the bundle and list the picture entries, and the restore then streams each
 * picture out of it. The staged file is removed when the restore finishes,
 * whatever the outcome, and anything older than a quarter of an hour is
 * swept on the next upload (a phone that lost Wi-Fi between the two calls).
 */

import { ZipArchive } from 'archiver';
import { createWriteStream, promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';
import { BUNDLE_ENTRY, PICTURES_PREFIX, pictureEntryPath } from './backup-pictures';
import { safeLibraryPath } from './library-files';
import { logger } from './logger';

const log = logger('backup');

export const RESTORE_STAGING_DIR = 'data/restore-staging';
/** A staged archive nobody restored within this long is dropped. */
const STAGED_ARCHIVE_TTL_MS = 15 * 60 * 1000;
const STAGED_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function stagingRoot(): string {
  return path.join(process.cwd(), RESTORE_STAGING_DIR);
}

/** The staged archive an id names, or null for an id that is not ours. */
export function stagedArchivePath(id: unknown): string | null {
  if (typeof id !== 'string' || !STAGED_ID_RE.test(id)) return null;
  return path.join(stagingRoot(), `${id}.zip`);
}

// ── Export ───────────────────────────────────────────────────────────

export interface ArchivePicture {
  /** Library-relative path, the zip entry's name under `pictures/`. */
  path: string;
}

/**
 * A zip of the bundle and the pictures, as a stream. `bundle` is the exact
 * JSON a plain backup would write, placed first. A file that vanished
 * between the listing and the read is left out, not a failed backup.
 */
export function composeBackupArchive(bundle: unknown, pictures: readonly ArchivePicture[]): Readable {
  // Stored, not deflated: pictures and videos do not shrink, and deflate
  // costs a Pi real time on a 100 MB library. One stat at a time: archiver
  // queues a file when its lstat returns, so concurrent stats would write
  // the pictures in whatever order the disk answered, not the library's.
  const archive = new ZipArchive({ store: true, statConcurrency: 1 });
  archive.on('error', (err) => { archive.destroy(err); });
  archive.on('warning', (err) => { log.warn('Backup archive skipped a file', err.message); });
  archive.append(JSON.stringify(bundle, null, 2), { name: BUNDLE_ENTRY });
  for (const picture of pictures) {
    const abs = safeLibraryPath(picture.path);
    if (!abs) continue;
    archive.file(abs, { name: PICTURES_PREFIX + picture.path });
  }
  archive.finalize();
  return archive;
}

// ── Restore ──────────────────────────────────────────────────────────

/** Remove staged archives nobody restored, and the one `keep` names never. */
export async function sweepStagedArchives(keep?: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(stagingRoot());
  } catch {
    return;
  }
  const cutoff = Date.now() - STAGED_ARCHIVE_TTL_MS;
  await Promise.all(entries.map(async (entry) => {
    const file = path.join(stagingRoot(), entry);
    if (file === keep) return;
    try {
      const stat = await fs.stat(file);
      if (stat.mtimeMs < cutoff) await fs.rm(file, { force: true });
    } catch { /* raced */ }
  }));
}

/**
 * Stream a request body to a new staged archive, capped at `maxBytes`, and
 * answer its id. The bytes land under a `.part` name and take the `.zip`
 * name only once whole, so a dropped upload never reads as a backup.
 */
export async function stageRestoreArchive(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string> {
  if (!body) throw new Error('empty body');
  await fs.mkdir(stagingRoot(), { recursive: true });
  const id = randomUUID();
  const final = stagedArchivePath(id)!;
  const part = `${final}.part`;
  let written = 0;
  const cap = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      written += chunk.length;
      if (written > maxBytes) callback(new ArchiveTooLargeError());
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as import('stream/web').ReadableStream), cap, createWriteStream(part));
    await fs.rename(part, final);
  } catch (err) {
    await fs.rm(part, { force: true }).catch(() => {});
    throw err;
  }
  return id;
}

export class ArchiveTooLargeError extends Error {
  constructor() {
    super('archive exceeds the space available');
    this.name = 'ArchiveTooLargeError';
  }
}

export interface ArchivePictureEntry {
  entryName: string;
  libraryPath: string;
  bytes: number;
}

export interface InspectedArchive {
  /** The bundle's raw JSON text, parsed by the restore with its own cap. */
  bundleText: string;
  pictures: ArchivePictureEntry[];
  /** Entries that are not pictures of ours (see `pictureEntryPath`). */
  skipped: number;
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return yauzl.openPromise(file, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true });
}

/** Every entry of a zip, one at a time; `onEntry` may read the entry's stream before the next is read. */
function forEachEntry(zipfile: yauzl.ZipFile, onEntry: (entry: yauzl.Entry) => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    zipfile.on('entry', (entry: yauzl.Entry) => {
      onEntry(entry).then(() => zipfile.readEntry(), (err) => { zipfile.close(); reject(err); });
    });
    zipfile.on('end', resolve);
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

async function readEntryText(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<string> {
  const stream = await zipfile.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Read the central directory once: the bundle's text and the picture
 * entries a restore may write. Null when the file is not a zip or holds no
 * `backup.json`; the bundle's text is left unread when it is over `maxBundleBytes`
 * (answered as null too, since a bundle that big is not one we wrote).
 */
export async function inspectRestoreArchive(file: string, maxBundleBytes: number): Promise<InspectedArchive | null> {
  let zipfile: yauzl.ZipFile;
  try {
    zipfile = await openZip(file);
  } catch {
    return null;
  }
  let bundleText: string | null = null;
  const pictures: ArchivePictureEntry[] = [];
  let skipped = 0;
  try {
    await forEachEntry(zipfile, async (entry) => {
      if (entry.fileName === BUNDLE_ENTRY) {
        if (entry.uncompressedSize <= maxBundleBytes) bundleText = await readEntryText(zipfile, entry);
        return;
      }
      if (entry.fileName.endsWith('/')) return;
      const libraryPath = pictureEntryPath(entry.fileName);
      if (!libraryPath) { skipped += 1; return; }
      pictures.push({ entryName: entry.fileName, libraryPath, bytes: entry.uncompressedSize });
    });
  } catch {
    return null;
  } finally {
    zipfile.close();
  }
  if (bundleText === null) return null;
  return { bundleText, pictures, skipped };
}

/**
 * The bytes of one entry as a web stream, for `writeLibraryFileTemp`. The
 * zip is opened per entry; the restore writes files one after another, and
 * a yauzl handle cannot hand out two streams at once.
 */
export async function openArchiveEntry(file: string, entryName: string): Promise<ReadableStream<Uint8Array>> {
  const zipfile = await openZip(file);
  return new Promise((resolve, reject) => {
    let found = false;
    zipfile.on('entry', (entry: yauzl.Entry) => {
      if (entry.fileName !== entryName) { zipfile.readEntry(); return; }
      found = true;
      zipfile.openReadStream(entry, (err, stream) => {
        if (err) { zipfile.close(); reject(err); return; }
        stream.on('end', () => zipfile.close());
        stream.on('error', () => zipfile.close());
        resolve(Readable.toWeb(stream) as ReadableStream<Uint8Array>);
      });
    });
    zipfile.on('end', () => { if (!found) { zipfile.close(); reject(new Error(`${entryName} is not in the archive`)); } });
    zipfile.on('error', (err: Error) => { zipfile.close(); reject(err); });
    zipfile.readEntry();
  });
}

/** The text of one small entry (an SVG's source for the size check). */
export async function readArchiveEntryText(file: string, entryName: string): Promise<string> {
  const stream = await openArchiveEntry(file, entryName);
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(stream as import('stream/web').ReadableStream)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}
