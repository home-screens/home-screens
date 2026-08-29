'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import { MapPin, Droplet, Wind } from 'lucide-react';
import type { ForecastDay } from '@/lib/weather';
import { windUnitLabel } from '@/lib/weather/units';
import type { WeatherViewProps, WeekRange } from './weather-view-utils';
import { FIT_MEASURE_ATTR } from './useFitScale';
import {
  alertTone, cachedFormat, weekRange,
  CARD_PAD_X_U, CARD_PAD_Y_U, DAILY_RAIN_SHOWN_PCT, MIN_BAR_PCT,
} from './weather-view-utils';
import { tempColor } from './temp-ramp';

/** Section label: small, tracked-out, muted. Shared by every card. */
export function Label({ children, s }: { children: React.ReactNode; s: number }) {
  return (
    <div style={{
      fontSize: s * 1.15, fontWeight: 600, letterSpacing: '.13em',
      textTransform: 'uppercase', color: 'var(--fsw-text-3)',
    }}>{children}</div>
  );
}

/**
 * `u` (structure), not `s` (type): a card's padding and radius should follow
 * density, not how large the household set the text.
 *
 * Every card is a box the fit loop measures on its own (`FIT_MEASURE_ATTR`):
 * a card sits in a column or a grid cell of fixed width, and content that
 * outgrows it lands on the neighbouring card without moving the stack's
 * overflow at all.
 */
export function Card({ children, u, style, testId }: {
  children: React.ReactNode; u: number; style?: React.CSSProperties; testId?: string;
}) {
  return (
    <div data-testid={testId} {...{ [FIT_MEASURE_ATTR]: '' }} style={{
      background: 'var(--fsw-surface)',
      border: '1px solid var(--fsw-border)',
      borderRadius: u * 2.1,
      boxShadow: 'var(--fsw-card-shadow)',
      padding: `${u * CARD_PAD_Y_U}px ${u * CARD_PAD_X_U}px`,
      ...style,
    }}>{children}</div>
  );
}

export function TopBar({ p }: { p: WeatherViewProps }) {
  const { s, u } = p.scale;
  const showTime = p.config.showTime !== false;
  const time = showTime
    ? cachedFormat(p.locale, {
        hour: 'numeric', minute: '2-digit',
        hour12: p.timeFormat !== '24h',
        timeZone: p.timezone,
      }).format(p.now)
    : null;

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: u * 2, flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: u, fontSize: s * 2.6, fontWeight: 600, letterSpacing: '-.01em', minWidth: 0 }}>
        <MapPin style={{ width: s * 2.3, height: s * 2.3, color: 'var(--fsw-text-3)', flex: 'none' }} strokeWidth={1.6} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.locationLabel}</span>
      </div>
      {time && (
        <div data-testid="fsw-clock" style={{
          flex: 'none', fontSize: s * 2.6, fontWeight: 600,
          letterSpacing: '-.01em', color: 'var(--fsw-text-2)',
        }}>{time}</div>
      )}
    </div>
  );
}

/**
 * Compact current-conditions header: icon, temperature, description, feels
 * like, and today's high/low. The Almanac's header, shared by every view
 * whose body is a chart rather than the hero itself (Almanac, Week, Hourly).
 *
 * Landscape trades hero size for body height: the canvas is 1080 tall rather
 * than 1920, and the body is what has to fit into what is left.
 */
export function MiniHero({ p }: { p: WeatherViewProps }) {
  const { s, u } = p.scale;
  const landscape = p.scale.orientation === 'landscape';
  const now = p.hourly[0];
  const today = p.forecast[0];
  const Icon = getWeatherIcon(now?.icon ?? 'thermometer', 'outline');
  const tempSize = landscape ? s * 8 : s * 10;
  const iconSize = landscape ? s * 6 : s * 7.5;
  return (
    <div data-testid="fsw-mini-hero" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: u * 2.5 }}>
      <Icon style={{ width: iconSize, height: iconSize, color: p.accent }} strokeWidth={1} />
      <div style={{ fontSize: tempSize, fontWeight: 200, letterSpacing: '-.05em', lineHeight: .9 }}>
        {now ? Math.round(now.temp) : '--'}
        <span style={{ fontSize: '.38em', verticalAlign: 'baseline', position: 'relative', top: '-1.02em', marginLeft: '-.04em', opacity: .38 }}>°</span>
      </div>
      <div>
        <div style={{ fontSize: s * 2.5, fontWeight: 500, letterSpacing: '-.01em' }}>{now?.description ?? ''}</div>
        {now?.feelsLike != null && (
          <div style={{ fontSize: s * 1.8, color: 'var(--fsw-text-2)', marginTop: u * .5 }}>
            {p.t('fullscreen-weather.feelsLike', { temp: Math.round(now.feelsLike) })}
          </div>
        )}
      </div>
      {today && (
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: s * 1.85, fontWeight: 600 }}>{`H ${Math.round(today.high)}°  L ${Math.round(today.low)}°`}</div>
        </div>
      )}
    </div>
  );
}

export function AlertBand({ p }: { p: WeatherViewProps }) {
  const { s, u } = p.scale;
  const alert = p.alerts[0];
  if (p.config.showAlerts === false || !alert) return null;
  const { fg, isSevere } = alertTone(alert.severity);

  return (
    <div
      data-testid="fsw-alert"
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: u * 1.7,
        padding: `${u * 1.7}px ${u * 2.3}px`, borderRadius: u * 1.9,
        color: fg, border: `1px solid ${fg}55`, background: `${fg}14`,
      }}
    >
      <div style={{ flex: 'none', fontSize: s * 3, lineHeight: 1 }} aria-hidden>⚠</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: s * 2, fontWeight: 600, letterSpacing: '-.01em' }}>{alert.title}</div>
        {alert.description && (
          <div style={{
            fontSize: s * 1.5, opacity: .85, marginTop: u * .3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{alert.description}</div>
        )}
      </div>
      <div style={{
        marginLeft: 'auto', flex: 'none', fontSize: s * 1.1, fontWeight: 700,
        letterSpacing: '.12em', textTransform: 'uppercase',
        padding: `${u * .55}px ${u * 1.15}px`, borderRadius: 999, border: '1px solid currentColor',
      }}>{isSevere ? p.t('fullscreen-weather.alerts.severe') : p.t('fullscreen-weather.alerts.advisory')}</div>
    </div>
  );
}

/**
 * Section header shared by the hourly charts: "Next N hours" on the left, the
 * chance-of-rain legend on the right.
 */
export function PrecipLegendHeader({ p, hours, style }: { p: WeatherViewProps; hours: number; style?: React.CSSProperties }) {
  const { s, u } = p.scale;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...style }}>
      <Label s={s}>{p.t('fullscreen-weather.sections.nextHours', { hours })}</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: u * .6, fontSize: s * 1.15, fontWeight: 600, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--fsw-text-3)' }}>
        <span style={{ width: s, height: s, borderRadius: 3, background: '#38bdf8', display: 'inline-block' }} />
        {p.t('fullscreen-weather.sections.chanceOfPrecip')}
      </div>
    </div>
  );
}

/** The ring marking the current temperature inside today's range. */
export function NowRing({ p, size, style }: { p: WeatherViewProps; size: number; style: React.CSSProperties }) {
  const { u } = p.scale;
  return (
    <div data-testid="fsw-now-ring" style={{
      position: 'absolute', width: size, height: size, borderRadius: '50%',
      background: 'var(--fsw-surface)', border: `${Math.max(2, u * .28)}px solid var(--fsw-text)`,
      ...style,
    }} />
  );
}

/**
 * A day's low..high on the week's shared scale, drawn left to right, with the
 * "now" ring when this is today. Shared by Panorama's 7-day strip and the
 * Week view's portrait bands.
 *
 * `height` and `ring` are the caller's, and should floor on `s`: the fit loop
 * shrinks `u` fastest, and a bar sized off `u` alone becomes a hairline
 * beside large numbers.
 */
export function RangeBar({ p, day, range, today, height, ring, style }: {
  p: WeatherViewProps; day: ForecastDay; range: WeekRange; today: boolean; height: number; ring: number; style?: React.CSSProperties;
}) {
  const left = range.pct(day.low);
  const right = range.pct(day.high);
  return (
    <div style={{ flex: 1, height, borderRadius: 999, position: 'relative', background: 'var(--fsw-surface-alt)', ...style }}>
      <div style={{
        position: 'absolute', top: 0, bottom: 0, borderRadius: 999,
        left: `${left}%`, width: `${Math.max(MIN_BAR_PCT, right - left)}%`,
        background: `linear-gradient(90deg, ${tempColor(day.low, p.units)}, ${tempColor(day.high, p.units)})`,
      }} />
      {today && range.nowTemp != null && (
        <NowRing p={p} size={ring} style={{ top: '50%', left: `${range.pct(range.nowTemp)}%`, transform: 'translate(-50%,-50%)' }} />
      )}
    </div>
  );
}

/** The 7-day list: each day's low..high drawn against the whole week's range. */
export function DayRangeBars({ p }: { p: WeatherViewProps }) {
  const { s, u } = p.scale;
  const range = weekRange(p);
  const { days, weekMin, weekMax } = range;
  if (days.length === 0) return null;

  // Icon (3.4s) plus breathing room is the smallest a row can be and stay legible.
  const rowMin = s * 4.4;
  const listMin = rowMin * days.length;

  return (
    <Card u={u} testId="fsw-days" style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      // header + rows + the card's own vertical padding
      minHeight: listMin + u * 6.1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label s={s}>{p.t('fullscreen-weather.sections.outlook', { days: days.length })}</Label>
        <Label s={s}>{`${Math.round(weekMin)}° – ${Math.round(weekMax)}°`}</Label>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: u * .4, minHeight: listMin }}>
        {days.map((d, i) => {
          const Icon = getWeatherIcon(d.icon, 'outline');
          return (
            <div key={d.date} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: u * 1.5, minHeight: rowMin,
              borderBottom: i === days.length - 1 ? 0 : '1px solid var(--fsw-border-sub)',
            }}>
              <div style={{
                width: s * 11, flex: 'none', fontSize: s * 2, letterSpacing: '-.01em',
                fontWeight: i === 0 ? 700 : 500,
                color: i === 0 ? 'var(--fsw-text)' : 'var(--fsw-text-2)',
              }}>{dayName(d.date, i, p)}</div>
              <div style={{ width: s * 4.6, flex: 'none', display: 'grid', placeItems: 'center', color: i === 0 ? p.accent : 'var(--fsw-text-2)' }}>
                <Icon style={{ width: s * 3.4, height: s * 3.4 }} strokeWidth={1.6} />
              </div>
              <div style={{
                width: s * 7, flex: 'none', display: 'flex', alignItems: 'center', gap: s * .45,
                fontSize: s * 1.5, fontWeight: 600, color: '#38bdf8',
                visibility: (d.precipProbability ?? 0) >= DAILY_RAIN_SHOWN_PCT ? 'visible' : 'hidden',
              }}>
                <Droplet style={{ width: s * 1.5, height: s * 1.5 }} strokeWidth={2} />
                {Math.round(d.precipProbability ?? 0)}%
              </div>
              <div style={{ width: s * 5.4, flex: 'none', textAlign: 'right', fontSize: s * 2.2, color: 'var(--fsw-text-3)' }}>{Math.round(d.low)}°</div>
              <RangeBar
                p={p} day={d} range={range} today={i === 0}
                height={Math.max(u * .85, s * .4)} ring={Math.max(u * 1.25, s * .7)}
                style={{ margin: `0 ${u * 1.5}px` }}
              />
              <div style={{ width: s * 6, flex: 'none', textAlign: 'right', fontSize: s * 2.2, fontWeight: 600 }}>{Math.round(d.high)}°</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * A forecast day's `date` is a calendar date with no zone. Parsing it as
 * browser-local and formatting it in the display zone shifted every label a
 * day forward whenever the Pi's OS zone sat 12 hours or more from the
 * display's (a Pi left on UTC driving an Auckland display). Read it as UTC
 * and format it as UTC, and the calendar date comes back unchanged.
 */
function calendarDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

/** "Today" for the first row, else the short weekday name. */
export function dayName(dateStr: string, index: number, p: WeatherViewProps): string {
  if (index === 0) return p.t('fullscreen-weather.today');
  const d = calendarDate(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return cachedFormat(p.locale, { weekday: 'short', timeZone: 'UTC' }).format(d);
}

/** "Aug 24" — the date under a day name, in the household's locale. */
export function shortDate(dateStr: string, p: WeatherViewProps): string {
  const d = calendarDate(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return cachedFormat(p.locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
}

/**
 * The details a forecast day carries beside its description: chance of rain
 * (hidden below `DAILY_RAIN_SHOWN_PCT`, so a dry week is not a column of "0%"), and wind when the
 * provider gives a daily figure. Icons rather than words, so nothing here
 * needs translating and the line stays one line in every locale.
 */
export function DayDetails({ p, day, size = 1.5, align = 'left' }: {
  p: WeatherViewProps; day: ForecastDay; size?: number; align?: 'left' | 'center';
}) {
  const { s, u } = p.scale;
  const rain = Math.round(day.precipProbability ?? 0);
  const windUnit = windUnitLabel(p.units);
  const items: React.ReactNode[] = [];
  if (rain >= DAILY_RAIN_SHOWN_PCT) {
    items.push(
      <span key="rain" style={{ display: 'inline-flex', alignItems: 'center', gap: s * .4, color: '#38bdf8', whiteSpace: 'nowrap' }}>
        <Droplet style={{ width: s * size, height: s * size }} strokeWidth={2} />{rain}%
      </span>,
    );
  }
  if (day.windSpeed != null) {
    items.push(
      <span key="wind" style={{ display: 'inline-flex', alignItems: 'center', gap: s * .4, whiteSpace: 'nowrap' }}>
        <Wind style={{ width: s * size, height: s * size }} strokeWidth={2} />{Math.round(day.windSpeed)} {windUnit}
      </span>,
    );
  }
  return (
    <div style={{
      display: 'flex', gap: u * 1.6, justifyContent: align === 'center' ? 'center' : 'flex-start',
      fontSize: s * size, color: 'var(--fsw-text-3)', fontWeight: 500,
      // Keep the line's height even when a day has nothing to say, so rows
      // and columns stay the same size across the week.
      minHeight: s * size * 1.3,
    }}>{items}</div>
  );
}

