'use client';

import type { AirQualityConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { ModuleLoadingState } from './ModuleStates';
import { useFetchData } from '@/hooks/useFetchData';
import { airQualityUrl } from '@/lib/fetch-keys';
import { TEXT_OPACITY } from '@/lib/constants';

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
  1: 'bg-green-600',
  2: 'bg-yellow-500',
  3: 'bg-orange-500',
  4: 'bg-red-600',
  5: 'bg-purple-600',
};

export default function AirQualityModule({ config, style }: AirQualityModuleProps) {
  const [data, error] = useFetchData<AirQualityData>(
    airQualityUrl(),
    config.refreshIntervalMs ?? 600000,
  );

  if (data === null) {
    return <ModuleLoadingState style={style} message="Loading air quality…" error={error} />;
  }

  const aqiLabel = AQI_LABELS[data.aqi] ?? 'Unknown';
  const aqiColor = AQI_COLORS[data.aqi] ?? 'bg-gray-500';

  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col gap-3 w-full h-full justify-center">
        {config.showAQI !== false && (
          <div className="flex items-center gap-3">
            <span className={`${aqiColor} text-white font-bold px-3 py-1 rounded-full`} style={{ fontSize: '0.875em' }}>
              AQI {data.aqi}
            </span>
            <span style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.secondary }}>{aqiLabel}</span>
          </div>
        )}

        {config.showPollutants && (
          <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.secondary }}>
            <span>PM2.5: {data.pm25.toFixed(1)} &mu;g/m&sup3;</span>
            <span>PM10: {data.pm10.toFixed(1)} &mu;g/m&sup3;</span>
            <span>O₃: {data.o3.toFixed(1)} &mu;g/m&sup3;</span>
          </div>
        )}

      </div>
    </ModuleWrapper>
  );
}
