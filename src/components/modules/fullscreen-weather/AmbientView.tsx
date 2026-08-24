'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import type { WeatherViewProps } from './weather-view-utils';
import { TopBar, AlertBand } from './weather-parts';

/**
 * Read-from-across-the-room minimal. Temperature, condition, one supporting
 * line, and a strip of day chips. For hallway displays and sleep-adjacent
 * screens where the only question is "what is it doing outside".
 */
export default function AmbientView(p: WeatherViewProps) {
  const s = p.scale.bu * p.scale.typoMul;
  const now = p.hourly[0];
  const today = p.forecast[0];
  const Icon = getWeatherIcon(now?.icon ?? 'thermometer', 'outline');
  const chips = p.forecast.slice(1, 6);

  return (
    <>
      <TopBar p={p} />
      <AlertBand p={p} />

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: 0,
      }}>
        <div style={{ width: s * 21, height: s * 21, display: 'grid', placeItems: 'center', marginBottom: s * 1.4, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: -s * 2, borderRadius: '50%', filter: `blur(${s * 4.8}px)`, opacity: .55, background: p.accent }} />
          <Icon style={{ width: s * 19, height: s * 19, position: 'relative', color: p.accent }} strokeWidth={.7} />
        </div>
        <div style={{ fontSize: s * 32, fontWeight: 150, letterSpacing: '-.06em', lineHeight: .82 }}>
          {now ? Math.round(now.temp) : '--'}
          <span style={{ fontSize: '.34em', verticalAlign: 'baseline', position: 'relative', top: '-1.12em', marginLeft: '-.03em', opacity: .34 }}>°</span>
        </div>
        <div style={{ fontSize: s * 5.2, fontWeight: 400, letterSpacing: '-.02em', marginTop: s * 2.5 }}>{now?.description ?? ''}</div>
        <div style={{ fontSize: s * 2.7, color: 'var(--fsw-text-2)', marginTop: s * 1.9 }}>
          {[
            now?.feelsLike != null ? p.t('fullscreen-weather.feelsLike', { temp: Math.round(now.feelsLike) }) : null,
            today ? p.t('fullscreen-weather.highOf', { temp: Math.round(today.high) }) : null,
            today ? p.t('fullscreen-weather.lowOf', { temp: Math.round(today.low) }) : null,
          ].filter(Boolean).join('  ·  ')}
        </div>
      </div>

      {chips.length > 0 && (
        <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: `repeat(${chips.length}, 1fr)`, gap: s * 1.3 }}>
          {chips.map((d) => {
            const Ico = getWeatherIcon(d.icon, 'outline');
            return (
              <div key={d.date} style={{
                textAlign: 'center', padding: `${s * 1.7}px ${s * .6}px`, borderRadius: s * 1.7,
                background: 'var(--fsw-surface)', border: '1px solid var(--fsw-border)',
              }}>
                <div style={{ fontSize: s * 1.45, fontWeight: 600, color: 'var(--fsw-text-3)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  {new Intl.DateTimeFormat(p.locale, { weekday: 'short', timeZone: p.timezone }).format(new Date(`${d.date}T12:00:00`))}
                </div>
                <Ico style={{ width: s * 3.3, height: s * 3.3, margin: `${s * 1.1}px auto ${s * .9}px` }} strokeWidth={1.6} />
                <div style={{ fontSize: s * 1.9, fontWeight: 600 }}>
                  {Math.round(d.high)}° <span style={{ color: 'var(--fsw-text-3)', fontWeight: 400 }}>{Math.round(d.low)}°</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
