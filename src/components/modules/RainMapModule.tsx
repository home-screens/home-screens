'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { RainMapConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState, ModuleEmptyState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { rainMapUrl } from '@/lib/fetch-keys';

interface RainMapModuleProps {
  config: RainMapConfig;
  style: ModuleStyle;
  latitude?: number;
  longitude?: number;
}

interface RainFrame {
  time: number;
  path: string;
}

interface RainViewerData {
  host: string;
  radar: {
    past: RainFrame[];
    nowcast: RainFrame[];
  };
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

function formatFrameTime(unixTime: number): string {
  const now = Date.now() / 1000;
  const diffMin = Math.round((unixTime - now) / 60);
  if (Math.abs(diffMin) <= 1) return 'Now';
  if (diffMin < 0) return `${Math.abs(diffMin)}m ago`;
  return `+${diffMin}m`;
}

export default function RainMapModule({
  config,
  style,
  latitude,
  longitude,
}: RainMapModuleProps) {
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
  const refreshMs = config.refreshIntervalMs ?? 600000;

  const [data, error] = useFetchData<RainViewerData>(rainMapUrl(), refreshMs);

  const [displayIndex, setDisplayIndex] = useState(0);
  const [imagesReady, setImagesReady] = useState(false);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const preloadedRef = useRef<Set<string>>(new Set());

  // Combine past + nowcast frames
  const frames = useMemo(() => {
    if (!data?.radar) return [];
    return [...(data.radar.past ?? []), ...(data.radar.nowcast ?? [])];
  }, [data]);

  // Radar zoom is capped at 7 by the RainViewer API; above that we upscale
  const radarZoom = Math.min(zoom, MAX_RADAR_ZOOM);
  const radarScale = Math.pow(2, zoom - radarZoom); // 1 at zoom ≤ 7, 2 at 8, 4 at 9, etc.

  // Calculate base map tile grid (uses full zoom)
  const tileGrid = useMemo(() => {
    const centerTileX = lon2tile(lon, zoom);
    const centerTileY = lat2tile(lat, zoom);
    const tileX = Math.floor(centerTileX);
    const tileY = Math.floor(centerTileY);
    const offsetX = (centerTileX - tileX) * TILE_SIZE;
    const offsetY = (centerTileY - tileY) * TILE_SIZE;

    const gridRadius = 2;
    const totalSize = (gridRadius * 2 + 1) * TILE_SIZE;
    const tiles: Array<{ x: number; y: number; px: number; py: number }> = [];
    for (let dy = -gridRadius; dy <= gridRadius; dy++) {
      for (let dx = -gridRadius; dx <= gridRadius; dx++) {
        tiles.push({
          x: tileX + dx,
          y: tileY + dy,
          px: totalSize / 2 - offsetX + dx * TILE_SIZE,
          py: totalSize / 2 - offsetY + dy * TILE_SIZE,
        });
      }
    }
    return { tiles, totalSize };
  }, [lat, lon, zoom]);

  // Calculate radar tile grid (uses capped zoom, scaled up to match base map)
  const radarTileGrid = useMemo(() => {
    const centerTileX = lon2tile(lon, radarZoom);
    const centerTileY = lat2tile(lat, radarZoom);
    const tileX = Math.floor(centerTileX);
    const tileY = Math.floor(centerTileY);
    const offsetX = (centerTileX - tileX) * TILE_SIZE * radarScale;
    const offsetY = (centerTileY - tileY) * TILE_SIZE * radarScale;

    // Match the base map's gridRadius — the extra +1 padding was causing
    // 49 tiles/frame instead of 25, which overwhelms RainViewer's rate limit.
    const gridRadius = Math.max(2, Math.ceil(2 / radarScale));
    const scaledSize = TILE_SIZE * radarScale;
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
  }, [lat, lon, radarZoom, radarScale]);

  // Build radar tile URL for a given frame
  const getRadarUrl = useCallback(
    (frame: RainFrame, tile: { x: number; y: number }) => {
      if (!data?.host) return '';
      return `${data.host}${frame.path}/${TILE_SIZE}/${radarZoom}/${tile.x}/${tile.y}/${colorScheme}/${smooth}_${snow}.png`;
    },
    [data?.host, radarZoom, colorScheme, smooth, snow],
  );

  // Preload a single frame's radar tiles, returning a promise that resolves
  // when all tiles for that frame have loaded (or errored). Skips tiles
  // that were already loaded in a previous cycle.
  const preloadFrame = useCallback(
    (frame: RainFrame) => {
      const promises = radarTileGrid.tiles.map((tile) => {
        const url = getRadarUrl(frame, tile);
        if (!url || preloadedRef.current.has(url)) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => {
            preloadedRef.current.add(url);
            resolve();
          };
          img.src = url;
        });
      });
      return Promise.all(promises);
    },
    [radarTileGrid.tiles, getRadarUrl],
  );

  // Preload the first frame, then start the animation loop.
  // Each animation step preloads the next frame before advancing.
  useEffect(() => {
    if (!frames.length || !data?.host || !radarTileGrid.tiles.length) return;

    let cancelled = false;
    indexRef.current = 0;
    setDisplayIndex(0);
    setImagesReady(false);

    // Preload just the first frame, then start animating
    preloadFrame(frames[0]).then(() => {
      if (cancelled) return;
      setImagesReady(true);

      function scheduleNext() {
        if (cancelled) return;
        const current = indexRef.current;
        const next = (current + 1) % frames.length;
        const isLooping = next === 0;
        const delay = isLooping ? extraDelayLastFrameMs : animationSpeedMs;

        // Preload the next frame's tiles during the current frame's display time
        preloadFrame(frames[next]);

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
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [frames, data?.host, radarTileGrid.tiles, preloadFrame, animationSpeedMs, extraDelayLastFrameMs]);

  if (data === null) {
    return <ModuleLoadingState style={style} message="Loading rain map…" error={error} />;
  }

  if (!frames.length) {
    return <ModuleEmptyState style={style} message="No radar data available" />;
  }

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
          {radarTileGrid.tiles.map((tile) => (
            <img
              key={`radar-${tile.x}-${tile.y}-${currentFrame.time}`}
              src={getRadarUrl(currentFrame, tile)}
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
          ))}
        </div>

        {/* Center marker dot */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-800 z-10"
          style={{ boxShadow: '0 0 4px rgba(0,0,0,0.6)' }}
        />

        {/* Timestamp */}
        {showTimestamp && (
          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded z-10 font-mono">
            {formatFrameTime(currentFrame.time)}
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
