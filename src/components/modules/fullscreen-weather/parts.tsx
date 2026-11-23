'use client';

import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FIT_MEASURE_ATTR } from '@/hooks/useFitScale';
import { NO_VALUE } from '@/lib/constants';
import { formatTimeOfDay } from '@/lib/timezone';
import type { WeatherViewProps } from './weather-view-utils';

/**
 * The pieces the Forecast and Conditions views are built from: the card, its
 * icon label, and the instruments (compass, sun arc, pressure gauge, scale
 * bar) the phone weather app draws. Shared by both views so the two screens
 * of the phone page look like one app. The moon is `MoonImage` in moon.tsx.
 */

/** A translucent card with a large radius: the phone app's card over any sky. */
export function Card({ children, u, style, testId }: {
  children: React.ReactNode; u: number; style?: React.CSSProperties; testId?: string;
}) {
  return (
    <div data-testid={testId} {...{ [FIT_MEASURE_ATTR]: '' }} style={{
      background: 'var(--fsw-surface)',
      border: '1px solid var(--fsw-border)',
      // The phone's corner is about 4.3% of a small card's width, which is four
      // structure units on a two-across grid.
      borderRadius: u * 4,
      boxShadow: 'var(--fsw-card-shadow)',
      padding: `${u * 2.4}px ${u * 2.8}px ${u * 2.6}px`,
      display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
      position: 'relative',
      ...style,
    }}>{children}</div>
  );
}

/** The card's uppercase label with its icon. */
export function CardLabel({ icon: Icon, children, s }: { icon: LucideIcon; children: React.ReactNode; s: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: s * 1.1, lineHeight: 1, flex: 'none',
      fontSize: s * 2.1, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', opacity: .55,
      overflow: 'hidden', whiteSpace: 'nowrap',
    }}>
      <Icon style={{ width: s * 2.4, height: s * 2.4, flex: 'none' }} strokeWidth={2} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </div>
  );
}

/** The card's big reading. */
export function BigValue({ children, s, style }: { children: React.ReactNode; s: number; style?: React.CSSProperties }) {
  return <div style={{ fontSize: s * 7.2, fontWeight: 400, letterSpacing: '-.02em', lineHeight: 1, marginTop: s * 1.3, ...style }}>{children}</div>;
}

/**
 * The unit beside a big reading. Small by default; the visibility card sets
 * it nearly as large as the number, the way the phone writes "15 mi".
 */
export function Unit({ children, size = '.45em' }: { children: React.ReactNode; size?: string }) {
  return <span style={{ fontSize: size, fontWeight: 400, marginLeft: '.12em', letterSpacing: 0 }}>{children}</span>;
}

/** The card's sentence, pushed to the foot when the card has slack. */
export function Sentence({ children, s, style }: { children: React.ReactNode; s: number; style?: React.CSSProperties }) {
  return <div style={{ fontSize: s * 2.75, lineHeight: 1.25, fontWeight: 400, opacity: .9, marginTop: 'auto', paddingTop: s * .8, ...style }}>{children}</div>;
}

/** Degrees between two headings the short way round, 0 to 180. */
function headingGap(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

export interface CompassLetters { n: string; e: string; s: string; w: string }
const COMPASS_LETTERS: CompassLetters = { n: 'N', e: 'E', s: 'S', w: 'W' };

/** The dial's four letters from the dictionary: N, O, S, W in German. `t` takes a full `modules` key. */
export function compassLetters(t: (key: string) => string): CompassLetters {
  return {
    n: t('fullscreen-weather.compass.n'), e: t('fullscreen-weather.compass.e'),
    s: t('fullscreen-weather.compass.s'), w: t('fullscreen-weather.compass.w'),
  };
}

/**
 * Wind compass: ticks every 6°, cardinal letters, and an arrow pointing the
 * way the wind blows (from the west means the arrow points east), with the
 * speed in the middle. The ring is brightest in the quadrant the arrow head
 * points into, as on the phone, and the letters sit one tick length inside
 * the ring with the arrow stopping short of them, so a west wind's arrow
 * never runs through the W and the E.
 */
export function Compass({ speed, fromDeg, unit, size, s, letters = COMPASS_LETTERS }: {
  speed: number; fromDeg: number | undefined; unit: string; size: number; s: number;
  /** The four cardinal letters in the household's language (see `compassLetters`). */
  letters?: CompassLetters;
}) {
  const S = 250;
  const c = S / 2;
  const r = 108;
  /** A major tick; the cardinal letters are inset by this much. */
  const TICK = 14;
  const letterR = r - TICK - 4;
  /** Where the arrow's ends stop: a letter's half height short of the letters. */
  const arrowR = letterR - 14;
  /** The clear middle the speed sits in. */
  const hubR = 46;
  const to = fromDeg != null ? (fromDeg + 180) % 360 : null;
  const ticks: React.ReactNode[] = [];
  for (let a = 0; a < 360; a += 6) {
    // The ticks either side of a cardinal give its letter room.
    if (a % 90 <= 6 || a % 90 >= 84) continue;
    const rad = (a * Math.PI) / 180;
    const major = a % 30 === 0;
    const len = major ? TICK : 9;
    const base = major ? .7 : .3;
    // Ramps up to full over the 90° centred on the arrow head.
    const glow = to == null ? 0 : Math.max(0, 1 - headingGap(a, to) / 45);
    ticks.push(
      <line key={a} x1={c + Math.sin(rad) * r} y1={c - Math.cos(rad) * r} x2={c + Math.sin(rad) * (r - len)} y2={c - Math.cos(rad) * (r - len)}
        stroke="currentColor" opacity={base + (1 - base) * glow * .9} strokeWidth={2} />,
    );
  }
  const cardinals = ([['n', 0], ['e', 90], ['s', 180], ['w', 270]] as const).map(([point, a]) => {
    const l = letters[point];
    const rad = (a * Math.PI) / 180;
    return (
      <text key={l} x={c + Math.sin(rad) * letterR} y={c - Math.cos(rad) * letterR} fill="currentColor" fontSize={22} fontWeight={600}
        textAnchor="middle" dominantBaseline="central" opacity=".85">{l}</text>
    );
  });
  let arrow: React.ReactNode = null;
  if (fromDeg != null && to != null) {
    const rad = (to * Math.PI) / 180;
    const rf = (fromDeg * Math.PI) / 180;
    const tipX = c + Math.sin(rad) * arrowR;
    const tipY = c - Math.cos(rad) * arrowR;
    const tailX = c + Math.sin(rf) * arrowR;
    const tailY = c - Math.cos(rf) * arrowR;
    arrow = (
      <g fill="currentColor" stroke="currentColor">
        <line x1={tailX} y1={tailY} x2={c + Math.sin(rf) * hubR} y2={c - Math.cos(rf) * hubR} strokeWidth={4} strokeLinecap="round" />
        <circle cx={tailX} cy={tailY} r={7} stroke="none" />
        <line x1={c + Math.sin(rad) * hubR} y1={c - Math.cos(rad) * hubR} x2={tipX - Math.sin(rad) * 6} y2={tipY + Math.cos(rad) * 6} strokeWidth={4} strokeLinecap="round" />
        <polygon stroke="none" points={`${tipX + Math.sin(rad) * 6},${tipY - Math.cos(rad) * 6} ${tipX + Math.sin(rad + 2.3) * 12},${tipY - Math.cos(rad + 2.3) * 12} ${tipX + Math.sin(rad - 2.3) * 12},${tipY - Math.cos(rad - 2.3) * 12}`} />
      </g>
    );
  }
  return (
    <div data-testid="fsw-compass" style={{ position: 'relative', width: size, height: size, margin: '0 auto', flex: 'none' }}>
      <svg viewBox={`0 0 ${S} ${S}`} style={{ width: '100%', height: '100%', display: 'block' }}>{ticks}{cardinals}{arrow}</svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
        <b style={{ fontSize: size * .22, fontWeight: 500 }}>{Math.round(speed)}</b>
        <span style={{ fontSize: Math.max(s * 1.6, size * .1), opacity: .75, marginTop: 2 }}>{unit}</span>
      </div>
    </div>
  );
}

/**
 * Sun arc: a sine over the day, the horizon line, and a glowing dot at the
 * current time, which sits below the horizon after sunset. The daylight part
 * of the curve is bright and the night part faint, as on the phone.
 */
export function SunArc({ sunriseFrac, sunsetFrac, nowFrac, height }: { sunriseFrac: number; sunsetFrac: number; nowFrac: number; height: number }) {
  const uid = useId();
  // The curve swings AMP either side of the horizon; the box leaves a stroke's
  // room past both extremes, or the trough's underside is cut off.
  const W = 400;
  const H = 150;
  const hy = 75;
  const AMP = 56;
  const span = sunsetFrac - sunriseFrac || 1;
  const y = (f: number) => hy - Math.sin(((f - sunriseFrac) / span) * Math.PI) * AMP;
  let d = '';
  for (let i = 0; i <= 60; i++) {
    const f = i / 60;
    d += `${i ? 'L' : 'M'}${(f * W).toFixed(1)} ${y(f).toFixed(1)} `;
  }
  const cx = nowFrac * W;
  const cy = y(nowFrac);
  const at: React.CSSProperties = { position: 'absolute', left: `${(cx / W) * 100}%`, top: `${(cy / H) * 100}%`, transform: 'translate(-50%,-50%)', borderRadius: '50%' };
  return (
    <div data-testid="fsw-sun-arc" style={{ position: 'relative', height, flex: 'none' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <clipPath id={`${uid}-day`}><rect x={0} y={0} width={W} height={hy} /></clipPath>
          <clipPath id={`${uid}-night`}><rect x={0} y={hy} width={W} height={H - hy} /></clipPath>
        </defs>
        <path d={d} stroke="currentColor" opacity=".85" strokeWidth={3} fill="none" vectorEffect="non-scaling-stroke" clipPath={`url(#${uid}-day)`} />
        <path d={d} stroke="currentColor" opacity=".35" strokeWidth={3} fill="none" vectorEffect="non-scaling-stroke" clipPath={`url(#${uid}-night)`} />
        <line x1={0} y1={hy} x2={W} y2={hy} stroke="currentColor" opacity=".55" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Outside the svg: `preserveAspectRatio="none"` would draw the dot as an ellipse. */}
      {/* The glow reaches about 10px past the dot at the base card size (an arc 70px tall) and scales with the arc. */}
      <span style={{
        ...at, width: height * .45, height: height * .45, opacity: .6,
        background: 'radial-gradient(circle, var(--fsw-text) 0%, transparent 65%)',
      }} />
      <span style={{
        ...at, width: height * .15, height: height * .15,
        background: 'var(--fsw-text)', border: '3px solid var(--fsw-surface)', boxSizing: 'content-box',
      }} />
    </div>
  );
}

export type PressureTrend = 'rising' | 'falling' | 'steady';

/**
 * Pressure gauge, as the phone draws it: a 270° ring of ticks open at the
 * bottom, a tick-shaped needle at the reading, the trend glyph over the
 * number, and Low and High under the ring's two feet. Everything is in the
 * one viewBox so the parts keep their places at any size and nothing can
 * land on the foot labels.
 */
export function Gauge({ value, unit, frac, trend, lowLabel, highLabel, size }: {
  value: string; unit: string; frac: number; trend: PressureTrend; lowLabel: string; highLabel: string; size: number;
}) {
  const S = 250;
  const c = S / 2;
  const r = 104;
  /** The ring runs from 7:30 round the top to 4:30 on a clock face. */
  const START = -135;
  const SWEEP = 270;
  const needleDeg = START + frac * SWEEP;
  const pt = (deg: number, radius: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [c + Math.sin(a) * radius, c - Math.cos(a) * radius];
  };
  const ticks: React.ReactNode[] = [];
  for (let i = 0; i <= SWEEP / 5; i++) {
    const deg = START + i * 5;
    // The needle stands in a gap of its own.
    if (Math.abs(deg - needleDeg) < 6) continue;
    const major = i % 9 === 0;
    const [x1, y1] = pt(deg, r);
    const [x2, y2] = pt(deg, r - (major ? 16 : 11));
    // The ticks brighten towards the needle, the way the phone's ring does.
    const glow = Math.max(0, 1 - Math.abs(deg - needleDeg) / 30);
    ticks.push(
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" opacity={(major ? .5 : .3) + .5 * glow} strokeWidth={2.5} />,
    );
  }
  const [nx1, ny1] = pt(needleDeg, r + 6);
  const [nx2, ny2] = pt(needleDeg, r - 22);
  const [lowX] = pt(START, r);
  const [highX] = pt(START + SWEEP, r);
  const glyphY = 84;
  const glyph = trend === 'steady'
    ? <g stroke="currentColor" strokeWidth={4} strokeLinecap="round">
        <line x1={c - 11} y1={glyphY - 5} x2={c + 11} y2={glyphY - 5} />
        <line x1={c - 11} y1={glyphY + 5} x2={c + 11} y2={glyphY + 5} />
      </g>
    : <g stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none"
        transform={trend === 'falling' ? `rotate(180 ${c} ${glyphY})` : undefined}>
        <line x1={c} y1={glyphY + 11} x2={c} y2={glyphY - 11} />
        <polyline points={`${c - 8},${glyphY - 3} ${c},${glyphY - 11} ${c + 8},${glyphY - 3}`} />
      </g>;
  return (
    <div data-testid="fsw-gauge" data-trend={trend} style={{ width: size, height: size, margin: '0 auto', flex: 'none' }}>
      <svg viewBox={`0 0 ${S} ${S}`} style={{ width: '100%', height: '100%', display: 'block' }} fill="currentColor">
        {ticks}
        <line x1={nx1} y1={ny1} x2={nx2} y2={ny2} stroke="currentColor" strokeWidth={7} strokeLinecap="round" />
        {glyph}
        <text x={c} y={147} fontSize={44} fontWeight={500} textAnchor="middle">{value}</text>
        <text x={c} y={176} fontSize={21} opacity=".75" textAnchor="middle">{unit}</text>
        <text x={lowX} y={236} fontSize={21} textAnchor="middle" opacity=".9">{lowLabel}</text>
        <text x={highX} y={236} fontSize={21} textAnchor="middle" opacity=".9">{highLabel}</text>
      </svg>
    </div>
  );
}

/** A gradient scale with a dot: the UV index and air quality bars. */
export function ScaleBar({ gradient, pct, u, style }: { gradient: string; pct: number; u: number; style?: React.CSSProperties }) {
  return (
    <div style={{ height: u * .95, borderRadius: 999, position: 'relative', background: gradient, flex: 'none', ...style }}>
      <div style={{
        position: 'absolute', top: '50%', left: `${Math.max(0, Math.min(100, pct))}%`, transform: 'translate(-50%,-50%)',
        width: u * 1.5, height: u * 1.5, borderRadius: '50%', background: 'var(--fsw-text)', border: '3px solid var(--fsw-surface)', boxSizing: 'content-box',
      }} />
    </div>
  );
}

export const UV_GRADIENT = 'linear-gradient(90deg, #4ade80, #facc15, #fb923c, #ef4444, #c084fc)';
export const AQ_GRADIENT = 'linear-gradient(90deg, #60a5fa, #4ade80, #facc15, #fb923c, #ef4444, #b91c1c, #a855f7)';

/** Clock time in the household's format and the display's zone. */
export function clockTime(p: WeatherViewProps, d: Date | null | undefined): string {
  if (!d) return NO_VALUE;
  // A no-break space before the AM or PM: "Moonrise: 2:00 PM" must never
  // wrap between the time and its half of the day in a narrow card.
  return formatTimeOfDay(d, { timeFormat: p.timeFormat, locale: p.locale, timezone: p.timezone }).replace(/\s/g, '\u00a0');
}
