import { describe, it, expect } from 'vitest';
import type { PlannedMeal } from '@/types/config';
import {
  groceryChecksForWeek,
  groceryItemKey,
  groceryTapDirection,
  groceryWeekKey,
  isGroceryChecked,
  normalizeGroceryChecked,
  pruneGroceryChecked,
  rekeyGroceryChecked,
  setGroceryCheck,
  withGroceryWeek,
  type GroceryChecked,
} from '../grocery-checks';

// Sunday-start weeks around the turn of the month: Sep 27 - Oct 3, Oct 4 - 10.
const THIS_WEEK = '2026-09-27';
const NEXT_WEEK = '2026-10-04';

const dinner = (date: string): PlannedMeal => ({ date, slot: 'dinner', mealId: 'tacos' });

describe('groceryWeekKey', () => {
  it('keys any day by the first day of its week', () => {
    expect(groceryWeekKey('2026-09-27', 'sunday')).toBe(THIS_WEEK);
    expect(groceryWeekKey('2026-10-01', 'sunday')).toBe(THIS_WEEK);
    expect(groceryWeekKey('2026-10-03', 'sunday')).toBe(THIS_WEEK);
    expect(groceryWeekKey('2026-10-04', 'sunday')).toBe(NEXT_WEEK);
  });

  it('follows the household week start day', () => {
    expect(groceryWeekKey('2026-09-27', 'monday')).toBe('2026-09-21');
    expect(groceryWeekKey('2026-10-01', 'monday')).toBe('2026-09-28');
  });
});

describe('ticks stay on the week they were made on', () => {
  it('a tick on this week never shows on next week, and the other way round', () => {
    let checked: GroceryChecked = {};
    checked = setGroceryCheck(checked, THIS_WEEK, 'Tortillas', 'check');
    checked = setGroceryCheck(checked, NEXT_WEEK, 'Lettuce', 'check');

    expect(groceryChecksForWeek(checked, THIS_WEEK)).toEqual(['tortillas']);
    expect(groceryChecksForWeek(checked, NEXT_WEEK)).toEqual(['lettuce']);
    expect(groceryChecksForWeek(checked, '2026-10-11')).toEqual([]);
  });

  it('the same item can be ticked on one week and still wanted on the next', () => {
    let checked: GroceryChecked = {};
    checked = setGroceryCheck(checked, THIS_WEEK, 'milk', 'check');
    expect(groceryTapDirection(checked, THIS_WEEK, 'Milk')).toBe('uncheck');
    expect(groceryTapDirection(checked, NEXT_WEEK, 'Milk')).toBe('check');
  });
});

describe('setGroceryCheck', () => {
  it('flips without a direction', () => {
    const ticked = setGroceryCheck({}, THIS_WEEK, 'eggs');
    expect(ticked).toEqual({ [THIS_WEEK]: ['eggs'] });
    expect(setGroceryCheck(ticked, THIS_WEEK, 'eggs')).toEqual({});
  });

  it('stores names the way every list compares items: trimmed, small letters, no accents', () => {
    expect(setGroceryCheck({}, THIS_WEEK, '  Ground Beef ', 'check')).toEqual({ [THIS_WEEK]: ['ground beef'] });
    expect(groceryItemKey('  Milk ')).toBe('milk');
    expect(groceryItemKey('Crème  Fraîche')).toBe('creme fraiche');
    expect(groceryItemKey('Rødkål')).toBe('rødkål');
  });

  it('reads a tick on a name typed without its accents as a tick on the item', () => {
    const ticked = setGroceryCheck({}, THIS_WEEK, 'Crème fraîche', 'check');
    expect(groceryTapDirection(ticked, THIS_WEEK, 'creme fraiche')).toBe('uncheck');
    expect(setGroceryCheck(ticked, THIS_WEEK, 'CREME FRAICHE', 'check')).toBe(ticked);
  });

  it('hands back the same object when a direction is already met', () => {
    const checked: GroceryChecked = { [THIS_WEEK]: ['milk'] };
    expect(setGroceryCheck(checked, THIS_WEEK, 'Milk', 'check')).toBe(checked);
    expect(setGroceryCheck(checked, NEXT_WEEK, 'milk', 'uncheck')).toBe(checked);
  });

  it('drops a week whose last tick is taken off', () => {
    const checked: GroceryChecked = { [THIS_WEEK]: ['milk'], [NEXT_WEEK]: ['eggs'] };
    expect(setGroceryCheck(checked, THIS_WEEK, 'milk', 'uncheck')).toEqual({ [NEXT_WEEK]: ['eggs'] });
  });
});

describe('withGroceryWeek', () => {
  it('replaces one week and leaves the others alone', () => {
    const checked: GroceryChecked = { [THIS_WEEK]: ['milk'], [NEXT_WEEK]: ['eggs'] };
    expect(withGroceryWeek(checked, THIS_WEEK, ['milk', 'bread'])).toEqual({
      [THIS_WEEK]: ['milk', 'bread'],
      [NEXT_WEEK]: ['eggs'],
    });
    expect(withGroceryWeek(checked, NEXT_WEEK, [])).toEqual({ [THIS_WEEK]: ['milk'] });
  });
});

describe('pruneGroceryChecked', () => {
  it('drops weeks the plan has no meals in any more', () => {
    const checked: GroceryChecked = {
      '2026-06-07': ['flour'],
      [THIS_WEEK]: ['milk'],
      [NEXT_WEEK]: ['eggs'],
    };
    expect(pruneGroceryChecked(checked, [dinner('2026-09-30'), dinner('2026-10-06')], 'sunday')).toEqual({
      [THIS_WEEK]: ['milk'],
      [NEXT_WEEK]: ['eggs'],
    });
    expect(pruneGroceryChecked(checked, [dinner('2026-10-02')], 'sunday')).toEqual({ [THIS_WEEK]: ['milk'] });
    expect(pruneGroceryChecked(checked, [], 'sunday')).toEqual({});
  });

  it('hands back the same object when every week is still planned', () => {
    const checked: GroceryChecked = { [THIS_WEEK]: ['milk'] };
    expect(pruneGroceryChecked(checked, [dinner('2026-10-03')], 'sunday')).toBe(checked);
  });
});

describe('rekeyGroceryChecked', () => {
  it('moves each week to the new week sharing six of its days', () => {
    // Sunday Sep 27 - Saturday Oct 3 becomes Monday Sep 28 - Sunday Oct 4.
    expect(rekeyGroceryChecked({ [THIS_WEEK]: ['milk'] }, 'monday')).toEqual({ '2026-09-28': ['milk'] });
    // And back.
    expect(rekeyGroceryChecked({ '2026-09-28': ['milk'] }, 'sunday')).toEqual({ [THIS_WEEK]: ['milk'] });
  });

  it('leaves keys alone when the week start day did not move', () => {
    const checked: GroceryChecked = { [THIS_WEEK]: ['milk'], [NEXT_WEEK]: ['eggs'] };
    expect(rekeyGroceryChecked(checked, 'sunday')).toEqual(checked);
  });
});

describe('normalizeGroceryChecked', () => {
  it('reads the single all-weeks list older builds kept as nothing ticked', () => {
    expect(normalizeGroceryChecked(['tortillas', 'lettuce'])).toEqual({});
    expect(normalizeGroceryChecked([])).toEqual({});
  });

  it('reads anything else unusable as nothing ticked', () => {
    expect(normalizeGroceryChecked(undefined)).toEqual({});
    expect(normalizeGroceryChecked('milk')).toEqual({});
    expect(normalizeGroceryChecked(null)).toEqual({});
  });

  it('keeps well-formed weeks, cleaning their names', () => {
    expect(normalizeGroceryChecked({
      [THIS_WEEK]: [' Milk', 'milk', 42, ''],
      [NEXT_WEEK]: [],
      'next tuesday': ['eggs'],
      '2026-10-11': 'eggs',
    })).toEqual({ [THIS_WEEK]: ['milk'] });
  });

  it('keys a stored tick with its accents the way the list keys the item now', () => {
    expect(normalizeGroceryChecked({ [THIS_WEEK]: ['crème fraîche', 'creme fraiche'] })).toEqual({ [THIS_WEEK]: ['creme fraiche'] });
  });
});

describe('isGroceryChecked', () => {
  it('accepts a map of week to names', () => {
    expect(isGroceryChecked({})).toBe(true);
    expect(isGroceryChecked({ [THIS_WEEK]: ['milk'] })).toBe(true);
  });

  it('refuses the single list and malformed maps', () => {
    expect(isGroceryChecked(['milk'])).toBe(false);
    expect(isGroceryChecked({ soon: ['milk'] })).toBe(false);
    expect(isGroceryChecked({ [THIS_WEEK]: [1] })).toBe(false);
    expect(isGroceryChecked({ [THIS_WEEK]: 'milk' })).toBe(false);
    expect(isGroceryChecked(null)).toBe(false);
  });
});
