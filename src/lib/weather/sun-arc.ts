/**
 * What a sun card says about today, as a pure rule: where the sun sits on its
 * arc, whether it is drawn at all, and how long the day is. One model for the
 * full-screen Almanac's sun card and the regular weather module's Sun and
 * moon view; each keeps its own drawing.
 */
import { decompose } from '@/lib/duration-format';
import type { SunTimes } from './sun-times';

export interface SunArcModel {
  /** False on a polar day or night: there is no sunrise or sunset to mark. */
  hasArc: boolean;
  /**
   * Whether the sun is drawn. After sunset (and before sunrise) it is gone,
   * not parked on the horizon it last crossed.
   */
  showSun: boolean;
  /** 0 at sunrise, 1 at sunset, clamped. */
  progress: number;
  /** Whole hours and minutes of daylight, both rounded down so 11 h 59.6 min never reads "11h 60m". */
  dayLength: { hours: number; minutes: number };
  /** Which polar condition holds when there is no arc. */
  polar: 'day' | 'night' | null;
}

/** `nowHour` is the fractional hour on the display's clock. */
export function sunArcModel(sun: SunTimes, nowHour: number): SunArcModel {
  const hasArc = sun.sunrise != null && sun.sunset != null;
  const span = sun.sunsetHour - sun.sunriseHour;
  const progress = span <= 0 ? 0 : Math.max(0, Math.min(1, (nowHour - sun.sunriseHour) / span));
  const { days, hours, minutes } = decompose(sun.dayLengthMs);
  return {
    hasArc,
    showSun: hasArc && !sun.isNight,
    progress,
    dayLength: { hours: days * 24 + hours, minutes },
    polar: hasArc ? null : sun.isNight ? 'night' : 'day',
  };
}

/** Points along a sun arc of the given box, ready for a spline. */
export function sunArcPoints(x: (k: number) => number, y: (k: number) => number): Array<[number, number]> {
  return Array.from({ length: 41 }, (_, i) => [x(i / 40), y(i / 40)] as [number, number]);
}

/**
 * A count and its short unit in the formatting language, kept apart so a
 * headline can set the unit smaller than the number: "9" and "h" in English,
 * "9" and "u" in Dutch, "14" and "Min." in German.
 */
export function shortUnitParts(value: number, unit: 'hour' | 'minute', locale: string): { value: string; unit: string } {
  const parts = new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }).formatToParts(value);
  return {
    value: parts.filter((p) => p.type !== 'unit' && p.type !== 'literal').map((p) => p.value).join(''),
    unit: parts.find((p) => p.type === 'unit')?.value ?? '',
  };
}

/** A day's length as one short line in the formatting language: "15h 0m", "15h 0 Min." in German. */
export function dayLengthText(dayLength: { hours: number; minutes: number }, locale: string): string {
  const short = (value: number, unit: 'hour' | 'minute') => new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(value);
  return `${short(dayLength.hours, 'hour')} ${short(dayLength.minutes, 'minute')}`;
}
