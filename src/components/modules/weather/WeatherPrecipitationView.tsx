'use client';

import { CloudRain } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import type { WeatherViewProps } from './types';

export default function WeatherPrecipitationView({ minutely, scaledFontSize, containerRef }: WeatherViewProps) {
  const t = useTranslate('modules');
  const data = (minutely ?? []).slice(0, 60);
  const maxIntensity = Math.max(...data.map((m) => m.intensity), 0.5);

  // Determine summary text
  const hasRain = data.some((m) => m.intensity > 0);
  const firstRainIdx = data.findIndex((m) => m.intensity > 0);
  const firstDryIdx = hasRain && data[0]?.intensity > 0
    ? data.findIndex((m, i) => i > 0 && m.intensity === 0)
    : -1;

  let summary = t('weather.noPrecipitationExpected');
  if (hasRain && data[0]?.intensity > 0 && firstDryIdx > 0) {
    summary = t('weather.stoppingInMin', { minutes: firstDryIdx });
  } else if (hasRain && data[0]?.intensity > 0) {
    summary = t('weather.precipitationForNextHour');
  } else if (firstRainIdx > 0) {
    summary = t('weather.startingInMin', { minutes: firstRainIdx });
  }

  // Color by precip type
  function barColor(type?: string): string {
    if (type === 'snow') return 'rgba(200, 220, 255, 0.9)';
    if (type === 'sleet' || type === 'ice') return 'rgba(180, 200, 220, 0.7)';
    return 'rgba(96, 165, 250, 0.8)'; // rain / default blue
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col" style={{ fontSize: `${scaledFontSize}px` }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2" style={{ flex: '0 0 auto' }}>
        <CloudRain size="1.5em" style={{ opacity: TEXT_OPACITY.secondary }} aria-hidden="true" />
        <span className="font-medium" style={{ fontSize: '1em' }}>{t('weather.next60Minutes')}</span>
      </div>

      {/* Summary */}
      <div className="mb-3" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.heading }}>{summary}</div>

      {/* Bar chart or empty state */}
      {minutely === undefined ? (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.tertiary }}>
            {t('weather.minutelyDataRequires')}
          </p>
        </div>
      ) : data.length > 0 ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-end gap-px flex-1 min-h-0">
            {data.map((m, i) => {
              const height = maxIntensity > 0 ? (m.intensity / maxIntensity) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end h-full"
                >
                  <div
                    className="w-full rounded-t-sm transition-all"
                    style={{
                      height: `${Math.max(height, m.intensity > 0 ? 4 : 0)}%`,
                      backgroundColor: barColor(m.type),
                      minHeight: m.intensity > 0 ? 2 : 0,
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Time axis */}
          <div className="flex justify-between mt-1" style={{ fontSize: '0.65em', opacity: TEXT_OPACITY.tertiary }}>
            <span>{t('weather.timeline.now')}</span>
            <span>{t('weather.timeline.minutes15')}</span>
            <span>{t('weather.timeline.minutes30')}</span>
            <span>{t('weather.timeline.minutes45')}</span>
            <span>{t('weather.timeline.minutes60')}</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.tertiary }}>
            {summary}
          </p>
        </div>
      )}
    </div>
  );
}
