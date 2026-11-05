import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { readConfig } from '@/lib/config';
import { DEFAULT_DISPLAY_HEIGHT, DEFAULT_DISPLAY_WIDTH } from '@/lib/constants';
import { libraryRoot, writeLibraryFile } from '@/lib/library-files';
import { MAX_IMPORT_IMAGE_BYTES, extensionForContentType, mediaKindOf } from '@/lib/media-formats';
import { serveUrlFor } from '@/lib/media-paths';
import { removeThumbnails } from '@/lib/thumbnails';
import { withDisplayAuth } from '@/lib/api-utils';
import { findScreenById } from '@/lib/display-filter';
import { normalizePhotoSource, offeredFor, sourceCacheKey } from '@/lib/photo-source';
import { pickOneFromSource, type PickedPicture } from '@/lib/photo-sources';
import {
  ROTATION_FILE_RE,
  referencedRotationFiles,
  rotationCacheFileName,
  rotationCacheStore as cacheStore,
  type BackgroundCache,
  type RotationCacheEntry,
} from '@/lib/background-rotation-cache';
import type { PhotoSource, ScreenConfiguration } from '@/types/config';

export const dynamic = 'force-dynamic';

/** Unreferenced rotation files kept as a grace buffer, newest first, so a
 *  display still showing the previous background doesn't lose it mid-swap. */
const PRUNE_KEEP_RECENT = 8;

const DEFAULT_INTERVAL_MINUTES = 60;

/**
 * Rotation files accumulate forever otherwise: an iCloud album alone can
 * leave thousands of one-time backgrounds on a Pi SD card over a few weeks.
 * Deletes rotation-cache files that no screen's cache entry references,
 * keeping the newest few as a grace buffer. Best-effort: any error just
 * leaves files for the next rotation to prune.
 */
async function pruneRotationFiles(cache: BackgroundCache): Promise<void> {
  const referenced = referencedRotationFiles(cache);
  const root = libraryRoot();

  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  const candidates: Array<{ name: string; mtimeMs: number }> = [];
  for (const dirent of entries) {
    if (!dirent.isFile() || !ROTATION_FILE_RE.test(dirent.name) || referenced.has(dirent.name)) continue;
    try {
      candidates.push({ name: dirent.name, mtimeMs: (await fs.stat(path.join(root, dirent.name))).mtimeMs });
    } catch { /* raced deletion */ }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const { name } of candidates.slice(PRUNE_KEEP_RECENT)) {
    await fs.unlink(path.join(root, name)).catch(() => { /* best effort */ });
    // The wall asked for a copy sized to its screen; it goes with the file.
    await removeThumbnails(name);
  }
}

/** The canvas a screen is painted on: its display's own size, or the shared one. */
function canvasOf(config: ScreenConfiguration, screenId: string): { w: number; h: number } {
  const owner = config.displays?.find((display) => display.screens.some((s) => s.id === screenId));
  return {
    w: owner?.displayWidth ?? config.settings?.displayWidth ?? DEFAULT_DISPLAY_WIDTH,
    h: owner?.displayHeight ?? config.settings?.displayHeight ?? DEFAULT_DISPLAY_HEIGHT,
  };
}

/**
 * The library file a picked picture is shown from. A library pick is served
 * where it is, with no copy. A download is saved at the library's top level
 * as `rotation-<kind>-<id>`, streamed to disk under the import size cap, and
 * reused when the same picture comes round again. The `rotation-` prefix
 * keeps these prunable without ever touching a household's own files.
 */
async function savePicked(kind: PhotoSource['kind'], picked: PickedPicture): Promise<string | null> {
  if (picked.kind === 'library') return picked.path;
  const root = libraryRoot();
  const stem = `rotation-${kind}-${picked.id.replace(/[^A-Za-z0-9._-]/g, '_')}`;
  await fs.mkdir(root, { recursive: true });
  const existing = (await fs.readdir(root)).find((name) => name.replace(/\.[^.]+$/, '') === stem && mediaKindOf(name) === 'image');
  if (existing) return existing;

  const res = await picked.open();
  if (!res.ok) return null;
  const ext = extensionForContentType(res.headers.get('content-type'), 'image');
  if (!ext) {
    await res.body?.cancel().catch(() => { /* nothing to drain */ });
    return null;
  }
  const name = `${stem}${ext}`;
  await writeLibraryFile(path.join(root, name), res.body, MAX_IMPORT_IMAGE_BYTES);
  return name;
}

/**
 * GET /api/backgrounds/rotate?screenId=X
 *
 * The current rotating background for a screen, picking a new one from the
 * screen's photo source only when the interval has passed or the source
 * changed. Any source works except a video: the background is an <img>.
 *
 * Response: { path: string, fresh: boolean } or { path: string | null }
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const screenId = request.nextUrl.searchParams.get('screenId');
  if (!screenId) {
    return NextResponse.json({ error: 'screenId required' }, { status: 400 });
  }

  // Look across every display's own `screens` and the legacy global pool: in
  // multi-display mode the screen almost certainly lives under a display.
  const config = await readConfig();
  const screen = findScreenById(config, screenId);
  if (!screen) {
    return NextResponse.json({ path: null });
  }

  const rotation = screen.backgroundRotation;
  const source = normalizePhotoSource(rotation?.photoSource);
  const fallback = screen.backgroundImage || null;
  if (!rotation?.enabled || !source || !offeredFor('background').includes(source.kind)) {
    return NextResponse.json({ path: fallback });
  }

  const cache = await cacheStore.read();
  const entry = cache[screenId];
  const intervalMinutes = rotation.intervalMinutes || DEFAULT_INTERVAL_MINUTES;
  const sourceKey = sourceCacheKey(source);
  const now = Date.now();

  if (
    entry
    && entry.sourceKey === sourceKey
    && entry.intervalMinutes === intervalMinutes
    && now - entry.fetchedAt < intervalMinutes * 60_000
  ) {
    return NextResponse.json({ path: entry.path, fresh: false });
  }

  // Need a new background.
  try {
    const previous = entry?.path ? rotationCacheFileName(entry.path) ?? undefined : undefined;
    const picked = await pickOneFromSource(source, canvasOf(config, screenId), previous);
    const file = picked ? await savePicked(source.kind, picked) : null;
    if (file) {
      const newPath = serveUrlFor(file);
      const next: RotationCacheEntry = { path: newPath, sourceKey, fetchedAt: now, intervalMinutes };
      // Merge into whatever is on disk now, not into the snapshot read before
      // the fetch above, so a rotation that finished for another screen while
      // this one was waiting on the network keeps its entry.
      const merged = await cacheStore.updateAtomic((current) => ({ ...current, [screenId]: next }));
      // Prune against the merged view; pruning against the stale snapshot
      // would delete files the other screen just claimed.
      await pruneRotationFiles(merged);
      return NextResponse.json({ path: newPath, fresh: true });
    }
  } catch {
    // Fall through to the cached or own picture: a missing key, a source
    // that is away, or a lapsed sign-in keeps the wall on what it has.
  }

  return NextResponse.json({ path: entry?.path || fallback });
}, 'Failed to rotate background');
