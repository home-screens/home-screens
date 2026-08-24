'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import type { WeatherViewProps } from './weather-view-utils';
import { TopBar, AlertBand } from './weather-parts';

/**
 * Read-from-across-the-room minimal. Temperature, condition, one supporting
 * line, and a strip of day chips. For hallway displays and sleep-adjacent
 * screens where the only question is "what is it doing outside".
 *
 * Landscape pairs the icon with the temperature instead of stacking them, and
 * lays the day chips out as horizontal pills in a width-capped strip. Portrait
 * spends height it has; landscape spends width it has.
 */
export default function AmbientView(p: WeatherViewProps) {
  const { s, u } = p.scale;
  const landscape = p.scale.orientation === 'landscape';
  const now = p.hourly[0];
  const today = p.forecast[0];
  const Icon = getWeatherIcon(now?.icon ?? 'thermometer', 'outline');
  const chips = p.forecast.slice(1, 6);

  const artBox = landscape ? s * 23 : s * 21;
  const artIcon = landscape ? s * 21 : s * 19;

  const art = (
    <div style={{
      flex: 'none', width: artBox, height: artBox, display: 'grid', placeItems: 'center',
      marginBottom: landscape ? 0 : u * 1.4, position: 'relative',
    }}>
      <div style={{ position: 'absolute', inset: -u * 2, borderRadius: '50%', filter: `blur(${s * 4.8}px)`, opacity: .55, background: p.accent }} />
      <Icon style={{ width: artIcon, height: artIcon, position: 'relative', color: p.accent }} strokeWidth={.7} />
    </div>
  );

  const temp = (
    <div style={{ fontSize: landscape ? s * 27 : s * 32, fontWeight: 150, letterSpacing: '-.06em', lineHeight: .82 }}>
      {now ? Math.round(now.temp) : '--'}
      <span style={{ fontSize: '.34em', verticalAlign: 'baseline', position: 'relative', top: '-1.12em', marginLeft: '-.03em', opacity: .34 }}>°</span>
    </div>
  );

  return (
    <>
      <TopBar p={p} />
      <AlertBand p={p} />

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: 0,
      }}>
        {landscape ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: u * 3.2 }}>
            {art}
            {temp}
          </div>
        ) : (
          <>
            {art}
            {temp}
          </>
        )}
        <div style={{ fontSize: landscape ? s * 4.8 : s * 5.2, fontWeight: 400, letterSpacing: '-.02em', marginTop: u * 2.5 }}>{now?.description ?? ''}</div>
        <div style={{ fontSize: s * 2.7, color: 'var(--fsw-text-2)', marginTop: u * 1.9 }}>
          {[
            now?.feelsLike != null ? p.t('fullscreen-weather.feelsLike', { temp: Math.round(now.feelsLike) }) : null,
            today ? p.t('fullscreen-weather.highOf', { temp: Math.round(today.high) }) : null,
            today ? p.t('fullscreen-weather.lowOf', { temp: Math.round(today.low) }) : null,
          ].filter(Boolean).join('  ·  ')}
        </div>
      </div>

      {chips.length > 0 && (
        <div style={{
          flex: 'none', display: 'grid', gridTemplateColumns: `repeat(${chips.length}, 1fr)`, gap: u * 1.3,
          // Five chips across a 1920 canvas are 370px wide and 90px tall,
          // which reads as banners rather than chips. Capping the strip and
          // centring it keeps them chip-shaped on any width.
          ...(landscape ? { width: '100%', maxWidth: u * 108, margin: '0 auto' } : {}),
        }}>
          {chips.map((d) => {
            const Ico = getWeatherIcon(d.icon, 'outline');
            const day = new Intl.DateTimeFormat(p.locale, { weekday: 'short', timeZone: p.timezone }).format(new Date(`${d.date}T12:00:00`));
            const chipStyle: React.CSSProperties = {
              textAlign: 'center', borderRadius: u * 1.7,
              background: 'var(--fsw-surface)', border: '1px solid var(--fsw-border)',
            };
            const label = (
              <div style={{ fontSize: s * 1.45, fontWeight: 600, color: 'var(--fsw-text-3)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                {day}
              </div>
            );
            const range = (
              <div style={{ fontSize: s * 1.9, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {Math.round(d.high)}° <span style={{ color: 'var(--fsw-text-3)', fontWeight: 400 }}>{Math.round(d.low)}°</span>
              </div>
            );

            if (landscape) {
              return (
                <div key={d.date} style={{
                  ...chipStyle, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: u * 1.5, padding: `${u * 1.4}px ${u * .8}px`,
                }}>
                  {label}
                  <Ico style={{ width: s * 2.8, height: s * 2.8, flex: 'none' }} strokeWidth={1.6} />
                  {range}
                </div>
              );
            }

            return (
              <div key={d.date} style={{ ...chipStyle, padding: `${u * 1.7}px ${u * .6}px` }}>
                {label}
                <Ico style={{ width: s * 3.3, height: s * 3.3, margin: `${u * 1.1}px auto ${u * .9}px` }} strokeWidth={1.6} />
                {range}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
