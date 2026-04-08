import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { readConfig } from '@/lib/config';
import { BACKGROUNDS_DIR } from '@/lib/constants';
import { getUnsplashAccessKey, trackDownload } from '@/lib/unsplash';
import { NASA_APOD_API, getNasaApiKey } from '@/lib/nasa';
import { immichFetch } from '@/lib/immich';
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
  const filename = `unsplash-${photoId}.${ext}`;
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
  const filename = `nasa-apod-${dateStr}${apodExt}`;
  const filePath = path.join(BGS, filename);

  await fs.mkdir(BGS, { recursive: true });
  await fs.writeFile(filePath, buffer);

  return `/api/backgrounds/serve?file=${encodeURIComponent(filename)}`;
}

async function fetchAndSaveImmichPhoto(rotation: BackgroundRotation): Promise<string | null> {
  let assetId: string | undefined;

  if (rotation.immichAlbumId) {
    // Fetch album assets and pick one randomly (search/random doesn't support albumIds)
    const albumRes = await immichFetch(`/api/albums/${rotation.immichAlbumId}`);
    if (!albumRes.ok) return null;
    const album = await albumRes.json();
    let assets = ((album.assets ?? []) as { id: string; type: string; isFavorite: boolean }[])
      .filter((a) => a.type === 'IMAGE');
    if (rotation.immichFavoritesOnly) assets = assets.filter((a) => a.isFavorite);
    if (assets.length === 0) return null;
    assetId = assets[Math.floor(Math.random() * assets.length)].id;
  } else {
    // Use random search endpoint
    const body: Record<string, unknown> = { type: 'IMAGE', size: 1 };
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
    assetId = assets[0].id as string;
  }

  if (!assetId) return null;

  // Download preview-quality image
  const imgRes = await immichFetch(`/api/assets/${assetId}/thumbnail?size=preview`, { timeout: 15_000 });
  if (!imgRes.ok) return null;

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') ?? '';
  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
  const filename = `immich-${assetId}${ext}`;
  const filePath = path.join(BGS, filename);

  await fs.mkdir(BGS, { recursive: true });
  await fs.writeFile(filePath, buffer);

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
  if (!rotation?.enabled || (source === 'unsplash' && !rotation.query) || (source !== 'unsplash' && source !== 'nasa-apod' && source !== 'immich')) {
    return NextResponse.json({ path: screen.backgroundImage || null });
  }

  const cache = await readCache();
  const entry = cache[screenId];
  const intervalMs = (rotation.intervalMinutes || 60) * 60 * 1000;
  const now = Date.now();
  const immichFilters = source === 'immich'
    ? JSON.stringify({ a: rotation.immichAlbumId, p: rotation.immichPersonId, f: rotation.immichFavoritesOnly })
    : undefined;

  // Check if cached entry is still fresh
  if (
    entry &&
    entry.source === source &&
    entry.query === rotation.query &&
    entry.intervalMinutes === (rotation.intervalMinutes || 60) &&
    entry.immichFilters === immichFilters &&
    now - entry.fetchedAt < intervalMs
  ) {
    return NextResponse.json({ path: entry.path, fresh: false });
  }

  // Need to fetch a new background
  try {
    let newPath: string | null = null;

    if (source === 'immich') {
      newPath = await fetchAndSaveImmichPhoto(rotation);
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
      };
      await writeCache(cache);
      return NextResponse.json({ path: newPath, fresh: true });
    }
  } catch {
    // Fall through to return cached/fallback
  }

  return NextResponse.json({ path: entry?.path || screen.backgroundImage || null });
}, 'Failed to rotate background');
