/**
 * Shared duration-formatting machinery — the reusable half of the Clock
 * module's Elapsed (Since/Until) view, extracted so the Countdown module can
 * render the same curated set of unit styles.
 *
 * Two independent, curated axes — both single-select, deliberately not
 * free-form pickers:
 *
 * - `format`: how units are rendered — `units` (50d), `unitsUpper` (50D),
 *   `unitsShort` (50day), `colon` (50:20:13), `words` (50 days, localized via
 *   Intl.DurationFormat), `wordsTitle` (50 Days — same localized rendering,
 *   with just the unit words capitalized via `formatToParts` so locale
 *   punctuation/connectors like ", " or " and " stay untouched).
 * - `precision`: which units are shown. `'auto'` is caller-specific (each
 *   consumer decides which units to include for a given duration); every
 *   other precision is a named, fixed unit set (`PRECISION_UNITS`) shown
 *   unconditionally (no zero-suppression).
 *
 * This module owns only the rendering and decomposition primitives; unit
 * selection (especially the `'auto'` rule) lives with each caller.
 */

export type DurationFormat = 'units' | 'unitsUpper' | 'unitsShort' | 'colon' | 'words' | 'wordsTitle';
export type DurationPrecision = 'auto' | 'days' | 'daysHours' | 'daysHoursMinutes' | 'daysHoursMinutesSeconds';

export type Unit = 'days' | 'hours' | 'minutes' | 'seconds';

export interface UnitValue {
  unit: Unit;
  value: number;
}

export const PRECISION_UNITS: Record<Exclude<DurationPrecision, 'auto'>, Unit[]> = {
  days: ['days'],
  daysHours: ['days', 'hours'],
  daysHoursMinutes: ['days', 'hours', 'minutes'],
  daysHoursMinutesSeconds: ['days', 'hours', 'minutes', 'seconds'],
};

export function decompose(diffMs: number) {
  const totalSeconds = Math.floor(Math.abs(diffMs) / 1000);
  return {
    totalSeconds,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
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

/**
 * Memoized `Intl.DurationFormat` instances, keyed by locale + which units are
 * displayed.
 *
 * Construction is not a cheap allocation — it canonicalizes the locale and
 * builds internal NumberFormat/ListFormat objects per displayed unit — and both
 * callers tick at 1Hz forever on a kiosk that never reloads. One Clock in the
 * `elapsed` view was ~86k constructions/day; a Countdown `all` view with five
 * events, five times that.
 *
 * The key space is closed and tiny: 7 locales × the handful of unit
 * combinations `auto`/fixed precision can produce, well under 100 entries, so
 * this never needs eviction. A null value memoizes "construction threw here",
 * so a bad locale doesn't retry-and-throw every single tick.
 */
const formatterCache = new Map<string, Intl.DurationFormat | null>();

function getDurationFormatter(
  locale: string,
  options: Intl.DurationFormatOptions,
): Intl.DurationFormat | null {
  // Every slot delimited. Concatenating them bare collided on unit-set SIZE:
  // each value is 'always' or '', so ['hours','minutes'], ['minutes','seconds']
  // and ['days','hours'] all produced "en-US|alwaysalways". The first formatter
  // constructed then served all three, applying `Display: 'always'` to units the
  // caller never asked for and leaving the caller's real units on the default
  // `auto` — which zero-suppresses, the exact thing renderWords must prevent.
  // A Clock crossing the 1h boundary visibly gained units: 45s rendered as
  // "0 hours, 0 minutes, 45 seconds".
  const key = [
    locale,
    options.daysDisplay ?? '',
    options.hoursDisplay ?? '',
    options.minutesDisplay ?? '',
    options.secondsDisplay ?? '',
  ].join('|');
  const cached = formatterCache.get(key);
  if (cached !== undefined) return cached;
  let formatter: Intl.DurationFormat | null;
  try {
    formatter = new Intl.DurationFormat(locale, options);
  } catch {
    formatter = null;
  }
  formatterCache.set(key, formatter);
  return formatter;
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
    const formatter = getDurationFormatter(locale, options);
    if (!formatter) return renderWordsFallback(units, titleCase);
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

export function formatDuration(units: UnitValue[], format: DurationFormat, locale: string): string {
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
