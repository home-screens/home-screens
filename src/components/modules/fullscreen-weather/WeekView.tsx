'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import type { WeatherViewProps, WeekRange } from './weather-view-utils';
import { weekRange, MIN_BAR_PCT } from './weather-view-utils';
import { tempColor } from './temp-ramp';
import { Card, Label, TopBar, AlertBand, MiniHero, DayDetails, RangeBar, NowRing, dayName, shortDate } from './weather-parts';

/**
 * The daily forecast as the whole screen.
 *
 * Panorama's 7-day list is a strip at the foot of a stack; here every day
 * gets real room — a large icon, its description, and a details line — and
 * the range bars share one scale so the week's trend reads without a number.
 *
 * Portrait stacks the days as bands. Landscape stands them up as columns,
 * with the range bars turned vertical: on a shared scale that is a
 * candlestick row, and the high sits above each bar with the low below it,
 * so the two labels can never collide however small a day's range is.
 */
export default function WeekView(p: WeatherViewProps) {
  const { s, u } = p.scale;
  const landscape = p.scale.orientation === 'landscape';
  const range = weekRange(p);
  const { days, weekMin, weekMax } = range;

  // Marks that carry data floor on `s`, not `u`: when the fit loop shrinks
  // the layout, structure gives way faster than type, and a bar or ring sized
  // off `u` alone shrinks to a hairline while the numbers beside it stay large.
  const marks = { bar: Math.max(u * 1.1, s * .5), ring: Math.max(u * 1.6, s * .9), track: Math.max(u * 1.6, s * .8) };

  // A band is the icon (6.5s) plus breathing room; the card floors at the
  // list so the fit loop can see when the bands no longer fit.
  const bandMin = s * 9;

  // The hourly fetch can succeed while the daily one fails; a "0-day outlook"
  // over an empty card is not a forecast, so say the forecast is still coming.
  if (days.length === 0) {
    return (
      <>
        <TopBar p={p} />
        <MiniHero p={p} />
        <AlertBand p={p} />
        <Card u={u} testId="fsw-week" style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--fsw-text-3)', fontSize: s * 2.2 }}>
          {p.t('fullscreen-weather.loading')}
        </Card>
      </>
    );
  }

  return (
    <>
      <TopBar p={p} />
      <MiniHero p={p} />
      <AlertBand p={p} />
      <Card u={u} testId="fsw-week" style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        // Portrait bands are fixed-width columns in `s`. Past a point they are
        // wider than the card, and a flex item stretched to its container's
        // width just lets its content spill into the card's padding, where
        // nothing measures it. `min-content` makes the card itself refuse to
        // be narrower than its rows, so the card overflows the stack instead
        // and the fit loop shrinks the type until the whole row fits.
        ...(landscape ? {} : { minHeight: bandMin * days.length + u * 6.5, minWidth: 'min-content' }),
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label s={s}>{p.t('fullscreen-weather.sections.outlook', { days: days.length })}</Label>
          <Label s={s}>{`${Math.round(weekMin)}° – ${Math.round(weekMax)}°`}</Label>
        </div>
        {landscape ? (
          <div style={{ flex: 1, display: 'flex', marginTop: u * .4 }}>
            {days.map((d, i) => <DayColumn key={d.date} p={p} day={d} index={i} last={i === days.length - 1} marks={marks} range={range} />)}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: u * .4, minHeight: bandMin * days.length }}>
            {days.map((d, i) => <DayBand key={d.date} p={p} day={d} index={i} last={i === days.length - 1} min={bandMin} marks={marks} range={range} />)}
          </div>
        )}
      </Card>
    </>
  );
}

interface DayProps {
  p: WeatherViewProps;
  day: WeatherViewProps['forecast'][number];
  index: number;
  last: boolean;
  range: WeekRange;
  marks: { bar: number; ring: number; track: number };
}

/** Portrait: one band per day. */
function DayBand({ p, day: d, index: i, last, min, range, marks }: DayProps & { min: number }) {
  const { s, u } = p.scale;
  const today = i === 0;
  const Icon = getWeatherIcon(d.icon, 'outline');

  return (
    <div data-testid="fsw-week-day" style={{
      flex: 1, display: 'flex', alignItems: 'center', gap: u * 2, minHeight: min,
      padding: `0 ${u * 1.2}px`, position: 'relative', borderRadius: u * 1.6,
      borderBottom: last || today ? '1px solid transparent' : '1px solid var(--fsw-border-sub)',
    }}>
      {today && <Tint p={p} />}
      <div style={{ width: s * 12, flex: 'none', position: 'relative' }}>
        <div style={{ fontSize: s * 3, fontWeight: today ? 700 : 500, letterSpacing: '-.01em', color: today ? 'var(--fsw-text)' : 'var(--fsw-text-2)' }}>
          {dayName(d.date, i, p)}
        </div>
        <div style={{ fontSize: s * 1.6, fontWeight: 500, color: 'var(--fsw-text-3)', marginTop: u * .3 }}>{shortDate(d.date, p)}</div>
      </div>
      <div style={{ width: s * 8.5, flex: 'none', display: 'grid', placeItems: 'center', position: 'relative', color: today ? p.accent : 'var(--fsw-text-2)' }}>
        <Icon style={{ width: s * 6.5, height: s * 6.5 }} strokeWidth={1.2} />
      </div>
      {/* A real minimum: the fixed columns must not squeeze this to nothing.
          Past 4x-large the row overflows the card instead, which the fit
          loop can see and correct. */}
      <div style={{ flex: 1, minWidth: s * 10, position: 'relative' }}>
        <div style={{
          fontSize: s * 2.7, fontWeight: 500, letterSpacing: '-.01em', lineHeight: 1.2,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{d.description}</div>
        <div style={{ marginTop: u * .6 }}><DayDetails p={p} day={d} size={1.8} /></div>
      </div>
      <div style={{ width: s * 28, flex: 'none', display: 'flex', alignItems: 'center', gap: u * 1.5, position: 'relative' }}>
        <div style={{ width: s * 6.5, textAlign: 'right', fontSize: s * 3, color: 'var(--fsw-text-3)' }}>{Math.round(d.low)}°</div>
        <RangeBar p={p} day={d} range={range} today={today} height={marks.bar} ring={marks.ring} />
        <div style={{ width: s * 7, textAlign: 'right', fontSize: s * 3, fontWeight: 600 }}>{Math.round(d.high)}°</div>
      </div>
    </div>
  );
}

/** Landscape: one column per day, range bars standing on a shared scale. */
function DayColumn({ p, day: d, index: i, last, range, marks }: DayProps) {
  const { s, u } = p.scale;
  const today = i === 0;
  const Icon = getWeatherIcon(d.icon, 'outline');
  // Headroom above and below the track for the labels that sit past its ends.
  const labelRoom = s * 3.2;
  // A flat day (high === low, or a week where every day is the same) still
  // draws a bar: floor it at MIN_BAR_PCT of the track, growing upward unless
  // that would leave the track.
  const lo0 = range.pct(d.low);
  const hi = Math.max(range.pct(d.high), Math.min(100, lo0 + MIN_BAR_PCT));
  const lo = Math.min(lo0, hi - MIN_BAR_PCT);

  return (
    <div data-testid="fsw-week-day" style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      padding: `${u * 1.2}px ${u * .8}px ${u * .6}px`, position: 'relative', borderRadius: u * 1.6,
      borderRight: last || today ? '1px solid transparent' : '1px solid var(--fsw-border-sub)',
    }}>
      {today && <Tint p={p} />}
      <div style={{ position: 'relative', fontSize: s * 2.2, fontWeight: today ? 700 : 500, color: today ? 'var(--fsw-text)' : 'var(--fsw-text-2)' }}>
        {dayName(d.date, i, p)}
      </div>
      <div style={{ position: 'relative', fontSize: s * 1.3, fontWeight: 500, color: 'var(--fsw-text-3)', marginTop: u * .2 }}>{shortDate(d.date, p)}</div>
      <div style={{ position: 'relative', marginTop: u * 1.2, color: today ? p.accent : 'var(--fsw-text-2)', display: 'grid' }}>
        <Icon style={{ width: s * 8, height: s * 8 }} strokeWidth={1.1} />
      </div>
      <div style={{
        position: 'relative', fontSize: s * 1.8, fontWeight: 500, marginTop: u * .8, lineHeight: 1.25, minHeight: '2.5em',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: '100%',
      }}>{d.description}</div>

      {/* The bar area takes the column's slack and floors at a height that
          keeps the two labels and a bar readable — in `s`, since the labels
          are type. No `min-height: 0`: the fit loop must be able to see this
          column outgrow the canvas. */}
      <div style={{ flex: 1, width: '100%', position: 'relative', minHeight: labelRoom * 2 + s * 6, margin: `${u * .8}px 0` }}>
        <div style={{
          position: 'absolute', left: '50%', top: labelRoom, bottom: labelRoom, width: marks.track,
          transform: 'translateX(-50%)', borderRadius: 999, background: 'var(--fsw-surface-alt)',
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, borderRadius: 999,
            bottom: `${lo}%`, top: `${100 - hi}%`,
            background: `linear-gradient(0deg, ${tempColor(d.low, p.units)}, ${tempColor(d.high, p.units)})`,
          }}>
            <div style={{ position: 'absolute', left: '50%', bottom: '100%', transform: 'translateX(-50%)', marginBottom: u * .7, fontSize: s * 2.4, fontWeight: 600, whiteSpace: 'nowrap' }}>
              {Math.round(d.high)}°
            </div>
            <div style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', marginTop: u * .7, fontSize: s * 2.2, color: 'var(--fsw-text-3)', whiteSpace: 'nowrap' }}>
              {Math.round(d.low)}°
            </div>
          </div>
          {today && range.nowTemp != null && <NowRing p={p} size={marks.ring} style={{ left: '50%', bottom: `${range.pct(range.nowTemp)}%`, transform: 'translate(-50%,50%)' }} />}
        </div>
      </div>
      <div style={{ position: 'relative', width: '100%' }}><DayDetails p={p} day={d} align="center" /></div>
    </div>
  );
}

/** Today's band or column gets a faint wash of the accent. A child rather
 *  than a background colour so it needs no alpha arithmetic on the accent. */
function Tint({ p }: { p: WeatherViewProps }) {
  const { u } = p.scale;
  return <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: u * 1.6, background: p.accent, opacity: .07, pointerEvents: 'none' }} />;
}
