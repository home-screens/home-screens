'use client';

import SunCalc from 'suncalc';
import { getWeatherIcon } from '@/lib/weather-icons';
import type { WeatherViewProps } from './weather-view-utils';
import { hourLabel, smoothPath, tzHour, hourlyInstant } from './weather-view-utils';
import { tempColor } from './temp-ramp';
import { Card, Label, TopBar, AlertBand } from './weather-parts';

/**
 * Instrument bento. Every card self-hides when its field is undefined, because
 * field coverage varies sharply by provider (visibility is NOAA-only, dew point
 * is NOAA / Open-Meteo / Met Office, UV is Pirate Weather / Met Office /
 * WeatherAPI / Open-Meteo). See the provider matrix in the design spec.
 */
export default function AlmanacView(p: WeatherViewProps) {
  const s = p.scale.bu * p.scale.typoMul;
  const now = p.hourly[0];

  // Which readout cards have data varies by provider, so the count is 0-5.
  // Spans are computed from that count instead of hard-coded, otherwise a
  // provider with, say, three of them leaves a visible hole in the last row.
  type SmallCard = (props: { p: WeatherViewProps; span: number }) => React.ReactElement;
  const present: Array<{ key: string; Comp: SmallCard }> = [];
  if (now?.windSpeed != null) present.push({ key: 'wind', Comp: WindCard });
  if (now?.humidity != null) present.push({ key: 'humidity', Comp: HumidityCard });
  if (now?.pressure != null) present.push({ key: 'pressure', Comp: PressureCard });
  if (now?.uvIndex != null) present.push({ key: 'uv', Comp: UVCard });
  if (now?.visibility != null) present.push({ key: 'visibility', Comp: VisibilityCard });

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
  const gridGap = s * 1.5;

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
        <SunCard p={p} />
        <MoonCard p={p} />
        {smallCards.map(({ key, Comp, span }) => <Comp key={key} p={p} span={span} />)}
        <Next12Card p={p} />
      </div>
    </>
  );
}

function MiniHero({ p }: { p: WeatherViewProps }) {
  const s = p.scale.bu * p.scale.typoMul;
  const now = p.hourly[0];
  const today = p.forecast[0];
  const Icon = getWeatherIcon(now?.icon ?? 'thermometer', 'outline');
  return (
    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: s * 2.5 }}>
      <Icon style={{ width: s * 7.5, height: s * 7.5, color: p.accent }} strokeWidth={1} />
      <div style={{ fontSize: s * 10, fontWeight: 200, letterSpacing: '-.05em', lineHeight: .9 }}>
        {now ? Math.round(now.temp) : '--'}
        <span style={{ fontSize: '.38em', verticalAlign: 'baseline', position: 'relative', top: '-1.02em', marginLeft: '-.04em', opacity: .38 }}>°</span>
      </div>
      <div>
        <div style={{ fontSize: s * 2.5, fontWeight: 500, letterSpacing: '-.01em' }}>{now?.description ?? ''}</div>
        {now?.feelsLike != null && (
          <div style={{ fontSize: s * 1.8, color: 'var(--fsw-text-2)', marginTop: s * .5 }}>
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

function Big({ children, s }: { children: React.ReactNode; s: number }) {
  return <div style={{ fontSize: s * 4.8, fontWeight: 250, letterSpacing: '-.035em', lineHeight: 1 }}>{children}</div>;
}
function Note({ children, s }: { children: React.ReactNode; s: number }) {
  return <div style={{ fontSize: s * 1.45, color: 'var(--fsw-text-2)', marginTop: s * .85, lineHeight: 1.45 }}>{children}</div>;
}
const Unit = ({ children, s }: { children: React.ReactNode; s: number }) => (
  <span style={{ fontSize: s * 2.2, fontWeight: 400, color: 'var(--fsw-text-3)', marginLeft: s * .35 }}>{children}</span>
);

function SunCard({ p }: { p: WeatherViewProps }) {
  const s = p.scale.bu * p.scale.typoMul;
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
    <Card s={s} style={{ gridColumn: 'span 3', gridRow: 'span 2', display: 'flex', flexDirection: 'column' }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.sun')}</Label>
      <div style={{ marginTop: s * 1.3 }}>
        <Big s={s}>{hours}<Unit s={s}>h</Unit> {mins}<Unit s={s}>m</Unit></Big>
        <Note s={s}>{p.t('fullscreen-weather.cards.daylight')}</Note>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: '100%' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="fsw-sun" x1="0" x2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity=".22" />
            <stop offset="50%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity=".22" />
          </linearGradient>
        </defs>
        <line x1={18} y1={H - 34} x2={W - 34} y2={H - 34} stroke="var(--fsw-border)" strokeWidth={1.5} strokeDasharray="4 6" />
        <path d={arc} fill="none" stroke="url(#fsw-sun)" strokeWidth={4} strokeLinecap="round" />
        <circle cx={ax(prog)} cy={ay(prog)} r={22} fill="#fbbf24" opacity=".20" />
        <circle cx={ax(prog)} cy={ay(prog)} r={11} fill="#fbbf24" />
        <text x={18} y={H - 6} fontSize={15} fontWeight={600} fill="var(--fsw-text-3)">{fmt(p.sun.sunrise)}</text>
        <text x={W - 18} y={H - 6} fontSize={15} fontWeight={600} fill="var(--fsw-text-3)" textAnchor="end">{fmt(p.sun.sunset)}</text>
      </svg>
      </div>
    </Card>
  );
}

function MoonCard({ p }: { p: WeatherViewProps }) {
  const s = p.scale.bu * p.scale.typoMul;
  const illum = SunCalc.getMoonIllumination(p.now);
  const pct = Math.round(illum.fraction * 100);
  const phaseKey = phaseNameKey(illum.phase);

  // Terminator geometry. `c` runs +1 (new) -> 0 (quarter) -> -1 (full).
  // Render = lit disc, then a dark half on the unlit limb, then an ellipse of
  // width |c|*R that is dark for a crescent (c > 0) and lit for a gibbous
  // (c < 0). Verified at all four quarters plus both crescents.
  const c = Math.cos(2 * Math.PI * illum.phase);
  const waxing = illum.phase < 0.5;
  const R = 62;
  const DARK = '#39404e';
  const LIT = 'url(#fsw-moon-grad)';

  return (
    <Card s={s} style={{ gridColumn: 'span 3', gridRow: 'span 2', display: 'flex', flexDirection: 'column' }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.moon')}</Label>
      <div style={{ marginTop: s * 1.3 }}>
        <div style={{ fontSize: s * 3.5, fontWeight: 250, letterSpacing: '-.03em', lineHeight: 1.1 }}>
          {p.t(`fullscreen-weather.moon.${phaseKey}`)}
        </div>
        <Note s={s}>{p.t('fullscreen-weather.moon.illuminated', { percent: pct })}</Note>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        <svg viewBox="0 0 150 150" style={{ width: s * 23, maxWidth: '100%', maxHeight: '100%' }}>
          <defs>
            <clipPath id="fsw-moon-clip"><circle cx="75" cy="75" r="62" /></clipPath>
            <radialGradient id="fsw-moon-grad" gradientUnits="userSpaceOnUse" cx="52" cy="48" r="96">
              <stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#cbd5e1" />
            </radialGradient>
          </defs>
          <circle cx="75" cy="75" r="72" fill={p.accent} opacity=".10" />
          <circle cx="75" cy="75" r="62" fill={DARK} />
          <g clipPath="url(#fsw-moon-clip)">
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

function WindCard({ p, span }: { p: WeatherViewProps; span: number }) {
  const s = p.scale.bu * p.scale.typoMul;
  const now = p.hourly[0];
  const unit = p.units === 'metric' ? 'km/h' : 'mph';
  return (
    <Card s={s} style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column' }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.wind')}</Label>
      <div style={{ marginTop: 'auto' }}>
        <Big s={s}>{Math.round(now!.windSpeed!)}<Unit s={s}>{unit}</Unit></Big>
        <Note s={s}>{p.t('fullscreen-weather.cards.windNote')}</Note>
      </div>
    </Card>
  );
}

function HumidityCard({ p, span }: { p: WeatherViewProps; span: number }) {
  const s = p.scale.bu * p.scale.typoMul;
  const now = p.hourly[0]!;
  const pctOn = Math.round((now.humidity! / 100) * 20);
  return (
    <Card s={s} style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column' }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.humidity')}</Label>
      <div style={{ marginTop: 'auto' }}>
        <Big s={s}>{Math.round(now.humidity!)}%</Big>
        {now.dewPoint != null && <Note s={s}>{p.t('fullscreen-weather.cards.dewPoint', { temp: Math.round(now.dewPoint) })}</Note>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: s * 5, marginTop: s * 1.3 }}>
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

function PressureCard({ p, span }: { p: WeatherViewProps; span: number }) {
  const s = p.scale.bu * p.scale.typoMul;
  const series = p.hourly.slice(0, 12).map((h) => h.pressure).filter((v): v is number => v != null);
  const now = p.hourly[0]!;
  const mn = Math.min(...series);
  const mx = Math.max(...series);
  const pts = series.map((v, i) => [i * (300 / Math.max(1, series.length - 1)), 70 - ((v - mn) / (mx - mn || 1)) * 56] as [number, number]);
  const trend = series.length > 1 ? series[series.length - 1] - series[0] : 0;

  return (
    <Card s={s} style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column' }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.pressure')}</Label>
      <div style={{ marginTop: 'auto' }}>
        <Big s={s}>{Math.round(now.pressure!)}<Unit s={s}>hPa</Unit></Big>
        <Note s={s}>{p.t(trend < -1 ? 'fullscreen-weather.cards.pressureFalling' : trend > 1 ? 'fullscreen-weather.cards.pressureRising' : 'fullscreen-weather.cards.pressureSteady')}</Note>
      </div>
      {pts.length > 1 && (
        <svg viewBox="0 0 300 80" style={{ width: '100%', marginTop: s * .8 }}>
          <path d={smoothPath(pts)} fill="none" stroke={p.accent} strokeWidth={3} strokeLinecap="round" />
          <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={6} fill={p.accent} />
        </svg>
      )}
    </Card>
  );
}

function UVCard({ p, span }: { p: WeatherViewProps; span: number }) {
  const s = p.scale.bu * p.scale.typoMul;
  const uv = p.hourly[0]!.uvIndex!;
  const color = uv >= 8 ? '#dc2626' : uv >= 6 ? '#f97316' : uv >= 3 ? '#eab308' : '#22c55e';
  const key = uv >= 8 ? 'veryHigh' : uv >= 6 ? 'high' : uv >= 3 ? 'moderate' : 'low';
  return (
    <Card s={s} style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column' }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.uv')}</Label>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ fontSize: s * 4.8, fontWeight: 250, letterSpacing: '-.035em', lineHeight: 1, color }}>{uv}</div>
        <Note s={s}>{p.t(`fullscreen-weather.uv.${key}`)}</Note>
      </div>
      <div style={{
        height: s * .85, borderRadius: 999, marginTop: s * 1.4, position: 'relative',
        background: 'linear-gradient(90deg,#22c55e,#eab308,#f97316,#dc2626,#7c3aed)',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: `${Math.min(100, (uv / 11) * 100)}%`,
          width: s * 1.6, height: s * 1.6, borderRadius: '50%', transform: 'translate(-50%,-50%)',
          background: 'var(--fsw-surface)', border: `${Math.max(2, s * .3)}px solid var(--fsw-text)`,
        }} />
      </div>
    </Card>
  );
}

function VisibilityCard({ p, span }: { p: WeatherViewProps; span: number }) {
  const s = p.scale.bu * p.scale.typoMul;
  const unit = p.units === 'metric' ? 'km' : 'mi';
  return (
    <Card s={s} style={{ gridColumn: `span ${span}`, display: 'flex', flexDirection: 'column' }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.visibility')}</Label>
      <div style={{ marginTop: 'auto' }}>
        <Big s={s}>{p.hourly[0]!.visibility}<Unit s={s}>{unit}</Unit></Big>
      </div>
    </Card>
  );
}

function Next12Card({ p }: { p: WeatherViewProps }) {
  const s = p.scale.bu * p.scale.typoMul;
  const hrs = p.hourly.slice(0, 12);
  if (hrs.length === 0) return null;
  return (
    <Card s={s} style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column' }}>
      <Label s={s}>{p.t('fullscreen-weather.cards.next12')}</Label>
      <div style={{ display: 'flex', flex: 1, alignItems: 'stretch', marginTop: s }}>
        {hrs.map((h, i) => {
          const Ico = getWeatherIcon(h.icon, 'outline');
          const pop = h.precipProbability ?? 0;
          return (
            <div key={i} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: s * .65,
              borderRight: i === hrs.length - 1 ? 0 : '1px solid var(--fsw-border-sub)',
            }}>
              <div style={{ fontSize: s * 1.35, fontWeight: 600, color: 'var(--fsw-text-3)' }}>
                {hourLabel(Math.floor(tzHour(hourlyInstant(h), p.timezone)))}
              </div>
              <Ico style={{ width: s * 2.3, height: s * 2.3, color: pop > 50 ? '#38bdf8' : 'var(--fsw-text-2)' }} strokeWidth={1.6} />
              <div style={{ fontSize: s * 2.3, fontWeight: 600, letterSpacing: '-.02em', color: tempColor(h.temp, p.units) }}>{Math.round(h.temp)}°</div>
              <div style={{ fontSize: s * 1.25, fontWeight: 600, color: '#38bdf8', minHeight: s * 1.6 }}>{pop >= 8 ? `${Math.round(pop)}%` : ''}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
