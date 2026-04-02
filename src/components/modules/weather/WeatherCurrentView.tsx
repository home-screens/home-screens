import { getWeatherIcon, getWeatherIconLabel } from '@/lib/weather-icons';
import { CurrentWeatherStats } from './CurrentWeatherStats';
import { WeatherEmptyState } from './WeatherEmptyState';
import type { WeatherViewProps } from './types';

export default function WeatherCurrentView({ config, forecast, hourly, units, scaledFontSize, containerRef }: WeatherViewProps) {
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
    <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ fontSize: `${scaledFontSize}px` }}>
      <div className="flex items-center gap-3">
        <Icon size="3em" strokeWidth={1.5} aria-label={getWeatherIconLabel(current.icon)} role="img" />
        <span className="font-light" style={{ fontSize: '4em' }}>{Math.round(current.temp)}&deg;</span>
      </div>
      <p className="opacity-60 capitalize" style={{ fontSize: '1em' }}>{current.description}</p>
      {today && (
        <span className="opacity-50" style={{ fontSize: '0.9em' }}>
          H:{Math.round(today.high)}&deg; L:{Math.round(today.low)}&deg;
        </span>
      )}
      {config.showFeelsLike !== false && current.feelsLike != null && (
        <span className="opacity-50" style={{ fontSize: '0.85em' }}>
          Feels like {Math.round(current.feelsLike)}&deg;
        </span>
      )}
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <CurrentWeatherStats config={config} current={current} units={units} fontSize="0.85em" />
      </div>
    </div>
  );
}
