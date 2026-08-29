'use client';

import type { CSSProperties } from 'react';
import { useTZClock } from '@/hooks/useTZClock';
import { formatEventTime } from '@/lib/calendar-utils';
import type { NewsDisplayItem } from '@/lib/news/types';
import type { TimeFormat } from '@/types/config';
import { formatNewsAge, isBreaking } from '../news/news-shared';
import type { NewsViewContext } from './news-canvas';

/**
 * "Source pill · age · Just in" row. Renders nothing when every part is
 * switched off, so callers can drop the gap above the headline.
 */
export function SourceMeta({
  item, ctx, size, style,
}: {
  item: NewsDisplayItem;
  ctx: NewsViewContext;
  /** Font size in px for the row. */
  size: number;
  style?: CSSProperties;
}) {
  const { options, theme, accent, t, locale, now } = ctx;
  const age = options.showTimestamp ? formatNewsAge(item.timestamp, t, locale, now) : '';
  const showSource = options.showSource && !!item.source;
  const breaking = isBreaking(item, now);
  if (!showSource && !age && !breaking) return null;

  const pill: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: size * 0.45,
    padding: `${size * 0.36}px ${size * 0.75}px`,
    borderRadius: 999,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
  };

  return (
    <div className="flex items-center min-w-0" style={{ gap: size * 0.7, fontSize: size, ...style }}>
      {showSource && (
        <span
          data-news-source
          className="min-w-0"
          style={{ ...pill, backgroundColor: theme.surface, border: `1px solid ${theme.border}`, color: theme.text }}
        >
          {item.sourceColor && (
            <span
              aria-hidden="true"
              className="rounded-full shrink-0"
              style={{ width: size * 0.55, height: size * 0.55, backgroundColor: item.sourceColor }}
            />
          )}
          <span className="truncate">{item.source}</span>
        </span>
      )}
      {age && <span data-news-age className="shrink-0" style={{ color: theme.textSecondary }}>{age}</span>}
      {breaking && (
        <span data-news-breaking style={{ ...pill, backgroundColor: accent, color: theme.onAccent ?? '#ffffff' }}>
          {t('news.justIn')}
        </span>
      )}
    </div>
  );
}

/**
 * Corner clock, as on the full-screen photo viewer: wall-clock time in the
 * display's timezone plus a long date. Sits over the story image, so it
 * carries its own shadow rather than a theme colour.
 */
export function ClockCorner({
  timezone, timeFormat, locale, size, light, style,
}: {
  timezone?: string;
  timeFormat: TimeFormat;
  locale: string;
  /** Font size in px for the time; the date is scaled from it. */
  size: number;
  /** Ink colour for the time; the date is the same at reduced opacity. */
  light: string;
  style?: CSSProperties;
}) {
  const now = useTZClock(timezone, 30_000);
  const time = formatEventTime(now, timeFormat, locale);
  // "9:41 AM" splits into the big digits and a small day-period suffix;
  // 24-hour locales have no suffix and render the digits alone.
  const gap = time.lastIndexOf(' ');
  const digits = gap > 0 ? time.slice(0, gap) : time;
  const suffix = gap > 0 ? time.slice(gap + 1) : '';
  const date = now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div
      data-news-clock
      className="flex flex-col"
      style={{ color: light, textShadow: '0 2px 14px rgba(0,0,0,0.55)', ...style }}
    >
      <div className="flex items-baseline" style={{ gap: size * 0.12 }}>
        <span className="font-light leading-none tracking-tight" style={{ fontSize: size }}>{digits}</span>
        {suffix && <span className="font-medium leading-none" style={{ fontSize: size * 0.4, opacity: 0.8 }}>{suffix}</span>}
      </div>
      <span className="leading-none" style={{ fontSize: size * 0.4, opacity: 0.8, marginTop: size * 0.12 }}>{date}</span>
    </div>
  );
}

/**
 * One segment per story with everything up to the current one filled, plus
 * a "3 of 12" counter. Reads at a glance how far through the list we are.
 */
export function StoryProgress({
  count, index, ctx, style,
}: {
  count: number;
  index: number;
  ctx: NewsViewContext;
  style?: CSSProperties;
}) {
  const { scale, theme, accent, t } = ctx;
  if (count <= 1) return null;
  const track = theme.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
  return (
    <div data-news-progress style={style}>
      <div className="flex" style={{ gap: Math.max(2, scale.bu * 0.75) }}>
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="flex-1 min-w-0"
            style={{
              height: Math.max(3, scale.bu * 0.55),
              borderRadius: 999,
              backgroundColor: i <= index ? accent : track,
            }}
          />
        ))}
      </div>
      <div
        className="text-right tabular-nums"
        style={{ fontSize: scale.s * 2, color: theme.textMuted, marginTop: scale.bu * 1.3 }}
      >
        {t('news.counter', { current: index + 1, total: count })}
      </div>
    </div>
  );
}

/** Page dots for the Front Page; hidden when there is only one page. */
export function PageDots({ count, index, ctx, style }: { count: number; index: number; ctx: NewsViewContext; style?: CSSProperties }) {
  const { scale, theme, accent, t } = ctx;
  if (count <= 1) return null;
  const idle = theme.isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)';
  return (
    <div
      data-news-pages
      className="flex justify-center shrink-0"
      style={{ gap: scale.bu * 1.1, ...style }}
      aria-label={t('news.counter', { current: index + 1, total: count })}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="rounded-full"
          style={{ width: scale.bu * 1.1, height: scale.bu * 1.1, backgroundColor: i === index ? accent : idle }}
        />
      ))}
    </div>
  );
}
