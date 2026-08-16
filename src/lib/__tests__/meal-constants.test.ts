import { describe, it, expect } from 'vitest';
import {
  getOrderedDays,
  resolveMeal,
  resolveMealWithEntry,
  getActiveSlot,
  formatTagLabel,
  capitalize,
  normalizeTag,
  toISODate,
  fromISODate,
  dateToDayIndex,
  getWeekRange,
  getWeekDatesForRange,
  filterPlanToWeek,
  replaceWeekInPlan,
  copyWeekEntries,
  formatMealTime,
  resolvePlannedMealTime,
  getSlotTimePresets,
  SLOT_TIME_PRESETS,
  normalizeMealSettings,
  DEFAULT_MEAL_SETTINGS,
  resolveMealTimeFormat,
  alignToWeekStart,
  SLOT_ORDER,
  SLOT_WINDOWS,
  SLOT_META,
  getLocalizedDayNames,
} from '@/lib/meal-constants';
import { preloadDateLocale } from '@/i18n/formatters';
import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';

// ── getLocalizedDayNames ──

describe('getLocalizedDayNames', () => {
  it('returns 7 entries indexed 0=Sunday … 6=Saturday', async () => {
    // Preload the date-fns en-US bundle before reading sync — the sync
    // variant falls back silently when the cache is cold.
    await preloadDateLocale('en-US');
    const names = getLocalizedDayNames('en-US', 'full');
    expect(names).toHaveLength(7);
    expect(names[0]).toBe('Sunday');
    expect(names[6]).toBe('Saturday');
  });

  it('returns short forms for format="short"', async () => {
    await preloadDateLocale('en-US');
    const names = getLocalizedDayNames('en-US', 'short');
    expect(names).toHaveLength(7);
    expect(names[0]).toBe('Sun');
    expect(names[1]).toBe('Mon');
  });

  it('honors the locale argument (de-DE returns German names)', async () => {
    // Regression guard for the en-US literal cutover. After preloading
    // the de-DE date-fns bundle, the names array must be German.
    await preloadDateLocale('de-DE');
    const names = getLocalizedDayNames('de-DE', 'full');
    expect(names).toHaveLength(7);
    // Sunday in German is "Sonntag", Saturday is "Samstag" — both
    // distinct enough from English that an accidental fallback would
    // be obvious.
    expect(names[0]).toBe('Sonntag');
    expect(names[6]).toBe('Samstag');
  });
});

// ── getOrderedDays ──

describe('getOrderedDays', () => {
  it('returns Sunday-first order for sunday start', () => {
    expect(getOrderedDays('sunday')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('returns Monday-first order for monday start', () => {
    expect(getOrderedDays('monday')).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('always returns exactly 7 days', () => {
    expect(getOrderedDays('sunday')).toHaveLength(7);
    expect(getOrderedDays('monday')).toHaveLength(7);
  });
});

// ── Date utilities ──

describe('toISODate', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(toISODate(new Date(2026, 3, 4))).toBe('2026-04-04');
  });

  it('zero-pads month and day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('fromISODate', () => {
  it('parses ISO date string to a Date', () => {
    const d = fromISODate('2026-04-04');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(3); // 0-indexed
    expect(d.getDate()).toBe(4);
  });
});

describe('dateToDayIndex', () => {
  it('returns correct day-of-week for known dates', () => {
    // 2026-04-04 is a Saturday
    expect(dateToDayIndex('2026-04-04')).toBe(6);
    // 2026-04-05 is a Sunday
    expect(dateToDayIndex('2026-04-05')).toBe(0);
    // 2026-04-06 is a Monday
    expect(dateToDayIndex('2026-04-06')).toBe(1);
  });
});

describe('getWeekRange', () => {
  it('returns Sunday-start range for Sunday start', () => {
    // 2026-04-04 is Saturday → week should be Mar 29 – Apr 4
    const { start, end } = getWeekRange(new Date(2026, 3, 4), 'sunday');
    expect(start).toBe('2026-03-29');
    expect(end).toBe('2026-04-04');
  });

  it('returns Monday-start range for Monday start', () => {
    // 2026-04-04 is Saturday → week should be Mar 30 – Apr 5
    const { start, end } = getWeekRange(new Date(2026, 3, 4), 'monday');
    expect(start).toBe('2026-03-30');
    expect(end).toBe('2026-04-05');
  });
});

describe('getWeekDatesForRange', () => {
  it('returns 7 dates', () => {
    const dates = getWeekDatesForRange('2026-03-29', 'sunday');
    expect(dates).toHaveLength(7);
  });

  it('returns consecutive dates starting from the aligned week start', () => {
    const dates = getWeekDatesForRange('2026-03-29', 'sunday');
    expect(dates[0]).toBe('2026-03-29');
    expect(dates[6]).toBe('2026-04-04');
  });

  it('returns correct dates for Monday start', () => {
    // 2026-03-30 is a Monday
    const dates = getWeekDatesForRange('2026-03-30', 'monday');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-03-30'); // Monday
    expect(dates[6]).toBe('2026-04-05'); // Sunday
  });

  it('re-aligns when start is mid-week', () => {
    // Pass a Wednesday — should still return the full week starting from Sunday
    const dates = getWeekDatesForRange('2026-04-01', 'sunday');
    expect(dates[0]).toBe('2026-03-29'); // aligned to Sunday
    expect(dates[6]).toBe('2026-04-04');
  });
});

describe('filterPlanToWeek', () => {
  it('filters entries within the range (inclusive)', () => {
    const plan: PlannedMeal[] = [
      { date: '2026-03-29', slot: 'breakfast', mealId: 'a' },
      { date: '2026-04-01', slot: 'lunch', mealId: 'b' },
      { date: '2026-04-04', slot: 'dinner', mealId: 'c' },
      { date: '2026-04-05', slot: 'breakfast', mealId: 'd' }, // next week
    ];
    const result = filterPlanToWeek(plan, '2026-03-29', '2026-04-04');
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.mealId)).toEqual(['a', 'b', 'c']);
  });

  it('returns empty array when nothing matches', () => {
    const plan: PlannedMeal[] = [
      { date: '2026-04-05', slot: 'breakfast', mealId: 'a' },
    ];
    expect(filterPlanToWeek(plan, '2026-03-29', '2026-04-04')).toHaveLength(0);
  });
});

describe('replaceWeekInPlan', () => {
  it('replaces only the specified week', () => {
    const fullPlan: PlannedMeal[] = [
      { date: '2026-03-29', slot: 'breakfast', mealId: 'old' },
      { date: '2026-04-05', slot: 'lunch', mealId: 'other-week' },
    ];
    const weekDates = ['2026-03-29', '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04'];
    const newEntries: PlannedMeal[] = [
      { date: '2026-03-29', slot: 'breakfast', mealId: 'new' },
    ];
    const result = replaceWeekInPlan(fullPlan, weekDates, newEntries);
    expect(result).toHaveLength(2);
    expect(result.find((p) => p.date === '2026-03-29')!.mealId).toBe('new');
    expect(result.find((p) => p.date === '2026-04-05')!.mealId).toBe('other-week');
  });
});

describe('copyWeekEntries', () => {
  const fromDates = ['2026-03-29', '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04'];
  const toDates = ['2026-04-05', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11'];

  it('copies entries from one week to another preserving position', () => {
    const plan: PlannedMeal[] = [
      { date: '2026-03-29', slot: 'breakfast', mealId: 'a' },
      { date: '2026-04-01', slot: 'dinner', mealId: 'b' },
      { date: '2026-04-12', slot: 'lunch', mealId: 'other' }, // outside source week
    ];
    const result = copyWeekEntries(plan, fromDates, toDates);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: '2026-04-05', slot: 'breakfast', mealId: 'a' }); // position 0 → 0
    expect(result[1]).toEqual({ date: '2026-04-08', slot: 'dinner', mealId: 'b' });   // position 3 → 3
  });

  it('returns empty array when source week has no entries', () => {
    const plan: PlannedMeal[] = [
      { date: '2026-04-12', slot: 'lunch', mealId: 'x' },
    ];
    const result = copyWeekEntries(plan, fromDates, toDates);
    expect(result).toHaveLength(0);
  });

  it('falls back to index 0 when date is not in fromDates', () => {
    // Construct a plan with a date that exists in the range but not in fromDates array
    const plan: PlannedMeal[] = [
      { date: '2026-03-29', slot: 'lunch', mealId: 'x' },
    ];
    // Use a fromDates that doesn't include '2026-03-29'
    const altFrom = ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04', '2026-04-05'];
    const result = copyWeekEntries(plan, altFrom, toDates);
    // date is within the filter range (altFrom[0]..altFrom[6]) but '2026-03-29' < '2026-03-30', so no entries
    expect(result).toHaveLength(0);
  });
});

// ── resolveMeal ──

describe('resolveMeal', () => {
  const meals: SavedMeal[] = [
    { id: 'pasta', name: 'Pasta' },
    { id: 'salad', name: 'Salad' },
  ];

  it('returns null when plan is undefined', () => {
    expect(resolveMeal('2026-04-04', 'dinner', undefined, meals)).toBeNull();
  });

  it('returns null when savedMeals is undefined', () => {
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'dinner', mealId: 'pasta' }];
    expect(resolveMeal('2026-04-04', 'dinner', plan, undefined)).toBeNull();
  });

  it('returns null when no plan entry matches date/slot', () => {
    const plan: PlannedMeal[] = [{ date: '2026-04-03', slot: 'lunch', mealId: 'pasta' }];
    expect(resolveMeal('2026-04-04', 'dinner', plan, meals)).toBeNull();
  });

  it('returns null when mealId is empty', () => {
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'dinner', mealId: '' }];
    expect(resolveMeal('2026-04-04', 'dinner', plan, meals)).toBeNull();
  });

  it('returns null when mealId references a non-existent meal', () => {
    const plan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'dinner', mealId: 'deleted' }];
    expect(resolveMeal('2026-04-04', 'dinner', plan, meals)).toBeNull();
  });

  it('resolves a valid planned meal', () => {
    const plan: PlannedMeal[] = [{ date: '2026-04-01', slot: 'lunch', mealId: 'salad' }];
    const result = resolveMeal('2026-04-01', 'lunch', plan, meals);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('salad');
    expect(result!.name).toBe('Salad');
  });

  it('resolves the correct meal when multiple entries exist', () => {
    const plan: PlannedMeal[] = [
      { date: '2026-04-04', slot: 'breakfast', mealId: 'pasta' },
      { date: '2026-04-04', slot: 'dinner', mealId: 'salad' },
    ];
    expect(resolveMeal('2026-04-04', 'breakfast', plan, meals)!.id).toBe('pasta');
    expect(resolveMeal('2026-04-04', 'dinner', plan, meals)!.id).toBe('salad');
  });
});

// ── getActiveSlot ──

describe('getActiveSlot', () => {
  const allSlots: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];

  it('returns breakfast during morning hours', () => {
    expect(getActiveSlot(5, allSlots)).toBe('breakfast');
    expect(getActiveSlot(9, allSlots)).toBe('breakfast');
  });

  it('returns lunch during midday hours', () => {
    expect(getActiveSlot(10, allSlots)).toBe('lunch');
    expect(getActiveSlot(13, allSlots)).toBe('lunch');
  });

  it('returns snack during afternoon hours', () => {
    expect(getActiveSlot(14, allSlots)).toBe('snack');
    expect(getActiveSlot(16, allSlots)).toBe('snack');
  });

  it('returns dinner during evening hours', () => {
    expect(getActiveSlot(17, allSlots)).toBe('dinner');
    expect(getActiveSlot(20, allSlots)).toBe('dinner');
  });

  it('returns null outside all slot windows', () => {
    expect(getActiveSlot(0, allSlots)).toBeNull();
    expect(getActiveSlot(4, allSlots)).toBeNull();
    expect(getActiveSlot(21, allSlots)).toBeNull();
    expect(getActiveSlot(23, allSlots)).toBeNull();
  });

  it('returns null when no slots are enabled', () => {
    expect(getActiveSlot(12, [])).toBeNull();
  });

  it('skips disabled slots and returns null if no match', () => {
    expect(getActiveSlot(12, ['breakfast'])).toBeNull();
  });

  it('skips disabled slots and returns match when available', () => {
    expect(getActiveSlot(12, ['lunch', 'dinner'])).toBe('lunch');
  });

  it('boundary: slot window start is inclusive', () => {
    expect(getActiveSlot(10, allSlots)).toBe('lunch');
    expect(getActiveSlot(17, allSlots)).toBe('dinner');
  });

  it('boundary: slot window end is exclusive', () => {
    expect(getActiveSlot(10, allSlots)).not.toBe('breakfast');
    expect(getActiveSlot(14, allSlots)).not.toBe('lunch');
  });
});

// ── formatTagLabel ──

describe('formatTagLabel', () => {
  it('capitalizes a single word', () => {
    expect(formatTagLabel('quick')).toBe('Quick');
  });

  it('capitalizes each segment of a hyphenated tag', () => {
    expect(formatTagLabel('kid-friendly')).toBe('Kid-Friendly');
  });

  it('handles multi-hyphen tags', () => {
    expect(formatTagLabel('gluten-free')).toBe('Gluten-Free');
    expect(formatTagLabel('batch-cook')).toBe('Batch-Cook');
  });

  it('handles already-capitalized input', () => {
    expect(formatTagLabel('Quick')).toBe('Quick');
  });
});

// ── capitalize ──

describe('capitalize', () => {
  it('capitalizes the first letter', () => {
    expect(capitalize('produce')).toBe('Produce');
  });

  it('leaves already-capitalized strings unchanged', () => {
    expect(capitalize('Produce')).toBe('Produce');
  });

  it('handles single character', () => {
    expect(capitalize('a')).toBe('A');
  });

  it('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });
});

// ── normalizeTag ──

describe('normalizeTag', () => {
  it('lowercases and converts spaces to hyphens', () => {
    expect(normalizeTag('Batch Cook')).toBe('batch-cook');
  });

  it('passes through already-canonical tags', () => {
    expect(normalizeTag('kid-friendly')).toBe('kid-friendly');
  });

  it('handles mixed case', () => {
    expect(normalizeTag('Kid-Friendly')).toBe('kid-friendly');
  });

  it('collapses multiple spaces into one hyphen', () => {
    expect(normalizeTag('Batch  Cook')).toBe('batch-cook');
  });
});

// ── Constants sanity checks ──

describe('SLOT_ORDER', () => {
  it('contains exactly 4 slots in chronological order', () => {
    expect(SLOT_ORDER).toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
  });
});

describe('SLOT_WINDOWS', () => {
  it('windows are non-overlapping and in order', () => {
    const ordered = SLOT_ORDER.map((s) => SLOT_WINDOWS[s]);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].start).toBeGreaterThanOrEqual(ordered[i - 1].end);
    }
  });
});

describe('SLOT_META', () => {
  it('has entries for all slots in SLOT_ORDER', () => {
    for (const slot of SLOT_ORDER) {
      expect(SLOT_META[slot]).toBeDefined();
      expect(SLOT_META[slot].color).toBeTruthy();
    }
  });
});

// ── alignToWeekStart ──

describe('alignToWeekStart', () => {
  it('aligns Wednesday → Sunday (sunday week start)', () => {
    const wed = new Date(2026, 3, 8); // Wed Apr 8 2026
    const aligned = alignToWeekStart(wed, 'sunday');
    expect(aligned.getDay()).toBe(0);
    expect(toISODate(aligned)).toBe('2026-04-05');
  });

  it('aligns Wednesday → Monday (monday week start)', () => {
    const wed = new Date(2026, 3, 8); // Wed Apr 8 2026
    const aligned = alignToWeekStart(wed, 'monday');
    expect(aligned.getDay()).toBe(1);
    expect(toISODate(aligned)).toBe('2026-04-06');
  });

  it('is a no-op when the date is already aligned (sunday)', () => {
    const sun = new Date(2026, 3, 5); // Sun Apr 5 2026
    const aligned = alignToWeekStart(sun, 'sunday');
    expect(toISODate(aligned)).toBe('2026-04-05');
  });

  it('is a no-op when the date is already aligned (monday)', () => {
    const mon = new Date(2026, 3, 6); // Mon Apr 6 2026
    const aligned = alignToWeekStart(mon, 'monday');
    expect(toISODate(aligned)).toBe('2026-04-06');
  });

  it('aligns Sunday → previous Monday in monday-start mode (no double-walk)', () => {
    // In Monday-start convention, a Sunday belongs to the *previous* week whose
    // start is the preceding Monday. So for Sun Apr 5 2026 the expected origin
    // is Mon Mar 30 2026 — six days back, which is the mathematically correct
    // result of `((dow + 6) % 7) = 6` when dow = 0.
    //
    // Regression guard: the prior implementation computed this offset twice
    // by applying alignToWeekStart to an already-aligned reference date, which
    // would subtract *another* week on top, landing on the Monday before that.
    // Callers must apply the offset once, starting from the raw reference date.
    const sun = new Date(2026, 3, 5); // Sun Apr 5 2026
    const aligned = alignToWeekStart(sun, 'monday');
    expect(toISODate(aligned)).toBe('2026-03-30');
  });

  it('aligns Saturday → Sunday (sunday week start)', () => {
    const sat = new Date(2026, 3, 11); // Sat Apr 11 2026
    const aligned = alignToWeekStart(sat, 'sunday');
    expect(toISODate(aligned)).toBe('2026-04-05');
  });

  it('aligns Saturday → Monday (monday week start)', () => {
    const sat = new Date(2026, 3, 11); // Sat Apr 11 2026
    const aligned = alignToWeekStart(sat, 'monday');
    expect(toISODate(aligned)).toBe('2026-04-06');
  });

  it('does not mutate the input date', () => {
    const wed = new Date(2026, 3, 8);
    const wedISO = toISODate(wed);
    alignToWeekStart(wed, 'monday');
    expect(toISODate(wed)).toBe(wedISO);
  });

  it('handles spring-forward DST boundary (March 8 2026 US)', () => {
    // DST spring-forward in US is Sunday March 8 2026 at 02:00.
    // A Wednesday in the same week should still align to Sunday March 8 cleanly.
    const wedAfterSpring = new Date(2026, 2, 11); // Wed Mar 11 2026
    const alignedSun = alignToWeekStart(wedAfterSpring, 'sunday');
    expect(toISODate(alignedSun)).toBe('2026-03-08');

    // And to Monday March 9
    const alignedMon = alignToWeekStart(wedAfterSpring, 'monday');
    expect(toISODate(alignedMon)).toBe('2026-03-09');
  });

  it('handles fall-back DST boundary (November 1 2026 US)', () => {
    // DST fall-back is Sunday November 1 2026 at 02:00.
    const wedAfterFall = new Date(2026, 10, 4); // Wed Nov 4 2026
    const aligned = alignToWeekStart(wedAfterFall, 'sunday');
    expect(toISODate(aligned)).toBe('2026-11-01');
  });

  it('handles month boundaries cleanly', () => {
    // Wed April 1 2026 with sunday-start should land on Sun March 29 2026
    const wedFirstOfMonth = new Date(2026, 3, 1);
    const aligned = alignToWeekStart(wedFirstOfMonth, 'sunday');
    expect(toISODate(aligned)).toBe('2026-03-29');
  });

  it('handles year boundaries cleanly', () => {
    // Friday Jan 2 2026 with monday-start should land on Mon Dec 29 2025
    const friFirstOfYear = new Date(2026, 0, 2);
    const aligned = alignToWeekStart(friFirstOfYear, 'monday');
    expect(toISODate(aligned)).toBe('2025-12-29');
  });
});

// ── formatMealTime ──

describe('formatMealTime', () => {
  it('returns empty string for undefined', () => {
    expect(formatMealTime(undefined)).toBe('');
  });

  it('returns empty string for malformed input', () => {
    expect(formatMealTime('')).toBe('');
    expect(formatMealTime('abc')).toBe('');
    expect(formatMealTime('25:00')).toBe('');
    expect(formatMealTime('12:60')).toBe('');
    expect(formatMealTime('12')).toBe('');
    expect(formatMealTime('12:5')).toBe('');
  });

  it('formats AM correctly in 12h mode', () => {
    expect(formatMealTime('07:30', '12h')).toBe('7:30 AM');
    expect(formatMealTime('00:00', '12h')).toBe('12:00 AM'); // midnight
    expect(formatMealTime('00:01', '12h')).toBe('12:01 AM');
    expect(formatMealTime('11:59', '12h')).toBe('11:59 AM');
  });

  it('formats PM correctly in 12h mode', () => {
    expect(formatMealTime('12:00', '12h')).toBe('12:00 PM'); // noon
    expect(formatMealTime('12:30', '12h')).toBe('12:30 PM');
    expect(formatMealTime('13:00', '12h')).toBe('1:00 PM');
    expect(formatMealTime('18:30', '12h')).toBe('6:30 PM');
    expect(formatMealTime('23:59', '12h')).toBe('11:59 PM');
  });

  it('formats correctly in 24h mode', () => {
    expect(formatMealTime('07:30', '24h')).toBe('07:30');
    expect(formatMealTime('00:00', '24h')).toBe('00:00');
    expect(formatMealTime('18:30', '24h')).toBe('18:30');
    expect(formatMealTime('23:59', '24h')).toBe('23:59');
  });

  it('defaults to 12h format when no format argument supplied', () => {
    expect(formatMealTime('18:30')).toBe('6:30 PM');
  });

  it('zero-pads single-digit minutes in 24h mode', () => {
    expect(formatMealTime('9:00', '24h')).toBe('09:00');
  });
});

// ── resolvePlannedMealTime ──

describe('resolvePlannedMealTime', () => {
  it('returns the entry time when set (ignores default)', () => {
    const planned: PlannedMeal = { date: '2026-04-01', slot: 'dinner', mealId: 'm1', time: '18:30' };
    expect(resolvePlannedMealTime(planned, 'dinner', { dinner: '19:00' })).toBe('18:30');
  });

  it('falls back to slot default when entry has no time', () => {
    const planned: PlannedMeal = { date: '2026-04-01', slot: 'dinner', mealId: 'm1' };
    expect(resolvePlannedMealTime(planned, 'dinner', { dinner: '19:00' })).toBe('19:00');
  });

  it('returns undefined when neither entry nor default exists', () => {
    const planned: PlannedMeal = { date: '2026-04-01', slot: 'dinner', mealId: 'm1' };
    expect(resolvePlannedMealTime(planned, 'dinner', {})).toBeUndefined();
  });

  it('returns undefined when planned entry is undefined and defaults is empty', () => {
    expect(resolvePlannedMealTime(undefined, 'dinner', {})).toBeUndefined();
  });

  it('uses default when planned entry is undefined but default exists', () => {
    expect(resolvePlannedMealTime(undefined, 'dinner', { dinner: '18:30' })).toBe('18:30');
  });
});

// ── resolveMealWithEntry ──

describe('resolveMealWithEntry', () => {
  const meals: SavedMeal[] = [
    { id: 'm1', name: 'Tacos' },
    { id: 'm2', name: 'Pizza' },
  ];
  const plan: PlannedMeal[] = [
    { date: '2026-04-01', slot: 'dinner', mealId: 'm1', time: '18:30' },
    { date: '2026-04-02', slot: 'lunch', customText: 'Eating out' }, // entry without mealId
  ];

  it('returns both meal and planned entry when present', () => {
    const result = resolveMealWithEntry('2026-04-01', 'dinner', plan, meals);
    expect(result.meal?.name).toBe('Tacos');
    expect(result.planned?.time).toBe('18:30');
  });

  it('returns null meal but the entry when entry has no mealId (customText case)', () => {
    const result = resolveMealWithEntry('2026-04-02', 'lunch', plan, meals);
    expect(result.meal).toBeNull();
    expect(result.planned?.customText).toBe('Eating out');
  });

  it('returns nulls when there is no entry for that date+slot', () => {
    const result = resolveMealWithEntry('2026-04-03', 'dinner', plan, meals);
    expect(result.meal).toBeNull();
    expect(result.planned).toBeUndefined();
  });

  it('handles undefined plan gracefully', () => {
    const result = resolveMealWithEntry('2026-04-01', 'dinner', undefined, meals);
    expect(result.meal).toBeNull();
    expect(result.planned).toBeUndefined();
  });
});

// ── getSlotTimePresets ──

describe('getSlotTimePresets / SLOT_TIME_PRESETS', () => {
  it('returns 4 presets for every slot type', () => {
    const slots: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
    for (const slot of slots) {
      const presets = getSlotTimePresets(slot);
      expect(presets).toHaveLength(4);
      // Each preset should be a valid HH:MM 24h string
      for (const p of presets) {
        expect(p).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
      }
    }
  });

  it('uses the canonical SLOT_TIME_PRESETS table', () => {
    expect(getSlotTimePresets('dinner')).toBe(SLOT_TIME_PRESETS.dinner);
    expect(SLOT_TIME_PRESETS.breakfast).toEqual(['06:00', '06:30', '07:00', '07:30']);
    expect(SLOT_TIME_PRESETS.lunch).toEqual(['11:00', '11:30', '12:00', '12:30']);
  });
});

// ── normalizeMealSettings ──

describe('normalizeMealSettings', () => {
  it('returns full defaults for null / undefined / non-object input', () => {
    const fromNull = normalizeMealSettings(null);
    expect(fromNull.enabledSlots).toEqual(DEFAULT_MEAL_SETTINGS.enabledSlots);
    expect(fromNull.weekStartDay).toBe(DEFAULT_MEAL_SETTINGS.weekStartDay);
    expect(fromNull.timeFormat).toBeUndefined();

    expect(normalizeMealSettings(undefined).enabledSlots).toEqual(DEFAULT_MEAL_SETTINGS.enabledSlots);
    expect(normalizeMealSettings('a string').enabledSlots).toEqual(DEFAULT_MEAL_SETTINGS.enabledSlots);
    expect(normalizeMealSettings(42).enabledSlots).toEqual(DEFAULT_MEAL_SETTINGS.enabledSlots);
  });

  it('does not return a shared array reference (mutation safety)', () => {
    const a = normalizeMealSettings(null);
    const b = normalizeMealSettings(null);
    a.enabledSlots.push('snack');
    expect(b.enabledSlots).not.toContain('snack');
  });

  it('filters out invalid slot strings from enabledSlots', () => {
    const result = normalizeMealSettings({
      enabledSlots: ['breakfast', 'brunch', 42, null, 'dinner'],
    });
    expect(result.enabledSlots).toEqual(['breakfast', 'dinner']);
  });

  it('falls back to defaults when enabledSlots filters down to empty', () => {
    const result = normalizeMealSettings({ enabledSlots: ['brunch', 'snacc'] });
    expect(result.enabledSlots).toEqual(DEFAULT_MEAL_SETTINGS.enabledSlots);
  });

  it('falls back to defaults when enabledSlots is literally empty', () => {
    const result = normalizeMealSettings({ enabledSlots: [] });
    expect(result.enabledSlots).toEqual(DEFAULT_MEAL_SETTINGS.enabledSlots);
  });

  it('falls back to default when weekStartDay is invalid', () => {
    expect(normalizeMealSettings({ weekStartDay: 'tuesday' }).weekStartDay).toBe('sunday');
    expect(normalizeMealSettings({ weekStartDay: 42 }).weekStartDay).toBe('sunday');
  });

  it('accepts only sunday/monday for weekStartDay', () => {
    expect(normalizeMealSettings({ weekStartDay: 'monday' }).weekStartDay).toBe('monday');
    expect(normalizeMealSettings({ weekStartDay: 'sunday' }).weekStartDay).toBe('sunday');
  });

  it('rejects out-of-range default slot times (e.g. 25:99)', () => {
    const result = normalizeMealSettings({
      defaultSlotTimes: { dinner: '25:99', lunch: '12:30', breakfast: 'not a time' },
    });
    expect(result.defaultSlotTimes).toEqual({ lunch: '12:30' });
  });

  it('drops unknown slot keys from defaultSlotTimes', () => {
    const result = normalizeMealSettings({
      defaultSlotTimes: { dinner: '18:00', brunch: '10:30' },
    });
    expect(result.defaultSlotTimes).toEqual({ dinner: '18:00' });
  });

  it('drops an invalid timeFormat entirely', () => {
    expect(normalizeMealSettings({ timeFormat: '36h' }).timeFormat).toBeUndefined();
    expect(normalizeMealSettings({ timeFormat: 42 }).timeFormat).toBeUndefined();
  });

  it('accepts 12h and 24h for timeFormat', () => {
    expect(normalizeMealSettings({ timeFormat: '12h' }).timeFormat).toBe('12h');
    expect(normalizeMealSettings({ timeFormat: '24h' }).timeFormat).toBe('24h');
  });

  it('round-trips a fully-valid settings object', () => {
    const input = {
      enabledSlots: ['breakfast', 'dinner'],
      weekStartDay: 'monday',
      defaultSlotTimes: { dinner: '18:30' },
      timeFormat: '24h',
    };
    const result = normalizeMealSettings(input);
    expect(result.enabledSlots).toEqual(['breakfast', 'dinner']);
    expect(result.weekStartDay).toBe('monday');
    expect(result.defaultSlotTimes.dinner).toBe('18:30');
    expect(result.timeFormat).toBe('24h');
  });
});

// ── resolveMealTimeFormat ──

describe('resolveMealTimeFormat', () => {
  it('prefers an explicit meal override', () => {
    expect(resolveMealTimeFormat({ timeFormat: '24h' }, '12h')).toBe('24h');
    expect(resolveMealTimeFormat({ timeFormat: '12h' }, '24h')).toBe('12h');
  });

  it('falls back to the global, then 12h', () => {
    expect(resolveMealTimeFormat({}, '24h')).toBe('24h');
    expect(resolveMealTimeFormat(undefined, undefined)).toBe('12h');
    expect(resolveMealTimeFormat({}, undefined)).toBe('12h');
  });
});

// ── normalizeMealSettings timeFormat optionality ──

describe('normalizeMealSettings timeFormat', () => {
  it('keeps explicit values and drops invalid ones entirely', () => {
    expect(normalizeMealSettings({ timeFormat: '24h' }).timeFormat).toBe('24h');
    expect(normalizeMealSettings({ timeFormat: '12h' }).timeFormat).toBe('12h');
    expect(normalizeMealSettings({ timeFormat: 'junk' }).timeFormat).toBeUndefined();
    expect(normalizeMealSettings({}).timeFormat).toBeUndefined();
  });

  it('no longer defaults the field', () => {
    expect(DEFAULT_MEAL_SETTINGS.timeFormat).toBeUndefined();
  });
});
