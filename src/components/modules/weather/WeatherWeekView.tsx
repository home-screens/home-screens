'use client';

import { useMemo } from 'react';
import { Droplet, Droplets, Wind } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useTZClock } from '@/hooks/useTZClock';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { localISODate } from '@/lib/timezone';
import { dayMonthPattern, formatDateSync } from '@/i18n';
import { getWeatherIcon } from '@/lib/weather-icons';
import type { ForecastDay } from '@/lib/weather';
import type { WeekRange } from '../fullscreen-weather/weather-view-utils';
import { RAIN_COLOR, RAIN_SHOWN_PCT, RangeBar, ViewTitle, useViewBox } from './chart-parts';
import { dayLabel } from './day-label';
import { getLocalizedConditionLabel } from './condition-label';
import { WeatherEmptyState } from './WeatherEmptyState';
import type { WeatherConfig } from '@/types/config';
import type { WeatherViewProps } from './types';

/**
 * The full-screen Week view as a module view: every day with its icon,
 * description, details line and a range bar on the week's shared scale,
 * with a ring on today's bar at the current temperature.
 *
 * A box that is wider than tall stands the days up as columns with the
 * bars vertical; a taller box lays them down as bands. A wide box too short
 * for columns (under about ten lines) falls back to the Panorama day list,
 * which is the same bars without the description.
 */
type Mode = 'columns' | 'bands' | 'list';

/**
 * The shortest box that stands days up as columns: name, icon, description,
 * high, a bar, low and details need this much height to stay legible. The
 * fitted text size is a fixed share of the height, so the rule is in pixels
 * of the design canvas rather than in lines.
 */
const COLUMN_MIN_HEIGHT_PX = 300;

export default function WeatherWeekView({ config, hourly, forecast, units, timezone, scaledFontSize }: WeatherViewProps) {
  const t = useTranslate('modules');
  const tCore = useTranslate('core');
  const tWeather = useTranslate('weather');
  const locale = useFormattingLocale();
  const [outerRef, box] = useViewBox();
  const todayISO = localISODate(useTZClock(timezone, 60_000));

  // The scale comes from exactly the days drawn. `weekRange` clamps the count
  // to the full-screen module's 3..7, which this view does not: with one or
  // two days it would scale the bars to days that are not on the wall.
  const days = forecast.slice(0, Math.max(1, config.daysToShow || 5));
  const scale: WeekRange = useMemo(() => {
    const weekMin = days.length ? Math.min(...days.map((d) => d.low)) : 0;
    const weekMax = days.length ? Math.max(...days.map((d) => d.high)) : 1;
    const span = weekMax - weekMin || 1;
    return {
      days, weekMin, weekMax,
      pct: (temp: number) => Math.max(0, Math.min(100, ((temp - weekMin) / span) * 100)),
      nowTemp: hourly[0]?.temp,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `days` is a fresh slice each render; its contents are what matter
  }, [forecast, config.daysToShow, hourly[0]?.temp]);
  const mode: Mode = box.landscape
    ? (box.height >= COLUMN_MIN_HEIGHT_PX ? 'columns' : 'list')
    : 'bands';

  const { boxRef, contentRef, fontSize } = useFitFontSize(
    scaledFontSize,
    [mode, days.length, config.showHighLow !== false, config.showPrecipitation !== false, config.showHumidity, config.showWind, config.showTitle !== false, config.showRelativeDayLabels !== false, config.iconSet].join('|'),
  );

  const labels = { today: tCore('today'), tomorrowShort: t('weather.tomorrowShort') };
  const relative = config.showRelativeDayLabels !== false;
  const name = (d: ForecastDay) => dayLabel(d.date, todayISO, locale, labels, relative);
  const shortDate = (d: ForecastDay) => formatDateSync(new Date(d.date + 'T12:00:00'), dayMonthPattern(locale, 'short'), { locale });
  const props: DayProps = { config, units, scale, tWeather, name, shortDate };

  return (
    <div ref={outerRef} className="w-full h-full">
      <div ref={boxRef} className="w-full h-full overflow-hidden" style={{ fontSize: `${fontSize}px` }} data-weather-week-mode={mode}>
        {/* Title and days are measured together, as one fill-height stack
            whose rows refuse to shrink: a row that shrank instead of
            overflowing would hide the very overflow the fit loop looks for. */}
        <div ref={contentRef} className="h-full flex flex-col">
          {config.showTitle !== false && (
            <ViewTitle right={days.length > 0 ? `${Math.round(scale.weekMin)}° – ${Math.round(scale.weekMax)}°` : undefined}>
              {t('fullscreen-weather.sections.outlook', { days: days.length })}
            </ViewTitle>
          )}
          {days.length === 0 ? (
            <WeatherEmptyState message={t('weather.noForecastData')} />
          ) : (
            <div className={`flex-1 flex ${mode === 'columns' ? 'flex-row' : 'flex-col'}`}>
              {days.map((d, i) => mode === 'columns'
                ? <DayColumn key={d.date} {...props} day={d} today={i === 0} last={i === days.length - 1} />
                : mode === 'bands'
                  ? <DayBand key={d.date} {...props} day={d} today={i === 0} first={i === 0} />
                  : <DayRow key={d.date} {...props} day={d} today={i === 0} last={i === days.length - 1} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DayProps {
  config: WeatherConfig;
  units: 'metric' | 'imperial';
  scale: WeekRange;
  tWeather: (key: string) => string;
  name: (d: ForecastDay) => string;
  shortDate: (d: ForecastDay) => string;
}

/**
 * Rain chance, humidity and wind, each behind its toggle; hidden rain keeps
 * the line's height. The wind is its icon and a number in every layout, as
 * the full-screen Week draws it: a column has no room for a unit beside
 * seven of these, and a band that spelled it out read as a different figure
 * from the same module stood up. One line always: the fit loop measures a
 * line that runs past the end of the box, never one that wraps.
 */
function Details({ config, day, mode }: { config: WeatherConfig; day: ForecastDay; mode: 'columns' | 'bands' }) {
  const rain = Math.round(day.precipProbability ?? 0);
  const items: React.ReactNode[] = [];
  if (config.showPrecipitation !== false && rain >= RAIN_SHOWN_PCT) {
    items.push(<span key="rain" className="inline-flex items-center gap-[0.2em]" style={{ color: RAIN_COLOR }}><Droplet size="1em" strokeWidth={2} aria-hidden="true" />{rain}%</span>);
  }
  if (config.showHumidity && day.humidity != null) {
    items.push(<span key="hum" className="inline-flex items-center gap-[0.2em]"><Droplets size="1em" strokeWidth={2} aria-hidden="true" />{Math.round(day.humidity)}%</span>);
  }
  if (config.showWind && day.windSpeed != null) {
    items.push(<span key="wind" className="inline-flex items-center gap-[0.2em]"><Wind size="1em" strokeWidth={2} aria-hidden="true" />{Math.round(day.windSpeed)}</span>);
  }
  return (
    <div
      className={`flex gap-[0.5em] font-medium whitespace-nowrap ${mode === 'columns' ? 'justify-center' : ''}`}
      style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.secondary, minHeight: '1.3em' }}
    >
      {items}
    </div>
  );
}

function DayColumn({ config, units, scale, tWeather, name, day, today, last }: DayProps & { day: ForecastDay; today: boolean; last: boolean }) {
  const Icon = getWeatherIcon(day.icon, config.iconSet);
  const showHighLow = config.showHighLow !== false;
  return (
    // `min-w-fit`: a column is never narrower than its widest line (the
    // description capped below), so seven that do not fit run past the end
    // of the row, where the fit loop measures them and shrinks the type. A
    // column that shrank instead would clip its details line in the middle.
    <div data-weather-day={day.date} className="flex-1 min-w-fit flex flex-col items-center gap-[0.12em] px-[0.2em] [&>*]:shrink-0" style={{ borderRight: last ? 0 : '1px solid color-mix(in srgb, currentColor 10%, transparent)' }}>
      <span className={today ? 'font-semibold' : ''} style={{ fontSize: '0.8em', opacity: today ? 1 : TEXT_OPACITY.secondary }}>{name(day)}</span>
      <Icon size="1.9em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(day.icon, tWeather)} role="img" />
      {/* Two lines at a fixed height, so "Widespread Frost Then Sunny" wraps
          instead of ending in an ellipsis and every column's high sits on
          the same line. The 8em cap still bounds the column's min-width. */}
      <span className="line-clamp-2 text-center max-w-[8em] capitalize" style={{ fontSize: '0.68em', lineHeight: 1.15, height: '2.3em', opacity: TEXT_OPACITY.dim }}>{day.description}</span>
      {showHighLow && <span className="font-medium tabular-nums" style={{ fontSize: '0.95em' }}>{Math.round(day.high)}&deg;</span>}
      <RangeBar day={day} range={scale} today={today} units={units} vertical />
      {showHighLow && <span className="tabular-nums" style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.dim }}>{Math.round(day.low)}&deg;</span>}
      <Details config={config} day={day} mode="columns" />
    </div>
  );
}

function DayBand({ config, units, scale, tWeather, name, shortDate, day, today, first }: DayProps & { day: ForecastDay; today: boolean; first: boolean }) {
  const Icon = getWeatherIcon(day.icon, config.iconSet);
  const showHighLow = config.showHighLow !== false;
  return (
    <div
      data-weather-day={day.date}
      className="grow shrink-0 basis-auto grid items-center gap-[0.5em] py-[0.2em]"
      style={{
        // The description column takes what its text needs (capped in
        // Details and the span below) and the bar takes the rest; a band
        // that needs more than the box is wider than it, which the fit loop
        // measures, rather than a bar squeezed to nothing.
        gridTemplateColumns: '3.6em 2em auto 2em minmax(4.5em,1fr) 2.2em',
        borderTop: first ? 0 : '1px solid color-mix(in srgb, currentColor 10%, transparent)',
      }}
    >
      <div className={today ? 'font-semibold' : ''} style={{ fontSize: '0.85em', lineHeight: 1.15, opacity: today ? 1 : TEXT_OPACITY.secondary }}>
        {name(day)}
        <span className="block font-normal" style={{ fontSize: '0.78em', opacity: TEXT_OPACITY.dim }}>{shortDate(day)}</span>
      </div>
      <Icon size="1.8em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(day.icon, tWeather)} role="img" />
      <div className="flex flex-col">
        <span className="capitalize line-clamp-2 max-w-[11em]" style={{ fontSize: '0.78em', lineHeight: 1.1, opacity: TEXT_OPACITY.secondary }}>{day.description}</span>
        <Details config={config} day={day} mode="bands" />
      </div>
      <span className="text-right tabular-nums" style={{ fontSize: '0.9em', opacity: TEXT_OPACITY.dim, visibility: showHighLow ? 'visible' : 'hidden' }}>{Math.round(day.low)}&deg;</span>
      <RangeBar day={day} range={scale} today={today} units={units} />
      <span className="font-medium tabular-nums" style={{ fontSize: '0.95em', visibility: showHighLow ? 'visible' : 'hidden' }}>{Math.round(day.high)}&deg;</span>
    </div>
  );
}

function DayRow({ config, units, scale, tWeather, name, day, today, last }: DayProps & { day: ForecastDay; today: boolean; last: boolean }) {
  const Icon = getWeatherIcon(day.icon, config.iconSet);
  const showHighLow = config.showHighLow !== false;
  const rain = Math.round(day.precipProbability ?? 0);
  return (
    <div
      data-weather-day={day.date}
      className="grow shrink-0 basis-auto flex items-center gap-[0.55em]"
      style={{ minHeight: '1.9em', borderBottom: last ? 0 : '1px solid color-mix(in srgb, currentColor 10%, transparent)' }}
    >
      <span className={`shrink-0 truncate ${today ? 'font-semibold' : ''}`} style={{ width: '3.2em', fontSize: '0.9em', opacity: today ? 1 : TEXT_OPACITY.secondary }}>{name(day)}</span>
      <span className="shrink-0 grid place-items-center" style={{ width: '1.6em', fontSize: '1.1em' }}>
        <Icon size="1em" strokeWidth={1.5} aria-label={getLocalizedConditionLabel(day.icon, tWeather)} role="img" />
      </span>
      <span className="shrink-0 inline-flex items-center gap-[0.25em] font-medium" style={{ width: '2.8em', fontSize: '0.72em', color: RAIN_COLOR, visibility: config.showPrecipitation !== false && rain >= RAIN_SHOWN_PCT ? 'visible' : 'hidden' }}>
        <Droplet size="1em" strokeWidth={2} aria-hidden="true" />{rain}%
      </span>
      <span className="shrink-0 text-right tabular-nums" style={{ width: '2em', fontSize: '0.95em', opacity: TEXT_OPACITY.dim, visibility: showHighLow ? 'visible' : 'hidden' }}>{Math.round(day.low)}&deg;</span>
      <div className="flex-1 flex mx-[0.5em]"><RangeBar day={day} range={scale} today={today} units={units} /></div>
      <span className="shrink-0 text-right font-medium tabular-nums" style={{ width: '2.2em', fontSize: '0.95em', visibility: showHighLow ? 'visible' : 'hidden' }}>{Math.round(day.high)}&deg;</span>
    </div>
  );
}
