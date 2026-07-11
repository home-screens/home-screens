import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { readConfig } from '@/lib/config';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { getUnsplashAccessKey, trackDownload } from '@/lib/unsplash';
import { NASA_APOD_API, getNasaApiKey } from '@/lib/nasa';
import { immichFetch } from '@/lib/immich';
import { fetchICloudMedia } from '@/lib/icloud-media';
import { writeLibraryFile, MAX_IMPORT_IMAGE_BYTES } from '@/lib/library-files';
import { fetchWithTimeout, withDisplayAuth } from '@/lib/api-utils';
import { findScreenById } from '@/lib/display-filter';
import type { BackgroundRotation } from '@/types/config';

export const dynamic = 'force-dynamic';

const CACHE_FILE = path.join(process.cwd(), 'data', 'background-cache.json');

const BGS = path.join(process.cwd(), BACKGROUNDS_DIR);

interface CacheEntry {
  path: string;
  source: string;
  query: string;
  fetchedAt: number;
  intervalMinutes: number;
  immichFilters?: string;
  icloudAlbum?: string;
}

type BackgroundCache = Record<string, CacheEntry>;

async function readCache(): Promise<BackgroundCache> {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeCache(cache: BackgroundCache): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

/** Only files the rotation savers below wrote themselves — user uploads and
 *  iCloud imports never carry this prefix, so pruning can't touch them. */
const ROTATION_FILE_RE = /^rotation-/;

/** Unreferenced rotation files kept as a grace buffer, newest first, so a
 *  display still showing the previous background doesn't lose it mid-swap. */
const PRUNE_KEEP_RECENT = 8;

function cacheFileName(servePath: string): string | null {
  try {
    return new URL(servePath, 'http://local').searchParams.get('file');
  } catch {
    return null;
  }
}

/**
 * Rotation files accumulate forever otherwise — an iCloud album alone can
 * leave thousands of one-time backgrounds on a Pi SD card over a few weeks.
 * Deletes rotation-cache files that no screen's cache entry references,
 * keeping the newest few as a grace buffer. Best-effort: any error just
 * leaves files for the next rotation to prune.
 */
async function pruneRotationFiles(cache: BackgroundCache): Promise<void> {
  const referenced = new Set<string>();
  for (const entry of Object.values(cache)) {
    const name = cacheFileName(entry.path);
    if (name) referenced.add(name);
  }

  let entries;
  try {
    entries = await fs.readdir(BGS, { withFileTypes: true });
  } catch {
    return;
  }

  const candidates: Array<{ name: string; mtimeMs: number }> = [];
  for (const dirent of entries) {
    if (!dirent.isFile() || !ROTATION_FILE_RE.test(dirent.name) || referenced.has(dirent.name)) continue;
    try {
      candidates.push({ name: dirent.name, mtimeMs: (await fs.stat(path.join(BGS, dirent.name))).mtimeMs });
    } catch { /* raced deletion */ }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const { name } of candidates.slice(PRUNE_KEEP_RECENT)) {
    await fs.unlink(path.join(BGS, name)).catch(() => { /* best effort */ });
  }
}

async function fetchAndSavePhoto(query: string, accessKey: string): Promise<string | null> {
  // Fetch random photo metadata from Unsplash
  const res = await fetchWithTimeout(
    `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=portrait&content_filter=high`,
    { headers: { Authorization: `Client-ID ${accessKey}` } },
  );
  if (!res.ok) return null;

  const photo = await res.json();
  const imageUrl = photo.urls?.regular;
  const photoId = photo.id;
  if (!imageUrl || !photoId) return null;

  // Trigger download tracking (required by Unsplash API terms)
  const downloadLocation = photo.links?.download_location;
  if (downloadLocation) {
    trackDownload(downloadLocation, accessKey);
  }

  // Download and save locally
  const imgRes = await fetchWithTimeout(imageUrl);
  if (!imgRes.ok) return null;

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const ext = 'jpg';
  const filename = `rotation-unsplash-${photoId}.${ext}`;
  const filePath = path.join(BGS, filename);

  await fs.mkdir(BGS, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

async function fetchAndSaveApod(): Promise<string | null> {
  const apiKey = await getNasaApiKey();
  if (!apiKey) return null;
  const res = await fetchWithTimeout(`${NASA_APOD_API}?api_key=${apiKey}&thumbs=true`);
  if (!res.ok) return null;

  const apod = await res.json();
  if (apod.media_type !== 'image') return null;

  const imageUrl = apod.hdurl || apod.url;
  if (!imageUrl) return null;

  const imgRes = await fetchWithTimeout(imageUrl, { timeout: 30_000 });
  if (!imgRes.ok) return null;

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const apodContentType = imgRes.headers.get('content-type') ?? '';
  const apodExt = apodContentType.includes('png') ? '.png' : apodContentType.includes('webp') ? '.webp' : '.jpg';
  const dateStr = (apod.date as string || '').replace(/-/g, '');
  const filename = `rotation-nasa-apod-${dateStr}${apodExt}`;
  const filePath = path.join(BGS, filename);

  await fs.mkdir(BGS, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

async function fetchAndSaveImmichPhoto(rotation: BackgroundRotation): Promise<string | null> {
  // Immich v3 removed `assets` from the album detail response; search/random
  // accepts albumIds on v2+ and handles all filter combinations server-side.
  const body: Record<string, unknown> = { type: 'IMAGE', size: 1 };
  if (rotation.immichAlbumId) body.albumIds = [rotation.immichAlbumId];
  if (rotation.immichPersonId) body.personIds = [rotation.immichPersonId];
  if (rotation.immichFavoritesOnly) body.isFavorite = true;

  const res = await immichFetch('/api/search/random', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const assets = await res.json();
  if (!Array.isArray(assets) || assets.length === 0) return null;
  const assetId = assets[0].id as string;

  // Download preview-quality image
  const imgRes = await immichFetch(`/api/assets/${assetId}/thumbnail?size=preview`, { timeout: 15_000 });
  if (!imgRes.ok) return null;

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') ?? '';
  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
  const filename = `rotation-immich-${assetId}${ext}`;
  const filePath = path.join(BGS, filename);

  await fs.mkdir(BGS, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

async function fetchAndSaveICloudPhoto(rotation: BackgroundRotation): Promise<string | null> {
  // Backgrounds are photos only — a video can't be a CSS background image.
  const images = (await fetchICloudMedia(rotation.icloudAlbumUrl || '')).filter((item) => item.type === 'image');
  if (images.length === 0) return null;
  const pick = images[Math.floor(Math.random() * images.length)];

  const imgRes = await fetchWithTimeout(pick.url, { timeout: 30_000 });
  if (!imgRes.ok) return null;

  const contentType = imgRes.headers.get('content-type') ?? '';
  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
  // Keyed by the photo's stable GUID (like rotation-immich-<assetId>): the
  // serve path must change between rotations or useBackgroundRotation never
  // swaps it. The rotation- prefix keeps these prunable without ever touching
  // user-imported icloud-<guid> files living in the same root.
  const filename = `rotation-icloud-${pick.guid.replace(/[^A-Za-z0-9-]/g, '')}${ext}`;
  const filePath = path.join(BGS, filename);

  await fs.mkdir(BGS, { recursive: true });
  // Stream to disk like the import path — an Apple original can be tens of
  // MB, too much to buffer whole on a Pi hub, and the cap applies mid-stream.
  await writeLibraryFile(filePath, imgRes.body, MAX_IMPORT_IMAGE_BYTES);

  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

/**
 * GET /api/backgrounds/rotate?screenId=X
 *
 * Returns the current rotating background for a screen, fetching a new one
 * from Unsplash only when the configured interval has elapsed.
 *
 * Response: { path: string, fresh: boolean } or { path: null }
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const screenId = request.nextUrl.searchParams.get('screenId');
  if (!screenId) {
    return NextResponse.json({ error: 'screenId required' }, { status: 400 });
  }

  // Read config to get this screen's rotation settings. Look across every
  // display's owned `screens` AND the legacy global pool — in multi-display
  // mode the screen we care about almost certainly lives under a
  // `display.screens` array, not `config.screens`.
  const config = await readConfig();
  const screen = findScreenById(config, screenId);
  if (!screen) {
    return NextResponse.json({ path: null });
  }

  const rotation = screen.backgroundRotation;
  const source = rotation?.source || 'unsplash';
  if (!rotation?.enabled || (source === 'unsplash' && !rotation.query) || (source !== 'unsplash' && source !== 'nasa-apod' && source !== 'immich' && source !== 'icloud')) {
    return NextResponse.json({ path: screen.backgroundImage || null });
  }

  const cache = await readCache();
  const entry = cache[screenId];
  const intervalMs = (rotation.intervalMinutes || 60) * 60 * 1000;
  const now = Date.now();
  const immichFilters = source === 'immich'
    ? JSON.stringify({ a: rotation.immichAlbumId, p: rotation.immichPersonId, f: rotation.immichFavoritesOnly })
    : undefined;
  const icloudAlbum = source === 'icloud' ? (rotation.icloudAlbumUrl || '') : undefined;

  // Check if cached entry is still fresh
  if (
    entry &&
    entry.source === source &&
    entry.query === rotation.query &&
    entry.intervalMinutes === (rotation.intervalMinutes || 60) &&
    entry.immichFilters === immichFilters &&
    entry.icloudAlbum === icloudAlbum &&
    now - entry.fetchedAt < intervalMs
  ) {
    return NextResponse.json({ path: entry.path, fresh: false });
  }

  // Need to fetch a new background
  try {
    let newPath: string | null = null;

    if (source === 'immich') {
      newPath = await fetchAndSaveImmichPhoto(rotation);
    } else if (source === 'icloud') {
      newPath = await fetchAndSaveICloudPhoto(rotation);
    } else if (source === 'nasa-apod') {
      newPath = await fetchAndSaveApod();
    } else {
      const accessKey = await getUnsplashAccessKey();
      if (!accessKey) {
        return NextResponse.json({ path: entry?.path || screen.backgroundImage || null });
      }
      newPath = await fetchAndSavePhoto(rotation.query, accessKey);
    }

    if (newPath) {
      cache[screenId] = {
        path: newPath,
        source,
        query: rotation.query,
        fetchedAt: now,
        intervalMinutes: rotation.intervalMinutes || 60,
        immichFilters,
        icloudAlbum,
      };
      await writeCache(cache);
      await pruneRotationFiles(cache);
      return NextResponse.json({ path: newPath, fresh: true });
    }
  } catch {
    // Fall through to return cached/fallback
  }

  return NextResponse.json({ path: entry?.path || screen.backgroundImage || null });
}, 'Failed to rotate background');
