'use client';

import { useEffect, useState, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import type { RainMapConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { radarTileStore } from './rain-map-preload';
import { useFetchData } from '@/hooks/useFetchData';
import { LocationRequired } from './LocationRequired';
import { useElementBox } from '@/hooks/useElementBox';
import { computeTileGrid, BASE_TILE_SIZE, RADAR_TILE_SIZE } from './rain-map-grid';
import { rainMapUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useTranslate, useFormattingLocale, formatRelativeTime } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { RainFrame, RadarIndexResponse } from '@/lib/rain-map-types';

interface RainMapModuleProps {
  config: RainMapConfig;
  style: ModuleStyle;
  latitude?: number;
  longitude?: number;
  locationSettingsHref?: string;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['rain-map']?.ttlMs ?? 600_000;

/** How long the radar window inputs must be stable before tiles are fetched. */
const RADAR_WINDOW_DEBOUNCE_MS = 500;

/**
 * How many times a frame with a failed tile is retried (once the store's
 * cooldown lapses) before it is shown with the hole. A hole is worse than a
 * skipped frame, but a tile the server will never serve must not keep a frame
 * out of the loop forever.
 */
const MAX_TILE_RETRIES = 2;

interface RadarWindowInputs {
  lat: number;
  lon: number;
  zoom: number;
  colorScheme: number;
  smooth: number;
  snow: number;
  /** Measured box, so a resize drag settles before a new window is fetched. */
  width: number;
  height: number;
}

/**
 * Delays propagating the radar-window inputs until they have been stable for
 * `ms`. Editor sliders (native range inputs) commit every intermediate step of
 * a drag, and each intermediate zoom/location/color value would otherwise mint
 * a full animation window of tile requests; the tile effect must only ever see
 * the value the slider rests on. The first render propagates immediately.
 */
function useDebouncedRadarWindow(inputs: RadarWindowInputs, ms: number): RadarWindowInputs {
  const [debounced, setDebounced] = useState(inputs);
  const key = JSON.stringify(inputs);
  const settledKeyRef = useRef(key);
  useEffect(() => {
    if (key === settledKeyRef.current) return;
    const id = setTimeout(() => {
      settledKeyRef.current = key;
      setDebounced(JSON.parse(key) as RadarWindowInputs);
    }, ms);
    return () => clearTimeout(id);
  }, [key, ms]);
  return debounced;
}

// Both styles come from the OpenStreetMap tile server, which needs no key.
// Carto's dark basemap used to be the dark style; it now watermarks every
// tile with "API KEY REQUIRED" for keyless callers, so the dark style is the
// standard OSM tile with a CSS dark filter over the base layer instead
// (the radar layer sits above it, unfiltered).
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Inverts the light OSM cartography into a dark map with muted colours. */
const DARK_TILE_FILTER = 'invert(1) hue-rotate(180deg) brightness(0.72) contrast(1.05) saturate(0.55)';

// Background colors that match each map theme's dominant tile color,
// so any gap from a slow-loading tile is invisible.
const MAP_BG: Record<string, string> = {
  dark: '#151515',
  standard: '#f2efe9',
};

/** Within this window of the frame time the overlay just says "Now". */
const FRAME_NOW_WINDOW_S = 90;

function formatFrameTime(unixTime: number, t: TranslateFn, locale: string): string {
  const nowMs = Date.now();
  if (Math.abs(unixTime * 1000 - nowMs) <= FRAME_NOW_WINDOW_S * 1000) return t('rain-map.now');
  // Minute granularity on purpose: past frames are 10 minutes apart over
  // ~2 hours, and "1 hr. ago" for three frames in a row says nothing about
  // which one is showing.
  return formatRelativeTime(nowMs, unixTime * 1000, { locale, numeric: 'always', style: 'short', unit: 'minute' });
}

export default function RainMapModule({
  config,
  style,
  latitude,
  longitude,
  locationSettingsHref,
}: RainMapModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  // The module's own coordinate pair wins when both are set (the config
  // section stores 0 for a blank field, so a lone latitude is not a
  // location); otherwise the household location. Resolved as a pair, never
  // per axis, so the map can never be centred on a latitude from one place
  // and a longitude from another. With neither there is nothing sensible to
  // centre on, and the gate below says so rather than silently showing
  // New York.
  const ownCoords = config.latitude && config.longitude ? { lat: config.latitude, lon: config.longitude } : null;
  const householdCoords = latitude != null && longitude != null ? { lat: latitude, lon: longitude } : null;
  const center = ownCoords ?? householdCoords;
  const hasCoords = center != null;
  const lat = center?.lat ?? 0;
  const lon = center?.lon ?? 0;
  const zoom = config.zoom ?? 6;
  const animationSpeedMs = Math.max(500, config.animationSpeedMs ?? 500);
  const extraDelayLastFrameMs = config.extraDelayLastFrameMs ?? 2000;
  const smooth = config.smooth !== false ? 1 : 0;
  const snow = config.showSnow !== false ? 1 : 0;
  const radarOpacity = config.opacity ?? 0.7;
  const showTimestamp = config.showTimestamp !== false;
  const showTimeline = config.showTimeline !== false;
  const mapStyle = config.mapStyle ?? 'dark';
  const colorScheme = config.colorScheme ?? 2;
  const refreshMs = config.refreshIntervalMs ?? DEFAULT_REFRESH_MS;

  // '' skips the fetch while there is nothing to centre the radar on.
  const [data, error] = useFetchData<RadarIndexResponse>(hasCoords ? rainMapUrl() : '', refreshMs);

  // The map box, measured: both tile grids cover exactly this and no more.
  const [boxRef, box] = useElementBox<HTMLDivElement>();

  const [displayIndex, setDisplayIndex] = useState(0);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Re-render when tiles settle into the store (loaded or evicted). The store
  // is shared across mounts, so a screen rotating back renders instantly.
  // The third argument is required: the display route renders modules on the
  // server, and React's server renderer throws without getServerSnapshot.
  useSyncExternalStore(radarTileStore.subscribe, radarTileStore.getVersion, radarTileStore.getVersion);

  // Combine past + nowcast frames
  const frames = useMemo(() => {
    if (!data?.radar) return [];
    return [...(data.radar.past ?? []), ...(data.radar.nowcast ?? [])];
  }, [data]);

  // Debounce the inputs that define the radar tile window. Editor sliders
  // (native range inputs) fire per step during a drag, and a resize drag
  // commits every intermediate box; each intermediate value would otherwise
  // mint a full window of tile requests. Only the value the control settles
  // on is ever fetched. The base map below stays live so the canvas keeps up
  // with the pointer.
  const radarWindow = useDebouncedRadarWindow(
    { lat, lon, zoom, colorScheme, smooth, snow, width: box.width, height: box.height },
    RADAR_WINDOW_DEBOUNCE_MS,
  );

  // Base map tile grid: live, follows the slider and the box.
  const tileGrid = useMemo(
    () => computeTileGrid(lat, lon, zoom, BASE_TILE_SIZE, box),
    [lat, lon, zoom, box],
  );

  // Radar tile grid from the debounced inputs: 512px tiles one zoom below the
  // map, the same ground per pixel as the base tiles in a quarter of the
  // requests.
  const radarZoom = radarWindow.zoom - 1;
  const radarTileGrid = useMemo(
    () => computeTileGrid(radarWindow.lat, radarWindow.lon, radarZoom, RADAR_TILE_SIZE, radarWindow),
    [radarWindow, radarZoom],
  );

  // Build radar tile URL for a given frame (the RainViewer v2 tile scheme
  // every compatible server, LibreWXR included, serves).
  const getRadarUrl = useCallback(
    (frame: RainFrame, tile: { x: number; y: number }) => {
      if (!data?.host) return '';
      return `${data.host}${frame.path}/${RADAR_TILE_SIZE}/${radarZoom}/${tile.x}/${tile.y}/${radarWindow.colorScheme}/${radarWindow.smooth}_${radarWindow.snow}.png`;
    },
    [data, radarWindow, radarZoom],
  );

  // Tile URLs for one frame, through the rate-bounded store.
  const frameUrls = useCallback(
    (frame: RainFrame) => radarTileGrid.map((tile) => getRadarUrl(frame, tile)),
    [radarTileGrid, getRadarUrl],
  );

  // Queue every frame in display order, then animate over the frames whose
  // tiles have all loaded. The store paces requests far slower than the
  // animation runs, so a cold start would otherwise cycle through mostly
  // empty frames for over a minute; instead the loop never shows a frame it
  // has not loaded. A frame with a failed tile is held back and retried when
  // the store's cooldown lapses (a slow render on the radar server is the
  // usual cause, and the retry lands warm); after MAX_TILE_RETRIES it joins
  // the loop with the hole rather than never. Until every frame is ready the
  // loop only moves forward, parking on the newest ready frame until the next
  // one lands, so a cold start plays one progressive sweep (1, 2, 3, ...)
  // rather than restarting from the first frame each time a new one arrives.
  // Once all frames are in it loops.
  useEffect(() => {
    const perFrame = frames.map(frameUrls);
    if (!perFrame.length || !perFrame[0].length || !data?.host) return;

    // Frame paths are timestamped, so each refresh brings a new URL set.
    // Register this instance's window: its tiles are never evicted while it
    // is live, and queued requests the window no longer wants are dropped.
    const releaseWindow = radarTileStore.retainWindow(new Set(perFrame.flat()));

    let cancelled = false;
    let started = false;
    // True while the loop is holding on the newest ready frame.
    let parked = false;
    const ready = new Set<number>();
    const retries = new Array<number>(perFrame.length).fill(0);
    const retryTimers = new Set<ReturnType<typeof setTimeout>>();
    indexRef.current = 0;
    setDisplayIndex(0);

    // Next ready frame after `current` in display order, or `current` itself
    // while there is none. Wrapping back to the start is allowed only once
    // every frame has settled (the first sweep is forward-only).
    function nextReady(current: number): number {
      const canWrap = ready.size === perFrame.length;
      for (let step = 1; step < perFrame.length; step++) {
        const candidate = current + step;
        if (candidate >= perFrame.length && !canWrap) break;
        const index = candidate % perFrame.length;
        if (ready.has(index)) return index;
      }
      return current;
    }

    function scheduleNext() {
      if (cancelled) return;
      const current = indexRef.current;
      const next = nextReady(current);
      parked = next === current;
      const isLooping = next <= current;
      const delay = isLooping ? extraDelayLastFrameMs : animationSpeedMs;

      // Re-ensure the frame about to be shown: a no-op while its tiles are
      // loaded, a retry once a failed tile's cooldown has lapsed.
      radarTileStore.ensure(perFrame[next]);

      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        indexRef.current = next;
        setDisplayIndex(next);
        scheduleNext();
      }, delay);
    }

    function markReady(i: number) {
      ready.add(i);
      if (!started) {
        // The first frame to be ready starts the loop (frame 0, except when
        // a later frame was already cached).
        started = true;
        indexRef.current = i;
        setDisplayIndex(i);
        scheduleNext();
      } else if (parked) {
        // The frame the loop was waiting on arrived: move on at animation
        // tempo instead of waiting out the end-of-loop hold.
        clearTimeout(timerRef.current);
        scheduleNext();
      }
    }

    // Every tile of the frame has settled: ready if they all loaded, else a
    // retry once the failed ones may be requested again.
    function settle(i: number) {
      if (cancelled) return;
      const urls = perFrame[i];
      const complete = urls.every((url) => radarTileStore.get(url) !== null);
      if (!complete && retries[i] < MAX_TILE_RETRIES) {
        const delay = radarTileStore.retryDelay(urls);
        if (delay > 0) {
          retries[i]++;
          const timer = setTimeout(() => {
            retryTimers.delete(timer);
            if (cancelled) return;
            radarTileStore.ensure(urls).then(() => settle(i));
          }, delay + 50);
          retryTimers.add(timer);
          return;
        }
      }
      markReady(i);
    }

    perFrame.forEach((urls, i) => {
      radarTileStore.ensure(urls).then(() => settle(i));
    });

    return () => {
      releaseWindow();
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const timer of retryTimers) clearTimeout(timer);
    };
  }, [frames, data?.host, frameUrls, animationSpeedMs, extraDelayLastFrameMs]);

  const gate = moduleGate({
    style, data, error,
    loadingMessage: t('rain-map.loading'),
    empty: !frames.length && t('rain-map.noRadarData'),
  });
  if (!hasCoords) {
    return <LocationRequired style={style} locationSettingsHref={locationSettingsHref} />;
  }
  if (gate || !data) return gate;

  const currentFrame = frames[displayIndex];
  if (!currentFrame) return null;
  const isDark = mapStyle !== 'standard';
  const pastCount = data.radar.past?.length ?? 0;

  return (
    <ModuleWrapper style={style}>
      <div
        ref={boxRef}
        className="relative w-full h-full overflow-hidden rounded-lg"
        style={{ backgroundColor: MAP_BG[mapStyle] ?? MAP_BG.dark }}
      >
        {/* Both layers hang off a zero-size anchor at the box centre, which
            sits on the configured coordinates; tile offsets are relative to it.
            The tiles carry max-w-none: the global img reset caps width at 100%
            of the parent, and 100% of a zero-size anchor is nothing. */}
        <div className="absolute left-1/2 top-1/2">
          {tileGrid.map((tile) => (
            <img
              key={`base-${tile.x}-${tile.y}`}
              src={OSM_TILE_URL
                .replace('{z}', String(zoom))
                .replace('{x}', String(tile.x))
                .replace('{y}', String(tile.y))}
              alt=""
              className="absolute max-w-none"
              style={{
                width: BASE_TILE_SIZE,
                height: BASE_TILE_SIZE,
                left: tile.left,
                top: tile.top,
                filter: isDark ? DARK_TILE_FILTER : undefined,
              }}
              draggable={false}
            />
          ))}
        </div>

        {/* Radar overlay tiles for the current frame (own anchor: its grid follows the debounced window) */}
        <div className="absolute left-1/2 top-1/2">
          {radarTileGrid.map((tile) => {
            // Blob URLs come from the tile store, so a frame advance just
            // swaps src on the same nodes — no remount, no network. Tiles not
            // yet loaded render as gaps; the loop above only advances onto
            // frames whose tiles are all in (or have exhausted their retries).
            const src = radarTileStore.get(getRadarUrl(currentFrame, tile));
            if (!src) return null;
            return (
              <img
                key={`radar-${tile.x}-${tile.y}`}
                src={src}
                alt=""
                className="absolute max-w-none"
                style={{
                  width: RADAR_TILE_SIZE,
                  height: RADAR_TILE_SIZE,
                  left: tile.left,
                  top: tile.top,
                  opacity: radarOpacity,
                }}
                draggable={false}
              />
            );
          })}
        </div>

        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-800 z-10"
          style={{ boxShadow: '0 0 4px rgba(0,0,0,0.6)' }}
        />

        {showTimestamp && (
          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded z-10 font-mono">
            {formatFrameTime(currentFrame.time, t, locale)}
          </div>
        )}

        <div
          className="absolute bottom-1 right-1.5 z-10 text-white pointer-events-none"
          style={{ fontSize: 9, opacity: 0.55, textShadow: '0 0 3px rgba(0,0,0,0.9)' }}
        >
          © OpenStreetMap
        </div>

        {showTimeline && frames.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 z-10" data-testid="rain-map-timeline">
            {frames.map((frame, i) => {
              const isNowcast = i >= pastCount;
              const isCurrent = i === displayIndex;
              return (
                // Every dot sits in a fixed 8px box so the active dot growing
                // never shifts the row (the dots used to bounce on each frame).
                <div key={frame.time} className="flex items-center justify-center" style={{ width: 8, height: 8 }}>
                  <div
                    className="rounded-full"
                    style={{
                      width: isCurrent ? 8 : 5,
                      height: isCurrent ? 8 : 5,
                      backgroundColor: isCurrent
                        ? '#ffffff'
                        : isNowcast
                          ? 'rgba(74, 222, 128, 0.6)'
                          : 'rgba(255, 255, 255, 0.35)',
                      boxShadow: isCurrent ? '0 0 4px rgba(255,255,255,0.5)' : 'none',
                      transition: 'background-color 200ms, box-shadow 200ms',
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}
