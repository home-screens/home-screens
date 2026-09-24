import { describe, it, expect } from 'vitest';
import { formatClockTime, formatClockMinutes, householdTimeFormat, localeTimeFormat, settingsTimeFormat } from '@/lib/clock-time';
import { formatMealTime } from '@/lib/meal-constants';

// ── formatClockTime ──

describe('formatClockTime', () => {
  it('formats midnight, noon and the ends of the day in 12h', () => {
    expect(formatClockTime('00:00', '12h')).toBe('12:00 AM');
    expect(formatClockTime('12:00', '12h')).toBe('12:00 PM');
    expect(formatClockTime('12:05', '12h')).toBe('12:05 PM');
    expect(formatClockTime('23:59', '12h')).toBe('11:59 PM');
  });

  it('formats the same times in 24h', () => {
    expect(formatClockTime('00:00', '24h')).toBe('00:00');
    expect(formatClockTime('12:00', '24h')).toBe('12:00');
    expect(formatClockTime('12:05', '24h')).toBe('12:05');
    expect(formatClockTime('23:59', '24h')).toBe('23:59');
  });

  it('drops the leading zero on the hour in 12h and keeps it in 24h', () => {
    expect(formatClockTime('07:30', '12h')).toBe('7:30 AM');
    expect(formatClockTime('07:30', '24h')).toBe('07:30');
    expect(formatClockTime('9:00', '24h')).toBe('09:00');
    expect(formatClockTime('9:00', '12h')).toBe('9:00 AM');
  });

  it('switches the day period at noon, not at 1 PM', () => {
    expect(formatClockTime('11:59', '12h')).toBe('11:59 AM');
    expect(formatClockTime('13:00', '12h')).toBe('1:00 PM');
  });

  it('returns an empty string for missing input', () => {
    expect(formatClockTime(undefined, '12h')).toBe('');
    expect(formatClockTime(null, '12h')).toBe('');
    expect(formatClockTime('', '12h')).toBe('');
  });

  it('returns an empty string for malformed or out-of-range input', () => {
    expect(formatClockTime('abc', '12h')).toBe('');
    expect(formatClockTime('12', '12h')).toBe('');
    expect(formatClockTime('12:5', '12h')).toBe('');
    expect(formatClockTime('12:005', '12h')).toBe('');
    expect(formatClockTime('24:00', '12h')).toBe('');
    expect(formatClockTime('25:00', '12h')).toBe('');
    expect(formatClockTime('12:60', '12h')).toBe('');
    expect(formatClockTime(' 12:00', '12h')).toBe('');
  });
});

// ── formatClockMinutes ──

describe('formatClockMinutes', () => {
  it('formats minutes from midnight in both formats', () => {
    expect(formatClockMinutes(0, '12h')).toBe('12:00 AM');
    expect(formatClockMinutes(0, '24h')).toBe('00:00');
    expect(formatClockMinutes(720, '12h')).toBe('12:00 PM');
    expect(formatClockMinutes(720, '24h')).toBe('12:00');
    expect(formatClockMinutes(725, '12h')).toBe('12:05 PM');
    expect(formatClockMinutes(725, '24h')).toBe('12:05');
    expect(formatClockMinutes(1439, '12h')).toBe('11:59 PM');
    expect(formatClockMinutes(1439, '24h')).toBe('23:59');
  });

  it('returns an empty string outside a single day', () => {
    expect(formatClockMinutes(-1, '12h')).toBe('');
    expect(formatClockMinutes(1440, '12h')).toBe('');
    expect(formatClockMinutes(99999, '12h')).toBe('');
  });

  it('returns an empty string for missing or non-integer input', () => {
    expect(formatClockMinutes(undefined, '12h')).toBe('');
    expect(formatClockMinutes(null, '12h')).toBe('');
    expect(formatClockMinutes(NaN, '12h')).toBe('');
    expect(formatClockMinutes(90.5, '12h')).toBe('');
  });

  it('agrees with formatClockTime across every minute of the day', () => {
    for (let minutes = 0; minutes < 1440; minutes++) {
      const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      expect(formatClockMinutes(minutes, '12h')).toBe(formatClockTime(hhmm, '12h'));
      expect(formatClockMinutes(minutes, '24h')).toBe(formatClockTime(hhmm, '24h'));
    }
  });
});

// ── householdTimeFormat ──

describe('householdTimeFormat', () => {
  it('keeps a choice the household made, whatever its language', () => {
    expect(householdTimeFormat('12h', 'da-DK')).toBe('12h');
    expect(householdTimeFormat('24h', 'en-US')).toBe('24h');
  });

  it("follows the language's own clock when nothing was chosen", () => {
    expect(householdTimeFormat(undefined, 'en-US')).toBe('12h');
    expect(householdTimeFormat(null, 'da-DK')).toBe('24h');
    expect(householdTimeFormat(undefined, 'pt-BR')).toBe('24h');
    expect(householdTimeFormat(undefined, 'de-DE')).toBe('24h');
    // The tag alone would guess wrong for these two.
    expect(localeTimeFormat('en-GB')).toBe('24h');
    expect(localeTimeFormat('fr-CA')).toBe('24h');
  });

  it('reads the formatting language before the language', () => {
    expect(settingsTimeFormat({ locale: 'en-US', formattingLocale: 'da-DK' })).toBe('24h');
    expect(settingsTimeFormat({ locale: 'da-DK' })).toBe('24h');
    expect(settingsTimeFormat({ locale: 'da-DK', timeFormat: '12h' })).toBe('12h');
    expect(settingsTimeFormat(undefined)).toBe('12h');
  });
});

// ── Parity with the meal planner's existing output ──

/**
 * The meal planner formatted its own times before this module existed. These
 * are its exact shipped strings; the shared formatter has to keep producing
 * them, because every meal surface and its own test file expect them.
 */
const MEAL_PARITY_TABLE: { time: string; twelve: string; twentyFour: string }[] = [
  { time: '00:00', twelve: '12:00 AM', twentyFour: '00:00' },
  { time: '00:01', twelve: '12:01 AM', twentyFour: '00:01' },
  { time: '07:30', twelve: '7:30 AM',  twentyFour: '07:30' },
  { time: '9:00',  twelve: '9:00 AM',  twentyFour: '09:00' },
  { time: '11:59', twelve: '11:59 AM', twentyFour: '11:59' },
  { time: '12:00', twelve: '12:00 PM', twentyFour: '12:00' },
  { time: '12:05', twelve: '12:05 PM', twentyFour: '12:05' },
  { time: '12:30', twelve: '12:30 PM', twentyFour: '12:30' },
  { time: '13:00', twelve: '1:00 PM',  twentyFour: '13:00' },
  { time: '18:30', twelve: '6:30 PM',  twentyFour: '18:30' },
  { time: '23:59', twelve: '11:59 PM', twentyFour: '23:59' },
];

const MEAL_PARITY_REJECTS = ['', 'abc', '25:00', '12:60', '12', '12:5'];

describe('parity with formatMealTime', () => {
  for (const row of MEAL_PARITY_TABLE) {
    it(`${row.time} still renders as before`, () => {
      expect(formatClockTime(row.time, '12h')).toBe(row.twelve);
      expect(formatClockTime(row.time, '24h')).toBe(row.twentyFour);
      expect(formatMealTime(row.time, '12h')).toBe(row.twelve);
      expect(formatMealTime(row.time, '24h')).toBe(row.twentyFour);
    });
  }

  it('rejects the same inputs the meal planner rejected', () => {
    for (const bad of MEAL_PARITY_REJECTS) {
      expect(formatClockTime(bad, '12h')).toBe('');
      expect(formatMealTime(bad, '12h')).toBe('');
    }
    expect(formatMealTime(undefined, '12h')).toBe('');
  });
});
