import { describe, expect, it } from 'vitest';
import {
  applyMealVoteChanges, dinnerRatingDate, dinnerRatingGap, dinnerRatingMeals, dinnerTypedDishes, familyMealAverage, mealVoteChangeLanded,
  normalizeFamilyMealRatings, pruneFamilyMealRatings, setFamilyMealRating, validateFamilyMealRatings,
} from '../meal-ratings';

const now = '2026-01-01T00:00:00.000Z';
const later = '2026-01-02T00:00:00.000Z';
const votes = [
  { mealId: 'soup', memberId: 'one', rating: 2, updatedAt: now },
  { mealId: 'soup', memberId: 'two', rating: 5, updatedAt: now },
];

describe('family meal ratings', () => {
  it('averages a recipe and leaves unrated meals empty', () => {
    expect(familyMealAverage(votes, 'soup')).toEqual({ average: 3.5, count: 2 });
    expect(familyMealAverage(votes, 'other')).toEqual({ average: null, count: 0 });
  });

  it('updates or clears only the selected member and recipe', () => {
    const updated = setFamilyMealRating(votes, 'soup', 'one', 4, now);
    expect(updated).toContainEqual({ ...votes[0], rating: 4 });
    expect(updated).toContainEqual(votes[1]);
    expect(setFamilyMealRating(updated, 'soup', 'one', null, now)).toEqual(votes.slice(1));
    expect(setFamilyMealRating(votes, 'soup', 'one', 2, now)).toBe(votes);
  });

  it('accepts older backups but rejects duplicates and malformed votes', () => {
    expect(validateFamilyMealRatings(undefined)).toBeNull();
    expect(validateFamilyMealRatings(votes)).toBeNull();
    expect(validateFamilyMealRatings([votes[0], votes[0]])).not.toBeNull();
    expect(validateFamilyMealRatings([{ ...votes[0], rating: 6 }])).not.toBeNull();
    expect(validateFamilyMealRatings([{ ...votes[0], updatedAt: 'invalid' }])).not.toBeNull();
  });

  it('reads stored votes by leaving out what is not a vote instead of refusing the file', () => {
    expect(normalizeFamilyMealRatings(undefined)).toEqual([]);
    expect(normalizeFamilyMealRatings({ not: 'a list' })).toEqual([]);
    // Nothing to fix: the same list, so the store knows there is nothing to write.
    expect(normalizeFamilyMealRatings(votes)).toBe(votes);
    expect(normalizeFamilyMealRatings([
      votes[0],
      { ...votes[1], rating: 9 },
      { ...votes[1], updatedAt: 'invalid' },
      null,
      'soup',
      { mealId: 'soup' },
    ])).toEqual([votes[0]]);
  });

  it('keeps the newer of two votes one person left for one recipe', () => {
    const newer = { ...votes[0], rating: 4, updatedAt: later };
    expect(normalizeFamilyMealRatings([votes[0], newer, votes[1]])).toEqual([newer, votes[1]]);
    expect(normalizeFamilyMealRatings([newer, votes[0]])).toEqual([newer]);
  });

  it('drops the votes of a family recipe that was deleted and keeps Mealie ones', () => {
    const mealie = { mealId: 'mealie:0f1e2d3c-4b5a-4968-8776-655443322110', memberId: 'one', rating: 4, updatedAt: now };
    const all = [...votes, mealie, { mealId: 'gone', memberId: 'one', rating: 1, updatedAt: now }];
    expect(pruneFamilyMealRatings(all, [{ id: 'soup' }])).toEqual([...votes, mealie]);
    expect(pruneFamilyMealRatings(votes, [{ id: 'soup' }])).toBe(votes);
  });

  it('lays a vote made on this page over the loaded ones until they agree', () => {
    const change = { mealId: 'soup', memberId: 'one', rating: 5, updatedAt: later };
    expect(applyMealVoteChanges(votes, [])).toBe(votes);
    expect(applyMealVoteChanges(votes, [change])).toContainEqual({ ...votes[0], rating: 5, updatedAt: later });
    expect(mealVoteChangeLanded(votes, change)).toBe(false);
    expect(mealVoteChangeLanded(applyMealVoteChanges(votes, [change]), change)).toBe(true);
    const cleared = { ...change, rating: null };
    expect(applyMealVoteChanges(votes, [cleared])).toEqual([votes[1]]);
    expect(mealVoteChangeLanded([votes[1]], cleared)).toBe(true);
    expect(mealVoteChangeLanded(votes, cleared)).toBe(false);
  });

  it('resolves the displayed dinner date and deduplicates saved courses', () => {
    const meals = [{ id: 'soup', name: 'Soup' }, { id: 'bread', name: 'Bread' }];
    expect(dinnerRatingMeals([
      { date: '2026-01-01', slot: 'dinner', mealId: 'bread' },
      { date: '2026-01-02', slot: 'dinner', mealId: 'soup', courses: [
        { kind: 'side', mealId: 'soup' }, { kind: 'side', mealId: 'bread' },
      ] },
      { date: '2026-01-02', slot: 'lunch', customText: 'Unsaved meal' },
    ], meals, '2026-01-02')).toEqual(meals);
  });
});

describe('which dinner Rate Dinner means', () => {
  const plan = [
    { date: '2026-01-01', slot: 'dinner' as const, mealId: 'soup' },
    { date: '2026-01-02', slot: 'dinner' as const, mealId: 'pasta' },
    { date: '2026-01-03', slot: 'dinner' as const, mealId: 'tacos', time: '19:30' },
  ];
  const defaults = { dinner: '18:00' };
  const at = (h: number, m = 0) => h * 60 + m;

  it("is last night's dinner until tonight's is served", () => {
    expect(dinnerRatingDate('2026-01-02', at(7), plan, defaults)).toBe('2026-01-01');
    expect(dinnerRatingDate('2026-01-02', at(17, 59), plan, defaults)).toBe('2026-01-01');
  });

  it("is tonight's dinner from the minute it is served, all evening", () => {
    expect(dinnerRatingDate('2026-01-02', at(18), plan, defaults)).toBe('2026-01-02');
    // Long after the Today view has turned to tomorrow's meals.
    expect(dinnerRatingDate('2026-01-02', at(19, 45), plan, defaults)).toBe('2026-01-02');
    expect(dinnerRatingDate('2026-01-02', at(23, 59), plan, defaults)).toBe('2026-01-02');
  });

  it("goes by the dinner's own time when it has one", () => {
    expect(dinnerRatingDate('2026-01-03', at(18, 30), plan, defaults)).toBe('2026-01-02');
    expect(dinnerRatingDate('2026-01-03', at(19, 30), plan, defaults)).toBe('2026-01-03');
  });

  it('crosses a month and falls back to the usual dinner time', () => {
    expect(dinnerRatingDate('2026-03-01', at(9), [], {})).toBe('2026-02-28');
    expect(dinnerRatingDate('2026-03-01', at(22), [], {})).toBe('2026-03-01');
  });

  it('says why a dinner has nothing to put stars on', () => {
    const meals = [{ id: 'soup', name: 'Soup' }];
    expect(dinnerRatingGap(plan, meals, '2026-01-01')).toBeNull();
    expect(dinnerRatingGap(plan, meals, '2026-01-05')).toBe('noDinner');
    expect(dinnerRatingGap(plan, meals, '2026-01-02')).toBe('unavailable');
    expect(dinnerRatingGap([{ date: '2026-01-04', slot: 'dinner', customText: 'Leftovers' }], meals, '2026-01-04')).toBe('typed');
  });

  it('names the dishes of a dinner that were typed in, once each, in the order they are served', () => {
    const typed = [
      { date: '2026-01-04', slot: 'dinner' as const, mealId: 'soup', courses: [{ kind: 'side' as const, customText: ' Garlic bread ' }, { kind: 'side' as const, mealId: 'soup' }, { kind: 'dessert' as const, customText: 'Ice cream' }] },
      { date: '2026-01-04', slot: 'lunch' as const, customText: 'Sandwiches' },
      { date: '2026-01-05', slot: 'dinner' as const, customText: 'Leftovers', courses: [{ kind: 'side' as const, customText: 'Leftovers' }] },
    ];
    expect(dinnerTypedDishes(typed, '2026-01-04')).toEqual(['Garlic bread', 'Ice cream']);
    expect(dinnerTypedDishes(typed, '2026-01-05')).toEqual(['Leftovers']);
    expect(dinnerTypedDishes(typed, '2026-01-06')).toEqual([]);
  });
});
