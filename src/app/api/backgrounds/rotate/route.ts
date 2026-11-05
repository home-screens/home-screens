import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readConfig } from '@/lib/config';
import { DEFAULT_DISPLAY_HEIGHT, DEFAULT_DISPLAY_WIDTH } from '@/lib/constants';
import { pruneRotationFiles } from '@/lib/background-rotation-prune';
import { withDisplayAuth } from '@/lib/api-utils';
import { findScreenById, findDisplayForScreen } from '@/lib/display-filter';
import { backgroundSourceProviders, isSourceConfigured } from '@/lib/background-sources';
import {
  rotationCacheStore as cacheStore,
  type RotationCacheEntry,
} from '@/lib/background-rotation-cache';
import type { BackgroundRotation, BackgroundRotationSourceId, ScreenConfiguration } from '@/types/config';
import { isRotationActive } from '@/lib/screen-background';

export const dynamic = 'force-dynamic';

/** Preserve declared dimensions; orientation normalization would flip portrait canvases. */
function canvasOf(config: ScreenConfiguration, screenId: string): { w: number; h: number } {
  const display = findDisplayForScreen(config, screenId);
  return {
    w: display?.displayWidth ?? config.settings?.displayWidth ?? DEFAULT_DISPLAY_WIDTH,
    h: display?.displayHeight ?? config.settings?.displayHeight ?? DEFAULT_DISPLAY_HEIGHT,
  };
}

/** Stable key for a sources array, independent of list order, for the cache freshness check. */
function sourcesKey(sources: BackgroundRotationSourceId[]): string {
  return JSON.stringify([...sources].sort());
}

/** Sources in `rotation.sources` that have what they need to actually produce a photo. */
function configuredSources(rotation: BackgroundRotation): BackgroundRotationSourceId[] {
  return [...new Set(rotation.sources)].filter((source) => isSourceConfigured(source, rotation));
}

/** Stable, catalog-filtered selections; omitted/empty means none selected. */
function starterSelectionKey(rotation: BackgroundRotation): string | undefined {
  const groups = (['color', 'pattern'] as const).filter((group) => rotation.sources.includes(group));
  if (!groups.length) return undefined;
  return JSON.stringify(groups.map((group) => {
    const ids = rotation.starterBackgroundIds?.[group];
    return [group, Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))].sort() : []];
  }));
}

/**
 * Downloads in progress, one per screen. A download can outlast the wall's
 * next poll (NASA retries for up to a minute and a half), and two displays
 * showing the same screen ask within seconds of each other, so a request
 * that finds one running joins it instead of starting a second download of
 * the same file.
 */
const inFlight = new Map<string, Promise<string | null>>();

function fetchOnce(screenId: string, fetchPhoto: () => Promise<string | null>): Promise<string | null> {
  const running = inFlight.get(screenId);
  if (running) return running;
  const run = fetchPhoto().finally(() => inFlight.delete(screenId));
  inFlight.set(screenId, run);
  return run;
}

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const screenId = request.nextUrl.searchParams.get('screenId');
  if (!screenId) {
    return NextResponse.json({ error: 'screenId required' }, { status: 400 });
  }

  const config = await readConfig();
  const screen = findScreenById(config, screenId);
  if (!screen) {
    return NextResponse.json({ path: null });
  }

  const rotation = screen.backgroundRotation;
  const eligible = rotation && isRotationActive(rotation) ? configuredSources(rotation) : [];
  if (!rotation || eligible.length === 0) {
    return NextResponse.json({ path: screen.backgroundImage || null });
  }

  const force = request.nextUrl.searchParams.get('force') === 'true';

  const cache = await cacheStore.read();
  const entry = cache[screenId];
  const intervalMs = (rotation.intervalMinutes || 60) * 60 * 1000;
  const now = Date.now();
  const currentSourcesKey = sourcesKey(rotation.sources);
  const immichFilters = rotation.sources.includes('immich')
    ? JSON.stringify({
      a: rotation.immichAlbumIds ?? [],
      p: rotation.immichPersonIds ?? [],
      px: rotation.immichPersonIdsExclude ?? [],
      f: rotation.immichFavoritesOnly,
      // Only in pick mode, so legacy and filters-mode keys stay byte-identical.
      ...(rotation.immichMode === 'pick'
        ? { m: 'pick', i: [...new Set(rotation.immichImages ?? [])].sort() }
        : {}),
    })
    : undefined;
  const icloudAlbum = rotation.sources.includes('icloud') ? (rotation.icloudAlbumUrl || '') : undefined;
  const localFolder = rotation.sources.includes('local')
    ? (rotation.localMode === 'images'
      ? `images:${JSON.stringify([...new Set(rotation.localImages ?? [])].sort())}`
      : (rotation.localFolder || ''))
    : undefined;
  const canvas = rotation.sources.includes('unsplash') ? JSON.stringify(canvasOf(config, screenId)) : undefined;
  const unsplashCollectionsKey = rotation.sources.includes('unsplash') && rotation.unsplashCollections?.length
    ? JSON.stringify(rotation.unsplashCollections)
    : undefined;
  const unsplashModeKey = rotation.sources.includes('unsplash') ? (rotation.unsplashMode || '') : undefined;
  const starterSelections = starterSelectionKey(rotation);
  const unsplashPicks = rotation.sources.includes('unsplash') && !unsplashCollectionsKey
    ? JSON.stringify([...new Set(rotation.unsplashImages ?? [])].sort())
    : undefined;

  // A source/config change invalidates the cached result before its interval ends.
  if (
    !force &&
    entry &&
    entry.sources === currentSourcesKey &&
    entry.query === rotation.query &&
    entry.intervalMinutes === (rotation.intervalMinutes || 60) &&
    entry.immichFilters === immichFilters &&
    entry.icloudAlbum === icloudAlbum &&
    entry.localFolder === localFolder &&
    entry.canvas === canvas &&
    entry.unsplashCollections === unsplashCollectionsKey &&
    entry.unsplashMode === unsplashModeKey &&
    entry.starterSelections === starterSelections &&
    entry.unsplashPicks === unsplashPicks &&
    now - entry.fetchedAt < intervalMs
  ) {
    return NextResponse.json({ path: entry.path, fresh: false });
  }

  const pickedSource = eligible[Math.floor(Math.random() * eligible.length)];

  try {
    // A request that finds this screen's download already running joins it.
    const newPath = await fetchOnce(screenId, () =>
      backgroundSourceProviders[pickedSource].fetchRandom(rotation, canvasOf(config, screenId)));

    if (newPath) {
      const newEntry: RotationCacheEntry = {
        path: newPath,
        sources: currentSourcesKey,
        query: rotation.query,
        fetchedAt: now,
        intervalMinutes: rotation.intervalMinutes || 60,
        immichFilters,
        icloudAlbum,
        localFolder,
        canvas,
        unsplashCollections: unsplashCollectionsKey,
        unsplashMode: unsplashModeKey,
        starterSelections,
        unsplashPicks,
      };
      const merged = await cacheStore.updateAtomic((current) => ({ ...current, [screenId]: newEntry }));
      await pruneRotationFiles(merged, config);
      return NextResponse.json({ path: newPath, fresh: true });
    }
  } catch {
    // Fall through to return cached/fallback
  }

  return NextResponse.json({ path: entry?.path || screen.backgroundImage || null, fresh: false });
}, 'Failed to rotate background');
