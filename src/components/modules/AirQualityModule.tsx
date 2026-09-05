'use client';

import { Wind } from 'lucide-react';
import type { AirQualityConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { moduleGate } from './ModuleStates';
import { LocationRequired } from './LocationRequired';
import { useFetchData } from '@/hooks/useFetchData';
import { airQualityUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { TEXT_OPACITY, ink } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import { ContentCard } from './shared/ContentCard';

interface AirQualityModuleProps {
  config: AirQualityConfig;
  style: ModuleStyle;
  latitude?: number;
  longitude?: number;
  locationSettingsHref?: string;
}

interface AirQualityData {
  aqi: number;
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
}

const AQI_LABEL_KEYS: Record<number, string> = {
  1: 'good',
  2: 'fair',
  3: 'moderate',
  4: 'poor',
  5: 'veryPoor',
};

const AQI_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#eab308',
  3: '#f97316',
  4: '#ef4444',
  5: '#a855f7',
};

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['air-quality']?.ttlMs ?? 300_000;

// WHO guideline thresholds (µg/m³) for relative bar widths
const WHO_THRESHOLDS: Record<string, number> = {
  pm25: 25,
  pm10: 50,
  o3: 100,
};

function PollutantBar({ label, value, unit, threshold, color }: {
  label: string;
  value: number;
  unit: string;
  threshold: number;
  color: string;
}) {
  const pct = Math.min(100, (value / threshold) * 100);
  return (
    <ContentCard>
      <div className="flex items-center justify-between gap-3" style={{ fontSize: '0.8em' }}>
        <span className="shrink-0" style={{ opacity: TEXT_OPACITY.secondary, minWidth: '3em' }}>{label}</span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: ink(0.06) }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8, transition: 'width 0.5s ease' }} />
        </div>
        <span className="tabular-nums shrink-0" style={{ opacity: TEXT_OPACITY.tertiary, minWidth: '5em', textAlign: 'right' }}>
          {value.toFixed(1)} {unit}
        </span>
      </div>
    </ContentCard>
  );
}

export default function AirQualityModule({ config, style, latitude, longitude, locationSettingsHref }: AirQualityModuleProps) {
  const t = useTranslate('modules');
  // The route reads the household location itself; without one it can only
  // answer with an error string, so say what is missing in plain words
  // instead (the fetch is skipped while the location is unset).
  const hasLocation = latitude != null && longitude != null;
  const [data, error] = useFetchData<AirQualityData>(
    hasLocation ? airQualityUrl() : '',
    config.refreshIntervalMs ?? DEFAULT_REFRESH_MS,
  );

  if (!hasLocation) {
    return <LocationRequired style={style} locationSettingsHref={locationSettingsHref} />;
  }

  const gate = moduleGate({ style, data, error, loadingMessage: t('air-quality.loading') });
  if (gate || !data) return gate;

  const labelKey = AQI_LABEL_KEYS[data.aqi];
  const aqiLabel = labelKey ? t(`air-quality.labels.${labelKey}`) : t('air-quality.labels.unknown');
  const aqiColor = AQI_COLORS[data.aqi] ?? '#6b7280';

  return (
    <ModuleWrapper style={style}>
      <div
        className="flex flex-col gap-3 w-full h-full justify-center"
        style={{ background: `linear-gradient(135deg, ${aqiColor}12, transparent 60%)` }}
      >
        {config.showAQI !== false && (
          <div className="flex items-center gap-3">
            <Wind size={18} style={{ opacity: TEXT_OPACITY.tertiary, flexShrink: 0 }} />
            <span
              className="font-bold tabular-nums"
              style={{ fontSize: '2.5em', lineHeight: 1, color: aqiColor }}
            >
              {data.aqi}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium" style={{ fontSize: '0.9em' }}>{aqiLabel}</span>
              <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>{t('air-quality.airQualityIndex')}</span>
            </div>
          </div>
        )}

        {config.showPollutants && (
          <div className="flex flex-col gap-1.5">
            <PollutantBar label={t('air-quality.pollutants.pm25')} value={data.pm25} unit="µg/m³" threshold={WHO_THRESHOLDS.pm25} color={aqiColor} />
            <PollutantBar label={t('air-quality.pollutants.pm10')} value={data.pm10} unit="µg/m³" threshold={WHO_THRESHOLDS.pm10} color={aqiColor} />
            <PollutantBar label={t('air-quality.pollutants.o3')} value={data.o3} unit="µg/m³" threshold={WHO_THRESHOLDS.o3} color={aqiColor} />
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}
