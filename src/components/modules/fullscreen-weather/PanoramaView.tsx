'use client';

import { useId } from 'react';
import { useElementBox } from '@/hooks/useElementBox';
import { getWeatherIcon } from '@/lib/weather-icons';
import { Wind, Droplets, Sun, Gauge, Sunset } from 'lucide-react';
import type { WeatherViewProps } from './weather-view-utils';
import { windUnitLabel } from '@/lib/weather/units';
import {
  hourLabel, smoothPath, nowcastVerdict, tzHour, hourlyInstant, isNightHour, spanHours,
  LANDSCAPE_LEFT_FRACTION, STRIP_COLUMNS, CANVAS_PAD_X_U, CARD_PAD_X_U, HOURLY_RAIN_SHOWN_PCT,
} from './weather-view-utils';
import { tempColor } from './temp-ramp';
import { Card, Label, TopBar, AlertBand, DayRangeBars, DayTallBands, PrecipLegendHeader } from './weather-parts';
import { HourlyRows } from './HourlyView';
import { FIT_MEASURE_ATTR } from '@/hooks/useFitScale';

/**
 * The flagship view, in two arrangements of the same parts.
 *
 * Portrait stacks every section full-width. On a landscape canvas that leaves
 * the 7-day tracks 1600px wide carrying 40px of information, and a hero with
 * half a screen of dead air between the temperature and its icon — so
 * landscape splits instead: the two *wide* things (the 48h curve and the week
 * bars) take the wide column, the two *tall* things (hero, nowcast) take a
 * narrow one, and the stat rail turns on its side to fill it out.
 */
export default function PanoramaView(p: WeatherViewProps) {
  return p.scale.orientation === 'landscape'
    ? <PanoramaLandscape p={p} />
    : <PanoramaPortrait p={p} />;
}

/**
 * The Wide strip view: Panorama's parts side by side, for a module across
 * the foot of a landscape wall. A view of its own rather than a shape the
 * box picks, so the household chooses it and Panorama never rearranges
 * itself under them.
 *
 * It keeps its three columns in a portrait box too, since a view that
 * quietly became Panorama there would look like nothing happened when it
 * was picked. There each column takes the form that suits a tall narrow
 * column (`StripPortrait`), so the wall is full because the content is,
 * not because the strip was stretched over it. A landscape box that is
 * taller than a strip (a 16:9 wall) keeps the wide form: the tall form's
 * 24 hourly rows need a portrait wall's height at large type. There the
 * chart is capped at a landscape proportion and the stats card takes the
 * slack instead.
 */
export function StripView(p: WeatherViewProps) {
  return p.scale.orientation === 'landscape'
    ? <PanoramaStrip p={p} />
    : <StripPortrait p={p} />;
}

/**
 * The strip turned on end: now, then the next hours, then the next days,
 * left to right, each column tall because its content is. The hero stacks
 * its temperature over its icon with the stat rail at the foot; the hours
 * run down the middle column as rows with the curve through them; each day
 * is a band with its description and range bar.
 */
function StripPortrait({ p }: { p: WeatherViewProps }) {
  const { u } = p.scale;
  return (
    <>
      <TopBar p={p} />
      <div style={{ flex: 1, display: 'flex', gap: u * 2 }}>
        <StripColumn share={STRIP_COLUMNS.hero}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: u * 2 }}>
            <Hero p={p} stacked />
            <AlertBand p={p} />
            <NowcastStrip p={p} />
            {p.config.showStatRail !== false && <StatRailVertical p={p} style={{ marginTop: 'auto' }} />}
          </div>
        </StripColumn>
        <StripColumn share={STRIP_COLUMNS.hours}>
          <HourlyRows p={p} narrow />
        </StripColumn>
        <StripColumn share={STRIP_COLUMNS.days}>
          <DayTallBands p={p} />
        </StripColumn>
      </div>
    </>
  );
}

/** A column of the strip: its share of the width, measured by the fit loop. */
function StripColumn({ share, children }: { share: number; children: React.ReactNode }) {
  return (
    <div {...{ [FIT_MEASURE_ATTR]: '' }} style={{
      flex: `${share * 100} 0 0%`, minWidth: 0,
      display: 'flex', flexDirection: 'column',
    }}>{children}</div>
  );
}

/**
 * Landscape stacks the ribbon over the day list, so in a box three times as
 * wide as it is tall the box's height bounds both and most of the width is
 * a bar with nothing on it. Here the three parts stand side by side, each
 * with the whole height: the hero, then the hours (the ribbon, taking the
 * slack, over the stat rail as a row of cells), then the days. Left to right
 * is now to later.
 */
function PanoramaStrip({ p }: { p: WeatherViewProps }) {
  const { u } = p.scale;
  return (
    <>
      <TopBar p={p} />
      <div style={{ flex: 1, display: 'flex', gap: u * 2 }}>
        <StripColumn share={STRIP_COLUMNS.hero}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: u * 2 }}>
            <Hero p={p} wide />
            <AlertBand p={p} />
            <NowcastStrip p={p} />
          </div>
        </StripColumn>
        <StripColumn share={STRIP_COLUMNS.hours}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: u * 2 }}>
            {p.config.showRibbon !== false && <TempRibbon p={p} strip />}
            {p.config.showStatRail !== false && <StatRail p={p} fill />}
          </div>
        </StripColumn>
        <StripColumn share={STRIP_COLUMNS.days}>
          <DayRangeBars p={p} />
        </StripColumn>
      </div>
    </>
  );
}

function PanoramaPortrait({ p }: { p: WeatherViewProps }) {
  return (
    <>
      <TopBar p={p} />
      <Hero p={p} />
      <AlertBand p={p} />
      <NowcastStrip p={p} />
      {p.config.showRibbon !== false && <TempRibbon p={p} />}
      <DayRangeBars p={p} />
      {p.config.showStatRail !== false && <StatRail p={p} />}
    </>
  );
}

function PanoramaLandscape({ p }: { p: WeatherViewProps }) {
  const { u } = p.scale;
  return (
    <>
      <TopBar p={p} />
      {/*
        No `min-height: 0` on this row, deliberately. A collapsed flex child
        renders smaller than its content without growing `scrollHeight`, which
        hides the overflow from `useFitScale` entirely — the failure mode that
        cost two rounds of bugs in the portrait pass. Leaving `min-height` at
        its `auto` default floors the row at its content and keeps overflow
        visible to the fit loop.
      */}
      <div style={{ flex: 1, display: 'flex', gap: u * 2 }}>
        {/*
          Both columns are measured by the fit loop (`FIT_MEASURE_ATTR`). The
          left one is fixed-width and the hero is all type: above a certain
          typography size the temperature and its icon are wider than the
          column and render over the ribbon, and nothing about the stack's
          own overflow changes when they do.
        */}
        <div {...{ [FIT_MEASURE_ATTR]: '' }} style={{
          width: `${LANDSCAPE_LEFT_FRACTION * 100}%`, flex: 'none',
          display: 'flex', flexDirection: 'column', gap: u * 2,
        }}>
          <Hero p={p} />
          <AlertBand p={p} />
          <NowcastStrip p={p} />
          {p.config.showStatRail !== false && <StatRailVertical p={p} />}
        </div>
        <div {...{ [FIT_MEASURE_ATTR]: '' }} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: u * 2 }}>
          {p.config.showRibbon !== false && <TempRibbon p={p} />}
          <DayRangeBars p={p} />
        </div>
      </div>
    </>
  );
}

/**
 * Current temperature, condition icon, and today's supporting line.
 *
 * Portrait sets the text against the icon across the full width. Landscape
 * pairs them on one line inside the narrow column and takes `flex: 1`, so the
 * hero is what absorbs whatever the alert, nowcast, and stat rail leave — the
 * left column is the only part of the layout with slack.
 */
function Hero({ p, wide, stacked }: { p: WeatherViewProps; wide?: boolean; stacked?: boolean }) {
  const { s, u } = p.scale;
  // The strip's hero column is the landscape hero whatever the box's shape;
  // `stacked` is its portrait-strip form, temperature over icon in a column
  // a third of the wall wide, sized between the two.
  const landscape = stacked ? true : (wide ?? p.scale.orientation === 'landscape');
  const now = p.hourly[0];
  const today = p.forecast[0];
  const Icon = getWeatherIcon(now?.icon ?? 'thermometer', 'outline');

  const temp = (
    <div data-testid="fsw-hero-temp" style={{
      fontSize: landscape ? s * 17 : s * 20,
      lineHeight: .84, fontWeight: 200, letterSpacing: '-.055em',
    }}>
      {now ? Math.round(now.temp) : '--'}
      <span style={{ fontSize: '.38em', verticalAlign: 'baseline', position: 'relative', top: '-1.02em', marginLeft: '-.04em', opacity: .38 }}>°</span>
    </div>
  );

  const art = (
    <div data-testid="fsw-hero-art" style={{
      flex: 'none', width: landscape ? s * 18 : s * 26, height: landscape ? s * 18 : s * 26,
      display: 'grid', placeItems: 'center', position: 'relative',
    }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', filter: `blur(${s * 3.2}px)`, opacity: .5, background: p.accent }} />
      <Icon style={{ width: landscape ? s * 13 : s * 18, height: landscape ? s * 13 : s * 18, position: 'relative' }} strokeWidth={.85} />
    </div>
  );

  const caption = (
    <div>
      <div style={{ fontSize: landscape ? s * 3.2 : s * 3.6, fontWeight: 500, letterSpacing: '-.02em', marginTop: landscape ? u * 1.2 : u * 2 }}>
        {now?.description ?? ''}
      </div>
      <div style={{ fontSize: s * 2.1, color: 'var(--fsw-text-2)', marginTop: u, display: 'flex', gap: stacked ? u * .5 : u * 1.4, flexDirection: stacked ? 'column' : 'row' }}>
        {now?.feelsLike != null && <span>{p.t('fullscreen-weather.feelsLike', { temp: Math.round(now.feelsLike) })}</span>}
        {today && !stacked && <span style={{ opacity: .4 }}>·</span>}
        {today && <span>{`H ${Math.round(today.high)}°  L ${Math.round(today.low)}°`}</span>}
      </div>
    </div>
  );

  if (stacked) {
    return (
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: `${u * .6}px ${u * .4}px 0` }}>
        {temp}
        <div style={{ marginTop: u * 1.2 }}>{art}</div>
        {caption}
      </div>
    );
  }

  if (landscape) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: u * 1.6 }}>
          {temp}
          {art}
        </div>
        {caption}
      </div>
    );
  }

  return (
    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: u * 2.4 }}>
      <div>
        {temp}
        {caption}
      </div>
      {art}
    </div>
  );
}

/** Minute-by-minute precipitation for the next hour. Pirate Weather only today. */
function NowcastStrip({ p }: { p: WeatherViewProps }) {
  const { s, u } = p.scale;
  if (p.config.showNowcast === false) return null;
  const verdict = nowcastVerdict(p.minutely, p.units, p.t);
  // No minutely payload at all means the provider does not offer it — the
  // section omits itself rather than showing an empty state on the wall.
  if (!verdict) return null;

  return (
    <Card u={u} style={{ flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: u, marginBottom: u * 1.3 }}>
        <Label s={s}>{p.t('fullscreen-weather.sections.nextHour')}</Label>
        <div style={{ fontSize: s * 1.8, fontWeight: 600, letterSpacing: '-.01em', textAlign: 'right' }}>{verdict.text}</div>
      </div>
      <div style={{ height: u * 7, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        {verdict.series.map((v, i) => (
          <div key={i} style={{
            flex: 1, minHeight: 2, height: Math.max(2, v * u * 7),
            borderRadius: '3px 3px 1px 1px',
            background: v > .6 ? 'rgba(29,78,216,.95)' : v > .3 ? 'rgba(56,189,248,.9)' : 'rgba(125,211,252,.75)',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: u * .9, fontSize: s * 1.25, color: 'var(--fsw-text-3)', fontWeight: 500 }}>
        <span>{p.t('fullscreen-weather.nowcast.now')}</span>
        {[15, 30, 45, 60].map((n) => <span key={n}>{p.t('fullscreen-weather.nowcast.minutes', { n })}</span>)}
      </div>
    </Card>
  );
}

/**
 * 48-hour temperature spline with precipitation bars under the baseline,
 * night shading, day dividers, and sunrise/sunset markers.
 *
 * Providers disagree on horizon (24h at 3h steps on OpenWeatherMap, 48h at 1h
 * on most others, ~156h on NOAA), so the ribbon draws whatever it was given
 * and labels the span rather than assuming 48 points exist.
 */
function TempRibbon({ p, strip = false }: { p: WeatherViewProps; strip?: boolean }) {
  const { s, u } = p.scale;
  const landscape = p.scale.orientation === 'landscape';
  // Gradient ids are document-global; namespace them so two instances in one
  // document (editor preview beside a background mount) do not cross-reference.
  const uid = useId();
  const tempGradId = `${uid}-temp`;
  const areaGradId = `${uid}-area`;
  // The strip's chart is measured, not reconstructed (see the geometry note).
  const [chartRef, chartBox] = useElementBox<HTMLDivElement>();
  const hrs = p.hourly.slice(0, 48);
  if (hrs.length < 2) return null;

  // ── Geometry ──────────────────────────────────────────────────────────
  // Everything below lives in viewBox units. `s` is CSS pixels and must never
  // leak in here: the SVG is scaled to the card, so a px value means a
  // different size at every typography setting. Mixing them made the hi/lo
  // callout balloon to 40 units against 13-unit axis labels and pushed its
  // baseline above y=0, where the card clipped it.
  const W = 964;

  // The rendered box and the viewBox are given the same aspect, so
  // `preserveAspectRatio="none"` scales x and y equally and text is not
  // stretched. That means reconstructing the card's own width from the
  // canvas and card padding, and in landscape the card sits in the
  // right-hand column rather than spanning the canvas; in the strip, in the
  // middle one of three.
  const contentW = p.scale.width - u * CANVAS_PAD_X_U * 2;
  const cardOuterW = strip
    ? (contentW - u * 4) * STRIP_COLUMNS.hours
    : landscape
      ? (contentW - u * 2) * (1 - LANDSCAPE_LEFT_FRACTION)
      : contentW;
  const authoredW = Math.max(120, cardOuterW - u * CARD_PAD_X_U * 2);
  const authoredH = Math.max(60, u * (strip ? 36 : landscape ? 30 : 27));

  // Portrait and landscape give the chart a fixed height and let a
  // neighbour take the column's slack. In the strip the chart is the tallest
  // thing in its column and the most informative, so it takes the slack
  // itself: the card grows, the chart box fills it, and its viewBox follows
  // the measured box. Measuring is safe here because nothing in the layout
  // depends on the viewBox, so the fit loop's probes are not disturbed; the
  // authored size stands in until the first measurement lands.
  const measured = strip && chartBox.width > 0 && chartBox.height > 0;
  const renderedW = measured ? chartBox.width : authoredW;
  const renderedH = measured ? chartBox.height : authoredH;
  const VH = Math.round((W * renderedH) / renderedW);

  /** Floors for the two data bands, in viewBox units. */
  const PB_MIN = 22;                                     // precip band
  const CH_MIN = 40;                                     // temperature band

  /**
   * Typography ratio, dimensionless. 1.0 at `medium`; this is what SVG text
   * scales by.
   *
   * Clamped, because the two are pulled in opposite directions: the r-scaled
   * bands (headroom + hour labels) grow with the typography setting while `VH`
   * *shrinks*, since `renderedH` follows `u` and the fit loop shrinks `u` as
   * type grows. At 4x-large in landscape that left VH=93 against bands wanting
   * 122, so `CH` and `PB` bottomed out on their floors and the temperature
   * band simply ran past them into the hour labels — all eight of them sat on
   * the curve, and nothing in the layout overflowed for the fit loop to catch.
   *
   * So `r` may not exceed what the box can actually seat: the floors are not
   * negotiable, and the r-scaled parts get what is left.
   */
  const rMax = (VH - CH_MIN - PB_MIN) / (26 + 20);
  const r = Math.max(0.45, Math.min(s / p.scale.bu, rMax));

  const TOP = 26 * r;                                    // markers + callout headroom
  const AXIS = 20 * r;                                   // hour labels
  const PB = Math.max(PB_MIN, (VH - TOP - AXIS) * 0.24);
  const CH = Math.max(CH_MIN, VH - TOP - AXIS - PB);
  const PAD = 10;

  const N = hrs.length;
  const temps = hrs.map((h) => h.temp);
  const mn = Math.min(...temps) - 3;
  const mx = Math.max(...temps) + 3;
  const range = mx - mn || 1;
  const step = (W - PAD * 2) / Math.max(1, N - 1);
  const x = (i: number) => PAD + i * step;
  const y = (t: number) => TOP + CH - ((t - mn) / range) * (CH - 8);
  const baseline = TOP + CH;

  const pts = hrs.map((h, i) => [x(i), y(h.temp)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${x(N - 1)},${baseline} L${x(0)},${baseline} Z`;
  const stops = hrs.map((h, i) => (
    <stop key={i} offset={`${((i / Math.max(1, N - 1)) * 100).toFixed(1)}%`} stopColor={tempColor(h.temp, p.units)} />
  ));

  const meta = hrs.map((h) => {
    const hour = tzHour(hourlyInstant(h), p.timezone);
    return { hour, isNight: isNightHour(hour, p.sun) };
  });

  const hiI = temps.indexOf(Math.max(...temps));
  const loI = temps.indexOf(Math.min(...temps));
  const labelPx = 15 * r;
  const labelGap = 7 * r;
  /**
   * Callout placement. Above the point when there is room, below it otherwise —
   * the hottest hour sits near the top of the band, so a fixed upward offset
   * puts its label outside the viewBox and the card clips it.
   *
   * An extreme at either end is labelled, not skipped: on a falling evening
   * the warmest hour of the run is "now", and skipping it left the ribbon
   * with a low and no high. Like the hour ticks, an end label is anchored
   * inward so it cannot hang past the viewBox, and at the start it also
   * steps past the now marker.
   */
  const callout = (i: number) => {
    const above = y(temps[i]) - labelGap;
    const fitsAbove = above - labelPx * 0.8 >= 0;
    const ty = fitsAbove ? above : Math.min(baseline - 2, y(temps[i]) + labelGap + labelPx * 0.85);
    const atStart = x(i) < W * 0.05;
    const atEnd = x(i) > W * 0.95;
    const anchor = atStart ? 'start' : atEnd ? 'end' : 'middle';
    const tx = atStart ? x(i) + 9 * r : x(i);
    return (
      <text x={tx} y={ty} fontSize={labelPx} fontWeight={600} fill="var(--fsw-text)" textAnchor={anchor}>
        {Math.round(temps[i])}&deg;
      </text>
    );
  };


  return (
    <Card u={u} testId="fsw-ribbon" style={{
      // The chart takes the column's slack ahead of the stats card (a grow
      // of 999 against its 1), but a chart is a landscape thing: its share
      // is capped at a landscape proportion of its own width, and only
      // what is left past the cap reaches the stats card.
      flex: strip ? '999 1 0%' : 'none', display: 'flex', flexDirection: 'column',
      maxHeight: strip ? authoredW * 0.75 : undefined,
    }}>
      <PrecipLegendHeader p={p} hours={spanHours(hrs)} style={{ marginBottom: u * .6, flex: 'none' }} />
      {/* The chart floors at half its authored height so the fit loop can
          see a column too short to hold a chart at all. */}
      <div ref={chartRef} style={strip ? { flex: '1 1 0%', minHeight: authoredH / 2, position: 'relative' } : { flex: 'none', height: renderedH, position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${VH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' }}>
        <defs>
          <linearGradient id={tempGradId} x1="0" x2="1">{stops}</linearGradient>
          <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--fsw-text)" stopOpacity=".16" />
            <stop offset="100%" stopColor="var(--fsw-text)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {meta.map((m, i) => m.isNight ? (
          <rect key={`n${i}`} x={x(i) - step / 2} y={0} width={step} height={baseline + PB} fill="var(--fsw-text)" opacity={0.045} />
        ) : null)}

        {meta.map((m, i) => {
          if (i === 0) return null;
          const prev = meta[i - 1];
          if (prev.isNight && !m.isNight) {
            return <g key={`sr${i}`}><line x1={x(i)} y1={TOP * .6} x2={x(i)} y2={baseline} stroke="#f59e0b" strokeWidth={1.5} opacity=".55" /><circle cx={x(i)} cy={TOP * .6} r={5 * r} fill="#f59e0b" /></g>;
          }
          if (!prev.isNight && m.isNight) {
            return <g key={`ss${i}`}><line x1={x(i)} y1={TOP * .6} x2={x(i)} y2={baseline} stroke="#6366f1" strokeWidth={1.5} opacity=".55" /><circle cx={x(i)} cy={TOP * .6} r={5 * r} fill="#6366f1" /></g>;
          }
          return null;
        })}

        <path d={area} fill={`url(#${areaGradId})`} />
        <path d={line} fill="none" stroke={`url(#${tempGradId})`} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />

        {hrs.map((h, i) => {
          const pop = (h.precipProbability ?? 0) / 100;
          if (pop * 100 < HOURLY_RAIN_SHOWN_PCT) return null;
          const bw = step * 0.62;
          return <rect key={`p${i}`} x={x(i) - bw / 2} y={baseline + 4} width={bw} height={Math.max(2, pop * (PB - 8))} rx={2.5} fill="#38bdf8" opacity={0.35 + pop * 0.6} />;
        })}

        {meta.map((m, i) => {
          if (i % Math.max(1, Math.round(N / 8)) !== 0) return null;
          // A centred label at either end hangs half its width outside the
          // viewBox and the card clips it ("10a" rendered as "0a"). Anchor the
          // outermost ticks inward instead.
          const atStart = x(i) < W * 0.05;
          const atEnd = x(i) > W * 0.95;
          const anchor = atStart ? 'start' : atEnd ? 'end' : 'middle';
          const tx = atStart ? 2 : atEnd ? W - 2 : x(i);
          return (
            <text key={`a${i}`} x={tx} y={VH - AXIS * .25} fontSize={13 * r} fontWeight={500} fill="var(--fsw-text-3)" textAnchor={anchor}>
              {hourLabel(Math.floor(m.hour), p.timeFormat)}
            </text>
          );
        })}

        {callout(hiI)}
        {callout(loI)}

        <line x1={x(0)} y1={TOP * .5} x2={x(0)} y2={baseline + PB} stroke={p.accent} strokeWidth={2.5} opacity=".9" />
        <circle cx={x(0)} cy={y(temps[0])} r={6.5 * r} fill={p.accent} stroke="var(--fsw-surface)" strokeWidth={3 * r} />
      </svg>
      </div>
    </Card>
  );
}

interface StatCell {
  icon: typeof Wind;
  key: string;
  value: string;
}

/** Wind / humidity / UV / pressure / sunset. Each cell drops out when unavailable. */
function statCells(p: WeatherViewProps): StatCell[] {
  const now = p.hourly[0];
  if (!now) return [];

  const windUnit = windUnitLabel(p.units);
  const cells: StatCell[] = [];
  if (now.windSpeed != null) cells.push({ icon: Wind, key: p.t('fullscreen-weather.stats.wind'), value: `${Math.round(now.windSpeed)} ${windUnit}` });
  if (now.humidity != null) cells.push({ icon: Droplets, key: p.t('fullscreen-weather.stats.humidity'), value: `${Math.round(now.humidity)}%` });
  if (now.uvIndex != null) cells.push({ icon: Sun, key: p.t('fullscreen-weather.stats.uv'), value: String(now.uvIndex) });
  if (now.pressure != null) cells.push({ icon: Gauge, key: p.t('fullscreen-weather.stats.pressure'), value: String(Math.round(now.pressure)) });
  if (p.sun.sunset) {
    cells.push({
      icon: Sunset,
      key: p.t('fullscreen-weather.stats.sunset'),
      value: new Intl.DateTimeFormat(p.locale, { hour: 'numeric', minute: '2-digit', timeZone: p.timezone }).format(p.sun.sunset),
    });
  }
  return cells;
}

/**
 * Portrait: one strip across the foot of the stack. The strip arrangement
 * seats it under the ribbon, where it takes the column's slack (`fill`)
 * with its cells centred in whatever height that leaves.
 */
function StatRail({ p, fill }: { p: WeatherViewProps; fill?: boolean }) {
  const { s, u } = p.scale;
  const cells = statCells(p);
  if (cells.length === 0) return null;

  return (
    <Card u={u} testId="fsw-stat-rail" style={{
      flex: fill ? '1 1 auto' : 'none', alignContent: 'center',
      display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, padding: `${u * 2}px 0`,
    }}>
      {cells.map((c, i) => {
        const Ico = c.icon;
        return (
          <div key={c.key} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: u * .8,
            borderRight: i === cells.length - 1 ? 0 : '1px solid var(--fsw-border-sub)',
          }}>
            <Ico style={{ width: s * 2.5, height: s * 2.5, color: 'var(--fsw-text-3)' }} strokeWidth={1.6} />
            <div style={{ fontSize: s * 2.6, fontWeight: 600, letterSpacing: '-.02em' }}>{c.value}</div>
            <div style={{ fontSize: s * 1.15, fontWeight: 600, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--fsw-text-3)' }}>{c.key}</div>
          </div>
        );
      })}
    </Card>
  );
}

/**
 * Landscape: the same cells as a column in the left rail.
 *
 * The bottom strip works on a wide canvas, but it leaves the narrow column
 * hollow whenever there is no alert and no nowcast — which is most of the
 * time, since only Pirate Weather returns minutely data. Standing the rail up
 * gives the column a floor it can always fill and hands the full height of the
 * wide column to the charts.
 */
function StatRailVertical({ p, style }: { p: WeatherViewProps; style?: React.CSSProperties }) {
  const { s, u } = p.scale;
  const cells = statCells(p);
  if (cells.length === 0) return null;

  return (
    <Card u={u} testId="fsw-stat-rail" style={{ flex: 'none', padding: `${u * .6}px ${u * 2.3}px`, ...style }}>
      {cells.map((c, i) => {
        const Ico = c.icon;
        return (
          <div key={c.key} style={{
            display: 'flex', alignItems: 'center', gap: u * 1.6, padding: `${u * 1.35}px 0`,
            borderBottom: i === cells.length - 1 ? 0 : '1px solid var(--fsw-border-sub)',
          }}>
            <Ico style={{ width: s * 2.3, height: s * 2.3, color: 'var(--fsw-text-3)', flex: 'none' }} strokeWidth={1.6} />
            <div style={{ fontSize: s * 1.15, fontWeight: 600, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--fsw-text-3)' }}>{c.key}</div>
            <div style={{ marginLeft: 'auto', fontSize: s * 2.4, fontWeight: 600, letterSpacing: '-.02em', whiteSpace: 'nowrap' }}>{c.value}</div>
          </div>
        );
      })}
    </Card>
  );
}
