/**
 * Which library pictures a backup carries, and how the ones in a backup come
 * back. Pure rules, shared by the export route (what goes in the zip), the
 * summary the choice is labelled with, and the restore (what a zip entry
 * may land as). Nothing here touches the filesystem; the routes hand in the
 * library walk and the zip's entry list.
 *
 * A backup with pictures is a zip: `backup.json` first, then
 * `pictures/<library path>` per file, stored without compression (JPEG and
 * MP4 do not shrink, and deflate costs a Pi real time). Base64 inside the
 * JSON, the way the icons travel, is wrong at library sizes.
 */

import { scanMediaUsage, scanMissingMedia } from './media-usage';
import { libraryMediaKind } from './library-files';
import { MAX_IMPORT_IMAGE_BYTES, MAX_VIDEO_BYTES } from './media-formats';
import { extensionOf } from './media-paths';
import { svgDeclaresSize } from './svg-intrinsic-size';
import type { MediaInventoryDirectory, MediaInventoryItem } from './media-inventory';

import type { PictureBackupChoice, PictureBackupCount, PictureBackupSummary } from './backup-pictures-types';

export type { PictureBackupChoice, PictureBackupCount, PictureBackupSummary } from './backup-pictures-types';

export const PICTURE_BACKUP_CHOICES: readonly PictureBackupChoice[] = ['off', 'used', 'all'];

export function parsePictureBackupChoice(raw: unknown): PictureBackupChoice | null {
  return typeof raw === 'string' && (PICTURE_BACKUP_CHOICES as readonly string[]).includes(raw)
    ? (raw as PictureBackupChoice)
    : null;
}

/** The zip entry name a library file is stored under. */
export const PICTURES_PREFIX = 'pictures/';
/** The bundle's entry name inside the zip. */
export const BUNDLE_ENTRY = 'backup.json';

interface LibraryListing {
  items: readonly MediaInventoryItem[];
  directories: readonly MediaInventoryDirectory[];
  /** On disk but never listed (top-level rotation files). */
  hidden?: readonly string[];
}

function countOf(items: readonly MediaInventoryItem[]): PictureBackupCount {
  return { count: items.length, bytes: items.reduce((sum, item) => sum + item.bytes, 0) };
}

/**
 * The files a `used` backup carries: every library file the config points at,
 * by the rule the Media library page marks a file as used (direct references
 * in any of their forms, plus every file inside a folder a local slideshow
 * plays that the slideshow would show). A referenced file that is not in the
 * library cannot be saved and is simply not here.
 */
export function usedPictures(config: unknown, items: readonly MediaInventoryItem[]): MediaInventoryItem[] {
  const known = new Set(items.map((item) => item.path));
  const usage = scanMediaUsage(config, known);
  return items.filter((item) => usage.has(item.path));
}

/** The files a backup with `choice` carries, sorted by path so a zip is the same twice. */
export function pictureBackupSet(
  choice: Exclude<PictureBackupChoice, 'off'>,
  config: unknown,
  items: readonly MediaInventoryItem[],
): MediaInventoryItem[] {
  const picked = choice === 'all' ? [...items] : usedPictures(config, items);
  return picked.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Counts and sizes for the labels beside each choice. */
export function pictureBackupSummary(config: unknown, library: LibraryListing): PictureBackupSummary {
  const missing = scanMissingMedia(
    config,
    new Set([...library.items.map((item) => item.path), ...(library.hidden ?? [])]),
    new Set(library.directories.map((d) => d.path)),
  );
  return {
    used: countOf(usedPictures(config, library.items)),
    all: countOf(library.items),
    missing: missing.length,
  };
}

/** Config references to pictures the library does not hold, after a restore. */
export function missingPictureCount(config: unknown, library: LibraryListing): number {
  return pictureBackupSummary(config, library).missing;
}

// ── Restore ──────────────────────────────────────────────────────────

const LIBRARY_PATH_RE = /^[^/]+(\/[^/]+)*$/;

/**
 * The library path a zip entry restores to, or null for anything that is
 * not one of ours: a directory entry, a name outside `pictures/`, a path that
 * could leave the library (`..`, an absolute path, a backslash), a folder
 * deeper than the library lists, a `.tmp` name, a file that is not a picture
 * or a video, or a top-level `rotation-` name the background rotation owns.
 * Null is skipped and counted, never a refusal: the family should get their
 * pictures back even from a zip someone poked at.
 */
export function pictureEntryPath(entryName: string): string | null {
  if (!entryName.startsWith(PICTURES_PREFIX)) return null;
  const libraryPath = entryName.slice(PICTURES_PREFIX.length);
  if (!LIBRARY_PATH_RE.test(libraryPath)) return null;
  if (libraryPath.includes('\\') || libraryPath.includes('\0')) return null;
  const segments = libraryPath.split('/');
  // The library lists folders two deep, so a file sits at most three segments in.
  if (segments.length > 3) return null;
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.trim() === '')) return null;
  if (libraryPath.toLowerCase().endsWith('.tmp')) return null;
  if (!libraryMediaKind(libraryPath)) return null;
  return libraryPath;
}

/**
 * Why a picture of `bytes` bytes at `libraryPath` cannot be restored, or
 * null. The caps are the ones imports are held to, so a 48 MP iCloud original
 * that was imported restores. `source` is the file's text, asked for only
 * when the rule needs it (an SVG without a size would draw wrong everywhere).
 */
export async function pictureEntryProblem(
  libraryPath: string,
  bytes: number,
  source: () => Promise<string>,
): Promise<string | null> {
  const kind = libraryMediaKind(libraryPath);
  const cap = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMPORT_IMAGE_BYTES;
  if (bytes > cap) return `${libraryPath} is bigger than a ${kind === 'video' ? 'video' : 'picture'} can be.`;
  if (extensionOf(libraryPath) === '.svg' && !svgDeclaresSize(await source())) {
    return `${libraryPath} has no size information.`;
  }
  return null;
}

export type PictureWriteAction = 'add' | 'replace' | 'keep';

export interface PictureWrite {
  libraryPath: string;
  bytes: number;
  action: PictureWriteAction;
}

export interface PictureWritePlan {
  writes: PictureWrite[];
  /** Bytes the adds and replaces will put on disk. */
  bytesNeeded: number;
}

/**
 * What each picture in a backup does to the library. A file already there
 * with the same byte size is kept (no rewrite, no thumbnail churn); a
 * different size is replaced, because a restore means the backup's
 * contents; anything else is added. Nothing is ever deleted: a backup of
 * only the pictures the screens use, restored onto a hub with a full
 * library, must not cost it the rest.
 */
export function planPictureWrites(
  entries: readonly { libraryPath: string; bytes: number }[],
  existingSizes: ReadonlyMap<string, number>,
): PictureWritePlan {
  const writes: PictureWrite[] = [];
  let bytesNeeded = 0;
  for (const entry of entries) {
    const existing = existingSizes.get(entry.libraryPath);
    const action: PictureWriteAction = existing === undefined ? 'add' : existing === entry.bytes ? 'keep' : 'replace';
    if (action !== 'keep') bytesNeeded += entry.bytes;
    writes.push({ libraryPath: entry.libraryPath, bytes: entry.bytes, action });
  }
  return { writes, bytesNeeded };
}

/** How much of the volume a restore may fill: the pictures must fit with this much left over. */
export const RESTORE_FREE_SPACE_MARGIN = 200 * 1024 * 1024;
