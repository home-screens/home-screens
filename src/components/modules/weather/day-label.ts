import { isToday, isTomorrow } from 'date-fns';
import { formatDateSync } from '@/i18n';

/**
 * Render a short day label for a forecast date.
 *
 * Takes pre-resolved `today` / `tomorrowShort` strings rather than a
 * translator + namespace so the helper stays decoupled from the host's
 * i18n routing — "Today" lives in `core`, "Tmrw" lives in the `modules`
 * dictionary under `weather.tomorrowShort`, and the caller threads both
 * in already-translated.
 */
export function dayLabel(
  dateStr: string,
  locale: string,
  labels: { today: string; tomorrowShort: string },
): string {
  const date = new Date(dateStr + 'T12:00:00');
  if (isToday(date)) return labels.today;
  if (isTomorrow(date)) return labels.tomorrowShort;
  return formatDateSync(date, 'EEE', { locale });
}
