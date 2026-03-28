import { CloudRain, Droplets, Wind, Gauge, Eye, Thermometer } from 'lucide-react';
import { getWeatherIcon, getWeatherIconLabel } from '@/lib/weather-icons';
import { WeatherStat } from '../WeatherStat';
import { dayLabel } from './day-label';
import type { WeatherViewProps } from './types';

export default function WeatherCombinedView({ config, hourly, forecast, units, timezone, scaledFontSize, containerRef }: WeatherViewProps) {
  const hours = hourly.slice(0, config.hoursToShow);
  const days = forecast.slice(0, config.daysToShow);
  const windUnit = units === 'metric' ? 'km/h' : 'mph';
  const current = hourly[0];

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col" style={{ fontSize: `${scaledFontSize}px` }}>
      {/* Current conditions — 25% */}
      {current && (
        <div className="flex items-center gap-4" style={{ flex: '0 0 25%' }}>
          {(() => { const Icon = getWeatherIcon(current.icon, config.iconSet); return <Icon size="2.5em" strokeWidth={1.5} aria-label={getWeatherIconLabel(current.icon)} role="img" />; })()}
          <span className="font-light" style={{ fontSize: '3em' }}>{Math.round(current.temp)}&deg;</span>
          <div className="flex flex-col gap-0.5">
            {forecast[0] && (
              <span className="opacity-60" style={{ fontSize: '0.8em' }}>
                H:{Math.round(forecast[0].high)}&deg; L:{Math.round(forecast[0].low)}&deg;
              </span>
            )}
            {config.showFeelsLike !== false && current.feelsLike != null && (
              <span className="opacity-50" style={{ fontSize: '0.75em' }}>
                Feels like {Math.round(current.feelsLike)}&deg;
              </span>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <WeatherStat icon={CloudRain} value={current.precipProbability} unit="%" visible={config.showPrecipitation !== false} fontSize="0.75em" />
              <WeatherStat icon={Droplets} value={current.humidity} unit="%" visible={config.showHumidity} fontSize="0.75em" />
              <WeatherStat icon={Wind} value={current.windSpeed} visible={config.showWind} fontSize="0.75em" />
              <WeatherStat icon={Gauge} value={current.pressure} unit=" hPa" visible={config.showPressure} fontSize="0.75em" />
              <WeatherStat icon={Eye} value={current.visibility} unit={units === 'metric' ? ' km' : ' mi'} visible={config.showVisibility} fontSize="0.75em" />
              <WeatherStat icon={Thermometer} value={current.dewPoint} unit="°" visible={config.showDewPoint} fontSize="0.75em" />
            </div>
          </div>
        </div>
      )}

      {/* Hourly strip — 25% */}
      {hours.length > 1 && (
        <div className="flex flex-col" style={{ flex: '0 0 25%' }}>
          <div className="w-full h-px opacity-20 bg-current" />
          <div className="flex items-center justify-around flex-1">
            {hours.slice(1).map((hour, i) => {
              const Icon = getWeatherIcon(hour.icon, config.iconSet);
              return (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span className="opacity-50" style={{ fontSize: '0.65em' }}>
                    {new Date(hour.time).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      hour12: true,
                      ...(timezone ? { timeZone: timezone } : {}),
                    })}
                  </span>
                  <Icon size="1.4em" strokeWidth={1.5} aria-label={getWeatherIconLabel(hour.icon)} role="img" />
                  <span className="font-medium" style={{ fontSize: '0.75em' }}>{Math.round(hour.temp)}&deg;</span>
                  <WeatherStat icon={CloudRain} value={hour.precipProbability} unit="%" visible={config.showPrecipitation !== false} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily forecast — remaining 50% */}
      {days.length > 0 && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="w-full h-px opacity-20 bg-current shrink-0" />
          <div className="flex flex-col flex-1 min-h-0 justify-evenly py-1">
            {days.map((day, i) => {
              const Icon = getWeatherIcon(day.icon, config.iconSet);
              return (
                <div key={i} className="flex items-center gap-3" style={{ fontSize: '0.85em' }}>
                  <span className="opacity-60 w-[3.5em] text-right" style={{ fontSize: '0.85em' }}>{dayLabel(day.date)}</span>
                  <Icon size="1.4em" strokeWidth={1.5} className="shrink-0" aria-label={getWeatherIconLabel(day.icon)} role="img" />
                  <WeatherStat icon={CloudRain} value={day.precipProbability} unit="%" visible={config.showPrecipitation !== false} />
                  {config.showHighLow !== false && (
                    <div className="flex gap-1 ml-auto">
                      <span className="font-medium">{Math.round(day.high)}&deg;</span>
                      <span className="opacity-50">{Math.round(day.low)}&deg;</span>
                    </div>
                  )}
                  <WeatherStat icon={Droplets} value={day.humidity} unit="%" visible={config.showHumidity} />
                  <WeatherStat icon={Wind} value={day.windSpeed} unit={` ${windUnit}`} visible={config.showWind} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!current && days.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="opacity-50" style={{ fontSize: '0.875em' }}>No weather data</p>
        </div>
      )}
    </div>
  );
}
