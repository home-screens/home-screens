import { useMemo } from 'react';
import { differenceInCalendarDays, isSameDay } from 'date-fns';
import { toTZWallTime } from '@/lib/timezone';
import { formatEventTime } from '@/lib/calendar-utils';
import type { TranslateFn } from '@/i18n';
import { DEFAULT_TIME_FORMAT, type CalendarFetchStatus, type CalendarSourceStatus, type TimeFormat } from '@/types/config';

/** Per-source `messageKey` the calendar route emits for a missing or expired Google sign-in. */
export const GOOGLE_NOT_SIGNED_IN_KEY = 'googleNotSignedIn';

/** A refresh that has been failing this long gets the loud badge and the tinted card edge. */
export const LOUD_AFTER_MS = 24 * 60 * 60 * 1000;

/** The setup problems a calendar module shows a setup card for instead of stale events. */
export type CalendarSetupNeed = 'signIn' | 'noSources';

export type CalendarStatusView =
  | { kind: 'ok' }
  /** A failure with no successful fetch ever: an outage, not a free day. */
  | { kind: 'cantLoad' }
  /** Setup problems replace the events entirely (see the mockup for audit item 73). */
  | { kind: 'setup'; setup: CalendarSetupNeed; title: string; hint: string }
  /** Events on screen are the kept last-good copy; the badge says since when. */
  | { kind: 'badge'; text: string; loud: boolean };

interface SinceFormatOpts {
  timezone: string | undefined;
  timeFormat: TimeFormat | undefined;
  locale: string;
  /** Display wall clock (the shifted Date from `useTZClock`). */
  now: Date;
  today: Date;
  t: TranslateFn;
}

/**
 * "Since when" for a not-updating badge, in the display's zone and locale:
 * "9:14 AM" on the day it happened, "yesterday, 9:14 AM" the day after,
 * then "Mon, 8/31, 9:14 AM". `ageMs` is how long ago that was on the
 * display's own clock, for the loud-after-a-day escalation.
 */
export function formatSince(fetchedAt: number, opts: SinceFormatOpts): { text: string; ageMs: number } {
  const instant = new Date(fetchedAt);
  const wall = toTZWallTime(instant, opts.timezone);
  const time = formatEventTime(wall, opts.timeFormat ?? DEFAULT_TIME_FORMAT, opts.locale);
  const ageMs = Math.max(0, opts.now.getTime() - wall.getTime());
  if (isSameDay(wall, opts.today)) return { text: time, ageMs };
  const daysAgo = differenceInCalendarDays(opts.today, wall);
  let day: string;
  try {
    day = daysAgo === 1
      ? new Intl.RelativeTimeFormat(opts.locale, { numeric: 'auto' }).format(-1, 'day')
      : new Intl.DateTimeFormat(opts.locale, {
          weekday: 'short', month: 'numeric', day: 'numeric',
          ...(opts.timezone ? { timeZone: opts.timezone } : {}),
        }).format(instant);
  } catch {
    // An invalid timezone in settings must not blank the badge.
    day = new Intl.DateTimeFormat(opts.locale, { weekday: 'short', month: 'numeric', day: 'numeric' }).format(instant);
  }
  // Composed here rather than as a dictionary entry: a day label followed by
  // a time reads the same way in every shipped locale.
  return { text: `${day}, ${time}`, ageMs };
}

/**
 * What both calendar modules show about the health of their feed, in
 * priority order:
 *
 * 1. Nothing configured, or every source the module uses needs a Google
 *    sign-in: the setup card, instead of events that quietly age.
 * 2. The shared fetch failing with no successful fetch ever: "can't load".
 * 3. The shared fetch failing with kept events: "Not updating since …",
 *    loud after a day.
 * 4. The fetch is fine but a source the module uses is failing: named for a
 *    single source, generic for several, and the sign-in wording when only
 *    Google is affected but other calendars still update.
 *
 * `failingSources` and `hasLiveSource` already honor the module's source
 * filter (see useFailingSources): a filtered-out source's outage is not this
 * module's problem.
 */
export function calendarStatusView(opts: {
  calendarSetup: CalendarSetupNeed | undefined;
  calendarStatus: CalendarFetchStatus | undefined;
  failingSources: CalendarSourceStatus[];
  hasLiveSource: boolean;
  timezone: string | undefined;
  timeFormat: TimeFormat | undefined;
  locale: string;
  now: Date;
  today: Date;
  t: TranslateFn;
}): CalendarStatusView {
  const { calendarStatus, failingSources, t } = opts;
  const since = (fetchedAt: number) => formatSince(fetchedAt, opts);
  const setupCard = (setup: CalendarSetupNeed): CalendarStatusView => (setup === 'noSources'
    ? { kind: 'setup', setup, title: t('calendar.noSourcesYet'), hint: t('calendar.noSourcesYetHint') }
    : { kind: 'setup', setup, title: t('calendar.signInAgain'), hint: t('calendar.signInAgainHint') });

  if (opts.calendarSetup === 'noSources') return setupCard('noSources');

  const needsSignIn = failingSources.length > 0
    && failingSources.every((s) => s.messageKey === GOOGLE_NOT_SIGNED_IN_KEY);
  if (needsSignIn && !opts.hasLiveSource) return setupCard('signIn');

  const fetchFailed = calendarStatus?.error != null;
  if (fetchFailed) {
    if (calendarStatus?.updatedAt == null) return { kind: 'cantLoad' };
    const { text, ageMs } = since(calendarStatus.updatedAt);
    return { kind: 'badge', text: t('calendar.notUpdatingSince', { time: text }), loud: ageMs >= LOUD_AFTER_MS };
  }

  if (failingSources.length === 0) return { kind: 'ok' };
  if (needsSignIn) return { kind: 'badge', text: t('calendar.signInAgain'), loud: false };

  // The most recent time any failing source was fine: the outage is at
  // least that old, so the escalation keys off it.
  const newestFetchedAt = failingSources.reduce<number | null>(
    (acc, s) => (s.fetchedAt != null && (acc == null || s.fetchedAt > acc) ? s.fetchedAt : acc),
    null,
  );
  const loud = newestFetchedAt != null && since(newestFetchedAt).ageMs >= LOUD_AFTER_MS;

  if (failingSources.length === 1) {
    const solo = failingSources[0];
    const name = solo.id === 'holidays' ? t('calendar.publicHolidays') : solo.name ?? '';
    const text = solo.fetchedAt != null
      ? t('calendar.sourceNotUpdating', { name, time: since(solo.fetchedAt).text })
      : t('calendar.sourceNotUpdatingNoTime', { name });
    return { kind: 'badge', text, loud };
  }
  return { kind: 'badge', text: t('calendar.sourcesNotUpdating'), loud };
}

/**
 * Shared derivation of the per-source failure presentation both calendar
 * modules render: which sources are failing (honoring the module's source
 * filter — a filtered-out source's outage is not this module's problem),
 * whether any source it uses is still updating, and the id set for legend
 * rings and row "saved" suffixes.
 */
export function useFailingSources({ sourceStatus, sourceFilter }: {
  sourceStatus: CalendarSourceStatus[] | undefined;
  sourceFilter: string[] | undefined;
}): {
  failingSources: CalendarSourceStatus[];
  failingSourceIds: ReadonlySet<string> | undefined;
  hasLiveSource: boolean;
} {
  const scoped = useMemo(() => {
    const all = sourceStatus ?? [];
    return sourceFilter && sourceFilter.length > 0 ? all.filter((s) => sourceFilter.includes(s.id)) : all;
  }, [sourceStatus, sourceFilter]);

  const failingSources = useMemo(() => scoped.filter((s) => !s.ok), [scoped]);

  const failingSourceIds = useMemo(
    () => (failingSources.length ? new Set(failingSources.map((s) => s.id)) : undefined),
    [failingSources],
  );

  return { failingSources, failingSourceIds, hasLiveSource: scoped.some((s) => s.ok) };
}
