'use client';

import { Wind } from 'lucide-react';
import type { AirQualityConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { airQualityUrl } from '@/lib/fetch-keys';
import { TEXT_OPACITY } from '@/lib/constants';
import { ContentCard } from './shared/ContentCard';

interface AirQualityModuleProps {
  config: AirQualityConfig;
  style: ModuleStyle;
}

interface AirQualityData {
  aqi: number;
  pm25: number;
  pm10: number;
  o3: number;
  no2: number;
}

const AQI_LABELS: Record<number, string> = {
  1: 'Good',
  2: 'Fair',
  3: 'Moderate',
  4: 'Poor',
  5: 'Very Poor',
};

const AQI_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#eab308',
  3: '#f97316',
  4: '#ef4444',
  5: '#a855f7',
};

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
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.8, transition: 'width 0.5s ease' }} />
        </div>
        <span className="tabular-nums shrink-0" style={{ opacity: TEXT_OPACITY.tertiary, minWidth: '5em', textAlign: 'right' }}>
          {value.toFixed(1)} {unit}
        </span>
      </div>
    </ContentCard>
  );
}

export default function AirQualityModule({ config, style }: AirQualityModuleProps) {
  const [data, error] = useFetchData<AirQualityData>(
    airQualityUrl(),
    config.refreshIntervalMs ?? 600000,
  );

  if (data === null) {
    return <ModuleLoadingState style={style} message="Loading air quality…" error={error} />;
  }

  const aqiLabel = AQI_LABELS[data.aqi] ?? 'Unknown';
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
              <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>Air Quality Index</span>
            </div>
          </div>
        )}

        {config.showPollutants && (
          <div className="flex flex-col gap-1.5">
            <PollutantBar label="PM2.5" value={data.pm25} unit="µg/m³" threshold={WHO_THRESHOLDS.pm25} color={aqiColor} />
            <PollutantBar label="PM10" value={data.pm10} unit="µg/m³" threshold={WHO_THRESHOLDS.pm10} color={aqiColor} />
            <PollutantBar label="O₃" value={data.o3} unit="µg/m³" threshold={WHO_THRESHOLDS.o3} color={aqiColor} />
          </div>
        )}
      </div>
    </ModuleWrapper>
  );
}
