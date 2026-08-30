'use client';

import { useId } from 'react';
import SunCalc from 'suncalc';
import { getWeatherIcon } from '@/lib/weather-icons';
import type { WeatherViewProps } from './weather-view-utils';
import { windUnitLabel } from '@/lib/weather/units';
import { hourLabel, smoothPath, tzHour, hourlyInstant, hoursWithin, HOURLY_RAIN_SHOWN_PCT } from './weather-view-utils';
import { tempColor } from './temp-ramp';
import { Card, Label, TopBar, AlertBand, MiniHero } from './weather-parts';

/** Every bento card takes its placement from the caller, not from itself. */
interface CardProps {
  p: WeatherViewProps;
  /** Grid spans in portrait, flex weights in landscape. */
  place: React.CSSProperties;
}

/**
 * Instrument bento. Every card self-hides when its field is undefined, because
 * field coverage varies sharply by provider (visibility is NOAA-only, dew point
 * is NOAA / Open-Meteo / Met Office, UV is Pirate Weather / Met Office /
 * WeatherAPI / Open-Meteo). See the provider matrix in the design spec.
 */
export default function AlmanacView(p: WeatherViewProps) {
  const { u } = p.scale;
  const now = p.hourly[0];
  const landscape = p.scale.orientation === 'landscape';

  // Which readout cards have data varies by provider, so the count is 0-5.
  const present: Array<{ key: string; Comp: (props: CardProps) => React.ReactElement }> = [];
  if (now?.windSpeed != null) present.push({ key: 'wind', Comp: WindCard });
  if (now?.humidity != null) present.push({ key: 'humidity', Comp: HumidityCard });
  if (now?.pressure != null) present.push({ key: 'pressure', Comp: PressureCard });
  if (now?.uvIndex != null) present.push({ key: 'uv', Comp: UVCard });
  if (now?.visibility != null) present.push({ key: 'visibility', Comp: VisibilityCard });

  const gridGap = u * 1.5;

  if (landscape) {
    return (
      <>
        <TopBar p={p} />
        <MiniHero p={p} />
        <AlertBand p={p} />
        {/*
          Two rows, not five.
          The portrait grid needs roughly 1500px of height; a 1080-tall canvas
          has ~730px left after the top bar, mini hero, and alert band, and the
          `minmax(min-content, ...)` row floors that keep the portrait cards
          from overlapping mean `useFitScale` can never claw that back — the
          bisection correctly reports a hard floor taller than the box. So
          landscape re-orders rather than rescales.

          Flex rows also retire the span arithmetic: a row of `flex: 1`
          children cannot leave the hole that a partly-filled grid row does, so
          the "how many readouts did this provider give us?" tail-span
          computation below applies to portrait only.
        */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: gridGap }}>
          <div style={{ flex: 1.15, display: 'flex', gap: gridGap }}>
            <SunCard p={p} place={{ flex: 4 }} />
            <MoonCard p={p} place={{ flex: 3 }} />
            <Next12Card p={p} place={{ flex: 5 }} />
          </div>
          {present.length > 0 && (
            <div style={{ flex: .85, display: 'flex', gap: gridGap }}>
              {present.map(({ key, Comp }) => <Comp key={key} p={p} place={{ flex: 1 }} />)}
            </div>
          )}
        </div>
      </>
    );
  }

  // Lay them 3-per-row (span 2), then widen the final row's cards so a
  // provider with 4 or 5 of them doesn't leave a visible hole.
  const rowCount = Math.ceil(present.length / 3);
  const tailSize = present.length - (rowCount - 1) * 3;
  const smallCards = present.map((c, i) => ({
    ...c,
    span: i >= (rowCount - 1) * 3 ? Math.floor(6 / tailSize) : 2,
  }));
  const smallRows = Array.from({ length: rowCount });

  // `fr` rows shrink below their content, so at large type the cards spilled
  // out of their grid areas and overlapped the row beneath — and because the
  // grid never grew, the shrink-to-fit measurement upstream saw nothing wrong.
  // `min-content` floors are derived from what the cards actually contain, so
  // the grid grows, the flex parent (min-height:auto) grows with it, and the
  // fit loop finally has an overflow to respond to. Hand-picked pixel floors
  // were tried first and were simply wrong at 4x-large.
  return (
    <>
      <TopBar p={p} />
      <MiniHero p={p} />
      <AlertBand p={p} />
      <div style={{
        flex: 1, display: 'grid', gap: gridGap,
        gridTemplateColumns: 'repeat(6, 1fr)',
        // The two hero cards carry drawings and earn the height; the readouts
        // are a number and a line, so equal rows left them stranded at the
        // bottom of a mostly empty cell.
        gridTemplateRows: [
          'minmax(min-content, 1fr)',
          'minmax(min-content, 1fr)',
          ...smallRows.map(() => 'minmax(min-content, .95fr)'),
          'minmax(min-content, .9fr)',
        ].join(' '),
      }}>
        <SunCard p={p} place={{ gridColumn: 'span 3', gridRow: 'span 2' }} />
        <MoonCard p={p} place={{ gridColumn: 'span 3', gridRow: 'span 2' }} />
        {smallCards.map(({ key, Comp, span }) => (
          <Comp key={key} p={p} place={{ gridColumn: `span ${span}` }} />
        ))}
        <Next12Card p={p} place={{ gridColumn: 'span 6' }} />
      </div>
    </>
  );
}

function Big({ children, s }: { children: React.ReactNode; s: number }) {
  return <div style={{ fontSize: s * 4.8, fontWeight: 250, letterSpacing: '-.035em', lineHeight: 1 }}>{children}</div>;
}
function Note({ children, s, u }: { children: React.ReactNode; s: number; u: number }) {
  return <div style={{ fontSize: s * 1.45, color: 'var(--fsw-text-2)', marginTop: u * .85, lineHeight: 1.45 }}>{children}</div>;
}
const Unit = ({ children, s }: { children: React.ReactNode; s: number }) => (
  <span style={{ fontSize: s * 2.2, fontWeight: 400, color: 'var(--fsw-text-3)', marginLeft: s * .12 }}>{children}</span>
);

/**
 * The readout body: the value block, taking whatever slack the card has.
 *
 * Portrait cards are short and wide, so the value sits at the bottom of that
 * slack — what `margin-top: auto` used to do. Landscape cards are close to
 * square, and bottom-aligning there strands the number under a field of
 * nothing.
 *
 * Landscape therefore top-aligns instead of centring. Centring looks right
 * card-by-card but breaks the row: these cards carry different trailing art
 * (a bar, a sparkline, nothing at all), so a centred value lands at a
 * different height in every one. Top-aligning puts every number on the same
 * baseline and settles the art against the card floor.
 */
function Readout({ p, children }: { p: WeatherViewProps; children: React.ReactNode }) {
  const { u } = p.scale;
  const landscape = p.scale.orientation === 'landscape';
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      justifyContent: landscape ? 'flex-start' : 'flex-end',
      marginTop: landscape ? u * 1.4 : 0,
    }}>{children}</div>
  );
}

function SunCard({ p, place }: CardProps) {
  const { s, u } = p.scale;
  const gradId = `${useId()}-sun`;
  // No sunrise today means polar day or night: the arc has nothing to mark.
  const hasArc = p.sun.sunrise != null && p.sun.sunset != null;
  const W = 460;
  const H = 250;
  const { sunriseHour, sunsetHour } = p.sun;
  const dayLen = sunsetHour - sunriseHour;
  const nowHour = tzHour(p.now, p.timezone);
  const prog = dayLen <= 0 ? 0 : Math.max(0, Math.min(1, (nowHour - sunriseHour) / dayLen));
  const ax = (t: number) => 34 + t * (W - 68);
  const ay = (t: number) => H - 34 - Math.sin(t * Math.PI) * (H - 78);
  const arc = smoothPath(Array.from({ length: 41 }, (_, i) => [ax(i / 40), ay(i / 40)] as [number, number]));
  const fmt = (d: Date | null) => d ? new Intl.DateTimeFormat(p.locale, { hour: 'numeric', minute: '2-digit', timeZone: p.timezone }).format(d) : '--';
  const hours = Math.floor(p.sun.dayLengthMs / 3600000);
  const mins = Math.round((p.sun.dayLengthMs % 3600000) / 60000);

  return (
    <Card u={u} testId="fsw-card" style={{ ...place, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.sun')}</Label>
      <div style={{ marginTop: u * 1.3 }}>
        <Big s={s}>{hours}<Unit s={s}>h</Unit> {mins}<Unit s={s}>m</Unit></Big>
        <Note s={s} u={u}>{p.t('fullscreen-weather.cards.daylight')}</Note>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: '100%' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradId} x1="0" x2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity=".22" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity=".22" />
          </linearGradient>
        </defs>
        <line x1={18} y1={H - 34} x2={W - 34} y2={H - 34} stroke="var(--fsw-border)" strokeWidth={1.5} strokeDasharray="4 6" />
        <path d={arc} fill="none" stroke={`url(#${gradId})`} strokeWidth={4} strokeLinecap="round" />
        {hasArc && (
          <>
            <circle cx={ax(prog)} cy={ay(prog)} r={22} fill="#fbbf24" opacity=".20" />
            <circle cx={ax(prog)} cy={ay(prog)} r={11} fill="#fbbf24" />
          </>
        )}
        <text x={18} y={H - 6} fontSize={15} fontWeight={600} fill="var(--fsw-text-3)">{fmt(p.sun.sunrise)}</text>
        <text x={W - 18} y={H - 6} fontSize={15} fontWeight={600} fill="var(--fsw-text-3)" textAnchor="end">{fmt(p.sun.sunset)}</text>
      </svg>
      </div>
    </Card>
  );
}

function MoonCard({ p, place }: CardProps) {
  const { s, u } = p.scale;
  const illum = SunCalc.getMoonIllumination(p.now);
  const pct = Math.round(illum.fraction * 100);
  const phaseKey = phaseNameKey(illum.phase);

  // Terminator geometry. `c` runs +1 (new) -> 0 (quarter) -> -1 (full).
  // Render = lit disc, then a dark half on the unlit limb, then an ellipse of
  // width |c|*R that is dark for a crescent (c > 0) and lit for a gibbous
  // (c < 0). Verified at all four quarters plus both crescents.
  const c = Math.cos(2 * Math.PI * illum.phase);
  const waxing = illum.phase < 0.5;
  const uid = useId();
  const clipId = `${uid}-moon-clip`;
  const gradId = `${uid}-moon-grad`;
  const R = 62;
  const DARK = '#39404e';
  const LIT = `url(#${gradId})`;

  return (
    <Card u={u} testId="fsw-card" style={{ ...place, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.moon')}</Label>
      <div style={{ marginTop: s * 1.3 }}>
        <div style={{ fontSize: s * 3.5, fontWeight: 250, letterSpacing: '-.03em', lineHeight: 1.1 }}>
          {p.t(`fullscreen-weather.moon.${phaseKey}`)}
        </div>
        <Note s={s} u={u}>{p.t('fullscreen-weather.moon.illuminated', { percent: pct })}</Note>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        <svg viewBox="0 0 150 150" style={{ width: u * 23, maxWidth: '100%', maxHeight: '100%' }}>
          <defs>
            <clipPath id={clipId}><circle cx="75" cy="75" r="62" /></clipPath>
            <radialGradient id={gradId} gradientUnits="userSpaceOnUse" cx="52" cy="48" r="96">
              <stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#cbd5e1" />
            </radialGradient>
          </defs>
          <circle cx="75" cy="75" r="72" fill={p.accent} opacity=".10" />
          <circle cx="75" cy="75" r="62" fill={DARK} />
          <g clipPath={`url(#${clipId})`}>
            <circle cx="75" cy="75" r={R} fill={LIT} />
            <circle cx={waxing ? 75 - R : 75 + R} cy="75" r={R} fill={DARK} />
            <ellipse cx="75" cy="75" rx={Math.abs(c) * R} ry={R} fill={c > 0 ? DARK : LIT} />
          </g>
          <circle cx="75" cy="75" r="62" fill="none" stroke="var(--fsw-border)" strokeWidth={1.5} />
        </svg>
      </div>
    </Card>
  );
}

function phaseNameKey(phase: number): string {
  if (phase < 0.03 || phase > 0.97) return 'new';
  if (phase < 0.22) return 'waxingCrescent';
  if (phase < 0.28) return 'firstQuarter';
  if (phase < 0.47) return 'waxingGibbous';
  if (phase < 0.53) return 'full';
  if (phase < 0.72) return 'waningGibbous';
  if (phase < 0.78) return 'lastQuarter';
  return 'waningCrescent';
}

function WindCard({ p, place }: CardProps) {
  const { s, u } = p.scale;
  const now = p.hourly[0];
  const unit = windUnitLabel(p.units);
  return (
    <Card u={u} testId="fsw-card" style={{ ...place, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.wind')}</Label>
      <Readout p={p}>
        <Big s={s}>{Math.round(now!.windSpeed!)}<Unit s={s}>{unit}</Unit></Big>
        <Note s={s} u={u}>{p.t('fullscreen-weather.cards.windNote')}</Note>
      </Readout>
    </Card>
  );
}

function HumidityCard({ p, place }: CardProps) {
  const { s, u } = p.scale;
  const now = p.hourly[0]!;
  const pctOn = Math.round((now.humidity! / 100) * 20);
  return (
    <Card u={u} testId="fsw-card" style={{ ...place, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.humidity')}</Label>
      <Readout p={p}>
        <Big s={s}>{Math.round(now.humidity!)}%</Big>
        {now.dewPoint != null && <Note s={s} u={u}>{p.t('fullscreen-weather.cards.dewPoint', { temp: Math.round(now.dewPoint) })}</Note>}
      </Readout>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: u * 5, marginTop: u * 1.3, flex: 'none' }}>
        {Array.from({ length: 20 }, (_, i) => (
          <i key={i} style={{
            flex: 1, display: 'block', borderRadius: 3,
            height: `${45 + Math.abs(Math.sin(i / 3)) * 55}%`,
            background: i < pctOn ? p.accent : 'var(--fsw-surface-alt)',
          }} />
        ))}
      </div>
    </Card>
  );
}

function PressureCard({ p, place }: CardProps) {
  const { s, u } = p.scale;
  const series = hoursWithin(p.hourly, 12).map((h) => h.pressure).filter((v): v is number => v != null);
  const now = p.hourly[0]!;
  const mn = Math.min(...series);
  const mx = Math.max(...series);
  const pts = series.map((v, i) => [i * (300 / Math.max(1, series.length - 1)), 70 - ((v - mn) / (mx - mn || 1)) * 56] as [number, number]);
  const trend = series.length > 1 ? series[series.length - 1] - series[0] : 0;

  return (
    <Card u={u} testId="fsw-card" style={{ ...place, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.pressure')}</Label>
      <Readout p={p}>
        <Big s={s}>{Math.round(now.pressure!)}<Unit s={s}>hPa</Unit></Big>
        <Note s={s} u={u}>{p.t(trend < -1 ? 'fullscreen-weather.cards.pressureFalling' : trend > 1 ? 'fullscreen-weather.cards.pressureRising' : 'fullscreen-weather.cards.pressureSteady')}</Note>
      </Readout>
      {pts.length > 1 && (() => {
        /*
          An `svg` with a viewBox and no height takes its height from its
          width — here `width: 100%` of the card — so this sparkline claimed
          cardWidth * 80/300 of vertical space that no amount of `s`/`u`
          shrinking could reclaim. On a wide, short module (1880x560) that was
          ~99px of a ~130px card: the fit loop bottomed out at MIN_FACTOR and
          the readout row was still clipped at the module edge. Every other
          chart here already states its height and stretches to it; this was
          the outlier.
        */
        const last = pts[pts.length - 1];
        const dot = Math.max(5, u * .9);
        return (
          <div style={{ position: 'relative', marginTop: u * .8, flex: 'none' }}>
            <svg
              viewBox="0 0 300 80"
              preserveAspectRatio="none"
              style={{ display: 'block', width: '100%', height: u * 5 }}
            >
              <path
                d={smoothPath(pts)} fill="none" stroke={p.accent}
                strokeWidth={Math.max(2, u * .3)} strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/*
              Outside the svg on purpose: `preserveAspectRatio="none"` scales x
              and y by different factors, which draws a `circle` as an ellipse
              whose shape changes with the card's aspect. A positioned span is
              round at every size, and `non-scaling-stroke` keeps the line an
              even width under the same stretch.
            */}
            <span style={{
              position: 'absolute', left: `${(last[0] / 300) * 100}%`, top: `${(last[1] / 80) * 100}%`,
              width: dot, height: dot, borderRadius: '50%', background: p.accent,
              transform: 'translate(-50%,-50%)',
            }} />
          </div>
        );
      })()}
    </Card>
  );
}

function UVCard({ p, place }: CardProps) {
  const { s, u } = p.scale;
  const uv = p.hourly[0]!.uvIndex!;
  const color = uv >= 8 ? '#dc2626' : uv >= 6 ? '#f97316' : uv >= 3 ? '#eab308' : '#22c55e';
  const key = uv >= 8 ? 'veryHigh' : uv >= 6 ? 'high' : uv >= 3 ? 'moderate' : 'low';
  return (
    <Card u={u} testId="fsw-card" style={{ ...place, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.uv')}</Label>
      <Readout p={p}>
        <div style={{ fontSize: s * 4.8, fontWeight: 250, letterSpacing: '-.035em', lineHeight: 1, color }}>{uv}</div>
        <Note s={s} u={u}>{p.t(`fullscreen-weather.uv.${key}`)}</Note>
      </Readout>
      <div style={{
        height: u * .85, borderRadius: 999, marginTop: u * 1.4, position: 'relative', flex: 'none',
        background: 'linear-gradient(90deg,#22c55e,#eab308,#f97316,#dc2626,#7c3aed)',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: `${Math.min(100, (uv / 11) * 100)}%`,
          width: u * 1.6, height: u * 1.6, borderRadius: '50%', transform: 'translate(-50%,-50%)',
          background: 'var(--fsw-surface)', border: `${Math.max(2, u * .3)}px solid var(--fsw-text)`,
        }} />
      </div>
    </Card>
  );
}

function VisibilityCard({ p, place }: CardProps) {
  const { s, u } = p.scale;
  const unit = p.units === 'metric' ? 'km' : 'mi';
  return (
    <Card u={u} testId="fsw-card" style={{ ...place, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.visibility')}</Label>
      <Readout p={p}>
        <Big s={s}>{p.hourly[0]!.visibility}<Unit s={s}>{unit}</Unit></Big>
      </Readout>
    </Card>
  );
}

function Next12Card({ p, place }: CardProps) {
  const { s, u } = p.scale;
  const hrs = hoursWithin(p.hourly, 12);
  if (hrs.length === 0) return <></>;
  return (
    <Card u={u} testId="fsw-card" style={{ ...place, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.next12')}</Label>
      <div style={{ display: 'flex', flex: 1, alignItems: 'stretch', marginTop: u }}>
        {hrs.map((h, i) => {
          const Ico = getWeatherIcon(h.icon, 'outline');
          const pop = h.precipProbability ?? 0;
          return (
            <div key={i} style={{
              flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: u * .65,
              borderRight: i === hrs.length - 1 ? 0 : '1px solid var(--fsw-border-sub)',
            }}>
              <div style={{ fontSize: s * 1.35, fontWeight: 600, color: 'var(--fsw-text-3)' }}>
                {hourLabel(Math.floor(tzHour(hourlyInstant(h), p.timezone)), p.timeFormat)}
              </div>
              <Ico style={{ width: s * 2.3, height: s * 2.3, color: pop > 50 ? '#38bdf8' : 'var(--fsw-text-2)' }} strokeWidth={1.6} />
              <div style={{ fontSize: s * 2.3, fontWeight: 600, letterSpacing: '-.02em', color: tempColor(h.temp, p.units) }}>{Math.round(h.temp)}°</div>
              <div style={{ fontSize: s * 1.25, fontWeight: 600, color: '#38bdf8', minHeight: u * 1.6 }}>{pop >= HOURLY_RAIN_SHOWN_PCT ? `${Math.round(pop)}%` : ''}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
