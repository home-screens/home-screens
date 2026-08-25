import { startOfDay } from 'date-fns';
import { formatDateSync } from '@/i18n';
import type { TranslateFn } from '@/i18n';
import type { TimeFormat } from '@/types/config';

/**
 * Shared support for the compact calendar views (the module imports the
 * views and the views import this file, mirroring the fullscreen layout).
 */

/**
 * How event lines render, resolved once per module render and threaded to
 * every view as a single memoized object (its identity only changes when a
 * field does, so the memoized EventCard stays cached across clock ticks).
 * `timezone` rides along because event times must be formatted and bucketed
 * in the display's timezone, exactly like the grid's today-highlight.
 */
export interface EventDisplayStyle {
  timeFormat: TimeFormat;
  gridStyle: 'classic' | 'colored';
  pillBackground: boolean;
  timezone?: string;
  /** Sources whose feed is failing; list rows add a "saved" time suffix. */
  failingSourceIds?: ReadonlySet<string>;
}

/** Accent color at a given alpha. ColorPicker's text input accepts any CSS
 * color, so plain hex-suffix concatenation ("red" + "cc") would produce
 * invalid CSS; only append when the value really is a 6-digit hex. */
export function withAlpha(color: string, alphaHex: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${alphaHex}`;
  const pct = Math.round((parseInt(alphaHex, 16) / 255) * 100);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

/** "Today" / "Tomorrow" / "Yesterday" / "Friday, Mar 6" for a day header. */
export function formatRelativeDay(
  date: Date,
  today: Date,
  tCore: TranslateFn,
  locale: string,
): string {
  const diffDays = Math.round((startOfDay(date).getTime() - startOfDay(today).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return tCore('today');
  if (diffDays === 1) return tCore('tomorrow');
  if (diffDays === -1) return tCore('yesterday');
  return formatDateSync(date, 'EEEE, MMM d', { locale });
}
