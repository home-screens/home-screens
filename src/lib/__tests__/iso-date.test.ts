import { describe, expect, it } from 'vitest';
import {
  DAY_MS, addIsoDays, isIsoDate, isoDaysBetween, isoUtcMs, isoWeekday, localDateFromIso, mondayOf,
  parseIsoDate, weekDatesContaining,
} from '../iso-date';

/** Run `fn` with the process in a zone, so the "no clock, no zone" promise is tested where it could break. */
function inZone<T>(tz: string, fn: () => T): T {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

const ZONES = ['UTC', 'America/Chicago', 'Europe/Berlin', 'Pacific/Auckland', 'America/Sao_Paulo'];

describe('isIsoDate', () => {
  it('takes real calendar days only', () => {
    expect(isIsoDate('2026-11-02')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-11-2')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(20261102)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe('addIsoDays', () => {
  it('moves inside a month, both ways, and leaves zero alone', () => {
    expect(addIsoDays('2026-03-15', 5)).toBe('2026-03-20');
    expect(addIsoDays('2026-03-15', -5)).toBe('2026-03-10');
    expect(addIsoDays('2026-03-15', 0)).toBe('2026-03-15');
  });

  it('crosses month ends', () => {
    expect(addIsoDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addIsoDays('2026-03-30', 5)).toBe('2026-04-04');
    expect(addIsoDays('2026-03-02', -5)).toBe('2026-02-25');
    expect(addIsoDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('crosses year ends', () => {
    expect(addIsoDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addIsoDays('2025-12-30', 5)).toBe('2026-01-04');
    expect(addIsoDays('2026-01-02', -5)).toBe('2025-12-28');
  });

  it('knows a leap year', () => {
    expect(addIsoDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addIsoDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addIsoDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('walks ninety days back and forward to the same day', () => {
    expect(addIsoDays(addIsoDays('2026-04-09', -90), 90)).toBe('2026-04-09');
  });

  it('counts each day once through both daylight-saving weeks, in any zone', () => {
    for (const tz of ZONES) {
      inZone(tz, () => {
        // US spring forward (March 8) and fall back (November 1), 2026.
        expect(addIsoDays('2026-03-07', 1), tz).toBe('2026-03-08');
        expect(addIsoDays('2026-03-08', 1), tz).toBe('2026-03-09');
        expect(addIsoDays('2026-03-09', -1), tz).toBe('2026-03-08');
        expect(addIsoDays('2026-10-31', 1), tz).toBe('2026-11-01');
        expect(addIsoDays('2026-11-01', 1), tz).toBe('2026-11-02');
        // Europe: March 29 and October 25.
        expect(addIsoDays('2026-03-28', 2), tz).toBe('2026-03-30');
        expect(addIsoDays('2026-10-24', 2), tz).toBe('2026-10-26');
        let day = '2026-03-01';
        for (let i = 0; i < 31; i++) day = addIsoDays(day, 1);
        expect(day, tz).toBe('2026-04-01');
      });
    }
  });

  it('answers a string that is no day, and does not throw, for anything that is not a day', () => {
    expect(addIsoDays('', 1)).toBe('NaN-NaN-NaN');
    expect(addIsoDays('nope', 1)).toBe('NaN-NaN-NaN');
    expect(addIsoDays('2026-03', 1)).toBe('NaN-NaN-NaN');
    expect(addIsoDays('2026-03-15', NaN)).toBe('NaN-NaN-NaN');
    // It equals no real day and sorts after every one, so a "while day <= last" loop ends.
    expect('NaN-NaN-NaN' > '9999-12-31').toBe(true);
  });
});

describe('isoUtcMs', () => {
  it('is UTC midnight of the day, a whole number of days from any other', () => {
    expect(isoUtcMs('1970-01-01')).toBe(0);
    expect(isoUtcMs('2026-03-09') - isoUtcMs('2026-03-08')).toBe(DAY_MS);
    expect(isoUtcMs('2027-01-01') - isoUtcMs('2026-12-31')).toBe(DAY_MS);
  });

  it('is NaN for anything that is not a day', () => {
    expect(isoUtcMs('')).toBeNaN();
    expect(isoUtcMs('soon')).toBeNaN();
  });
});

describe('isoWeekday', () => {
  it('names the weekday, Sunday as 0', () => {
    expect(isoWeekday('2026-04-04')).toBe(6);
    expect(isoWeekday('2026-04-05')).toBe(0);
    expect(isoWeekday('2026-04-06')).toBe(1);
    expect(isoWeekday('2026-12-31')).toBe(4);
    expect(isoWeekday('2027-01-01')).toBe(5);
  });

  it('agrees with the local calendar in every zone, daylight-saving days included', () => {
    for (const tz of ZONES) {
      inZone(tz, () => {
        for (const day of ['2026-03-08', '2026-03-29', '2026-10-25', '2026-11-01', '2026-12-31']) {
          expect(isoWeekday(day), `${tz} ${day}`).toBe(localDateFromIso(day).getDay());
        }
      });
    }
  });

  it('is NaN for anything that is not a day', () => {
    expect(isoWeekday('')).toBeNaN();
  });
});

describe('mondayOf', () => {
  it('keeps a Monday and walks every other day back to it', () => {
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
    expect(mondayOf('2026-11-18')).toBe('2026-11-16');
    expect(mondayOf('2026-11-21')).toBe('2026-11-16');
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
  });

  it('crosses a month and a year', () => {
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
  });

  it('holds through the daylight-saving weeks', () => {
    for (const tz of ZONES) {
      inZone(tz, () => {
        expect(mondayOf('2026-03-08'), tz).toBe('2026-03-02');
        expect(mondayOf('2026-03-09'), tz).toBe('2026-03-09');
        expect(mondayOf('2026-11-01'), tz).toBe('2026-10-26');
      });
    }
  });

  it('answers a string that is no day for anything that is not one', () => {
    expect(mondayOf('nope')).toBe('NaN-NaN-NaN');
  });
});

describe('weekDatesContaining', () => {
  it('lists a Sunday-start week', () => {
    // 2026-04-09 is a Thursday.
    expect(weekDatesContaining('2026-04-09', 'sunday')).toEqual([
      '2026-04-05', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11',
    ]);
  });

  it('lists a Monday-start week, with Sunday last', () => {
    expect(weekDatesContaining('2026-04-09', 'monday')[0]).toBe('2026-04-06');
    expect(weekDatesContaining('2026-04-12', 'monday')).toEqual([
      '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11', '2026-04-12',
    ]);
    expect(weekDatesContaining('2026-04-12', 'sunday')[0]).toBe('2026-04-12');
  });

  it('crosses a year end and a daylight-saving change with seven different days', () => {
    expect(weekDatesContaining('2026-12-31', 'sunday')).toEqual([
      '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02',
    ]);
    for (const tz of ZONES) {
      inZone(tz, () => {
        const week = weekDatesContaining('2026-03-10', 'sunday');
        expect(week, tz).toEqual(['2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14']);
        expect(new Set(weekDatesContaining('2026-11-01', 'monday')).size, tz).toBe(7);
      });
    }
  });

  it('gives seven strings that are no day for anything that is not one', () => {
    expect(weekDatesContaining('', 'sunday')).toEqual(Array(7).fill('NaN-NaN-NaN'));
  });
});

describe('localDateFromIso', () => {
  it('is local midnight of the day', () => {
    for (const tz of ZONES) {
      inZone(tz, () => {
        const d = localDateFromIso('2026-04-09');
        expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], tz).toEqual([2026, 3, 9, 0]);
        expect(localDateFromIso('2026-12-31').getDay(), tz).toBe(4);
      });
    }
  });

  it('is an Invalid Date for anything that is not a day', () => {
    expect(localDateFromIso('').getTime()).toBeNaN();
    expect(localDateFromIso('soon').getTime()).toBeNaN();
  });
});

describe('parseIsoDate', () => {
  it('reads a day as local midnight', () => {
    expect(parseIsoDate('2026-09-09')?.getDate()).toBe(9);
    expect(parseIsoDate('2026-09-09')?.getHours()).toBe(0);
  });

  it('is null for anything not spelled YYYY-MM-DD', () => {
    expect(parseIsoDate('nope')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate('2026-9-9')).toBeNull();
    expect(parseIsoDate('2026-09-09T10:00:00')).toBeNull();
  });

  it('rolls an impossible day forward, as a Date does, and does not refuse it', () => {
    expect(parseIsoDate('2026-13-40')).not.toBeNull();
    expect(parseIsoDate('2026-02-30')?.getMonth()).toBe(2);
  });
});

describe('isoDaysBetween', () => {
  it('counts whole days across month and year ends, signed', () => {
    expect(isoDaysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(isoDaysBetween('2026-10-01', '2026-09-30')).toBe(-1);
    expect(isoDaysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(isoDaysBetween('2026-01-01', '2027-01-01')).toBe(365);
    expect(isoDaysBetween('2026-05-05', '2026-05-05')).toBe(0);
  });

  it('counts a daylight-saving day as one day, in any zone', () => {
    for (const tz of ZONES) {
      inZone(tz, () => {
        expect(isoDaysBetween('2026-03-07', '2026-03-09'), tz).toBe(2);
        expect(isoDaysBetween('2026-10-31', '2026-11-02'), tz).toBe(2);
        expect(isoDaysBetween('2026-03-28', '2026-03-30'), tz).toBe(2);
        expect(isoDaysBetween('2026-03-01', '2026-04-01'), tz).toBe(31);
      });
    }
  });

  it('is null when either side is not spelled YYYY-MM-DD', () => {
    expect(isoDaysBetween('bad', '2026-09-30')).toBeNull();
    expect(isoDaysBetween('2026-09-30', '')).toBeNull();
    expect(isoDaysBetween('2026-9-30', '2026-10-01')).toBeNull();
  });
});
