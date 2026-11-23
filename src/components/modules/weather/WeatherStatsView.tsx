'use client';

import { Droplets, Gauge, Sun, Sunrise, Sunset, Wind, type LucideIcon } from 'lucide-react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale, useTranslate } from '@/i18n';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import { formatTimeOfDay } from '@/lib/timezone';
import { dayLengthText, sunArcModel } from '@/lib/weather/sun-arc';
import { localizedCompassLabel, pressureForUnits, windUnitLabel } from '@/lib/weather/units';
import { PRESSURE_NOTE_KEY, pressureSeries, pressureTrend, uvLevel, windFootline } from '@/lib/weather/condition-sentences';
import { useSunTimes, useViewBox } from './chart-parts';
import { ModuleTitleRow } from '../shared/ModuleTitleRow';
import { WeatherEmptyState } from './WeatherEmptyState';
import type { WeatherViewProps } from './types';

/**
 * The Panorama stat rail as a module view: wind, humidity, UV, pressure,
 * sunrise and sunset. Each cell drops out when the provider has no figure.
 *
 * A squarish box gets a grid with a note under each number (dew point, the
 * UV advice, the pressure trend, the day's length); a wide shallow box gets
 * one row of numbers; a narrow column gets a list with the number on the
 * right. The cells are the same in every shape, only the arrangement moves.
 */
type Mode = 'grid' | 'row' | 'list';

interface Cell {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  note?: React.ReactNode;
  /** UV only: a 0-1 position on the meter under the number. */
  meter?: number;
}

export default function WeatherStatsView({ config, hourly, units, timezone, timeFormat, scaledFontSize, latitude, longitude }: WeatherViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const sun = useSunTimes(latitude, longitude, timezone);
  const [outerRef, box] = useViewBox();
  const now = hourly[0];

  const clock = { timezone, locale, timeFormat };
  const cells: Cell[] = [];
  if (now?.windSpeed != null) {
    // The gust or the direction under the number, as the Conditions wind card says it.
    const foot = windFootline(now, units);
    cells.push({
      key: 'wind', icon: Wind, label: t('fullscreen-weather.stats.wind'), value: String(Math.round(now.windSpeed)), unit: windUnitLabel(units),
      note: foot ? t(`fullscreen-weather.cards.${foot.key}`, { speed: foot.speed ?? '', unit: foot.unit, dir: foot.direction != null ? localizedCompassLabel(foot.direction, t) : '' }).trim() : undefined,
    });
  }
  if (now?.humidity != null) {
    cells.push({
      key: 'humidity', icon: Droplets, label: t('fullscreen-weather.stats.humidity'), value: String(Math.round(now.humidity)), unit: '%',
      note: now.dewPoint != null ? t('fullscreen-weather.cards.dewPoint', { temp: Math.round(now.dewPoint) }) : undefined,
    });
  }
  if (now?.uvIndex != null) {
    cells.push({
      key: 'uv', icon: Sun, label: t('fullscreen-weather.stats.uv'), value: String(now.uvIndex),
      note: t(`fullscreen-weather.uv.${uvLevel(now.uvIndex)}`), meter: Math.min(1, now.uvIndex / 11),
    });
  }
  if (now?.pressure != null) {
    const reading = pressureForUnits(now.pressure, units, locale);
    const hasTrend = pressureSeries(hourly).length > 1;
    cells.push({
      key: 'pressure', icon: Gauge, label: t('fullscreen-weather.stats.pressure'), value: reading.value, unit: reading.unit,
      note: hasTrend ? t(PRESSURE_NOTE_KEY[pressureTrend(hourly)]) : undefined,
    });
  }
  if (sun.sunrise) {
    // The same figure, written the same way, as the Sun and moon view's headline.
    const length = dayLengthText(sunArcModel(sun, 0).dayLength, locale);
    cells.push({ key: 'sunrise', icon: Sunrise, label: t('weather.sunrise'), value: formatTimeOfDay(sun.sunrise, clock), note: `${length} ${t('fullscreen-weather.cards.daylight')}` });
  }
  if (sun.sunset) {
    cells.push({ key: 'sunset', icon: Sunset, label: t('fullscreen-weather.stats.sunset'), value: formatTimeOfDay(sun.sunset, clock) });
  }

  const mode: Mode = box.width > box.height * 3 ? 'row' : box.width < scaledFontSize * 16 ? 'list' : 'grid';
  const columns = cells.length >= 5 ? 3 : cells.length >= 3 ? 2 : 1;

  // A row is a strip: start from its height (a 180 px band gets 40 px
  // figures, not the 18 px the box's short edge would give) and let the fit
  // loop bring the six cells back inside the width.
  const desired = mode === 'row' ? Math.max(scaledFontSize, box.height / 4.5) : scaledFontSize;
  const { boxRef, contentRef, fontSize } = useFitFontSize(
    desired,
    [mode, cells.map((c) => c.key).join(','), config.showTitle !== false].join('|'),
  );

  return (
    <div ref={outerRef} className="w-full h-full">
      <div ref={boxRef} className="w-full h-full overflow-hidden" style={{ fontSize: `${fontSize}px` }} data-weather-stats-mode={mode}>
        {/* Title and cells measured together (see WeatherWeekView). The cells
            sit in a block with auto margins rather than a centred container:
            auto margins never go negative, so a block taller than its box
            overflows past the bottom edge, where the fit loop measures it,
            instead of splitting the overflow across both. */}
        <div ref={contentRef} className="h-full flex flex-col">
          {config.showTitle !== false && mode !== 'row' && <ModuleTitleRow title={t('weather.rightNow')} />}
          {cells.length === 0 ? (
            <WeatherEmptyState />
          ) : (
            <div
              className={mode === 'grid' ? 'my-auto grid gap-x-[1em] gap-y-[0.5em]' : mode === 'row' ? 'my-auto flex items-center justify-between gap-[0.6em]' : 'my-auto flex flex-col'}
              style={mode === 'grid' ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
            >
              {cells.map((c, i) => <StatCell key={c.key} cell={c} mode={mode} first={i === 0} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCell({ cell, mode, first }: { cell: Cell; mode: Mode; first: boolean }) {
  const Icon = cell.icon;
  const label = (
    <span className="inline-flex items-center gap-[0.4em] whitespace-nowrap" style={{ fontSize: mode === 'list' ? '0.85em' : '0.7em', opacity: TEXT_OPACITY.secondary }}>
      <Icon size="1.1em" strokeWidth={1.6} aria-hidden="true" />{cell.label}
    </span>
  );
  const value = (
    <span className="tabular-nums whitespace-nowrap leading-none" style={{ fontSize: mode === 'list' ? '1.1em' : '1.7em', fontWeight: mode === 'list' ? 500 : 300 }}>
      {cell.value}{cell.unit && <span style={{ fontSize: '0.5em', opacity: TEXT_OPACITY.secondary, marginLeft: '0.25em', fontWeight: 400 }}>{cell.unit}</span>}
    </span>
  );
  if (mode === 'list') {
    return (
      <div data-testid={`weather-stat-${cell.key}`} className="flex items-center justify-between gap-[1em] py-[0.35em]" style={{ borderTop: first ? 0 : '1px solid color-mix(in srgb, currentColor 10%, transparent)' }}>
        {label}{value}
      </div>
    );
  }
  return (
    // A row cell never shrinks below its figure: six that do not fit run past
    // the strip's end, where the fit loop measures them, instead of the times
    // sliding under each other.
    <div data-testid={`weather-stat-${cell.key}`} className={`flex flex-col gap-[0.1em] ${mode === 'row' ? 'items-center text-center flex-1 min-w-fit' : 'min-w-0'}`}>
      {label}
      {value}
      {mode === 'grid' && cell.note && (
        <span className="line-clamp-2" style={{ fontSize: '0.7em', opacity: TEXT_OPACITY.dim }}>{cell.note}</span>
      )}
      {mode === 'grid' && cell.meter != null && (
        <div className="relative rounded-full mt-[0.35em]" style={{ height: '0.3em', maxWidth: '8em', background: 'linear-gradient(90deg,#22c55e,#eab308,#f97316,#dc2626,#7c3aed)' }} aria-hidden="true">
          <span className="absolute rounded-full" style={{ top: '50%', left: `${cell.meter * 100}%`, width: '0.7em', height: '0.7em', transform: 'translate(-50%,-50%)', background: 'rgba(0,0,0,.55)', border: '2px solid currentColor' }} />
        </div>
      )}
    </div>
  );
}
