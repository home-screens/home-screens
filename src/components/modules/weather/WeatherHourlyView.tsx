import { CloudRain, Droplets, Wind } from 'lucide-react';
import { getWeatherIcon, getWeatherIconLabel } from '@/lib/weather-icons';
import { WeatherStat } from '../WeatherStat';
import type { WeatherViewProps } from './types';

export default function WeatherHourlyView({ config, hourly, forecast, timezone, scaledFontSize, containerRef }: WeatherViewProps) {
  const hours = hourly.slice(0, config.hoursToShow);

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col" style={{ fontSize: `${scaledFontSize}px` }}>
      <h2 className="font-semibold mb-3 opacity-80 shrink-0" style={{ fontSize: '1.125em' }}>Hourly Forecast</h2>
      {hours.length === 0 ? (
        <p className="opacity-50" style={{ fontSize: '0.875em' }}>No weather data</p>
      ) : (
        <div className="flex items-center gap-5 flex-1 min-h-0">
          {/* Current weather - large */}
          <div className="flex flex-col items-center justify-center shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-light" style={{ fontSize: '3em' }}>{Math.round(hours[0].temp)}&deg;</span>
              {(() => { const Icon = getWeatherIcon(hours[0].icon, config.iconSet); return <Icon size="2.5em" strokeWidth={1.5} aria-label={getWeatherIconLabel(hours[0].icon)} role="img" />; })()}
            </div>
            <div className="flex flex-col items-center gap-0.5">
              {forecast[0] && (
                <span className="opacity-60" style={{ fontSize: '0.85em' }}>
                  H:{Math.round(forecast[0].high)}&deg; L:{Math.round(forecast[0].low)}&deg;
                </span>
              )}
              {config.showFeelsLike !== false && hours[0].feelsLike != null && (
                <span className="opacity-60" style={{ fontSize: '0.85em' }}>
                  Feels like {Math.round(hours[0].feelsLike)}&deg;
                </span>
              )}
              <WeatherStat icon={Droplets} value={hours[0].humidity} unit="%" visible={config.showHumidity} fontSize="0.85em" />
              <WeatherStat icon={Wind} value={hours[0].windSpeed} visible={config.showWind} fontSize="0.85em" />
            </div>
          </div>

          {/* Divider */}
          <div className="self-stretch w-px opacity-30 bg-current shrink-0" />

          {/* Upcoming hours */}
          <div className="flex flex-1 min-w-0 min-h-0 items-stretch justify-around">
            {hours.slice(1).map((hour, i) => {
              const Icon = getWeatherIcon(hour.icon, config.iconSet);
              return (
                <div key={i} className="flex flex-col items-center justify-evenly min-h-0">
                  <span className="opacity-60" style={{ fontSize: '0.75em' }}>
                    {new Date(hour.time).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      hour12: true,
                      ...(timezone ? { timeZone: timezone } : {}),
                    })}
                  </span>
                  <Icon size="1.8em" strokeWidth={1.5} aria-label={getWeatherIconLabel(hour.icon)} role="img" />
                  <WeatherStat icon={CloudRain} value={hour.precipProbability} unit="%" visible={config.showPrecipitation !== false} />
                  <span className="font-medium" style={{ fontSize: '0.875em' }}>{Math.round(hour.temp)}&deg;</span>
                  <WeatherStat icon={Droplets} value={hour.humidity} unit="%" visible={config.showHumidity} />
                  <WeatherStat icon={Wind} value={hour.windSpeed} visible={config.showWind} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
