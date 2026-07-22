/**
 * Duration formatting for the Clock module's Elapsed (Since/Until) view.
 *
 * The rendering half (format styles, decomposition, the `PRECISION_UNITS`
 * table) lives in `@/lib/duration-format` and is shared with the Countdown
 * module. This file keeps only the Clock-specific `'auto'` selection rule:
 * days/hours dropped when zero, hours forced back on once days is active,
 * minutes always shown, seconds only under 1h — `units`/`'auto'` output stays
 * byte-identical to the pre-existing formatter. Every other precision is a
 * named, fixed unit set shown unconditionally (no zero-suppression).
 */

import type { ElapsedFormat, ElapsedPrecision } from '@/types/config';
import { decompose, formatDuration, PRECISION_UNITS, type Unit, type UnitValue } from '@/lib/duration-format';

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

export function formatElapsed(diffMs: number, format: ElapsedFormat, precision: ElapsedPrecision, locale: string): string {
  const units = selectUnits(diffMs, precision);
  return formatDuration(units, format, locale);
}
