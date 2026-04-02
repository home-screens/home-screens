import { getWeatherIcon, getWeatherIconLabel } from '@/lib/weather-icons';
import { TEXT_OPACITY } from '@/lib/constants';
import { CurrentWeatherStats } from './CurrentWeatherStats';
import { WeatherEmptyState } from './WeatherEmptyState';
import type { WeatherViewProps } from './types';

export default function WeatherCompactView({ config, hourly, forecast, units, scaledFontSize, containerRef }: WeatherViewProps) {
  const current = hourly[0];
  const today = forecast[0];

  if (!current) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center">
        <WeatherEmptyState />
      </div>
    );
  }

  const Icon = getWeatherIcon(current.icon, config.iconSet);

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col justify-center gap-1" style={{ fontSize: `${scaledFontSize}px` }}>
      <div className="flex items-center gap-3">
        <Icon size="1.8em" strokeWidth={1.5} aria-label={getWeatherIconLabel(current.icon)} role="img" />
        <span className="font-light" style={{ fontSize: '2em' }}>{Math.round(current.temp)}&deg;</span>
        {today && config.showHighLow !== false && (
          <span style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.dim }}>
            H:{Math.round(today.high)}&deg; L:{Math.round(today.low)}&deg;
          </span>
        )}
        <span className="capitalize truncate" style={{ fontSize: '0.8em', opacity: TEXT_OPACITY.dim }}>{current.description}</span>
      </div>
      <div className="flex items-center gap-3">
        {config.showFeelsLike !== false && current.feelsLike != null && (
          <span style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.tertiary }}>
            Feels {Math.round(current.feelsLike)}&deg;
          </span>
        )}
        <CurrentWeatherStats config={config} current={current} units={units} fontSize="0.7em" />
      </div>
    </div>
  );
}
