'use client';

import { formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { CalendarScale } from './view-support';

/**
 * Small shared pieces for the fullscreen list views: the status slot
 * (countdown pill / progress bar), the agenda boundary separators, and the
 * event-row aria label.
 */

/**
 * Accessible name for an event row/chip/block, built the same way in every
 * view so a screen-reader user hears the location wherever one exists.
 * `startLabel`/`endLabel` are the already-formatted times; all-day rows
 * skip them.
 */
export function eventAriaLabel(
  t: TranslateFn,
  ev: { title: string; location?: string },
  opts: { startLabel?: string; endLabel?: string; allDay?: boolean } = {},
): string {
  if (opts.allDay) {
    const base = t('fullscreen-calendar.ariaLabels.eventAllDay', { title: ev.title });
    return ev.location ? `${base}, ${ev.location}` : base;
  }
  const start = opts.startLabel ?? '';
  const end = opts.endLabel ?? '';
  return ev.location
    ? t('fullscreen-calendar.ariaLabels.eventTimedAtLocation', { title: ev.title, start, end, location: ev.location })
    : t('fullscreen-calendar.ariaLabels.eventTimed', { title: ev.title, start, end });
}

/** Countdown pill — the "not started yet" face of the status slot. */
export function CountdownPill({ label, fontSize }: { label: string; fontSize: number }) {
  return (
    <span style={{
      fontSize: fontSize * 0.65,
      fontWeight: 600,
      color: 'var(--cal-accent)',
      background: 'var(--cal-accent-bg)',
      padding: `${fontSize * 0.1}px ${fontSize * 0.45}px`,
      borderRadius: 999,
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

/** Progress bar — the "running now" face of the status slot. */
export function EventProgressBar({ fraction, fontSize }: { fraction: number; fontSize: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        marginTop: fontSize * 0.35,
        height: Math.max(3, fontSize * 0.22),
        borderRadius: 2,
        background: 'var(--cal-border-subtle)',
        overflow: 'hidden',
      }}
    >
      <div style={{
        height: '100%',
        width: `${Math.round(fraction * 100)}%`,
        borderRadius: 2,
        background: 'var(--cal-accent)',
      }} />
    </div>
  );
}

/** Week boundary: light rule with a "Week of <date>" label. */
export function WeekSeparator({ weekStart, scale, fontSize, t, locale }: {
  weekStart: Date;
  scale: CalendarScale;
  fontSize: number;
  t: TranslateFn;
  locale: string;
}) {
  const line = { flex: 1, height: 2, background: 'var(--cal-border)', borderRadius: 1 } as const;
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: scale.bu * 0.8,
      padding: `${scale.bu * 1.2}px 0 0`,
    }}>
      <div style={line} />
      <span style={{
        fontSize: fontSize * 0.62,
        fontWeight: 700,
        letterSpacing: '0.05em',
        color: 'var(--cal-text-secondary)',
        background: 'var(--cal-surface)',
        border: '1px solid var(--cal-border)',
        borderRadius: 999,
        padding: `${scale.bu * 0.1}px ${scale.bu * 0.7}px`,
        whiteSpace: 'nowrap',
      }}>
        {t('fullscreen-calendar.weekOf', { date: formatDateSync(weekStart, 'MMM d', { locale }) })}
      </span>
      <div style={line} />
    </div>
  );
}

/** Month boundary: serif month name over an accent rule. Beats the week rule. */
export function MonthSeparator({ monthStart, scale, fontSize, locale }: {
  monthStart: Date;
  scale: CalendarScale;
  fontSize: number;
  locale: string;
}) {
  return (
    <div style={{ padding: `${scale.bu * 1.6}px 0 0` }}>
      <div style={{
        fontFamily: "var(--font-dm-serif), 'DM Serif Display', Georgia, serif",
        fontSize: fontSize * 1.3,
        color: 'var(--cal-accent)',
        lineHeight: 1.1,
      }}>
        {formatDateSync(monthStart, 'MMMM', { locale })}
      </div>
      <div style={{
        height: 3,
        background: 'var(--cal-accent)',
        opacity: 0.55,
        borderRadius: 2,
        marginTop: scale.bu * 0.3,
      }} />
    </div>
  );
}
