import { useMemo } from 'react';
import { isSameDay } from 'date-fns';
import { toTZWallTime } from '@/lib/timezone';
import { formatEventTime } from '@/lib/calendar-utils';
import type { TranslateFn } from '@/i18n';
import { DEFAULT_TIME_FORMAT, type CalendarSourceStatus, type TimeFormat } from '@/types/config';

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
