import { useMemo } from 'react';
import { isSameDay } from 'date-fns';
import { toTZWallTime } from '@/lib/timezone';
import { formatEventTime } from '@/lib/calendar-utils';
import type { TranslateFn } from '@/i18n';
import { DEFAULT_TIME_FORMAT, type CalendarFetchStatus, type CalendarSourceStatus, type TimeFormat } from '@/types/config';

/**
 * The "failure does not mean empty" status both calendar modules render:
 * while the shared fetch is failing, the events on screen are the kept
 * last-good payload — `statusText` badges them as saved rather than live
 * (day-scoped saved-from time, display-timezone formatted). Only a failure
 * with NO successful fetch ever (`neverLoaded`) renders a "can't load"
 * state: last-good data whose visible window happens to be empty is a
 * normal quiet day, not an outage. When the shared fetch is fine but a
 * single source is failing, the text names it via the useFailingSources
 * derivation; several at once fall back to the generic saved wording.
 * `ns` picks each module's namespace for the saved strings, same as
 * `eventKindLabel`.
 */
export function calendarStaleStatus(opts: {
  calendarStatus: CalendarFetchStatus | undefined;
  failingSources: CalendarSourceStatus[];
  soloFailingName: string | undefined;
  soloFailingSince: string | null;
  timezone: string | undefined;
  timeFormat: TimeFormat | undefined;
  locale: string;
  today: Date;
  t: TranslateFn;
  ns: 'calendar' | 'fullscreen-calendar';
}): { fetchFailed: boolean; neverLoaded: boolean; statusText: string | null } {
  const { calendarStatus, t, ns } = opts;
  const fetchFailed = calendarStatus?.error != null;
  const neverLoaded = fetchFailed && calendarStatus?.updatedAt == null;
  // The saved-from time is only meaningful on the day it happened; a
  // multi-day outage falls back to the generic wording.
  const savedWall = fetchFailed && calendarStatus?.updatedAt != null
    ? (opts.timezone ? toTZWallTime(new Date(calendarStatus.updatedAt), opts.timezone) : new Date(calendarStatus.updatedAt))
    : null;
  const staleSince = savedWall && isSameDay(savedWall, opts.today)
    ? formatEventTime(savedWall, opts.timeFormat ?? DEFAULT_TIME_FORMAT, opts.locale)
    : null;
  let statusText: string | null = null;
  if (fetchFailed && !neverLoaded) {
    statusText = staleSince ? t(`${ns}.savedFrom`, { time: staleSince }) : t(`${ns}.savedEvents`);
  } else if (!fetchFailed && opts.failingSources.length > 0) {
    statusText = opts.soloFailingName
      ? (opts.soloFailingSince
        ? t('calendar.sourceNotUpdating', { name: opts.soloFailingName, time: opts.soloFailingSince })
        : t('calendar.sourceNotUpdatingNoTime', { name: opts.soloFailingName }))
      : t(`${ns}.savedEvents`);
  }
  return { fetchFailed, neverLoaded, statusText };
}

/**
 * Shared derivation of the per-source failure presentation both calendar
 * modules render: which sources are failing (honoring the module's source
 * filter — a filtered-out source's outage is not this module's problem), the
 * id set for legend rings and row "saved" suffixes, and the named solo pill
 * ("School not updating since 7:10 AM" — name and since-time resolve to
 * undefined/null when more than one source fails, which callers render as
 * the generic saved wording).
 */
export function useFailingSources({ sourceStatus, sourceFilter, timezone, timeFormat, locale, today, t }: {
  sourceStatus: CalendarSourceStatus[] | undefined;
  sourceFilter: string[] | undefined;
  timezone: string | undefined;
  timeFormat: TimeFormat | undefined;
  locale: string;
  today: Date;
  t: TranslateFn;
}): {
  failingSources: CalendarSourceStatus[];
  failingSourceIds: ReadonlySet<string> | undefined;
  soloFailingName: string | undefined;
  soloFailingSince: string | null;
} {
  const failingSources = useMemo(() => {
    const failing = (sourceStatus ?? []).filter((s) => !s.ok);
    return sourceFilter && sourceFilter.length > 0
      ? failing.filter((s) => sourceFilter.includes(s.id))
      : failing;
  }, [sourceStatus, sourceFilter]);

  const failingSourceIds = useMemo(
    () => (failingSources.length ? new Set(failingSources.map((s) => s.id)) : undefined),
    [failingSources],
  );

  const soloFailing = failingSources.length === 1 ? failingSources[0] : null;
  const soloFailingName = soloFailing
    ? (soloFailing.id === 'holidays' ? t('calendar.publicHolidays') : soloFailing.name)
    : undefined;
  // The since-time is only meaningful on the day it happened; older outages
  // fall back to the time-less wording. Formatted on the display wall clock.
  const soloFailingWall = soloFailing?.fetchedAt != null
    ? (timezone ? toTZWallTime(new Date(soloFailing.fetchedAt), timezone) : new Date(soloFailing.fetchedAt))
    : null;
  const soloFailingSince = soloFailingWall && isSameDay(soloFailingWall, today)
    ? formatEventTime(soloFailingWall, timeFormat ?? DEFAULT_TIME_FORMAT, locale)
    : null;

  return { failingSources, failingSourceIds, soloFailingName, soloFailingSince };
}
