'use client';

import { useFormattingLocale, useTranslate } from '@/i18n';
import { useRealClock } from '@/hooks/useTZClock';
import { useViewerTimezone } from '@/hooks/useViewerTimezone';
import { phoneClockDiffersFromHome, viewerAwayFromHome } from '@/lib/home-time';
import { formatDateInTZ, formatTimeInTZ } from '@/lib/timezone';
import { useHouseholdClockFormat, useHouseholdTimezone } from '../household-clock';

/**
 * "It's Friday, 7:40 AM at home": one quiet line on the grown-ups' tabs while
 * the phone's own day or hour differs from home's. A parent in Berlin on
 * Thursday evening sees Friday and the morning chores lit, which is right for
 * home and reads like a bug without it. Hidden in the normal case, a phone at
 * home, and never on the kids' page.
 */
export default function AtHomePill({ style }: { style?: React.CSSProperties }) {
  const t = useTranslate('remote');
  const locale = useFormattingLocale();
  const home = useHouseholdTimezone();
  const hour12 = useHouseholdClockFormat() === '12h';
  const viewer = useViewerTimezone();
  // The clock only runs on a phone that is away at all.
  const now = useRealClock(15_000, viewerAwayFromHome(viewer, home));

  if (!phoneClockDiffersFromHome(now, viewer, home)) return null;
  const text = t('atHome.pill', {
    day: formatDateInTZ(now, home, { weekday: 'long' }, locale),
    time: formatTimeInTZ(now, { timezone: home, locale, hour12 }),
  });
  return (
    <div
      data-testid="at-home-pill"
      style={{
        display: 'flex',
        width: 'fit-content',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        color: 'var(--hs-text-body)',
        background: 'var(--hs-bg-card)',
        border: '1px solid var(--hs-border)',
        borderRadius: 99,
        padding: '5px 12px 5px 6px',
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 20,
          height: 20,
          borderRadius: 99,
          background: 'color-mix(in srgb, var(--hs-accent) 14%, transparent)',
          color: 'var(--hs-accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 'none',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9v11h14V9" />
        </svg>
      </span>
      {text}
    </div>
  );
}
