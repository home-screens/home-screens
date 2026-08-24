'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import { Wind, Droplets, Sun, Gauge, Sunset } from 'lucide-react';
import type { WeatherViewProps } from './weather-view-utils';
import { hourLabel, smoothPath, nowcastVerdict, tzHour, hourlyInstant } from './weather-view-utils';
import { tempColor } from './temp-ramp';
import { Card, Label, TopBar, AlertBand, DayRangeBars } from './weather-parts';

export default function PanoramaView(p: WeatherViewProps) {
  const s = p.scale.bu * p.scale.typoMul;
  const now = p.hourly[0];
  const today = p.forecast[0];
  const Icon = getWeatherIcon(now?.icon ?? 'thermometer', 'outline');

  return (
    <>
      <TopBar p={p} />

      {/* Hero */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: s * 2.4 }}>
        <div>
          <div data-testid="fsw-hero-temp" style={{ fontSize: s * 20, lineHeight: .84, fontWeight: 200, letterSpacing: '-.055em' }}>
            {now ? Math.round(now.temp) : '--'}
            <span style={{ fontSize: '.38em', verticalAlign: 'baseline', position: 'relative', top: '-1.02em', marginLeft: '-.04em', opacity: .38 }}>°</span>
          </div>
          <div style={{ fontSize: s * 3.6, fontWeight: 500, letterSpacing: '-.02em', marginTop: s * 2 }}>
            {now?.description ?? ''}
          </div>
          <div style={{ fontSize: s * 2.1, color: 'var(--fsw-text-2)', marginTop: s, display: 'flex', gap: s * 1.4 }}>
            {now?.feelsLike != null && <span>{p.t('fullscreen-weather.feelsLike', { temp: Math.round(now.feelsLike) })}</span>}
            {today && <span style={{ opacity: .4 }}>·</span>}
            {today && <span>{`H ${Math.round(today.high)}°  L ${Math.round(today.low)}°`}</span>}
          </div>
        </div>
        <div style={{ flex: 'none', width: s * 26, height: s * 26, display: 'grid', placeItems: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', filter: `blur(${s * 3.2}px)`, opacity: .5, background: p.accent }} />
          <Icon style={{ width: s * 18, height: s * 18, position: 'relative' }} strokeWidth={.85} />
        </div>
      </div>

      <AlertBand p={p} />
      <NowcastStrip p={p} />
      {p.config.showRibbon !== false && <TempRibbon p={p} />}
      <DayRangeBars p={p} />
      {p.config.showStatRail !== false && <StatRail p={p} />}
    </>
  );
}

/** Minute-by-minute precipitation for the next hour. Pirate Weather only today. */
function NowcastStrip({ p }: { p: WeatherViewProps }) {
  const s = p.scale.bu * p.scale.typoMul;
  if (!p.config.showNowcast) return null;
  const verdict = nowcastVerdict(p.minutely, p.t);
  // No minutely payload at all means the provider does not offer it — the
  // section omits itself rather than showing an empty state on the wall.
  if (!verdict) return null;

  return (
    <Card s={s} style={{ flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: s * 1.3 }}>
        <Label s={s}>{p.t('fullscreen-weather.sections.nextHour')}</Label>
        <div style={{ fontSize: s * 1.8, fontWeight: 600, letterSpacing: '-.01em' }}>{verdict.text}</div>
      </div>
      <div style={{ height: s * 7, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        {verdict.series.map((v, i) => (
          <div key={i} style={{
            flex: 1, minHeight: 2, height: Math.max(2, v * s * 7),
            borderRadius: '3px 3px 1px 1px',
            background: v > .6 ? 'rgba(29,78,216,.95)' : v > .3 ? 'rgba(56,189,248,.9)' : 'rgba(125,211,252,.75)',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: s * .9, fontSize: s * 1.25, color: 'var(--fsw-text-3)', fontWeight: 500 }}>
        <span>{p.t('fullscreen-weather.nowcast.now')}</span>
        <span>{p.t('fullscreen-weather.nowcast.minutes', { n: 15 })}</span>
        <span>{p.t('fullscreen-weather.nowcast.minutes', { n: 30 })}</span>
        <span>{p.t('fullscreen-weather.nowcast.minutes', { n: 45 })}</span>
        <span>{p.t('fullscreen-weather.nowcast.minutes', { n: 60 })}</span>
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
function TempRibbon({ p }: { p: WeatherViewProps }) {
  const s = p.scale.bu * p.scale.typoMul;
  const hrs = p.hourly.slice(0, 48);
  if (hrs.length < 2) return null;

  const W = 964;
  const H = 200;
  const PB = 54;
  const PAD = 10;
  const N = hrs.length;
  const temps = hrs.map((h) => h.temp);
  const mn = Math.min(...temps) - 3;
  const mx = Math.max(...temps) + 3;
  const range = mx - mn || 1;
  const step = (W - PAD * 2) / Math.max(1, N - 1);
  const x = (i: number) => PAD + i * step;
  const y = (t: number) => H - ((t - mn) / range) * (H - 34) - 18;

  const pts = hrs.map((h, i) => [x(i), y(h.temp)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${x(N - 1)},${H} L${x(0)},${H} Z`;
  const stops = hrs.map((h, i) => (
    <stop key={i} offset={`${((i / Math.max(1, N - 1)) * 100).toFixed(1)}%`} stopColor={tempColor(h.temp, p.units)} />
  ));

  const meta = hrs.map((h) => {
    const inst = hourlyInstant(h);
    const hour = tzHour(inst, p.timezone);
    const isNight = p.sun.sunriseHour === p.sun.sunsetHour
      ? false
      : p.sun.sunriseHour < p.sun.sunsetHour
        ? hour < p.sun.sunriseHour || hour >= p.sun.sunsetHour
        : hour < p.sun.sunriseHour && hour >= p.sun.sunsetHour;
    return { hour, isNight };
  });

  const hiI = temps.indexOf(Math.max(...temps));
  const loI = temps.indexOf(Math.min(...temps));
  const callout = (i: number) => (i < 4 || i > N - 2 ? null : (
    <text x={x(i)} y={y(temps[i]) - s * 1.6} fontSize={s * 1.75} fontWeight={600} fill="var(--fsw-text)" textAnchor="middle">
      {Math.round(temps[i])}°
    </text>
  ));

  const spanHours = Math.round((hourlyInstant(hrs[N - 1]).getTime() - hourlyInstant(hrs[0]).getTime()) / 3600000);

  return (
    <Card s={s} style={{ flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: s * .6 }}>
        <Label s={s}>{p.t('fullscreen-weather.sections.nextHours', { hours: spanHours })}</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: s * .6, fontSize: s * 1.15, fontWeight: 600, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--fsw-text-3)' }}>
          <span style={{ width: s, height: s, borderRadius: 3, background: '#38bdf8', display: 'inline-block' }} />
          {p.t('fullscreen-weather.sections.chanceOfPrecip')}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + PB + 10}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: s * 27 }}>
        <defs>
          <linearGradient id="fsw-temp" x1="0" x2="1">{stops}</linearGradient>
          <linearGradient id="fsw-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--fsw-text)" stopOpacity=".16" />
            <stop offset="100%" stopColor="var(--fsw-text)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {meta.map((m, i) => m.isNight ? (
          <rect key={`n${i}`} x={x(i) - step / 2} y={0} width={step} height={H + PB} fill="var(--fsw-text)" opacity={0.045} />
        ) : null)}

        {meta.map((m, i) => {
          if (i === 0) return null;
          const prev = meta[i - 1];
          if (prev.isNight && !m.isNight) {
            return <g key={`sr${i}`}><line x1={x(i)} y1={26} x2={x(i)} y2={H} stroke="#f59e0b" strokeWidth={1.5} opacity=".55" /><circle cx={x(i)} cy={26} r={6} fill="#f59e0b" /></g>;
          }
          if (!prev.isNight && m.isNight) {
            return <g key={`ss${i}`}><line x1={x(i)} y1={26} x2={x(i)} y2={H} stroke="#6366f1" strokeWidth={1.5} opacity=".55" /><circle cx={x(i)} cy={26} r={6} fill="#6366f1" /></g>;
          }
          return null;
        })}

        <path d={area} fill="url(#fsw-area)" />
        <path d={line} fill="none" stroke="url(#fsw-temp)" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />

        {hrs.map((h, i) => {
          const pop = (h.precipProbability ?? 0) / 100;
          if (pop < 0.05) return null;
          const bw = step * 0.62;
          return <rect key={`p${i}`} x={x(i) - bw / 2} y={H + 4} width={bw} height={pop * (PB - 20)} rx={2.5} fill="#38bdf8" opacity={0.35 + pop * 0.6} />;
        })}

        {meta.map((m, i) => (i % Math.max(1, Math.round(N / 8)) === 0 ? (
          <text key={`a${i}`} x={x(i)} y={H + PB + 2} fontSize={13} fontWeight={500} fill="var(--fsw-text-3)" textAnchor="middle">
            {hourLabel(Math.floor(m.hour))}
          </text>
        ) : null))}

        {callout(hiI)}
        {callout(loI)}

        <line x1={x(0)} y1={20} x2={x(0)} y2={H + PB - 14} stroke={p.accent} strokeWidth={2.5} opacity=".9" />
        <circle cx={x(0)} cy={y(temps[0])} r={8} fill={p.accent} stroke="var(--fsw-surface)" strokeWidth={3.5} />
      </svg>
    </Card>
  );
}

/** Wind / humidity / UV / pressure / sunset. Each cell hides when unavailable. */
function StatRail({ p }: { p: WeatherViewProps }) {
  const s = p.scale.bu * p.scale.typoMul;
  const now = p.hourly[0];
  if (!now) return null;

  const windUnit = p.units === 'metric' ? 'km/h' : 'mph';
  const cells: Array<{ icon: typeof Wind; key: string; value: string }> = [];
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
  if (cells.length === 0) return null;

  return (
    <Card s={s} style={{ flex: 'none', display: 'grid', gridTemplateColumns: `repeat(${cells.length}, 1fr)`, padding: `${s * 2}px 0` }}>
      {cells.map((c, i) => {
        const Ico = c.icon;
        return (
          <div key={c.key} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: s * .8,
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
