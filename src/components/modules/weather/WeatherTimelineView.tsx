'use client';

import { useId } from 'react';
import { Droplet, Wind } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { windUnitLabel } from '@/lib/weather/units';
import { tempColor } from '@/lib/weather/temp-ramp';
import { isNightHour, nightBandRadius } from '@/lib/weather/sun-times';
import { getWeatherIcon } from '@/lib/weather-icons';
import type { HourlyWeather } from '@/lib/weather';
import {
  cachedFormat, hourLabel, hourLabelled, labelStride, smoothPath, spanHours, temperatureAxis, timelineMarks, valueLabelled,
} from '../fullscreen-weather/weather-view-utils';
import { RAIN_COLOR, RainLegend, ViewTitle, useSunTimes, useViewBox } from './chart-parts';
import { getLocalizedConditionLabel } from './condition-label';
import { WeatherEmptyState } from './WeatherEmptyState';
import type { WeatherViewProps } from './types';

/** Rain chance below this draws no bar and no percentage. */
const RAIN_SHOWN_PCT = 5;

/**
 * The full-screen Hour by hour view as a module view.
 *
 * A box wider than tall is a meteogram: hour, icon, the temperature curve
 * with a dot per hour, rain chance bars, wind, time running across. A taller
 * box runs time down the page as rows, with the curve drawn vertically
 * through the track. Same parts either way: the dots and labels are DOM
 * elements positioned by percentage inside their own row or column, so type
 * scales in em like the rest of the module, and only the connecting line is
 * SVG, with a viewBox of one unit per entry and a non-scaling stroke so it
 * lands on the dots at any size.
 */
export default function WeatherTimelineView({ config, hourly, units, timezone, timeFormat, scaledFontSize, latitude, longitude }: WeatherViewProps) {
  const t = useTranslate('modules');
  const tWeather = useTranslate('weather');
  const locale = useFormattingLocale();
  const sun = useSunTimes(latitude, longitude, timezone);
  const [outerRef, box] = useViewBox();
  const uid = useId();

  const hrs = hourly.slice(0, Math.max(2, config.hoursToShow || 8));
  const N = hrs.length;
  const temps = hrs.map((h) => h.temp);
  const axis = temperatureAxis(temps);
  const marks = timelineMarks(hrs, timezone);
  const dayFormat = cachedFormat(locale, { weekday: 'short', ...(timezone ? { timeZone: timezone } : {}) });
  const entries = hrs.map((h, i) => {
    const { hour, midnight } = marks[i];
    return {
      h, i, midnight,
      night: isNightHour(hour, sun),
      label: i === 0 ? t('fullscreen-weather.nowcast.now') : midnight ? dayFormat.format(new Date(h.time)) : hourLabel(Math.floor(hour), timeFormat),
      rain: Math.round(h.precipProbability ?? 0),
      wind: h.windSpeed != null ? Math.round(h.windSpeed) : null,
      k: axis.k(h.temp),
    };
  });
  const landscape = box.landscape;
  // Rows in a narrow box drop the icon and wind columns, as the full-screen
  // HourlyRows do: with every column fixed in em, a 420 px box left the
  // temperature track 17 px wide and nothing overflowed for the fit loop
  // to shrink. The track also has a floor (see Rows) so a box too narrow for
  // the remaining columns overflows instead of collapsing it. Design canvas
  // pixels: the starting text size follows the box height, so a rule in em
  // would not tell a narrow box from a wide one.
  const narrow = !landscape && box.width > 0 && box.width < 480;

  const { boxRef, contentRef, fontSize } = useFitFontSize(
    scaledFontSize,
    [landscape, narrow, N, config.showTitle !== false, config.iconSet].join('|'),
  );

  const gradient = (vertical: boolean) => (
    <defs>
      <linearGradient id={`${uid}-g`} gradientUnits="userSpaceOnUse" x1={vertical ? 0 : 0.5} y1={vertical ? 0.5 : 0} x2={vertical ? 0 : N - 0.5} y2={vertical ? N - 0.5 : 0}>
        {temps.map((temp, i) => <stop key={i} offset={`${((i / Math.max(1, N - 1)) * 100).toFixed(1)}%`} stopColor={tempColor(temp, units)} />)}
      </linearGradient>
    </defs>
  );

  return (
    <div ref={outerRef} className="w-full h-full">
      <div ref={boxRef} className="w-full h-full overflow-hidden" style={{ fontSize: `${fontSize}px` }} data-weather-timeline-mode={landscape ? 'columns' : 'rows'}>
        {/* Title and chart measured together; see WeatherWeekView. */}
        <div ref={contentRef} className="h-full flex flex-col">
          {config.showTitle !== false && (
            <ViewTitle right={<RainLegend />}>{t('fullscreen-weather.sections.nextHours', { hours: spanHours(hrs) })}</ViewTitle>
          )}
          {N < 2 ? (
            <WeatherEmptyState />
          ) : landscape ? (
            <Meteogram entries={entries} units={units} boxWidth={box.width} fontSize={fontSize} iconSet={config.iconSet} tWeather={tWeather} gradient={gradient(false)} gradId={`${uid}-g`} />
          ) : (
            <Rows entries={entries} units={units} axis={axis} iconSet={config.iconSet} tWeather={tWeather} gradient={gradient(true)} gradId={`${uid}-g`} narrow={narrow} />
          )}
        </div>
      </div>
    </div>
  );
}

type Entry = {
  h: HourlyWeather; i: number; midnight: boolean; night: boolean; label: string; rain: number; wind: number | null; k: number;
};

interface ChartProps {
  entries: Entry[];
  units: 'metric' | 'imperial';
  iconSet: WeatherViewProps['config']['iconSet'];
  tWeather: (key: string) => string;
  gradient: React.ReactNode;
  gradId: string;
}

const DIVIDER = '1px solid color-mix(in srgb, currentColor 12%, transparent)';

function Meteogram({ entries, units, boxWidth, fontSize, iconSet, tWeather, gradient, gradId }: ChartProps & { boxWidth: number; fontSize: number }) {
  const N = entries.length;
  const gutterEm = 1.8;
  // Labels thin out when the columns get narrower than a "84°".
  const columnPx = (boxWidth - gutterEm * fontSize) / N;
  const stride = labelStride(columnPx, fontSize * 2.2);
  const midnights = entries.map((e) => e.midnight);
  const pts = entries.map((e) => [e.i + 0.5, (1 - e.k) * 100] as [number, number]);
  const bands = ['hour', 'icon', 'curve', 'rain', 'wind'] as const;
  const bandStyle: Record<(typeof bands)[number], React.CSSProperties> = {
    hour: { height: '1.1em', flexShrink: 0 },
    icon: { height: '1.5em', flexShrink: 0 },
    curve: { flex: 1, minHeight: '3em' },
    rain: { height: '2.2em', flexShrink: 0 },
    wind: { height: '1.1em', flexShrink: 0 },
  };
  const plotInset: React.CSSProperties = { position: 'absolute', left: 0, right: 0, top: '1.3em', bottom: '0.3em' };

  return (
    <div className="flex-1 flex">
      <div className="shrink-0 flex flex-col gap-[0.3em]" style={{ width: `${gutterEm}em`, opacity: TEXT_OPACITY.dim }}>
        {bands.map((b) => (
          <div key={b} className="relative flex items-center justify-center" style={bandStyle[b]}>
            {b === 'rain' && <Droplet size="1em" strokeWidth={1.6} aria-hidden="true" />}
            {b === 'wind' && <span className="font-semibold" style={{ fontSize: '0.6em' }}>{windUnitLabel(units)}</span>}
          </div>
        ))}
      </div>
      <div className="flex-1 min-w-0 relative flex">
        {/* A ghost column with the same bands as the hour columns, spanning
            the whole list, whose curve band holds the spline. */}
        <div aria-hidden className="absolute inset-0 flex flex-col gap-[0.3em] pointer-events-none">
          {bands.map((b) => (
            <div key={b} className="relative" style={bandStyle[b]}>
              {b === 'curve' && (
                <div style={plotInset} data-testid="weather-timeline-spline">
                  <svg viewBox={`0 0 ${N} 100`} preserveAspectRatio="none" className="block w-full h-full overflow-visible">
                    {gradient}
                    <path d={smoothPath(pts)} fill="none" stroke={`url(#${gradId})`} strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
        {entries.map((e) => {
          const Icon = getWeatherIcon(e.h.icon, iconSet);
          const labelled = valueLabelled(e.i, stride);
          return (
            <div
              key={e.i}
              data-testid="weather-hour"
              className="flex-1 min-w-0 flex flex-col gap-[0.3em] relative"
              style={{
                borderLeft: e.midnight ? DIVIDER : '1px solid transparent',
                background: e.night ? 'color-mix(in srgb, currentColor 5%, transparent)' : undefined,
                borderRadius: e.night ? nightBandRadius(entries, e.i, '0.4em', 'row') : undefined,
              }}
            >
              {/* Every band box is sized in the base em, same as the ghost
                  column's, and only the text inside takes a smaller size:
                  a size set on the box itself scales its em height and the
                  spline's band no longer lines up with the dots. */}
              <div className="relative flex items-center justify-center whitespace-nowrap" style={bandStyle.hour}>
                <span style={{ fontSize: '0.68em', fontWeight: e.i === 0 ? 600 : 500, opacity: e.i === 0 ? 1 : TEXT_OPACITY.secondary }}>
                  {hourLabelled(e.i, stride, midnights) ? e.label : ''}
                </span>
              </div>
              <div className="relative flex items-center justify-center" style={{ ...bandStyle.icon, color: e.rain >= 50 ? RAIN_COLOR : undefined }}>
                <Icon size="1.15em" strokeWidth={1.6} aria-label={getLocalizedConditionLabel(e.h.icon, tWeather)} role="img" />
              </div>
              <div className="relative" style={bandStyle.curve}>
                <div style={plotInset}>
                  <span className="absolute rounded-full" style={{ left: '50%', top: `${(1 - e.k) * 100}%`, width: '0.5em', height: '0.5em', transform: 'translate(-50%,-50%)', background: tempColor(e.h.temp, units), border: '2px solid rgba(0,0,0,.45)' }} />
                  {labelled && (
                    <span className="absolute font-medium whitespace-nowrap tabular-nums" style={{ left: '50%', top: `${(1 - e.k) * 100}%`, transform: 'translate(-50%, calc(-100% - 0.4em))', fontSize: '0.78em' }}>
                      {Math.round(e.h.temp)}&deg;
                    </span>
                  )}
                </div>
              </div>
              <div className="relative flex items-end justify-center" style={{ ...bandStyle.rain, padding: '0 18%' }}>
                {e.rain >= RAIN_SHOWN_PCT && (
                  <>
                    {labelled && (
                      <span className="absolute left-0 right-0 text-center font-semibold" style={{ bottom: `calc(${e.rain}% + 0.3em)`, fontSize: '0.58em', color: RAIN_COLOR }}>{e.rain}%</span>
                    )}
                    <div className="w-full" style={{ height: `${e.rain}%`, minHeight: 2, background: RAIN_COLOR, borderRadius: '3px 3px 1px 1px' }} />
                  </>
                )}
              </div>
              <div className="relative flex items-center justify-center" style={bandStyle.wind}>
                <span style={{ fontSize: '0.68em', opacity: TEXT_OPACITY.secondary }}>{labelled && e.wind != null ? e.wind : ''}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Rows({ entries, units, axis, iconSet, tWeather, gradient, gradId, narrow }: ChartProps & { axis: { min: number; max: number }; narrow: boolean }) {
  const N = entries.length;
  // The track is never narrower than this: a row that cannot seat it runs
  // past the box, where the fit loop measures it and shrinks the type.
  const TRACK_MIN = 'min-w-[9em]';
  const pts = entries.map((e) => [e.k * 100, e.i + 0.5] as [number, number]);
  const trackInset: React.CSSProperties = { position: 'absolute', top: 0, bottom: 0, left: '0.3em', right: '2.6em' };
  const col = {
    hour: { width: '3em', flex: 'none' } as React.CSSProperties,
    icon: { width: '1.6em', flex: 'none' } as React.CSSProperties,
    rain: { width: '4.2em', flex: 'none' } as React.CSSProperties,
    wind: { width: '3.6em', flex: 'none' } as React.CSSProperties,
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Column widths are in the base em on every row, the header and the
          ghost row alike, so the track lands in the same place in each; the
          type inside takes its own size. */}
      <div className="flex gap-[0.6em] shrink-0 pb-[0.4em] font-semibold" style={{ opacity: TEXT_OPACITY.dim, borderBottom: DIVIDER }}>
        <span style={col.hour} />
        {!narrow && <span style={col.icon} />}
        <span className={`flex-1 ${TRACK_MIN} flex justify-between px-[0.3em] tabular-nums`} style={{ fontSize: '0.62em' }}><span>{Math.round(axis.min)}&deg;</span><span>{Math.round(axis.max)}&deg;</span></span>
        <span className="flex justify-center" style={col.rain}><Droplet size="0.9em" strokeWidth={1.6} aria-hidden="true" /></span>
        {!narrow && <span className="flex justify-center" style={col.wind}><Wind size="0.9em" strokeWidth={1.6} aria-hidden="true" /></span>}
      </div>
      <div className="flex-1 relative flex flex-col">
        <div aria-hidden className="absolute inset-0 flex gap-[0.6em] pointer-events-none">
          <span style={col.hour} />
          {!narrow && <span style={col.icon} />}
          <span className={`flex-1 ${TRACK_MIN} relative`}>
            <div style={trackInset} data-testid="weather-timeline-spline">
              <svg viewBox={`0 0 100 ${N}`} preserveAspectRatio="none" className="block w-full h-full overflow-visible">
                {gradient}
                <path d={smoothPath(pts)} fill="none" stroke={`url(#${gradId})`} strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              </svg>
            </div>
          </span>
          <span style={col.rain} />
          {!narrow && <span style={col.wind} />}
        </div>
        {entries.map((e) => {
          const Icon = getWeatherIcon(e.h.icon, iconSet);
          return (
            <div key={e.i} data-testid="weather-hour" className="grow shrink-0 basis-auto flex items-center gap-[0.6em] relative" style={{ minHeight: '1.6em' }}>
              <span className="font-semibold" style={col.hour}><span style={{ fontSize: '0.78em', opacity: e.i === 0 ? 1 : TEXT_OPACITY.secondary }}>{e.label}</span></span>
              {!narrow && (
                <span className="grid place-items-center" style={{ ...col.icon, color: e.rain >= 50 ? RAIN_COLOR : undefined }}>
                  <Icon size="1.1em" strokeWidth={1.6} aria-label={getLocalizedConditionLabel(e.h.icon, tWeather)} role="img" />
                </span>
              )}
              <span className={`flex-1 ${TRACK_MIN} relative h-full`}>
                <div style={trackInset}>
                  <span className="absolute rounded-full" style={{ top: '50%', left: `${e.k * 100}%`, width: '0.5em', height: '0.5em', transform: 'translate(-50%,-50%)', background: tempColor(e.h.temp, units), border: '2px solid rgba(0,0,0,.45)' }} />
                  <span className="absolute font-medium whitespace-nowrap tabular-nums" style={{ top: '50%', left: `${e.k * 100}%`, transform: 'translate(0.45em, -50%)', fontSize: '0.82em' }}>{Math.round(e.h.temp)}&deg;</span>
                </div>
              </span>
              <span className="flex items-center gap-[0.3em]" style={{ ...col.rain, visibility: e.rain >= RAIN_SHOWN_PCT ? 'visible' : 'hidden' }}>
                <span className="flex-1 relative overflow-hidden rounded-full" style={{ height: '0.35em', background: 'color-mix(in srgb, currentColor 12%, transparent)' }}>
                  <span className="absolute left-0 top-0 bottom-0 rounded-full" style={{ width: `${e.rain}%`, background: RAIN_COLOR }} />
                </span>
                {/* Wide enough for two digits and the sign: a fixed 2em column
                    held "48%" at its width and let the sign run off the card. */}
                <span className="text-right font-semibold tabular-nums whitespace-nowrap" style={{ minWidth: '2.6em', fontSize: '0.65em', color: RAIN_COLOR }}>{e.rain}%</span>
              </span>
              {!narrow && (
                <span className="text-right whitespace-nowrap" style={col.wind}>
                  <span style={{ fontSize: '0.72em', opacity: TEXT_OPACITY.secondary }}>{e.wind != null ? `${e.wind} ${windUnitLabel(units)}` : ''}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
