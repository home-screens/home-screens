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
 *
 * One carve-out: `colon` keeps its seconds segment at every magnitude. Without
 * unit letters the same segment count silently changes meaning at a boundary,
 * so `59:59` (m:s) was followed by `1:00` (h:m) and the counter appeared to
 * reset — and again at 24h, `23:59` (h:m) then `1:00:00` (d:h:m). Anchoring the
 * rightmost segment to seconds is the only rule monotonic at both.
 */

import type { ElapsedFormat, ElapsedPrecision } from '@/types/config';
import { decompose, formatDuration, PRECISION_UNITS, type Unit, type UnitValue } from '@/lib/duration-format';

function selectUnits(diffMs: number, precision: ElapsedPrecision, format: ElapsedFormat): UnitValue[] {
  const { totalSeconds, days, hours, minutes, seconds } = decompose(diffMs);
  const values: Record<Unit, number> = { days, hours, minutes, seconds };

  if (precision !== 'auto') {
    return PRECISION_UNITS[precision].map((unit) => ({ unit, value: values[unit] }));
  }

  // `auto` normally drops seconds past the 1h mark. That's fine for the
  // unit-letter formats, which stay self-describing ("59m 59s" → "1h 0m"), but
  // `colon` has no letters: the same two-segment shape silently changed meaning,
  // so a counter reading "59:59" (59m 59s) appeared to RESET to "1:00" (1h 0m)
  // one second later. Keeping seconds for `colon` makes the rightmost segment
  // always mean seconds, so it reads "59:59" → "1:00:00" and stays monotonic.
  const dropSeconds = totalSeconds >= 3600 && format !== 'colon';
  const allowed: Unit[] = dropSeconds
    ? ['days', 'hours', 'minutes']
    : ['days', 'hours', 'minutes', 'seconds'];
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
  const units = selectUnits(diffMs, precision, format);
  return formatDuration(units, format, locale);
}
