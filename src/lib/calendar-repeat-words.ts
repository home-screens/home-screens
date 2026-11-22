import { formatDateSync } from '@/i18n/formatters';
import type { TranslateFn } from '@/i18n/types';
import type { RepeatFrequency, RepeatReading, RepeatRule } from './calendar-write';
import { daySheetHeading } from './calendar-day-sheet';
import { formatShortDayMonth } from './meal-constants';

/**
 * How a repeat reads on the phone and the wall, from the `core` dictionary
 * both of them load (`calendarRepeat.*`). Worded from the day the event
 * starts ("Every week on Monday"), so nobody has to work out what "weekly"
 * means.
 */

function dateOf(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The day of the month as the sentence wants it: "23rd" in English, the bare number elsewhere. */
function dayOfMonth(iso: string, locale: string): string {
  const n = Number(iso.slice(8, 10));
  if (!locale.toLowerCase().startsWith('en')) return String(n);
  const suffix = { one: 'st', two: 'nd', few: 'rd', other: 'th' } as const;
  const rule = new Intl.PluralRules('en', { type: 'ordinal' }).select(n) as keyof typeof suffix;
  return `${n}${suffix[rule] ?? 'th'}`;
}

/** One choice, worded from `date`: "Every 2 weeks on Monday", "Every year on November 23". */
export function repeatChoiceWords(frequency: RepeatFrequency, date: string, locale: string, t: TranslateFn): string {
  const day = dateOf(date);
  const weekday = formatDateSync(day, 'EEEE', { locale });
  switch (frequency) {
    case 'daily': return t('calendarRepeat.daily');
    case 'weekdays': return t('calendarRepeat.weekdays');
    case 'weekly': return t('calendarRepeat.weekly', { weekday });
    case 'biweekly': return t('calendarRepeat.biweekly', { weekday });
    case 'monthly': return t('calendarRepeat.monthly', { day: dayOfMonth(date, locale) });
    case 'yearly': return t('calendarRepeat.yearly', { date: daySheetHeading(day, locale).date });
  }
}

/** A whole rule, with its stop: "Every week on Monday, until Dec 18". */
export function repeatWords(rule: RepeatRule | null | undefined, date: string, locale: string, t: TranslateFn): string {
  if (!rule) return t('calendarRepeat.none');
  const words = repeatChoiceWords(rule.frequency, date, locale, t);
  if (!rule.until) return words;
  return t('calendarRepeat.until', { rule: words, date: formatShortDayMonth(rule.until, locale) });
}

/** A saved repeat as the forms show it, including one set up elsewhere that they cannot change. */
export function repeatReadingWords(reading: RepeatReading, date: string, locale: string, t: TranslateFn): string {
  if (reading.kind === 'other') return t('calendarRepeat.other');
  return repeatWords(reading.kind === 'known' ? reading.rule : null, date, locale, t);
}

/** The short form for the wall's half-width Repeats box: "Every week". */
export function repeatShortWords(rule: RepeatRule | null | undefined, t: TranslateFn): string {
  return rule ? t(`calendarRepeat.short.${rule.frequency}`) : t('calendarRepeat.none');
}
