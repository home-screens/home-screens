import { describe, it, expect } from 'vitest';
import {
  formatDayList,
  getOrderedDays,
  resolveMealWithEntry,
  getNextPlannedMeal,
  currentMealSlot,
  mealDayLead,
  mealPhases,
  mealServingTime,
  servingOrder,
  formatTagLabel,
  capitalize,
  normalizeTag,
  toISODate,
  fromISODate,
  dateToDayIndex,
  getWeekRange,
  getWeekDatesForRange,
  weekStartAfterDayChange,
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
  SLOT_USUAL_TIMES,
  SLOT_META,
  getLocalizedDayNames,
  getLocalizedMonthNames,
  formatShortDayMonth,
} from '@/lib/meal-constants';
import type { SavedMeal, PlannedMeal, MealSlotType } from '@/types/config';

// ── getLocalizedMonthNames ──

describe('getLocalizedMonthNames', () => {
  it('returns 12 entries indexed 0=January, in the requested locale', async () => {
    const en = getLocalizedMonthNames('en-US');
    expect(en).toHaveLength(12);
    expect(en[0]).toBe('January');
    expect(en[11]).toBe('December');
    expect(getLocalizedMonthNames('en-US', 'short')[8]).toBe('Sep');
    const de = getLocalizedMonthNames('de-DE');
    expect(de[2]).toBe('März');
  });

  it('reads the locale with no date bundle preloaded', () => {
    // Same cold-cache fallback the day names had: the sync date-fns path
    // answers in en-US when the bundle has not loaded, so a German editor
    // could offer English month names.
    expect(getLocalizedMonthNames('de-DE')[2]).toBe('März');
    expect(getLocalizedMonthNames('fr-FR')[0]).toBe('janvier');
  });
});

// ── formatShortDayMonth ──

describe('formatShortDayMonth', () => {
  it('puts day and month in the order the language reads them', () => {
    expect(formatShortDayMonth('2026-09-28', 'en-US')).toBe('9/28');
    expect(formatShortDayMonth('2026-09-28', 'de-DE')).toBe('28.9.');
    // October 1st, which month/day everywhere showed as "10/1": the 10th of
    // January to anyone who reads day first.
    expect(formatShortDayMonth('2026-10-01', 'en-US')).toBe('10/1');
    for (const locale of ['de-DE', 'fr-FR', 'es-ES', 'nl-NL', 'pt-BR', 'da-DK']) {
      const shown = formatShortDayMonth('2026-10-01', locale);
      expect(shown, locale).toMatch(/^0?1\D+10\D*$/);
    }
  });

  it('keeps the calendar day whatever the hour offset', () => {
    // Read at local noon, so a date never slides to the day before.
    expect(formatShortDayMonth('2026-03-01', 'en-US')).toBe('3/1');
    expect(formatShortDayMonth('2026-12-31', 'en-US')).toBe('12/31');
  });
});

// ── getLocalizedDayNames ──

describe('getLocalizedDayNames', () => {
  it('returns 7 entries indexed 0=Sunday … 6=Saturday', async () => {
    // Preload the date-fns en-US bundle before reading sync — the sync
    // variant falls back silently when the cache is cold.
    const names = getLocalizedDayNames('en-US', 'full');
    expect(names).toHaveLength(7);
    expect(names[0]).toBe('Sunday');
    expect(names[6]).toBe('Saturday');
  });

  it('returns short forms for format="short"', async () => {
    const names = getLocalizedDayNames('en-US', 'short');
    expect(names).toHaveLength(7);
    expect(names[0]).toBe('Sun');
    expect(names[1]).toBe('Mon');
  });

  it('abbreviates short names in every locale', () => {
    // pt-BR's date-fns short pattern returns the whole word ("domingo"),
    // which filled every weekday column with a full word. These are the
    // CLDR abbreviations, which is what a column header wants.
    expect(getLocalizedDayNames('pt-BR', 'short')[0]).toBe('dom.');
    expect(getLocalizedDayNames('nl-NL', 'short')[0]).toBe('zo');
    expect(getLocalizedDayNames('de-DE', 'short')[0]).toBe('So');
    expect(getLocalizedDayNames('da-DK', 'short')[0]).toBe('søn.');
  });

  it('reads the locale on the first call', () => {
    // The date-fns locales once loaded on demand and fell back to en-US on a
    // cold cache, so a wall that rendered first showed English weekday names
    // in a German household.
    expect(getLocalizedDayNames('de-DE', 'full')[0]).toBe('Sonntag');
    expect(getLocalizedDayNames('fr-FR', 'short')[1]).toBe('lun.');
  });

  it('honors the locale argument (de-DE returns German names)', async () => {
    // Regression guard for the en-US literal cutover. After preloading
    // the de-DE date-fns bundle, the names array must be German.
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

describe('weekStartAfterDayChange', () => {
  // 2026-09-27 is a Sunday, 2026-09-28 a Monday.
  it('moves a viewer parked on the current week to the new week at Sunday midnight', () => {
    expect(weekStartAfterDayChange('2026-09-21', '2026-09-27', '2026-09-28', 'monday')).toBe('2026-09-28');
  });

  it('moves a Sunday-start viewer on Saturday midnight', () => {
    expect(weekStartAfterDayChange('2026-09-20', '2026-09-26', '2026-09-27', 'sunday')).toBe('2026-09-27');
  });

  it('leaves the week alone when the new day is in the same week', () => {
    expect(weekStartAfterDayChange('2026-09-21', '2026-09-24', '2026-09-25', 'monday')).toBe('2026-09-21');
  });

  it('leaves a viewer who navigated to another week where they are', () => {
    expect(weekStartAfterDayChange('2026-10-05', '2026-09-27', '2026-09-28', 'monday')).toBe('2026-10-05');
    expect(weekStartAfterDayChange('2026-09-14', '2026-09-27', '2026-09-28', 'monday')).toBe('2026-09-14');
  });

  it('aligns an unaligned viewed start before comparing', () => {
    expect(weekStartAfterDayChange('2026-09-23', '2026-09-27', '2026-09-28', 'monday')).toBe('2026-09-28');
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

// ── Now and next, by serving time ──

describe('now and next by serving time', () => {
  const DAY = '2026-10-31';
  const TOMORROW = '2026-11-01';
  const meals: SavedMeal[] = [
    { id: 'lasagne', name: 'Lasagne' },
    { id: 'oats', name: 'Oatmeal' },
    { id: 'soup', name: 'Soup' },
  ];
  const slots: MealSlotType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
  const at = (h: number, m = 0) => h * 60 + m;
  const plan: PlannedMeal[] = [
    { date: DAY, slot: 'breakfast', mealId: 'oats' },
    { date: DAY, slot: 'dinner', mealId: 'lasagne', time: '17:30' },
    { date: TOMORROW, slot: 'breakfast', mealId: 'oats' },
  ];

  it('serves a meal at its own time, else the household time, else the usual one', () => {
    expect(mealServingTime({ date: DAY, slot: 'dinner', time: '17:30' }, 'dinner', { dinner: '19:00' })).toBe('17:30');
    expect(mealServingTime({ date: DAY, slot: 'dinner' }, 'dinner', { dinner: '19:00' })).toBe('19:00');
    expect(mealServingTime(undefined, 'dinner', {})).toBe(SLOT_USUAL_TIMES.dinner);
  });

  it('is now from a quarter of an hour before to an hour and a half after', () => {
    const served = [{ at: at(17, 30) }];
    expect(mealPhases(served, at(17, 14))).toEqual(['later']);
    expect(mealPhases(served, at(17, 15))).toEqual(['now']);
    expect(mealPhases(served, at(18, 59))).toEqual(['now']);
    expect(mealPhases(served, at(19))).toEqual(['over']);
  });

  it('hands over to the next meal as soon as its window opens', () => {
    const served = [{ at: at(12) }, { at: at(13) }];
    expect(mealPhases(served, at(12, 44))).toEqual(['now', 'later']);
    expect(mealPhases(served, at(12, 45))).toEqual(['over', 'now']);
  });

  it('marks a 5:30 dinner now at 5:20 and not at 5:10 or 8:30', () => {
    expect(currentMealSlot(DAY, at(17, 10), slots, plan, meals, {})).toBeNull();
    expect(currentMealSlot(DAY, at(17, 20), slots, plan, meals, {})).toBe('dinner');
    expect(currentMealSlot(DAY, at(20, 30), slots, plan, meals, {})).toBeNull();
  });

  it('never makes an empty slot now', () => {
    // Lunch time, with nothing planned for lunch.
    expect(currentMealSlot(DAY, at(12), slots, plan, meals, {})).toBeNull();
  });

  it('orders a day by serving time, not by slot', () => {
    const brunch: PlannedMeal[] = [
      { date: DAY, slot: 'breakfast', mealId: 'oats', time: '11:30' },
      { date: DAY, slot: 'lunch', mealId: 'soup', time: '11:00' },
    ];
    expect(servingOrder(DAY, slots, brunch, meals, {}).filter((s) => s.planned).map((s) => s.slot)).toEqual(['lunch', 'breakfast']);
    expect(currentMealSlot(DAY, at(11, 20), slots, brunch, meals, {})).toBe('breakfast');
  });

  it('leads with tomorrow\'s breakfast once dinner is over', () => {
    expect(getNextPlannedMeal(DAY, at(17, 20), plan, meals, slots)).toMatchObject({ slot: 'dinner', context: 'now' });
    expect(getNextPlannedMeal(DAY, at(16), plan, meals, slots)).toMatchObject({ slot: 'dinner', context: 'upcoming' });
    expect(getNextPlannedMeal(DAY, at(19, 5), plan, meals, slots)).toMatchObject({ slot: 'breakfast', date: TOMORROW, context: 'tomorrow' });
  });

  it('reads the household times for meals with none of their own', () => {
    const untimed: PlannedMeal[] = [{ date: DAY, slot: 'dinner', mealId: 'lasagne' }];
    expect(getNextPlannedMeal(DAY, at(19, 5), untimed, meals, slots)?.context).toBe('now');
    expect(getNextPlannedMeal(DAY, at(19, 5), untimed, meals, slots, { dinner: '17:00' })).toBeNull();
  });

  describe('mealDayLead', () => {
    it('leads with the meal being served, then the next planned one', () => {
      expect(mealDayLead(DAY, at(17, 20), slots, plan, meals, {})).toMatchObject({ date: DAY, slot: 'dinner', now: true });
      // Lunch time with no lunch: the dinner to come leads, not the gap.
      expect(mealDayLead(DAY, at(12), slots, plan, meals, {})).toMatchObject({ date: DAY, slot: 'dinner', now: false, over: ['breakfast'] });
    });

    it('shows an unplanned slot still ahead once the planned meals are over', () => {
      const breakfastOnly: PlannedMeal[] = [{ date: DAY, slot: 'breakfast', mealId: 'oats' }];
      expect(mealDayLead(DAY, at(14), slots, breakfastOnly, meals, {})).toMatchObject({ date: DAY, slot: 'snack', now: false });
      expect(mealDayLead(DAY, at(18), slots, breakfastOnly, meals, {})).toMatchObject({ date: DAY, slot: 'dinner', now: true });
    });

    it('moves on to tomorrow once all of today is over', () => {
      expect(mealDayLead(DAY, at(22, 30), slots, plan, meals, {})).toEqual({ date: TOMORROW, slot: 'breakfast', now: false, over: [] });
    });

    it('agrees with Next meal late in the evening', () => {
      const lead = mealDayLead(DAY, at(22, 30), slots, plan, meals, {});
      const next = getNextPlannedMeal(DAY, at(22, 30), plan, meals, slots);
      expect([lead?.date, lead?.slot]).toEqual([next?.date, next?.slot]);
    });

    it('is null with no slot switched on', () => {
      expect(mealDayLead(DAY, at(12), [], plan, meals, {})).toBeNull();
    });
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

describe('SLOT_USUAL_TIMES', () => {
  it('serves the slots in the day order', () => {
    const times = SLOT_ORDER.map((s) => SLOT_USUAL_TIMES[s]);
    expect([...times].sort()).toEqual(times);
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
    expect(formatMealTime(undefined, '12h')).toBe('');
  });

  it('returns empty string for malformed input', () => {
    expect(formatMealTime('', '12h')).toBe('');
    expect(formatMealTime('abc', '12h')).toBe('');
    expect(formatMealTime('25:00', '12h')).toBe('');
    expect(formatMealTime('12:60', '12h')).toBe('');
    expect(formatMealTime('12', '12h')).toBe('');
    expect(formatMealTime('12:5', '12h')).toBe('');
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

  /* `name` is what every view prints. Without it each one read `meal.name` and
   * a meal typed straight into the slot showed on the phone and nowhere else. */
  it('names a saved meal and a typed-in one the same way', () => {
    expect(resolveMealWithEntry('2026-04-01', 'dinner', plan, meals).name).toBe('Tacos');
    expect(resolveMealWithEntry('2026-04-02', 'lunch', plan, meals).name).toBe('Eating out');
  });

  it('has no name when the slot is empty', () => {
    expect(resolveMealWithEntry('2026-04-03', 'dinner', plan, meals).name).toBeNull();
  });

  it('has no name for an entry whose saved meal has been deleted', () => {
    const orphan: PlannedMeal[] = [{ date: '2026-04-04', slot: 'dinner', mealId: 'gone' }];
    expect(resolveMealWithEntry('2026-04-04', 'dinner', orphan, meals).name).toBeNull();
  });

  it('ignores whitespace-only typed text', () => {
    const blank: PlannedMeal[] = [{ date: '2026-04-05', slot: 'dinner', customText: '   ' }];
    expect(resolveMealWithEntry('2026-04-05', 'dinner', blank, meals).name).toBeNull();
  });

  it('shows the note written on the plan for that day, then the note on the dish', () => {
    const withNotes: SavedMeal[] = [{ id: 'm1', name: 'Tacos', notes: 'Double the salsa' }];
    expect(resolveMealWithEntry('2026-04-01', 'dinner', [{ date: '2026-04-01', slot: 'dinner', mealId: 'm1', notes: 'Grandma visits' }], withNotes).notes)
      .toEqual(['Grandma visits', 'Double the salsa']);
    expect(resolveMealWithEntry('2026-04-01', 'dinner', [{ date: '2026-04-01', slot: 'dinner', mealId: 'm1', notes: '  ' }], withNotes).notes)
      .toEqual(['Double the salsa']);
    expect(resolveMealWithEntry('2026-04-01', 'dinner', [{ date: '2026-04-01', slot: 'dinner', mealId: 'm1', notes: 'Double the salsa ' }], withNotes).notes)
      .toEqual(['Double the salsa']);
    expect(resolveMealWithEntry('2026-04-02', 'lunch', [{ date: '2026-04-02', slot: 'lunch', customText: 'School lunch', notes: 'Pizza day' }], withNotes).notes)
      .toEqual(['Pizza day']);
    expect(resolveMealWithEntry('2026-04-03', 'dinner', [], withNotes).notes).toEqual([]);
  });
});

describe('getNextPlannedMeal with a typed-in meal', () => {
  const meals: SavedMeal[] = [{ id: 'm1', name: 'Tacos' }];
  const slots: MealSlotType[] = ['breakfast', 'lunch', 'dinner'];

  /* The wall's Next Meal card and the fullscreen Next Meal view both resolve
   * through this, so a typed meal used to be skipped over on both. */
  it('finds a slot holding only typed text', () => {
    const plan: PlannedMeal[] = [{ date: '2026-04-01', slot: 'dinner', customText: 'Takeaway' }];
    const next = getNextPlannedMeal('2026-04-01', 8 * 60, plan, meals, slots);
    expect(next?.name).toBe('Takeaway');
    expect(next?.meal).toBeNull();
    expect(next?.slot).toBe('dinner');
  });

  it('still prefers the earlier slot whichever kind it is', () => {
    const plan: PlannedMeal[] = [
      { date: '2026-04-01', slot: 'lunch', customText: 'Leftovers' },
      { date: '2026-04-01', slot: 'dinner', mealId: 'm1' },
    ];
    const next = getNextPlannedMeal('2026-04-01', 8 * 60, plan, meals, slots);
    expect(next?.name).toBe('Leftovers');
  });

  it('carries the saved meal through when there is one', () => {
    const plan: PlannedMeal[] = [{ date: '2026-04-01', slot: 'dinner', mealId: 'm1' }];
    const next = getNextPlannedMeal('2026-04-01', 8 * 60, plan, meals, slots);
    expect(next?.meal?.id).toBe('m1');
    expect(next?.name).toBe('Tacos');
  });

  it('skips an entry whose saved meal has been deleted', () => {
    const plan: PlannedMeal[] = [{ date: '2026-04-01', slot: 'dinner', mealId: 'gone' }];
    expect(getNextPlannedMeal('2026-04-01', 8 * 60, plan, meals, slots)).toBeNull();
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

  it('keeps the meals in the order of the day, whatever order they were switched on in', () => {
    expect(normalizeMealSettings({ enabledSlots: ['dinner', 'breakfast', 'snack', 'lunch'] }).enabledSlots)
      .toEqual(['breakfast', 'lunch', 'snack', 'dinner']);
    expect(normalizeMealSettings({ enabledSlots: ['snack', 'breakfast'] }).enabledSlots).toEqual(['breakfast', 'snack']);
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

  it('falls back to the household format', () => {
    expect(resolveMealTimeFormat({}, '24h')).toBe('24h');
    expect(resolveMealTimeFormat(undefined, '12h')).toBe('12h');
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

describe('formatDayList', () => {
  it('names the days in calendar order, once each', () => {
    // 2026-10-31 is a Saturday, 2026-11-01 a Sunday.
    expect(formatDayList(['2026-11-01', '2026-10-31', '2026-11-01'], 'en-US')).toBe('Saturday and Sunday');
    expect(formatDayList(['2026-10-31'], 'de-DE')).toBe('Samstag');
    expect(formatDayList(['2026-10-29', '2026-10-30', '2026-10-31'], 'fr-FR')).toBe('jeudi, vendredi et samedi');
  });
});

