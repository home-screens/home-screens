'use client';

import { useId } from 'react';
import { getWeatherIcon } from '@/lib/weather-icons';
import { Droplet, Wind } from 'lucide-react';
import { windUnitLabel } from '@/lib/weather/units';
import type { WeatherViewProps } from './weather-view-utils';
import {
  hourLabel, smoothPath, hourlyInstant, isNightHour, timelineHours, timelineMarks, temperatureAxis,
  labelStride, spanHours, cachedFormat, meteogramColumnPx, valueLabelled, hourLabelled,
  HOURLY_RAIN_SHOWN_PCT,
} from './weather-view-utils';
import { tempColor } from './temp-ramp';
import { Card, TopBar, AlertBand, MiniHero, PrecipLegendHeader } from './weather-parts';

/**
 * The next 24 hours as a timeline.
 *
 * Every hour is a dot placed along a shared temperature axis, joined by one
 * spline running the length of the list; rain is a bar and a percentage,
 * wind a number, night hours are shaded, and a midnight entry is labelled
 * with the day instead of the hour.
 *
 * Portrait runs time *down* the page (rows). Landscape runs it *across*
 * (columns) — the classic meteogram, with the curve in the middle band. The
 * two are the same parts with the axis swapped, and share one geometry rule:
 * the dots and labels are DOM elements positioned by percentage inside their
 * own row or column, so type scales with `s` like everywhere else, and only
 * the connecting line is SVG. Its viewBox is one unit per entry along the
 * time axis and 0-100 across it, drawn with `preserveAspectRatio="none"` and
 * a non-scaling stroke, so it lands exactly on the DOM dots at any size.
 */
export default function HourlyView(p: WeatherViewProps) {
  const { s, u } = p.scale;
  const landscape = p.scale.orientation === 'landscape';
  const hrs = timelineHours(p.hourly);
  const N = hrs.length;
  const temps = hrs.map((h) => h.temp);
  const axis = temperatureAxis(temps);
  const marks = timelineMarks(hrs, p.timezone);
  const dayFormat = cachedFormat(p.locale, { weekday: 'short', timeZone: p.timezone });

  const entries = hrs.map((h, i) => {
    const { hour, midnight } = marks[i];
    return {
      h, i,
      night: isNightHour(hour, p.sun),
      midnight,
      label: i === 0
        ? p.t('fullscreen-weather.nowcast.now')
        : midnight
          ? dayFormat.format(hourlyInstant(h))
          : hourLabel(Math.floor(hour), p.timeFormat),
      rain: Math.round(h.precipProbability ?? 0),
      wind: h.windSpeed != null ? Math.round(h.windSpeed) : null,
      /** 0-1 position along the temperature axis. */
      k: axis.k(h.temp),
    };
  });

  const uid = useId();
  const gradId = `${uid}-tl`;
  const windUnit = windUnitLabel(p.units);
  // Marks that carry data floor on `s`: the fit loop shrinks `u` fastest, and
  // a dot or bar sized off `u` alone becomes a speck beside large numbers.
  const stroke = Math.max(2, s * .18);
  const dot = Math.max(u * 1.5, s * .8);

  const head = <PrecipLegendHeader p={p} hours={spanHours(hrs)} style={{ marginBottom: u * .8 }} />;

  // One entry is not a timeline (and "Next 1 hours" is not a heading): when
  // the hourly fetch came back short, say so rather than draw an empty axis.
  if (N < 2) {
    return (
      <>
        <TopBar p={p} />
        <MiniHero p={p} />
        <AlertBand p={p} />
        <Card u={u} testId="fsw-hourly" style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--fsw-text-3)', fontSize: s * 2.2 }}>
          {p.t('fullscreen-weather.loading')}
        </Card>
      </>
    );
  }

  const gradient = (vertical: boolean) => (
    <defs>
      <linearGradient
        id={gradId} gradientUnits="userSpaceOnUse"
        x1={vertical ? 0 : 0.5} y1={vertical ? 0.5 : 0}
        x2={vertical ? 0 : N - 0.5} y2={vertical ? N - 0.5 : 0}
      >
        {temps.map((t, i) => (
          <stop key={i} offset={`${((i / (N - 1)) * 100).toFixed(1)}%`} stopColor={tempColor(t, p.units)} />
        ))}
      </linearGradient>
    </defs>
  );

  // ── Portrait: rows ──────────────────────────────────────────────────────
  if (!landscape) {
    // Fixed column widths, so the spline overlay can be placed without
    // measuring (which would re-render inside the fit loop). The column
    // order is defined once, here; the axis row, the ghost row that carries
    // the spline, and every data row all lay out from it, so the overlay
    // lands on the track without anyone adding up the widths before it.
    const cols: Cell[] = [
      { key: 'hour', size: s * 6 },
      { key: 'icon', size: s * 4 },
      { key: 'track' },
      { key: 'rain', size: s * 9 },
      { key: 'wind', size: s * 7 },
    ];
    const gap = u * 1.5;
    const rowMin = Math.max(s * 2.8, u * 2.4);
    const rainBar = Math.max(u * .9, s * .5);
    // The plot box is inset from the track cell in *pixels of type*: half a
    // dot on the left, and room for a "100°" label to the right of the
    // warmest dot. A percentage inset was tried first and fails at large
    // type, where the label outgrows its share of the track.
    const plotL = dot / 2;
    const plotR = s * 4.8;
    const pts = entries.map((e) => [e.k * 100, e.i + 0.5] as [number, number]);
    const cell = (c: Cell, style?: React.CSSProperties): React.CSSProperties =>
      c.size != null ? { width: c.size, flex: 'none', ...style } : { flex: 1, minWidth: 0, ...style };

    const axisCell: Record<string, React.ReactNode> = {
      hour: null,
      icon: null,
      track: (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: `0 ${s * .4}px` }}>
          <span>{Math.round(axis.min)}°</span><span>{Math.round(axis.max)}°</span>
        </div>
      ),
      rain: <div style={{ display: 'flex', justifyContent: 'center' }}><Droplet style={{ width: s * 1.7, height: s * 1.7 }} strokeWidth={1.6} /></div>,
      wind: <div style={{ display: 'flex', justifyContent: 'center' }}><Wind style={{ width: s * 1.7, height: s * 1.7 }} strokeWidth={1.6} /></div>,
    };

    const rowCell = (e: (typeof entries)[number], key: string): React.ReactNode => {
      switch (key) {
        case 'hour':
          return (
            <div style={{
              fontSize: s * 1.7, fontWeight: 600, whiteSpace: 'nowrap',
              color: e.i === 0 ? p.accent : e.midnight ? 'var(--fsw-text-2)' : 'var(--fsw-text-3)',
            }}>{e.label}</div>
          );
        case 'icon': {
          const Ico = getWeatherIcon(e.h.icon, 'outline');
          return (
            <div style={{ display: 'grid', placeItems: 'center', color: e.rain >= 50 ? '#38bdf8' : 'var(--fsw-text-2)' }}>
              <Ico style={{ width: s * 2.4, height: s * 2.4 }} strokeWidth={1.6} />
            </div>
          );
        }
        case 'track':
          return (
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: plotL, right: plotR }}>
              <Dot p={p} temp={e.h.temp} size={dot} style={{ top: '50%', left: `${e.k * 100}%`, transform: 'translate(-50%,-50%)' }} />
              <div style={{
                position: 'absolute', top: '50%', left: `${e.k * 100}%`, transform: `translate(${dot * .5 + s * .5}px,-50%)`,
                fontSize: s * 1.9, fontWeight: 600, letterSpacing: '-.02em', whiteSpace: 'nowrap',
              }}>{Math.round(e.h.temp)}°</div>
            </div>
          );
        case 'rain':
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: s * .5, visibility: e.rain >= HOURLY_RAIN_SHOWN_PCT ? 'visible' : 'hidden' }}>
              <div style={{ flex: 1, height: rainBar, borderRadius: 999, background: 'var(--fsw-surface-alt)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${e.rain}%`, background: '#38bdf8', borderRadius: 999 }} />
              </div>
              <div style={{ width: s * 3.2, textAlign: 'right', fontSize: s * 1.4, fontWeight: 600, color: '#38bdf8' }}>{e.rain}%</div>
            </div>
          );
        case 'wind':
          return (
            <div style={{ textAlign: 'right', fontSize: s * 1.6, fontWeight: 500, color: 'var(--fsw-text-2)', whiteSpace: 'nowrap' }}>
              {e.wind != null ? `${e.wind} ${windUnit}` : ''}
            </div>
          );
        default:
          return null;
      }
    };

    return (
      <>
        <TopBar p={p} />
        <MiniHero p={p} />
        <AlertBand p={p} />
        <Card u={u} testId="fsw-hourly" style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          // Header + axis + rows + the card's own padding: a real floor.
          minHeight: rowMin * N + s * 4.5 + u * 6.5,
          // The fixed columns are sized in `s`; past a point they outgrow the
          // card, and a stretched flex item would spill into the card's
          // padding where the fit loop cannot see it. `min-content` makes the
          // card overflow the stack instead, which the loop measures.
          minWidth: 'min-content',
        }}>
          {head}
          <div style={{
            display: 'flex', alignItems: 'center', gap, color: 'var(--fsw-text-3)',
            fontSize: s * 1.3, fontWeight: 600, paddingBottom: u * .6, borderBottom: '1px solid var(--fsw-border-sub)',
          }}>
            {cols.map((c) => <div key={c.key} style={cell(c)}>{axisCell[c.key]}</div>)}
          </div>

          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: rowMin * N }}>
            {/* A ghost row with the same columns as the data rows, spanning
                the whole list, whose track cell holds the spline. The SVG is
                a replaced element: `top/bottom` alone would leave it at its
                intrinsic 150px, so a wrapper carries the placement and the
                SVG fills it. */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', gap, pointerEvents: 'none' }}>
              {cols.map((c) => (
                <div key={c.key} style={cell(c, { position: 'relative' })}>
                  {c.key === 'track' && (
                    <div data-testid="fsw-hourly-spline" style={{ position: 'absolute', top: 0, bottom: 0, left: plotL, right: plotR }}>
                      <svg viewBox={`0 0 100 ${N}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}>
                        {gradient(true)}
                        <path d={smoothPath(pts)} fill="none" stroke={`url(#${gradId})`} strokeWidth={stroke} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {entries.map((e) => (
              <div key={e.i} data-testid="fsw-hour" style={{
                flex: 1, display: 'flex', alignItems: 'center', gap, minHeight: rowMin,
                position: 'relative', borderRadius: u * .6,
                borderTop: e.midnight ? '1px solid var(--fsw-border)' : '1px solid transparent',
              }}>
                {e.night && <NightShade radius={u * .6} />}
                {cols.map((c) => (
                  <div key={c.key} style={cell(c, { position: 'relative', ...(c.key === 'track' ? { alignSelf: 'stretch' } : {}) })}>
                    {rowCell(e, c.key)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </>
    );
  }

  // ── Landscape: columns (a meteogram) ────────────────────────────────────
  // The band order is defined once: the gutter, the ghost column that carries
  // the spline, and every hour column lay out from it, so the overlay lands
  // on the curve band without anyone adding up the band heights above it.
  const rainH = Math.max(u * 7, s * 4);
  const bands: Cell[] = [
    { key: 'hour', size: s * 2.2 },
    { key: 'icon', size: s * 3.2 },
    { key: 'curve' },
    { key: 'rain', size: rainH },
    { key: 'wind', size: s * 2.4 },
  ];
  const gap = u * .9;
  const gutterW = s * 4;
  // The plot box is inset from the curve band in pixels of type: a label's
  // height above the warmest dot, half a dot below the coldest. The band
  // itself floors at that plus a real curve.
  const plotT = s * 2.6;
  const plotB = dot / 2;
  const curveMin = plotT + plotB + s * 8;
  const pts = entries.map((e) => [e.i + 0.5, (1 - e.k) * 100] as [number, number]);
  const fixedH = bands.reduce((sum, b) => sum + (b.size ?? 0), 0);

  // Label thinning: a "84°" is about 3.3s wide, and 24 columns on a 1920
  // canvas are ~72px each, so large type needs every second or third column.
  const stride = labelStride(meteogramColumnPx(p.scale.width, u, gutterW, N), s * 3.3);
  const midnights = entries.map((e) => e.midnight);
  const labelled = (i: number) => valueLabelled(i, stride);
  const hourShown = (i: number) => hourLabelled(i, stride, midnights);

  const band = (b: Cell, style?: React.CSSProperties): React.CSSProperties =>
    b.size != null
      ? { height: b.size, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', ...style }
      : { flex: 1, position: 'relative', minHeight: curveMin, ...style };

  const gutterCell: Record<string, React.ReactNode> = {
    hour: null,
    icon: null,
    curve: null,
    rain: <Droplet style={{ width: s * 1.7, height: s * 1.7 }} strokeWidth={1.6} />,
    wind: <span style={{ fontSize: s * 1.2, fontWeight: 600 }}>{windUnit}</span>,
  };

  const columnCell = (e: (typeof entries)[number], key: string): React.ReactNode => {
    switch (key) {
      case 'hour':
        return (
          <span style={{
            fontSize: s * 1.5, fontWeight: 600, whiteSpace: 'nowrap',
            color: e.i === 0 ? p.accent : e.midnight ? 'var(--fsw-text-2)' : 'var(--fsw-text-3)',
          }}>{hourShown(e.i) ? e.label : ''}</span>
        );
      case 'icon': {
        const Ico = getWeatherIcon(e.h.icon, 'outline');
        return <Ico style={{ width: s * 2.6, height: s * 2.6, color: e.rain >= 50 ? '#38bdf8' : 'var(--fsw-text-2)' }} strokeWidth={1.6} />;
      }
      case 'curve':
        return (
          <div style={{ position: 'absolute', left: 0, right: 0, top: plotT, bottom: plotB }}>
            <Dot p={p} temp={e.h.temp} size={dot} style={{ left: '50%', top: `${(1 - e.k) * 100}%`, transform: 'translate(-50%,-50%)' }} />
            {labelled(e.i) && (
              <div style={{
                position: 'absolute', left: '50%', top: `${(1 - e.k) * 100}%`,
                transform: `translate(-50%, calc(-100% - ${dot * .5 + s * .3}px))`,
                fontSize: s * 1.9, fontWeight: 600, letterSpacing: '-.02em', whiteSpace: 'nowrap',
              }}>{Math.round(e.h.temp)}°</div>
            )}
          </div>
        );
      case 'rain':
        return e.rain >= HOURLY_RAIN_SHOWN_PCT ? (
          <>
            {labelled(e.i) && (
              <div style={{
                position: 'absolute', left: 0, right: 0, bottom: `calc(${e.rain}% + ${u * .4}px)`,
                textAlign: 'center', fontSize: s * 1.25, fontWeight: 600, color: '#38bdf8',
              }}>{e.rain}%</div>
            )}
            <div style={{ width: '100%', height: `${e.rain}%`, minHeight: 2, background: '#38bdf8', borderRadius: '4px 4px 2px 2px' }} />
          </>
        ) : null;
      case 'wind':
        return (
          <span style={{ fontSize: s * 1.5, fontWeight: 500, color: 'var(--fsw-text-2)' }}>
            {labelled(e.i) && e.wind != null ? e.wind : ''}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <TopBar p={p} />
      <MiniHero p={p} />
      <AlertBand p={p} />
      <Card u={u} testId="fsw-hourly" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {head}
        {/* No `min-height: 0` here: the curve band floors at `curveMin`, so
            the body floors at its bands and overflow stays visible to the fit loop. */}
        <div style={{ flex: 1, display: 'flex', minHeight: fixedH + curveMin + gap * (bands.length - 1) }}>
          <div style={{ flex: 'none', width: gutterW, display: 'flex', flexDirection: 'column', gap, color: 'var(--fsw-text-3)' }}>
            {bands.map((b) => <div key={b.key} style={band(b, b.size == null ? { minHeight: 0 } : undefined)}>{gutterCell[b.key]}</div>)}
          </div>

          <div style={{ flex: 1, position: 'relative', display: 'flex', minWidth: 0 }}>
            {/* A ghost column with the same bands as the hour columns,
                spanning the whole list, whose curve band holds the spline. */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap, pointerEvents: 'none' }}>
              {bands.map((b) => (
                <div key={b.key} style={band(b)}>
                  {b.key === 'curve' && (
                    <div data-testid="fsw-hourly-spline" style={{ position: 'absolute', left: 0, right: 0, top: plotT, bottom: plotB }}>
                      <svg viewBox={`0 0 ${N} 100`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}>
                        {gradient(false)}
                        <path d={smoothPath(pts)} fill="none" stroke={`url(#${gradId})`} strokeWidth={stroke} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {entries.map((e) => (
              <div key={e.i} data-testid="fsw-hour" style={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap,
                position: 'relative', borderRadius: u * .8,
                borderLeft: e.midnight ? '1px solid var(--fsw-border)' : '1px solid transparent',
              }}>
                {e.night && <NightShade radius={u * .8} />}
                {bands.map((b) => (
                  <div key={b.key} style={band(b, b.key === 'rain' ? { alignItems: 'flex-end', padding: '0 18%' } : undefined)}>
                    {columnCell(e, b.key)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}

/** One column (portrait) or band (landscape) of the timeline: a fixed size, or the flexible track. */
interface Cell {
  key: string;
  size?: number;
}

/** A temperature dot, coloured from the shared ramp, ringed in the card surface. */
function Dot({ p, temp, size, style }: { p: WeatherViewProps; temp: number; size: number; style: React.CSSProperties }) {
  return (
    <div data-testid="fsw-hour-dot" style={{
      position: 'absolute', width: size, height: size, borderRadius: '50%',
      background: tempColor(temp, p.units), border: '2px solid var(--fsw-surface)',
      ...style,
    }} />
  );
}

/** Night hours: a faint wash of the text colour. An overlay child rather
 *  than a background so it needs no alpha arithmetic on the theme token. */
function NightShade({ radius }: { radius: number }) {
  return <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: radius, background: 'var(--fsw-text)', opacity: .045, pointerEvents: 'none' }} />;
}
