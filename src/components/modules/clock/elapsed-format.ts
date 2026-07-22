/**
 * Duration formatting for the Clock module's Elapsed (Since/Until) view.
 *
 * Two independent, curated axes — both single-select, deliberately not
 * free-form pickers:
 *
 * - `format`: how units are rendered — `units` (50d), `unitsUpper` (50D),
 *   `unitsShort` (50day), `colon` (50:20:13), `words` (50 days, localized via
 *   Intl.DurationFormat), `wordsTitle` (50 Days — same localized rendering,
 *   with just the unit words capitalized via `formatToParts` so locale
 *   punctuation/connectors like ", " or " and " stay untouched).
 * - `precision`: which units are shown. `'auto'` reproduces the legacy
 *   adaptive rule exactly (days/hours dropped when zero, hours forced back
 *   on once days is active, minutes always shown, seconds only under 1h) —
 *   `units`/`'auto'` output stays byte-identical to the pre-existing
 *   formatter. Every other precision is a named, fixed unit set shown
 *   unconditionally (no zero-suppression).
 */

import type { ElapsedFormat, ElapsedPrecision } from '@/types/config';

type Unit = 'days' | 'hours' | 'minutes' | 'seconds';

interface UnitValue {
  unit: Unit;
  value: number;
}

const PRECISION_UNITS: Record<Exclude<ElapsedPrecision, 'auto'>, Unit[]> = {
  days: ['days'],
  daysHours: ['days', 'hours'],
  daysHoursMinutes: ['days', 'hours', 'minutes'],
  daysHoursMinutesSeconds: ['days', 'hours', 'minutes', 'seconds'],
};

function decompose(diffMs: number) {
  const totalSeconds = Math.floor(Math.abs(diffMs) / 1000);
  return {
    totalSeconds,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function selectUnits(diffMs: number, precision: ElapsedPrecision): UnitValue[] {
  const { totalSeconds, days, hours, minutes, seconds } = decompose(diffMs);
  const values: Record<Unit, number> = { days, hours, minutes, seconds };

  if (precision !== 'auto') {
    return PRECISION_UNITS[precision].map((unit) => ({ unit, value: values[unit] }));
  }

  const allowed: Unit[] = totalSeconds < 3600 ? ['days', 'hours', 'minutes', 'seconds'] : ['days', 'hours', 'minutes'];
  const included: UnitValue[] = [];
  let daysIncluded = false;
  for (const unit of allowed) {
    if (unit === 'days') {
      if (days > 0) {
        included.push({ unit, value: days });
        daysIncluded = true;
      }
    } else if (unit === 'hours') {
      if (hours > 0 || daysIncluded) included.push({ unit, value: hours });
    } else {
      // minutes (always allowed) and seconds (allowed only under 1h) are
      // unconditional whenever they're in `allowed` — reproduces the legacy
      // formatter's unconditional `${mins}m`.
      included.push({ unit, value: values[unit] });
    }
  }

  return included;
}

const UNIT_SUFFIX: Record<Unit, string> = { days: 'd', hours: 'h', minutes: 'm', seconds: 's' };
const UNIT_SHORT_WORD: Record<Unit, string> = { days: 'day', hours: 'hr', minutes: 'min', seconds: 'sec' };
const ENGLISH_UNIT_WORD: Record<Unit, string> = { days: 'days', hours: 'hours', minutes: 'minutes', seconds: 'seconds' };

function capitalize(word: string): string {
  return word.length ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function renderUnits(units: UnitValue[], uppercase: boolean): string {
  return units
    .map(({ unit, value }) => `${value}${uppercase ? UNIT_SUFFIX[unit].toUpperCase() : UNIT_SUFFIX[unit]}`)
    .join(' ');
}

function renderUnitsShort(units: UnitValue[]): string {
  return units.map(({ unit, value }) => `${value}${UNIT_SHORT_WORD[unit]}`).join(' ');
}

function renderColon(units: UnitValue[]): string {
  return units.map(({ value }, i) => (i === 0 ? String(value) : String(value).padStart(2, '0'))).join(':');
}

function renderWordsFallback(units: UnitValue[], titleCase: boolean): string {
  return units.map(({ unit, value }) => `${value} ${titleCase ? capitalize(ENGLISH_UNIT_WORD[unit]) : ENGLISH_UNIT_WORD[unit]}`).join(' ');
}

// Every unit Intl.DurationFormat is asked to render must be explicitly
// marked `Display: 'always'` — its default hides ANY zero-valued unit
// (verified: `{days:1,hours:0,minutes:0}` renders as just "1 day" with no
// options), which would silently drop the `1d 0h 0m` quirk and render an
// empty string for a diffMs of exactly 0.
function renderWords(units: UnitValue[], locale: string, titleCase: boolean): string {
  if (typeof Intl.DurationFormat !== 'function') {
    return renderWordsFallback(units, titleCase);
  }

  const options: Intl.DurationFormatOptions = { style: 'long' };
  const duration: Partial<Record<Unit, number>> = {};
  for (const { unit, value } of units) {
    duration[unit] = value;
    if (unit === 'days') options.daysDisplay = 'always';
    else if (unit === 'hours') options.hoursDisplay = 'always';
    else if (unit === 'minutes') options.minutesDisplay = 'always';
    else options.secondsDisplay = 'always';
  }

  try {
    const formatter = new Intl.DurationFormat(locale, options);
    if (!titleCase) return formatter.format(duration);
    // Capitalize only the actual unit-word parts (type 'unit') — numbers and
    // locale punctuation/connectors (", ", " and ", "y ", "und "...) pass
    // through untouched, so grammar stays correct in every locale.
    return formatter
      .formatToParts(duration)
      .map((part) => (part.type === 'unit' ? capitalize(part.value) : part.value))
      .join('');
  } catch {
    return renderWordsFallback(units, titleCase);
  }
}

export function formatElapsed(diffMs: number, format: ElapsedFormat, precision: ElapsedPrecision, locale: string): string {
  const units = selectUnits(diffMs, precision);
  switch (format) {
    case 'unitsUpper':
      return renderUnits(units, true);
    case 'unitsShort':
      return renderUnitsShort(units);
    case 'colon':
      return renderColon(units);
    case 'wordsTitle':
      return renderWords(units, locale, true);
    case 'words':
      return renderWords(units, locale, false);
    case 'units':
    default:
      return renderUnits(units, false);
  }
}
