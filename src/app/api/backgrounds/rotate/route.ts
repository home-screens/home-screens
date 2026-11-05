import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { readConfig } from '@/lib/config';
import { DEFAULT_DISPLAY_HEIGHT, DEFAULT_DISPLAY_WIDTH } from '@/lib/constants';
import { libraryRoot, safeLibraryPath, writeLibraryFile } from '@/lib/library-files';
import { MAX_IMPORT_IMAGE_BYTES, extensionForContentType, mediaKindOf } from '@/lib/media-formats';
import { serveUrlFor } from '@/lib/media-paths';
import { removeThumbnails } from '@/lib/thumbnails';
import { withDisplayAuth } from '@/lib/api-utils';
import { findScreenById } from '@/lib/display-filter';
import { logger } from '@/lib/logger';
import { canRotate, rotationCacheKey, rotationSources } from '@/lib/photo-source';
import { pickOneFromSource, type PickedPicture } from '@/lib/photo-sources';
import { getSecretStatus } from '@/lib/secrets';
import { shuffleArray } from '@/lib/shuffle';
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

const log = logger('rotate');

/** Unreferenced rotation files kept as a grace buffer, newest first, so a
 *  display still showing the previous background doesn't lose it mid-swap. */
const PRUNE_KEEP_RECENT = 8;

const DEFAULT_INTERVAL_MINUTES = 60;

/**
 * After every source failed, how long the screen keeps what it has before
 * the sources are asked again. Without it a source that is away costs an
 * upstream call on every poll, a minute apart, for as long as it is away.
 */
export const FAILURE_BACKOFF_MS = 5 * 60_000;

/**
 * The least time between two forced refreshes of one screen. Refresh now in
 * the editor is one click away, and Unsplash's free plan allows 50 requests
 * an hour.
 */
export const FORCE_SPACING_MS = 5_000;

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
 * The URL a picked picture is shown from. A bundled wall is its own path and
 * a library pick is served where it is, with no copy. A download is saved at
 * the library's top level as `rotation-<kind>-<id>`, streamed to disk under
 * the import size cap, and reused when the same picture comes round again.
 * The `rotation-` prefix keeps these prunable without ever touching a
 * household's own files.
 */
async function savePicked(kind: PhotoSource['kind'], picked: PickedPicture): Promise<string | null> {
  if (picked.kind === 'static') return picked.path;
  if (picked.kind === 'library') return serveUrlFor(picked.path);
  const root = libraryRoot();
  const stem = `rotation-${kind}-${picked.id.replace(/[^A-Za-z0-9._-]/g, '_')}`;
  await fs.mkdir(root, { recursive: true });
  const existing = (await fs.readdir(root)).find((name) => name.replace(/\.[^.]+$/, '') === stem && mediaKindOf(name) === 'image');
  if (existing) return serveUrlFor(existing);

  const res = await picked.open();
  if (!res.ok) return null;
  const ext = extensionForContentType(res.headers.get('content-type'), 'image');
  if (!ext) {
    await res.body?.cancel().catch(() => { /* nothing to drain */ });
    return null;
  }
  const name = `${stem}${ext}`;
  await writeLibraryFile(path.join(root, name), res.body, MAX_IMPORT_IMAGE_BYTES);
  return serveUrlFor(name);
}

/**
 * Whether the cached answer still points at a picture the hub has. A library
 * file can be deleted or moved from the media page; a bundled wall or a
 * remote URL is taken as it is.
 */
async function cachedPictureExists(servePath: string): Promise<boolean> {
  const file = rotationCacheFileName(servePath);
  if (!file) return true;
  const abs = safeLibraryPath(file);
  if (!abs) return false;
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

/** Where the picture showing now came from, so a fresh pick can avoid it. */
function previousOf(entry: RotationCacheEntry | undefined): string | undefined {
  if (!entry?.path) return undefined;
  return rotationCacheFileName(entry.path) ?? entry.path;
}

/**
 * GET /api/backgrounds/rotate?screenId=X[&force=true]
 *
 * The current rotating background for a screen, picking a new one from the
 * screen's sources only when the interval has passed, the sources changed,
 * or the editor asked (force, spaced a few seconds apart). The ready sources
 * are tried in a random order until one answers; when none does the screen
 * keeps what it has and the sources rest for a while. Any source works
 * except a video: the background is an <img>.
 *
 * Response: { path: string, fresh: boolean } or { path: string | null }
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const screenId = request.nextUrl.searchParams.get('screenId');
  if (!screenId) {
    return NextResponse.json({ error: 'screenId required' }, { status: 400 });
  }
  const force = request.nextUrl.searchParams.get('force') === 'true';

  // Look across every display's own `screens` and the legacy global pool: in
  // multi-display mode the screen almost certainly lives under a display.
  const config = await readConfig();
  const screen = findScreenById(config, screenId);
  if (!screen) {
    return NextResponse.json({ path: null });
  }

  const rotation = screen.backgroundRotation;
  const fallback = screen.backgroundImage || null;
  const secrets = await getSecretStatus();
  const candidates = rotationSources(rotation).filter((source) => canRotate(source, secrets));
  if (!rotation || candidates.length === 0) {
    return NextResponse.json({ path: fallback });
  }

  const cache = await cacheStore.read();
  let entry: RotationCacheEntry | undefined = cache[screenId];
  const intervalMinutes = rotation.intervalMinutes || DEFAULT_INTERVAL_MINUTES;
  const sourceKey = rotationCacheKey(rotation);
  const now = Date.now();

  if (entry && entry.sourceKey === sourceKey) {
    const spaced = force
      ? now - (entry.forcedAt ?? 0) < FORCE_SPACING_MS
      : now - entry.fetchedAt < intervalMinutes * 60_000 || (entry.failedAt !== undefined && now - entry.failedAt < FAILURE_BACKOFF_MS);
    if (spaced && entry.path && await cachedPictureExists(entry.path)) {
      return NextResponse.json({ path: entry.path, fresh: false });
    }
    if (entry.path && !(await cachedPictureExists(entry.path))) entry = { ...entry, path: '' };
  } else {
    entry = undefined;
  }

  // Need a new background: every ready source gets a turn, in a random order,
  // until one answers.
  const previous = previousOf(entry);
  const canvas = canvasOf(config, screenId);
  const failures: string[] = [];
  for (const source of shuffleArray(candidates)) {
    try {
      const picked = await pickOneFromSource(source, canvas, previous);
      const newPath = picked ? await savePicked(source.kind, picked) : null;
      if (!newPath) {
        failures.push(`${source.kind}: nothing to show`);
        continue;
      }
      const next: RotationCacheEntry = {
        path: newPath, sourceKey, fetchedAt: now, intervalMinutes,
        ...(force ? { forcedAt: now } : entry?.forcedAt ? { forcedAt: entry.forcedAt } : {}),
      };
      // Merge into whatever is on disk now, not into the snapshot read before
      // the fetch above, so a rotation that finished for another screen while
      // this one was waiting on the network keeps its entry.
      const merged = await cacheStore.updateAtomic((current) => ({ ...current, [screenId]: next }));
      // Prune against the merged view; pruning against the stale snapshot
      // would delete files the other screen just claimed.
      await pruneRotationFiles(merged);
      return NextResponse.json({ path: newPath, fresh: true });
    } catch (error) {
      // A missing key, a source that is away, or a lapsed sign-in: the next
      // source gets its turn, and the wall keeps what it has if none answers.
      failures.push(`${source.kind}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  log.warn(`No background for screen ${screenId}; sources rest for ${FAILURE_BACKOFF_MS / 60_000} minutes (${failures.join('; ')})`);
  const rested: RotationCacheEntry = {
    path: entry?.path ?? '', sourceKey, fetchedAt: entry?.fetchedAt ?? 0, intervalMinutes, failedAt: now,
    ...(force ? { forcedAt: now } : {}),
  };
  await cacheStore.updateAtomic((current) => ({ ...current, [screenId]: rested }));
  return NextResponse.json({ path: entry?.path || fallback });
}, 'Failed to rotate background');
