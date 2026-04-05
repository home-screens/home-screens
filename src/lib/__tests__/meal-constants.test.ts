import { describe, it, expect } from 'vitest';
import {
  getOrderedDays,
  resolveMeal,
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
  SLOT_ORDER,
  SLOT_WINDOWS,
  SLOT_META,
} from '@/lib/meal-constants';
import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';

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
      expect(SLOT_META[slot].label).toBeTruthy();
      expect(SLOT_META[slot].color).toBeTruthy();
    }
  });
});
