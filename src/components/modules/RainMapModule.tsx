'use client';

import { useEffect, useState, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import type { RainMapConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { radarTileStore } from './rain-map-preload';
import { useFetchData } from '@/hooks/useFetchData';
import { rainMapUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { RainFrame, RainViewerResponse } from '@/lib/rain-map-types';

interface RainMapModuleProps {
  config: RainMapConfig;
  style: ModuleStyle;
  latitude?: number;
  longitude?: number;
}

// ── Tile math (standard Web Mercator) ──

function lon2tile(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

function lat2tile(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    Math.pow(2, zoom)
  );
}

const TILE_SIZE = 256;
const MAX_RADAR_ZOOM = 7;

interface TileGrid {
  tiles: Array<{ x: number; y: number; px: number; py: number }>;
  totalSize: number;
  scaledSize: number;
}

/**
 * Assemble a centered slippy-map tile grid around (lat, lon) at the given tile
 * zoom. `scale` upsamples each tile: the base map passes 1 (native tiles) while
 * the radar layer passes >1 to stretch RainViewer's zoom-capped tiles up to the
 * base map's zoom. The grid radius grows as the scale shrinks so a scaled grid
 * still covers the viewport. `px`/`py` are top-left offsets inside a
 * `totalSize`-square container centered over the location. Kept as one helper so
 * the base and radar grids can never drift; the multiplication order matches the
 * original per-caller code exactly (scale is always an exact power of two, so
 * even the base map's added `* 1` is bit-identical).
 */
function computeTileGrid(lat: number, lon: number, tileZoom: number, scale: number): TileGrid {
  const centerTileX = lon2tile(lon, tileZoom);
  const centerTileY = lat2tile(lat, tileZoom);
  const tileX = Math.floor(centerTileX);
  const tileY = Math.floor(centerTileY);
  const scaledSize = TILE_SIZE * scale;
  const offsetX = (centerTileX - tileX) * TILE_SIZE * scale;
  const offsetY = (centerTileY - tileY) * TILE_SIZE * scale;

  // Match the base map's gridRadius — the extra +1 padding was causing
  // 49 tiles/frame instead of 25, which overwhelms RainViewer's rate limit.
  const gridRadius = Math.max(2, Math.ceil(2 / scale));
  const totalSize = (gridRadius * 2 + 1) * scaledSize;
  const tiles: Array<{ x: number; y: number; px: number; py: number }> = [];
  for (let dy = -gridRadius; dy <= gridRadius; dy++) {
    for (let dx = -gridRadius; dx <= gridRadius; dx++) {
      tiles.push({
        x: tileX + dx,
        y: tileY + dy,
        px: totalSize / 2 - offsetX + dx * scaledSize,
        py: totalSize / 2 - offsetY + dy * scaledSize,
      });
    }
  }
  return { tiles, totalSize, scaledSize };
}
const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['rain-map']?.ttlMs ?? 600_000;

/** How long the radar window inputs must be stable before tiles are fetched. */
const RADAR_WINDOW_DEBOUNCE_MS = 500;

interface RadarWindowInputs {
  lat: number;
  lon: number;
  radarZoom: number;
  radarScale: number;
  colorScheme: number;
  smooth: number;
  snow: number;
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

const BASE_TILE_URLS: Record<string, string> = {
  dark: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
  standard: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};

// Background colors that match each map theme's dominant tile color,
// so any gap from a slow-loading tile is invisible.
const MAP_BG: Record<string, string> = {
  dark: '#090909',
  standard: '#f2efe9',
};

function formatFrameTime(unixTime: number, t: TranslateFn): string {
  const now = Date.now() / 1000;
  const diffMin = Math.round((unixTime - now) / 60);
  if (Math.abs(diffMin) <= 1) return t('rain-map.now');
  if (diffMin < 0) return t('rain-map.minutesAgo', { minutes: Math.abs(diffMin) });
  return t('rain-map.minutesAhead', { minutes: diffMin });
}

export default function RainMapModule({
  config,
  style,
  latitude,
  longitude,
}: RainMapModuleProps) {
  const t = useTranslate('modules');
  const lat = config.latitude || latitude || 40;
  const lon = config.longitude || longitude || -74;
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

  const [data, error] = useFetchData<RainViewerResponse>(rainMapUrl(), refreshMs);

  const [displayIndex, setDisplayIndex] = useState(0);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Re-render when tiles settle into the store (loaded or pruned). The store
  // is shared across mounts, so a screen rotating back renders instantly.
  // The third argument is required: the display route renders modules on the
  // server, and React's server renderer throws without getServerSnapshot.
  useSyncExternalStore(radarTileStore.subscribe, radarTileStore.getVersion, radarTileStore.getVersion);

  // Combine past + nowcast frames
  const frames = useMemo(() => {
    if (!data?.radar) return [];
    return [...(data.radar.past ?? []), ...(data.radar.nowcast ?? [])];
  }, [data]);

  // Radar zoom is capped at 7 by the RainViewer API; above that we upscale
  const radarZoom = Math.min(zoom, MAX_RADAR_ZOOM);
  const radarScale = Math.pow(2, zoom - radarZoom); // 1 at zoom ≤ 7, 2 at 8, 4 at 9, etc.

  // Debounce the inputs that define the radar tile window. Editor sliders
  // (native range inputs) fire per step during a drag, and each intermediate
  // zoom/location/color value would otherwise mint a full 325-URL window of
  // tiles; only the value the slider settles on is ever fetched. The base map
  // below stays live so the canvas keeps up with the pointer.
  const radarWindow = useDebouncedRadarWindow(
    { lat, lon, radarZoom, radarScale, colorScheme, smooth, snow },
    RADAR_WINDOW_DEBOUNCE_MS,
  );

  // Base map tile grid (uses full zoom, native tile size)
  const tileGrid = useMemo(
    () => computeTileGrid(lat, lon, zoom, 1),
    [lat, lon, zoom],
  );

  // Radar tile grid (uses capped zoom, scaled up to match the base map)
  const radarTileGrid = useMemo(
    () => computeTileGrid(radarWindow.lat, radarWindow.lon, radarWindow.radarZoom, radarWindow.radarScale),
    [radarWindow],
  );

  // Build radar tile URL for a given frame
  const getRadarUrl = useCallback(
    (frame: RainFrame, tile: { x: number; y: number }) => {
      if (!data?.host) return '';
      return `${data.host}${frame.path}/${TILE_SIZE}/${radarWindow.radarZoom}/${tile.x}/${tile.y}/${radarWindow.colorScheme}/${radarWindow.smooth}_${radarWindow.snow}.png`;
    },
    [data, radarWindow],
  );

  // Tile URLs for one frame, through the rate-bounded store.
  const frameUrls = useCallback(
    (frame: RainFrame) => radarTileGrid.tiles.map((tile) => getRadarUrl(frame, tile)),
    [radarTileGrid.tiles, getRadarUrl],
  );

  // Load the first frame, then start the animation loop. Each animation step
  // ensures the next frame's tiles before advancing — a no-op for tiles that
  // are already loaded or still in their failure cooldown.
  useEffect(() => {
    if (!frames.length || !data?.host || !radarTileGrid.tiles.length) return;

    // Frame paths are timestamped, so each refresh brings a new URL set.
    // Register this instance's window: the store prunes to the union of all
    // live instances' windows (sibling rain-maps keep their tiles) while a
    // never-unmounting display still sheds URLs that rotate out of every
    // window.
    const windowUrls = new Set<string>();
    for (const frame of frames) {
      for (const tile of radarTileGrid.tiles) {
        const url = getRadarUrl(frame, tile);
        if (url) windowUrls.add(url);
      }
    }
    const releaseWindow = radarTileStore.retainWindow(windowUrls);

    let cancelled = false;
    indexRef.current = 0;
    setDisplayIndex(0);

    // Ensure just the first frame, then start animating
    radarTileStore.ensure(frameUrls(frames[0])).then(() => {
      if (cancelled) return;

      function scheduleNext() {
        if (cancelled) return;
        const current = indexRef.current;
        const next = (current + 1) % frames.length;
        const isLooping = next === 0;
        const delay = isLooping ? extraDelayLastFrameMs : animationSpeedMs;

        // Ensure the next frame's tiles during the current frame's display time
        radarTileStore.ensure(frameUrls(frames[next]));

        timerRef.current = setTimeout(() => {
          if (cancelled) return;
          indexRef.current = next;
          setDisplayIndex(next);
          scheduleNext();
        }, delay);
      }

      scheduleNext();
    });

    return () => {
      releaseWindow();
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [frames, data?.host, radarTileGrid.tiles, getRadarUrl, frameUrls, animationSpeedMs, extraDelayLastFrameMs]);

  const gate = moduleGate({
    style, data, error,
    loadingMessage: t('rain-map.loading'),
    empty: !frames.length && t('rain-map.noRadarData'),
  });
  if (gate || !data) return gate;

  const currentFrame = frames[displayIndex];
  if (!currentFrame) return null;
  const baseUrl = BASE_TILE_URLS[mapStyle] ?? BASE_TILE_URLS.dark;
  const pastCount = data.radar.past?.length ?? 0;

  return (
    <ModuleWrapper style={style}>
      <div
        className="relative w-full h-full overflow-hidden rounded-lg"
        style={{ backgroundColor: MAP_BG[mapStyle] ?? MAP_BG.dark }}
      >
        {/* Base map tiles */}
        <div
          className="absolute"
          style={{
            width: tileGrid.totalSize,
            height: tileGrid.totalSize,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          {tileGrid.tiles.map((tile) => (
            <img
              key={`base-${tile.x}-${tile.y}`}
              src={baseUrl
                .replace('{z}', String(zoom))
                .replace('{x}', String(tile.x))
                .replace('{y}', String(tile.y))}
              alt=""
              className="absolute"
              style={{
                width: TILE_SIZE,
                height: TILE_SIZE,
                left: tile.px,
                top: tile.py,
              }}
              draggable={false}
            />
          ))}

        </div>

        {/* Radar overlay tiles for current frame (own container, scaled up beyond zoom 7) */}
        <div
          className="absolute"
          style={{
            width: radarTileGrid.totalSize,
            height: radarTileGrid.totalSize,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          {radarTileGrid.tiles.map((tile) => {
            // Blob URLs come from the tile store, so a frame advance just
            // swaps src on the same nodes — no remount, no network. Tiles not
            // yet loaded (or in failure cooldown) render as gaps.
            const src = radarTileStore.get(getRadarUrl(currentFrame, tile));
            if (!src) return null;
            return (
              <img
                key={`radar-${tile.x}-${tile.y}`}
                src={src}
                alt=""
                className="absolute"
                style={{
                  width: radarTileGrid.scaledSize,
                  height: radarTileGrid.scaledSize,
                  left: tile.px,
                  top: tile.py,
                  opacity: radarOpacity,
                  imageRendering: radarScale > 1 ? 'pixelated' : undefined,
                }}
                draggable={false}
              />
            );
          })}
        </div>

        {/* Center marker dot */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-800 z-10"
          style={{ boxShadow: '0 0 4px rgba(0,0,0,0.6)' }}
        />

        {/* Timestamp */}
        {showTimestamp && (
          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded z-10 font-mono">
            {formatFrameTime(currentFrame.time, t)}
          </div>
        )}

        {/* Timeline dots */}
        {showTimeline && frames.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {frames.map((frame, i) => {
              const isNowcast = i >= pastCount;
              const isCurrent = i === displayIndex;
              return (
                <div
                  key={frame.time}
                  className="rounded-full transition-all duration-200"
                  style={{
                    width: isCurrent ? 8 : 5,
                    height: isCurrent ? 8 : 5,
                    backgroundColor: isCurrent
                      ? '#ffffff'
                      : isNowcast
                        ? 'rgba(74, 222, 128, 0.6)'
                        : 'rgba(255, 255, 255, 0.35)',
                    boxShadow: isCurrent ? '0 0 4px rgba(255,255,255,0.5)' : 'none',
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}
