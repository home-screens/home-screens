import { isToday, isTomorrow } from 'date-fns';
import { formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';

/**
 * Render a short day label for a forecast date.
 *
 * Uses the provided translator (`t`) for "Today" / "Tmrw" so the label is
 * locale-aware; falls through to the date-fns `EEE` token (already
 * locale-driven via `formattingLocale`) for any other day.
 */
export function dayLabel(dateStr: string, locale: string, t: TranslateFn): string {
  const date = new Date(dateStr + 'T12:00:00');
  if (isToday(date)) return t('weather.today');
  if (isTomorrow(date)) return t('weather.tomorrowShort');
  return formatDateSync(date, 'EEE', { locale });
}
