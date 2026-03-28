import { CloudRain, Droplets, Wind } from 'lucide-react';
import { getWeatherIcon, getWeatherIconLabel } from '@/lib/weather-icons';
import { WeatherStat } from '../WeatherStat';
import { dayLabel } from './day-label';
import type { WeatherViewProps } from './types';

export default function WeatherDailyView({ config, forecast, units, scaledFontSize, containerRef }: WeatherViewProps) {
  const days = forecast.slice(0, config.daysToShow);
  const windUnit = units === 'metric' ? 'km/h' : 'mph';
  const showHighLow = config.showHighLow !== false;

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col overflow-visible" style={{ fontSize: `${scaledFontSize}px` }}>
      <div className="flex flex-col flex-1 min-h-0">
        <h2 className="font-semibold mb-3 opacity-80" style={{ fontSize: '1.125em' }}>Forecast</h2>
        {days.length === 0 ? (
          <p className="opacity-50" style={{ fontSize: '0.875em' }}>No forecast data</p>
        ) : (
          <div className="flex items-center gap-5 flex-1 min-h-0">
            {/* Today - large */}
            <div className="flex flex-col items-center shrink-0">
              <span className="opacity-60 font-medium" style={{ fontSize: '0.85em' }}>{dayLabel(days[0].date)}</span>
              <div className="flex items-center gap-2">
                {(() => { const Icon = getWeatherIcon(days[0].icon, config.iconSet); return <Icon size="2.5em" strokeWidth={1.5} aria-label={getWeatherIconLabel(days[0].icon)} role="img" />; })()}
                {showHighLow && (
                  <div className="flex flex-col">
                    <span className="font-light" style={{ fontSize: '2em' }}>{Math.round(days[0].high)}&deg;</span>
                    <span className="opacity-50" style={{ fontSize: '1.2em' }}>{Math.round(days[0].low)}&deg;</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <WeatherStat icon={CloudRain} value={days[0].precipProbability} unit="%" visible={config.showPrecipitation !== false} fontSize="0.85em" />
                <WeatherStat icon={Droplets} value={days[0].humidity} unit="%" visible={config.showHumidity} fontSize="0.85em" />
                <WeatherStat icon={Wind} value={days[0].windSpeed} unit={` ${windUnit}`} visible={config.showWind} fontSize="0.85em" />
              </div>
            </div>

            {/* Divider */}
            <div className="self-stretch w-px opacity-30 bg-current shrink-0" />

            {/* Upcoming days */}
            <div className="flex flex-1 min-w-0 items-center justify-around flex-wrap gap-y-3">
              {days.slice(1).map((day, i) => {
                const Icon = getWeatherIcon(day.icon, config.iconSet);
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="opacity-60" style={{ fontSize: '0.75em' }}>
                      {dayLabel(day.date)}
                    </span>
                    <Icon size="1.8em" strokeWidth={1.5} aria-label={getWeatherIconLabel(day.icon)} role="img" />
                    <WeatherStat icon={CloudRain} value={day.precipProbability} unit="%" visible={config.showPrecipitation !== false} />
                    {config.showPrecipAmount && day.precipAmount != null && day.precipAmount > 0 && (
                      <span className="opacity-50" style={{ fontSize: '0.7em' }}>{day.precipAmount.toFixed(1)}&quot;</span>
                    )}
                    {showHighLow && (
                      <div className="flex gap-1" style={{ fontSize: '0.875em' }}>
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
      </div>
    </div>
  );
}
