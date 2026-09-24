import { formatDateSync } from '@/i18n';
import { addDaysISO } from '@/components/modules/chore-chart/types';

/**
 * Render a short day label for a forecast date.
 *
 * `todayISO` is the household's today (`YYYY-MM-DD`), so "Today" and "Tmrw"
 * follow the household's calendar rather than the Pi's clock: a Pi on UTC in
 * a Chicago home used to call tomorrow "Today" every evening. Both sides are
 * calendar dates, so the comparison is plain string equality.
 *
 * Takes pre-resolved `today` / `tomorrowShort` strings rather than a
 * translator + namespace so the helper stays decoupled from the host's
 * i18n routing: "Today" lives in `core`, "Tmrw" lives in the `modules`
 * dictionary under `weather.tomorrowShort`, and the caller threads both
 * in already-translated.
 */
export function dayLabel(
  dateStr: string,
  todayISO: string,
  locale: string,
  labels: { today: string; tomorrowShort: string },
  showRelativeLabel = true,
): string {
  if (showRelativeLabel && dateStr === todayISO) return labels.today;
  if (showRelativeLabel && dateStr === addDaysISO(todayISO, 1)) return labels.tomorrowShort;
  // Local noon of the calendar date, formatted with no zone, reads back as
  // that same date's weekday on any machine.
  return formatDateSync(new Date(dateStr + 'T12:00:00'), 'EEE', { locale });
}
