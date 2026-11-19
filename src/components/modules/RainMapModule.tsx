'use client';

import type { RainMapConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { LocationRequired } from './LocationRequired';
import RadarCanvas, { useRadarFrames } from './shared/RadarCanvas';
import { FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';

interface RainMapModuleProps {
  config: RainMapConfig;
  style: ModuleStyle;
  latitude?: number;
  longitude?: number;
  locationSettingsHref?: string;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['rain-map']?.ttlMs ?? 600_000;

export default function RainMapModule({
  config,
  style,
  latitude,
  longitude,
  locationSettingsHref,
}: RainMapModuleProps) {
  const t = useTranslate('modules');
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
  const refreshMs = config.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  // Off holds the newest frame: a still radar for an older Pi or a calmer wall.
  const animate = config.animate !== false;

  // The canvas reads the same index; useFetchData shares the request.
  const { data, error, frames } = useRadarFrames(center, refreshMs);

  const gate = moduleGate({
    style, data, error,
    loadingMessage: t('rain-map.loading'),
    empty: !frames.length && t('rain-map.noRadarData'),
  });
  if (!center) {
    return <LocationRequired style={style} locationSettingsHref={locationSettingsHref} />;
  }
  if (gate || !data) return gate;

  return (
    <ModuleWrapper style={style}>
      <RadarCanvas
        center={center}
        zoom={config.zoom ?? 6}
        mapStyle={config.mapStyle ?? 'dark'}
        colorScheme={config.colorScheme ?? 2}
        smooth={config.smooth !== false}
        showSnow={config.showSnow !== false}
        opacity={config.opacity ?? 0.7}
        animationSpeedMs={Math.max(500, config.animationSpeedMs ?? 500)}
        extraDelayLastFrameMs={config.extraDelayLastFrameMs ?? 2000}
        showTimestamp={config.showTimestamp !== false}
        showTimeline={animate && config.showTimeline !== false}
        latestOnly={!animate}
        refreshIntervalMs={refreshMs}
      />
    </ModuleWrapper>
  );
}
