import { describe, expect, it } from 'vitest';
import { dinnerRatingMeals, familyMealAverage, setFamilyMealRating, validateFamilyMealRatings } from '../meal-ratings';

const now = '2026-01-01T00:00:00.000Z';
const votes = [
  { mealId: 'soup', memberId: 'one', rating: 2, updatedAt: now },
  { mealId: 'soup', memberId: 'two', rating: 5, updatedAt: now },
  { mealId: 'soup', memberId: 'removed', rating: 1, updatedAt: now },
];

describe('family meal ratings', () => {
  it('averages only current family members and leaves unrated meals empty', () => {
    const members = new Set(['one', 'two']);
    expect(familyMealAverage(votes, 'soup', members)).toEqual({ average: 3.5, count: 2 });
    expect(familyMealAverage(votes, 'other', members)).toEqual({ average: null, count: 0 });
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
