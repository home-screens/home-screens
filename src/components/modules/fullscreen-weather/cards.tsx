'use client';

import SunCalc from 'suncalc';
import {
  Wind, Sunset, Sunrise, Moon, Sun, Thermometer, Droplets, CloudRain, Eye, Gauge as GaugeIcon, CloudDrizzle, Leaf,
  Clock, CalendarDays,
} from 'lucide-react';
import { getWeatherIcon } from '@/lib/weather-icons';
import { moonTimesForDay } from '@/lib/moon-times';
import { moonPhaseKey } from '@/lib/weather/moon-phase-name';
import { pressureForUnits, windUnitLabel } from '@/lib/weather/units';
import {
  compassLabel, feelsLikeSentence, humiditySentence, visibilitySentence, formatPrecipAmount, precipitationReading,
  airQualityLevel, airQualityPosition, uvLevel, uvRestOfDay, pressureTrend, pressurePosition, type Sentence as SentenceKey,
} from '@/lib/weather/condition-sentences';
import type { FullscreenWeatherCard } from '@/types/config';
import { resolveWeatherCards } from '@/lib/fullscreen-weather-cards';
import { floorEase, type WeatherViewProps } from './weather-view-utils';
import { hoursWithin, nowcastVerdict, tzHour, weekRange, cachedFormat, HOURLY_RAIN_SHOWN_PCT, DAILY_RAIN_SHOWN_PCT } from './weather-view-utils';
import { RangeBar, dayName, weekdayShort } from './weather-parts';
import {
  Card, CardLabel, BigValue, Unit, Sentence, Compass, SunArc, Gauge, ScaleBar,
  UV_GRADIENT, AQ_GRADIENT, clockTime,
} from './parts';
import { MoonImage } from './moon';
import MapCard from './MapCard';

/**
 * The cards of the phone weather page. Each one decides for itself whether
 * its source sent what it needs (`available`), so a provider without UV or
 * visibility simply has fewer cards and the grid closes up. Both views
 * draw from this one list.
 */
export type CardKey = FullscreenWeatherCard;

/** What deciding a card's availability reads: the data and toggles, never the scale. */
export type CardInputs = Pick<
  WeatherViewProps,
  'config' | 'hourly' | 'forecast' | 'minutely' | 'units' | 'sun' | 't' | 'latitude' | 'longitude' | 'airQuality'
>;

/** Shape and size hints a card lays itself out from. */
export interface CardCtx {
  /** The landscape (tablet) arrangement, where cards are shorter and wider. */
  land: boolean;
  /**
   * The card's cell in px when the view knows it (the Conditions grid), so
   * the compass, gauge and moon can size themselves to the card rather than
   * to the type. Left out, they fall back to a size in type units.
   */
  width?: number;
  height?: number;
}

/**
 * The compass, the gauge and the moon: half the card's width, or .62 of its
 * height when that is less, which leaves the label above and the line below
 * their room. `fallback` is the type-based size for a card of unknown shape.
 */
/**
 * How big a compass, gauge or moon may draw in a card of a known size: half
 * the width, and no taller than what is left of the height once the card's
 * padding, its label and the line under the instrument have had theirs
 * (about 12.5 type units together, from `Card`, `CardLabel` and `Sentence`).
 */
function instrumentSize(ctx: CardCtx, s: number, fallback: number, reserve = 0): number {
  if (ctx.width == null || ctx.height == null) return fallback;
  return Math.max(s * 5, Math.min(ctx.width * .5, ctx.height - s * (12.5 + reserve)));
}

/**
 * A cell too short to seat an instrument: the Forecast tablet grid's middle
 * row, where a compass or a sun arc would come out the size of a coin and
 * the sentence under it would run off the card. A card in a short cell draws
 * its reading as a number and a line instead, the way the phone's short
 * cards do. Fewer than eight type units left after the label and the line
 * is the threshold.
 */
export function isShortCell(ctx: CardCtx, s: number): boolean {
  return ctx.height != null && ctx.height - s * 12.5 < s * 8;
}

/** The sun arc at its full height, in type units: the phone's, a little taller on the tablet. */
const SUN_ARC_S = { portrait: 6.6, land: 8 };
/** An arc squeezed below this is a line with a dot on it: the card reads as a number and a line instead. */
const SUN_ARC_MIN_S = 3.5;

/**
 * How tall the sun card's arc may draw in its cell, or null when the cell
 * is too short for one. The sun card is the one card that puts its big
 * reading (the lead time, at the BigValue size plus its margin) above its
 * instrument, which the shared short-cell rule does not count, so a cell a
 * little over the shared floor seated the arc at full height and drew it
 * through the time and the line under it. The arc gives up height first
 * and the card falls back to its short form only below the arc's floor.
 */
export function sunArcHeight(ctx: CardCtx, s: number, u: number): number | null {
  const full = s * (ctx.land ? SUN_ARC_S.land : SUN_ARC_S.portrait);
  if (ctx.height == null) return full;
  const timeLine = s * (ctx.land ? 5.2 : 6) + u;
  const room = ctx.height - s * 12.5 - timeLine;
  if (room < s * SUN_ARC_MIN_S) return null;
  return Math.min(full, room);
}

/**
 * A landscape cell with more height than the tablet's low, wide air quality
 * banner uses (about 22 type units), where the banner's bar-at-the-foot
 * layout would leave a void between the sentence and the bar.
 */
function hasSlack(ctx: CardCtx, s: number): boolean {
  return ctx.height != null && ctx.height > s * 22;
}

const t = (p: WeatherViewProps, key: string, vars?: Record<string, string | number>) => p.t(`fullscreen-weather.cards.${key}`, vars);
const sentence = (p: WeatherViewProps, s: SentenceKey) => t(p, s.key, s.vars);

const hasCoords = (p: CardInputs) => p.latitude != null && p.longitude != null;
/** A real instant, or null for the Invalid Date SunCalc returns when an event does not happen. */
const validDate = (d: Date | null | undefined): Date | null => (d && !Number.isNaN(d.getTime()) ? d : null);

/** Whether a card has the data it draws. Being on the list is the other half, which `availableCards` reads. */
export function cardHasData(p: CardInputs, key: CardKey): boolean {
  const now = p.hourly[0];
  switch (key) {
    case 'wind': return now?.windSpeed != null;
    case 'sun': return p.sun.sunrise != null && p.sun.sunset != null;
    case 'moon': return hasCoords(p);
    case 'uv': return now?.uvIndex != null;
    case 'feelsLike': return now?.feelsLike != null;
    case 'humidity': return now?.humidity != null;
    case 'precipitation': return precipitationReading(p.forecast, p.units) != null;
    case 'visibility': return now?.visibility != null;
    case 'pressure': return now?.pressure != null;
    case 'nowcast': return nowcastVerdict(p.minutely, p.units, p.t) != null;
    case 'airQuality': return p.airQuality != null;
  }
}

/** The cards that are on, in the module's order, filtered to what this wall can fill. */
export function availableCards(p: CardInputs): CardKey[] {
  return resolveWeatherCards(p.config).filter((k) => cardHasData(p, k));
}

export function Instrument({ p, card, ctx, style }: { p: WeatherViewProps; card: CardKey; ctx: CardCtx; style?: React.CSSProperties }) {
  switch (card) {
    case 'wind': return <WindCard p={p} ctx={ctx} style={style} />;
    case 'sun': return <SunCard p={p} ctx={ctx} style={style} />;
    case 'moon': return <MoonCard p={p} ctx={ctx} style={style} />;
    case 'uv': return <UVCard p={p} ctx={ctx} style={style} />;
    case 'feelsLike': return <FeelsLikeCard p={p} ctx={ctx} style={style} />;
    case 'humidity': return <HumidityCard p={p} ctx={ctx} style={style} />;
    case 'precipitation': return <PrecipitationCard p={p} ctx={ctx} style={style} />;
    case 'visibility': return <VisibilityCard p={p} ctx={ctx} style={style} />;
    case 'pressure': return <PressureCard p={p} ctx={ctx} style={style} />;
    case 'nowcast': return <NowcastCard p={p} ctx={ctx} style={style} />;
    case 'airQuality': return <AirQualityCard p={p} ctx={ctx} style={style} />;
  }
}

interface CardProps { p: WeatherViewProps; ctx: CardCtx; style?: React.CSSProperties }

// ── Hero ───────────────────────────────────────────────────────────────────

/**
 * The portrait hero's share of the canvas. The phone's first card starts 46%
 * of the way down; a wall shows the map and two more cards on the same
 * screen, so it keeps about a quarter.
 */
const HERO_MIN_SHARE = 0.27;
/**
 * Padding above the hero's text, as a share of the canvas: centring alone
 * leaves equal sky above and below, and the text wants to sit a little low
 * so the band above the city stays clear for the moon.
 */
const HERO_SKY_LEAD_SHARE = 0.033;

/** The place, the temperature, the condition and today's range, centred, over the sky. */
export function Hero({ p, compact, land }: { p: WeatherViewProps; compact?: boolean; land?: boolean }) {
  const { s, u } = p.scale;
  const now = p.hourly[0];
  const today = p.forecast[0];
  const showTime = p.config.showTime !== false;
  const time = showTime
    ? cachedFormat(p.locale, { hour: 'numeric', minute: '2-digit', hour12: p.timeFormat !== '24h', timeZone: p.timezone }).format(p.now)
    : null;
  const temp = now ? Math.round(now.temp) : '--';
  // The portrait hero is the page's sky. On the phone the temperature sits
  // a quarter of the way down and the first card nearly halfway; a wall that
  // cannot scroll keeps a share of that, so the hero claims a quarter of
  // the canvas and seats its text a little below the middle, leaving the
  // band above the city to the moon and the clouds. The share is of the
  // canvas, not of `u`, so the fit loop shrinks the type before the sky.
  const tall = !compact && !land;
  // The clock sits in the top right corner. While the place name has room
  // beside it the name keeps that much clear on both sides; at a type size
  // where the clock alone would take half the width (4x-large on a portrait
  // wall), the name starts under the clock instead of being cut to a stub.
  const clockBeside = !time || s * 28 < p.scale.width * .55;
  const clockClear = time ? (clockBeside ? s * 13 : s * 2) : s * 2;
  const underClock = time && !clockBeside ? s * 3.6 : 0;
  // The sky's share is a fixed slice of the canvas the fit loop cannot shrink,
  // so when the loop is near its floor (huge type, a seven-day list, an alert
  // band) the share eases down: full above .6, half of itself at the floor.
  const share = HERO_MIN_SHARE * floorEase(p.scale.fit);
  const skyShare = tall ? {
    minHeight: p.scale.height * share,
    display: 'flex' as const, flexDirection: 'column' as const, justifyContent: 'center' as const,
    paddingTop: p.scale.height * HERO_SKY_LEAD_SHARE + underClock,
  } : { paddingTop: (land ? u * .5 : 0) + underClock };
  return (
    <div data-testid="fsw-hero" style={{ position: 'relative', textAlign: 'center', flex: 'none', textShadow: 'var(--fsw-text-shadow)', ...skyShare }}>
      {time && (
        <div data-testid="fsw-clock" style={{ position: 'absolute', right: 0, top: 0, fontSize: s * 2.8, fontWeight: 500, opacity: .6 }}>{time}</div>
      )}
      <div style={{ fontSize: land ? s * 4.3 : compact ? s * 5.2 : s * 6.4, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-.01em', padding: `0 ${clockClear}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.locationLabel}
      </div>
      {compact ? (
        <div style={{ fontSize: s * 3.5, fontWeight: 400, opacity: .85, marginTop: u * .4 }}>
          {temp}°<i style={{ fontStyle: 'normal', opacity: .4, margin: `0 ${s * 1.1}px` }}>|</i>{now?.description ?? ''}
        </div>
      ) : (
        <>
          <div data-testid="fsw-hero-temp" style={{ fontSize: land ? s * 12.6 : s * 20, fontWeight: 200, lineHeight: .95, letterSpacing: '-.04em', margin: land ? 0 : `${u * .4}px 0 ${u * .2}px` }}>
            {temp}<span style={{ fontSize: '.42em', verticalAlign: 'top', fontWeight: 300, marginTop: '.24em', display: 'inline-block', marginLeft: '-.1em', lineHeight: 1 }}>°</span>
          </div>
          <div style={{ fontSize: land ? s * 3 : s * 4.2, fontWeight: 500, lineHeight: 1.2 }}>{now?.description ?? ''}</div>
          {today && (
            <div style={{ fontSize: land ? s * 2.8 : s * 3.7, fontWeight: 500, marginTop: land ? 0 : u * .4, letterSpacing: '.01em' }}>
              {`H:${Math.round(today.high)}°`}<span style={{ margin: `0 ${s}px` }} />{`L:${Math.round(today.low)}°`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Hourly strip and day list ──────────────────────────────────────────────

export function HourlyCard({ p, count, style }: { p: WeatherViewProps; count: number; style?: React.CSSProperties }) {
  const { s, u } = p.scale;
  const hrs = hoursWithin(p.hourly, 36).slice(0, count);
  const fmt = cachedFormat(p.locale, { hour: 'numeric', hour12: p.timeFormat !== '24h', timeZone: p.timezone });
  return (
    <Card u={u} testId="fsw-hours" style={{ flex: 'none', ...style }}>
      <CardLabel icon={Clock} s={s}>{t(p, 'hourly')}</CardLabel>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${hrs.length}, 1fr)`, alignContent: 'center', marginTop: u * 1.6 }}>
        {hrs.map((h, i) => {
          const Icon = getWeatherIcon(h.icon, 'color');
          const pop = h.precipProbability ?? 0;
          return (
            <div key={h.time} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: u * .5, lineHeight: 1.1, minWidth: 0 }}>
              <div style={{ fontSize: s * 2.8, fontWeight: i === 0 ? 700 : 500, whiteSpace: 'nowrap' }}>{i === 0 ? t(p, 'now') : fmt.format(new Date(h.time)).replace(' ', '')}</div>
              <div style={{ height: s * 5.4, display: 'flex', alignItems: 'center' }}><Icon size={s * 5.2} /></div>
              <div style={{ fontSize: s * 2, color: '#7dd3fc', fontWeight: 600, height: s * 2, lineHeight: `${s * 2}px`, marginTop: -u * .5 }}>{pop >= HOURLY_RAIN_SHOWN_PCT ? `${Math.round(pop)}%` : ''}</div>
              <div style={{ fontSize: s * 3.5, fontWeight: 500 }}>{Math.round(h.temp)}°</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Row height in type units: the phone's row is about 7.5% of its screen, trimmed a little for a wall that also shows a map. */
const DAY_ROW_MIN_S = 6.6;

export function DaysCard({ p, land, style }: { p: WeatherViewProps; land?: boolean; style?: React.CSSProperties }) {
  const { s, u } = p.scale;
  const k = land ? .8 : 1;
  const rowMin = s * DAY_ROW_MIN_S * k;
  // Every day the editor asks for is drawn: the count is a setting, not a
  // hint. Each row keeps its floor, so when the days do not fit the fit
  // loop shrinks the type rather than the list dropping a day.
  const range = weekRange(p);
  const { days } = range;
  const header = u * (2.4 + 2.6 + .9) + s * 2.4;
  return (
    <Card u={u} testId="fsw-days" style={{ minHeight: rowMin * days.length + header, ...style }}>
      <CardLabel icon={CalendarDays} s={s}>{t(p, 'days', { days: days.length })}</CardLabel>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: u * .9 }}>
        {days.map((d, i) => {
          const Icon = getWeatherIcon(d.icon, 'color');
          const pop = d.precipProbability ?? 0;
          return (
            <div key={d.date} data-testid="fsw-day" style={{
              flex: 1, minHeight: rowMin, display: 'grid', alignItems: 'center', gap: u * (land ? 1.5 : 2),
              gridTemplateColumns: `${s * 13.5 * k}px ${s * 10 * k}px ${s * 8 * k}px 1fr ${s * 8 * k}px`,
              borderTop: i === 0 ? 0 : '1px solid var(--fsw-border-sub)',
            }}>
              <div style={{ fontSize: s * 3.3 * k, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dayName(d.date, p)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                <Icon size={s * 4.4 * k} />
                {pop >= DAILY_RAIN_SHOWN_PCT && <span style={{ fontSize: s * 1.8 * k, color: '#7dd3fc', fontWeight: 600, marginTop: 1 }}>{Math.round(pop)}%</span>}
              </div>
              <div style={{ fontSize: s * 3.3 * k, fontWeight: 500, opacity: .45, textAlign: 'right' }}>{Math.round(d.low)}°</div>
              <RangeBar p={p} day={d} range={range} today={i === 0} height={Math.max(u * 1.1 * k, s * .5)} ring={Math.max(u * 1.3 * k, s * .7)} />
              <div style={{ fontSize: s * 3.3 * k, fontWeight: 500, textAlign: 'right' }}>{Math.round(d.high)}°</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export { MapCard };

// ── Instruments ────────────────────────────────────────────────────────────

function WindCard({ p, ctx, style }: CardProps) {
  const { s, u } = p.scale;
  const now = p.hourly[0]!;
  const unit = windUnitLabel(p.units);
  const dir = now.windDirection != null ? compassLabel(now.windDirection) : null;
  const foot = now.windGust != null
    ? t(p, 'gusts', { speed: Math.round(now.windGust), unit, dir: dir ?? '' }).trim()
    : dir ? t(p, 'windFrom', { dir }) : null;
  return (
    <Card u={u} testId="fsw-card-wind" style={style}>
      <CardLabel icon={Wind} s={s}>{t(p, 'wind')}</CardLabel>
      {isShortCell(ctx, s) ? (
        <>
          <BigValue s={s}>{Math.round(now.windSpeed!)}<Unit>{unit}</Unit></BigValue>
          {foot && <Sentence s={s} style={{ opacity: .85 }}>{foot}</Sentence>}
        </>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: u }}>
          <Compass speed={now.windSpeed!} fromDeg={now.windDirection} unit={unit} size={instrumentSize(ctx, s, ctx.land ? s * 16 : s * 15)} s={s} />
          {foot && <div style={{ fontSize: s * 2.4, textAlign: 'center', flex: 'none' }}>{foot}</div>}
        </div>
      )}
    </Card>
  );
}

function SunCard({ p, ctx, style }: CardProps) {
  const { s, u } = p.scale;
  const nowHour = tzHour(p.now, p.timezone);
  const { sunriseHour, sunsetHour } = p.sun;
  const afterSunset = nowHour >= sunsetHour;
  const beforeSunrise = nowHour < sunriseHour;
  // After sunset the card leads with tomorrow's sunrise, as the phone does.
  // SunCalc answers an Invalid Date where there is no sunrise tomorrow (the
  // polar night starting), and that must not reach the formatter.
  const tomorrowSunrise = afterSunset && hasCoords(p)
    ? validDate(SunCalc.getTimes(new Date(p.now.getTime() + 86_400_000), p.latitude!, p.longitude!).sunrise)
    : null;
  const leadSunrise = afterSunset || beforeSunrise;
  const lead = leadSunrise ? (tomorrowSunrise ?? p.sun.sunrise) : p.sun.sunset;
  const other = leadSunrise ? p.sun.sunset : p.sun.sunrise;
  const arcHeight = isShortCell(ctx, s) ? null : sunArcHeight(ctx, s, u);
  return (
    <Card u={u} testId="fsw-card-sun" style={style}>
      <CardLabel icon={leadSunrise ? Sunrise : Sunset} s={s}>{t(p, leadSunrise ? 'sunrise' : 'sunset')}</CardLabel>
      <BigValue s={s} style={{ fontSize: ctx.land ? s * 5.2 : s * 6, marginTop: u }}>{clockTime(p, lead)}</BigValue>
      {arcHeight == null ? (
        <Sentence s={s} style={{ opacity: .85 }}>{t(p, leadSunrise ? 'sunsetAt' : 'sunriseAt', { time: clockTime(p, other) })}</Sentence>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <SunArc sunriseFrac={sunriseHour / 24} sunsetFrac={sunsetHour / 24} nowFrac={nowHour / 24} height={arcHeight} />
          </div>
          <div style={{ fontSize: s * 2.5, flex: 'none' }}>{t(p, leadSunrise ? 'sunsetAt' : 'sunriseAt', { time: clockTime(p, other) })}</div>
        </>
      )}
    </Card>
  );
}

function MoonCard({ p, ctx, style }: CardProps) {
  const { s, u } = p.scale;
  const illum = SunCalc.getMoonIllumination(p.now);
  const times = moonTimesForDay(p.now, p.latitude!, p.longitude!, p.timezone);
  const nowMs = p.now.getTime();
  const next = [['moonrise', times.rise], ['moonset', times.set]] as const;
  const upcoming = next.filter(([, d]) => d && d.getTime() >= nowMs).sort((a, b) => a[1]!.getTime() - b[1]!.getTime())[0];
  const foot = upcoming
    ? t(p, upcoming[0], { time: clockTime(p, upcoming[1]) })
    : p.t('fullscreen-weather.moon.illuminated', { percent: Math.round(illum.fraction * 100) });
  // The label is the short word "Moon" and the phase name is the card's
  // reading, in the body: as the label it was tracked uppercase on one line
  // and a 293 px landscape card cut "Waxing Gibbous" to "WAXING GIBBO...",
  // with the longer names of other languages cut harder.
  const phaseName = p.t(`fullscreen-weather.moon.${moonPhaseKey(illum.phase)}`);
  return (
    <Card u={u} testId="fsw-card-moon" style={style}>
      <CardLabel icon={Moon} s={s}>{t(p, 'moon')}</CardLabel>
      {isShortCell(ctx, s) ? (
        <>
          <div style={{ fontSize: s * 3, fontWeight: 500, marginTop: u, lineHeight: 1.2 }} data-testid="fsw-moon-phase">{phaseName}</div>
          <Sentence s={s} style={{ opacity: .85 }}>{foot}</Sentence>
        </>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `${u * .5}px 0` }}>
            <MoonImage phase={illum.phase} size={instrumentSize(ctx, s, ctx.land ? s * 9 : s * 10.5, 2.6)} />
          </div>
          <div style={{ fontSize: s * 2.4, fontWeight: 500, textAlign: 'center', flex: 'none', lineHeight: 1.2 }} data-testid="fsw-moon-phase">{phaseName}</div>
          <div style={{ fontSize: s * 2.1, textAlign: 'center', flex: 'none', opacity: .85, marginTop: s * .3 }}>{foot}</div>
        </>
      )}
    </Card>
  );
}

function UVCard({ p, ctx, style }: CardProps) {
  const { s, u } = p.scale;
  const uv = Math.round(p.hourly[0]!.uvIndex!);
  const rest = uvRestOfDay(p.hourly, p.sun.sunset?.getTime() ?? null);
  return (
    <Card u={u} testId="fsw-card-uv" style={style}>
      <CardLabel icon={Sun} s={s}>{t(p, 'uv')}</CardLabel>
      <BigValue s={s}>{uv}</BigValue>
      <div style={{ fontSize: s * 2.75, fontWeight: 600, marginTop: u * .5 }}>{t(p, `uvWord.${uvLevel(uv)}`)}</div>
      <ScaleBar gradient={UV_GRADIENT} pct={(uv / 11) * 100} u={u} style={{ marginTop: ctx.land ? u * 1.4 : 'auto' }} />
      {ctx.land && !isShortCell(ctx, s) && rest != null && <Sentence s={s} style={{ opacity: .8, fontSize: s * 2.4 }}>{t(p, 'uvRest', { level: t(p, `uvWord.${uvLevel(rest)}`) })}</Sentence>}
    </Card>
  );
}

function FeelsLikeCard({ p, style }: CardProps) {
  const { s, u } = p.scale;
  const now = p.hourly[0]!;
  return (
    <Card u={u} testId="fsw-card-feelsLike" style={style}>
      <CardLabel icon={Thermometer} s={s}>{t(p, 'feelsLike')}</CardLabel>
      <BigValue s={s}>{Math.round(now.feelsLike!)}°</BigValue>
      <Sentence s={s} style={{ opacity: .85 }}>{sentence(p, feelsLikeSentence(now.temp, now.feelsLike!, p.units))}</Sentence>
    </Card>
  );
}

function HumidityCard({ p, style }: CardProps) {
  const { s, u } = p.scale;
  const now = p.hourly[0]!;
  return (
    <Card u={u} testId="fsw-card-humidity" style={style}>
      <CardLabel icon={Droplets} s={s}>{t(p, 'humidity')}</CardLabel>
      <BigValue s={s}>{Math.round(now.humidity!)}%</BigValue>
      <Sentence s={s} style={{ opacity: .85 }}>{sentence(p, humiditySentence(now.humidity!, now.dewPoint))}</Sentence>
    </Card>
  );
}

function PrecipitationCard({ p, ctx, style }: CardProps) {
  const { s, u } = p.scale;
  const reading = precipitationReading(p.forecast, p.units)!;
  const next = reading.next.vars?.date
    ? t(p, reading.next.key, { ...reading.next.vars, day: weekdayShort(String(reading.next.vars.date), p.locale) })
    : sentence(p, reading.next);
  return (
    <Card u={u} testId="fsw-card-precipitation" style={style}>
      <CardLabel icon={CloudRain} s={s}>{t(p, 'precipitation')}</CardLabel>
      {/* Three lines, as the phone writes it: the amount, "Today" in bold, then what comes next. */}
      <BigValue s={s} style={{ fontSize: s * 5.6 }}>{formatPrecipAmount(reading.today, p.units)}</BigValue>
      <div style={{ fontSize: s * 2.75, fontWeight: 700, lineHeight: 1.25, marginTop: u * .5 }}>{p.t('fullscreen-weather.today')}</div>
      {/* The third line needs a card of about 24 type units (label, amount, "Today", two lines, padding); a shorter cell keeps the amount and the day. */}
      {(ctx.height == null || ctx.height >= s * 24) && <Sentence s={s} style={{ opacity: .85, marginTop: 0, paddingTop: u * .2 }}>{next}</Sentence>}
    </Card>
  );
}

function VisibilityCard({ p, style }: CardProps) {
  const { s, u } = p.scale;
  const vis = p.hourly[0]!.visibility!;
  const unit = p.units === 'metric' ? 'km' : 'mi';
  return (
    <Card u={u} testId="fsw-card-visibility" style={style}>
      <CardLabel icon={Eye} s={s}>{t(p, 'visibility')}</CardLabel>
      <BigValue s={s}>{Math.round(vis * 10) / 10}<Unit size=".75em">{unit}</Unit></BigValue>
      <Sentence s={s} style={{ opacity: .85 }}>{sentence(p, visibilitySentence(vis, p.units))}</Sentence>
    </Card>
  );
}

function PressureCard({ p, ctx, style }: CardProps) {
  const { s, u } = p.scale;
  const hPa = p.hourly[0]!.pressure!;
  const reading = pressureForUnits(hPa, p.units);
  const trend = pressureTrend(p.hourly);
  return (
    <Card u={u} testId="fsw-card-pressure" style={style}>
      <CardLabel icon={GaugeIcon} s={s}>{t(p, 'pressure')}</CardLabel>
      {isShortCell(ctx, s) ? (
        <>
          <BigValue s={s} style={{ fontSize: s * 5.6 }}>{reading.value}<Unit>{reading.unit}</Unit></BigValue>
          <Sentence s={s} style={{ opacity: .85 }}>{t(p, `pressureTrend.${trend}`)}</Sentence>
        </>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Gauge value={reading.value} unit={reading.unit} frac={pressurePosition(hPa)} trend={trend}
              size={instrumentSize(ctx, s, ctx.land ? s * 15 : s * 16)}
              lowLabel={t(p, 'pressureLow')} highLabel={t(p, 'pressureHigh')} />
          </div>
          <div style={{ fontSize: s * 2.4, textAlign: 'center', opacity: .85, flex: 'none' }}>{t(p, `pressureTrend.${trend}`)}</div>
        </>
      )}
    </Card>
  );
}

function NowcastCard({ p, style }: CardProps) {
  const { s, u } = p.scale;
  const verdict = nowcastVerdict(p.minutely, p.units, p.t)!;
  return (
    <Card u={u} testId="fsw-card-nowcast" style={style}>
      <CardLabel icon={CloudDrizzle} s={s}>{t(p, 'nowcast')}</CardLabel>
      <div style={{ fontSize: s * 3, fontWeight: 500, marginTop: u, lineHeight: 1.2 }}>{verdict.text}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: u * 3.7, marginTop: 'auto' }}>
        {verdict.series.map((v, i) => (
          <div key={i} style={{ flex: 1, minHeight: 3, height: Math.max(3, v * u * 3.7), borderRadius: 2, background: v > 0 ? '#7dd3fc' : 'rgba(125,211,252,.35)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: s * 2, opacity: .5, marginTop: u * .7 }}>
        <span>{p.t('fullscreen-weather.nowcast.now')}</span>
        <span>{p.t('fullscreen-weather.nowcast.minutes', { n: 30 })}</span>
        <span>{p.t('fullscreen-weather.nowcast.minutes', { n: 60 })}</span>
      </div>
    </Card>
  );
}

export function AirQualityCard({ p, ctx, style }: CardProps) {
  const { s, u } = p.scale;
  const aqi = p.airQuality!.aqi;
  const level = airQualityLevel(aqi);
  // The tablet's low, wide banner puts the bar at the foot; in a cell with
  // room to spare (the list put the card in the Forecast grid's bottom row,
  // or a tall Conditions row) that leaves a void above it, so the card
  // stacks like the phone's instead, its body centred in the slack.
  const low = ctx.land && !hasSlack(ctx, s);
  const centred = ctx.land && hasSlack(ctx, s);
  return (
    <Card u={u} testId="fsw-card-airQuality" style={style}>
      <CardLabel icon={Leaf} s={s}>{t(p, 'airQuality')}</CardLabel>
      <div style={centred ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' } : { display: 'contents' }}>
        <div style={{ fontSize: low ? s * 3.7 : s * 5.2, fontWeight: 500, letterSpacing: '-.01em', lineHeight: 1, marginTop: low ? u : u * 1.6 }}>{p.t(`air-quality.labels.${level}`)}</div>
        {low ? (
          <>
            <Sentence s={s} style={{ marginTop: u * .5, opacity: .8, fontSize: s * 2.2, paddingTop: 0 }}>{t(p, `aqSentence.${level}`)}</Sentence>
            <ScaleBar gradient={AQ_GRADIENT} pct={airQualityPosition(aqi)} u={u} style={{ marginTop: 'auto' }} />
          </>
        ) : (
          <>
            <ScaleBar gradient={AQ_GRADIENT} pct={airQualityPosition(aqi)} u={u} style={{ marginTop: u * 1.6 }} />
            <Sentence s={s} style={{ marginTop: u * 1.4, opacity: .8, fontSize: s * 2.4, paddingTop: 0, flex: 'none' }}>{t(p, `aqSentence.${level}`)}</Sentence>
          </>
        )}
      </div>
    </Card>
  );
}
