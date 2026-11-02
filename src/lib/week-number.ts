import { getWeek } from 'date-fns';
import type { WeekStartDay } from '@/types/config';

/**
 * The week number every module prints, from the week start it draws with. A
 * Monday week is numbered the ISO 8601 way (week 1 holds the year's first
 * Thursday, the German "KW"); a Sunday week the US way (week 1 holds
 * 1 January). The two agree in some years and not others: through 2027 they
 * are a week apart, two on Sundays, so two modules on one wall must ask here
 * rather than each picking a rule.
 */
export function weekNumberFor(date: Date, weekStart: WeekStartDay | undefined): number {
  return weekStart === 'monday'
    ? getWeek(date, { weekStartsOn: 1, firstWeekContainsDate: 4 })
    : getWeek(date, { weekStartsOn: 0, firstWeekContainsDate: 1 });
}

/** Regions whose weeks start on Sunday, from CLDR's week data. */
const SUNDAY_REGIONS = new Set([
  'AG', 'AS', 'BD', 'BR', 'BS', 'BT', 'BW', 'BZ', 'CA', 'CO', 'DM', 'DO', 'ET', 'GT', 'GU', 'HK', 'HN', 'ID',
  'IL', 'IN', 'IS', 'JM', 'JP', 'KE', 'KH', 'KR', 'LA', 'MH', 'MM', 'MO', 'MT', 'MX', 'MZ', 'NI', 'NP', 'PA',
  'PE', 'PH', 'PK', 'PR', 'PT', 'PY', 'SA', 'SG', 'SV', 'TH', 'TT', 'TW', 'UM', 'US', 'VE', 'VI', 'WS', 'YE',
  'ZA', 'ZW',
]);

/**
 * The week start a formatting locale conventionally uses, for the modules that
 * have no week-start setting (Clock and Date). The region decides, and a tag
 * without one takes its language's likely region ("en" is the US, "pt" is
 * Brazil). Everywhere else counts as Monday, the regions whose week starts on
 * Saturday included, since a week here starts on one or the other.
 */
export function localeWeekStart(locale: string): WeekStartDay {
  let region: string | undefined;
  try {
    region = new Intl.Locale(locale).maximize().region;
  } catch {
    // Not a tag Intl can read: Monday, as for any region not listed.
  }
  return region !== undefined && SUNDAY_REGIONS.has(region) ? 'sunday' : 'monday';
}
