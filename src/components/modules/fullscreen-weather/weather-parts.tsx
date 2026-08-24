'use client';

import { getWeatherIcon } from '@/lib/weather-icons';
import { MapPin, Droplet } from 'lucide-react';
import type { WeatherViewProps } from './weather-view-utils';
import { alertTone, degree } from './weather-view-utils';
import { tempColor } from './temp-ramp';

/** Section label: small, tracked-out, muted. Shared by every card. */
export function Label({ children, s }: { children: React.ReactNode; s: number }) {
  return (
    <div style={{
      fontSize: s * 1.15, fontWeight: 600, letterSpacing: '.13em',
      textTransform: 'uppercase', color: 'var(--fsw-text-3)',
    }}>{children}</div>
  );
}

/** `u` (structure), not `s` (type): a card's padding and radius should follow
 *  density, not how large the household set the text. */
export function Card({ children, u, style, testId }: {
  children: React.ReactNode; u: number; style?: React.CSSProperties; testId?: string;
}) {
  return (
    <div data-testid={testId} style={{
      background: 'var(--fsw-surface)',
      border: '1px solid var(--fsw-border)',
      borderRadius: u * 2.1,
      boxShadow: 'var(--fsw-card-shadow)',
      padding: `${u * 2.1}px ${u * 2.3}px`,
      ...style,
    }}>{children}</div>
  );
}

export function TopBar({ p }: { p: WeatherViewProps }) {
  const { s, u } = p.scale;
  const showTime = p.config.showTime !== false;
  const time = showTime
    ? new Intl.DateTimeFormat(p.locale, {
        hour: 'numeric', minute: '2-digit',
        hour12: p.timeFormat !== '24h',
        timeZone: p.timezone,
      }).format(p.now)
    : null;

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: u * 2, flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: u, fontSize: s * 2.6, fontWeight: 600, letterSpacing: '-.01em', minWidth: 0 }}>
        <MapPin style={{ width: s * 2.3, height: s * 2.3, color: 'var(--fsw-text-3)', flex: 'none' }} strokeWidth={1.6} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.locationLabel}</span>
      </div>
      {time && (
        <div data-testid="fsw-clock" style={{
          flex: 'none', fontSize: s * 2.6, fontWeight: 600,
          letterSpacing: '-.01em', color: 'var(--fsw-text-2)',
        }}>{time}</div>
      )}
    </div>
  );
}

export function AlertBand({ p }: { p: WeatherViewProps }) {
  const { s, u } = p.scale;
  const alert = p.alerts[0];
  if (!p.config.showAlerts || !alert) return null;
  const { fg, isSevere } = alertTone(alert.severity);

  return (
    <div
      data-testid="fsw-alert"
      style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: u * 1.7,
        padding: `${u * 1.7}px ${u * 2.3}px`, borderRadius: u * 1.9,
        color: fg, border: `1px solid ${fg}55`, background: `${fg}14`,
      }}
    >
      <div style={{ flex: 'none', fontSize: s * 3, lineHeight: 1 }} aria-hidden>⚠</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: s * 2, fontWeight: 600, letterSpacing: '-.01em' }}>{alert.title}</div>
        {alert.description && (
          <div style={{
            fontSize: s * 1.5, opacity: .85, marginTop: u * .3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{alert.description}</div>
        )}
      </div>
      <div style={{
        marginLeft: 'auto', flex: 'none', fontSize: s * 1.1, fontWeight: 700,
        letterSpacing: '.12em', textTransform: 'uppercase',
        padding: `${u * .55}px ${u * 1.15}px`, borderRadius: 999, border: '1px solid currentColor',
      }}>{isSevere ? p.t('fullscreen-weather.alerts.severe') : p.t('fullscreen-weather.alerts.advisory')}</div>
    </div>
  );
}

/** The 7-day list: each day's low..high drawn against the whole week's range. */
export function DayRangeBars({ p }: { p: WeatherViewProps }) {
  const { s, u } = p.scale;
  const count = Math.max(3, Math.min(7, p.config.daysToShow ?? 7));
  const days = p.forecast.slice(0, count);
  if (days.length === 0) return null;

  const weekMin = Math.min(...days.map((d) => d.low));
  const weekMax = Math.max(...days.map((d) => d.high));
  const span = weekMax - weekMin || 1;
  const nowTemp = p.hourly[0]?.temp;

  // Icon (3.4s) plus breathing room is the smallest a row can be and stay legible.
  const rowMin = s * 4.4;
  const listMin = rowMin * days.length;

  return (
    <Card u={u} style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      // header + rows + the card's own vertical padding
      minHeight: listMin + u * 6.1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label s={s}>{p.t('fullscreen-weather.sections.outlook', { days: days.length })}</Label>
        <Label s={s}>{`${Math.round(weekMin)}° – ${Math.round(weekMax)}°`}</Label>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: u * .4, minHeight: listMin }}>
        {days.map((d, i) => {
          const Icon = getWeatherIcon(d.icon, 'outline');
          const left = ((d.low - weekMin) / span) * 100;
          const right = ((d.high - weekMin) / span) * 100;
          const nowPct = i === 0 && nowTemp != null ? ((nowTemp - weekMin) / span) * 100 : null;
          return (
            <div key={d.date} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: u * 1.5, minHeight: rowMin,
              borderBottom: i === days.length - 1 ? 0 : '1px solid var(--fsw-border-sub)',
            }}>
              <div style={{
                width: s * 11, flex: 'none', fontSize: s * 2, letterSpacing: '-.01em',
                fontWeight: i === 0 ? 700 : 500,
                color: i === 0 ? 'var(--fsw-text)' : 'var(--fsw-text-2)',
              }}>{dayName(d.date, i, p)}</div>
              <div style={{ width: s * 4.6, flex: 'none', display: 'grid', placeItems: 'center', color: i === 0 ? p.accent : 'var(--fsw-text-2)' }}>
                <Icon style={{ width: s * 3.4, height: s * 3.4 }} strokeWidth={1.6} />
              </div>
              <div style={{
                width: s * 7, flex: 'none', display: 'flex', alignItems: 'center', gap: s * .45,
                fontSize: s * 1.5, fontWeight: 600, color: '#38bdf8',
                visibility: (d.precipProbability ?? 0) >= 8 ? 'visible' : 'hidden',
              }}>
                <Droplet style={{ width: s * 1.5, height: s * 1.5 }} strokeWidth={2} />
                {Math.round(d.precipProbability ?? 0)}%
              </div>
              <div style={{ width: s * 5.4, flex: 'none', textAlign: 'right', fontSize: s * 2.2, color: 'var(--fsw-text-3)' }}>{Math.round(d.low)}°</div>
              <div style={{
                flex: 1, height: u * .85, borderRadius: 999, position: 'relative',
                background: 'var(--fsw-surface-alt)', margin: `0 ${u * 1.5}px`,
              }}>
                <div style={{
                  position: 'absolute', top: 0, bottom: 0, borderRadius: 999,
                  left: `${left}%`, width: `${Math.max(3, right - left)}%`,
                  background: `linear-gradient(90deg, ${tempColor(d.low, p.units)}, ${tempColor(d.high, p.units)})`,
                }} />
                {nowPct !== null && (
                  <div style={{
                    position: 'absolute', top: '50%', left: `${Math.max(0, Math.min(100, nowPct))}%`,
                    width: u * 1.25, height: u * 1.25, borderRadius: '50%',
                    transform: 'translate(-50%,-50%)',
                    background: 'var(--fsw-surface)', border: `${Math.max(2, u * .28)}px solid var(--fsw-text)`,
                  }} />
                )}
              </div>
              <div style={{ width: s * 6, flex: 'none', textAlign: 'right', fontSize: s * 2.2, fontWeight: 600 }}>{Math.round(d.high)}°</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function dayName(dateStr: string, index: number, p: WeatherViewProps): string {
  if (index === 0) return p.t('fullscreen-weather.today');
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat(p.locale, { weekday: 'short', timeZone: p.timezone }).format(d);
}

export { degree };
