import { FamilyError } from '@/lib/family-errors';
import { validateFamilyMealRatings } from '@/lib/meal-ratings';
import { missingAssignment, type Doc, type MemberReferenceDomain } from './contract';
import type { FamilyMealRating } from '@/types/meal-ratings';

function checked(doc: Doc): FamilyMealRating[] {
  if (!Array.isArray(doc.savedMeals) || !Array.isArray(doc.plan)) throw new FamilyError('family.dataInvalid', 'The saved meals are invalid.', { status: 409 });
  const error = validateFamilyMealRatings(doc.familyRatings);
  if (error) throw new FamilyError('family.dataInvalid', error, { status: 409 });
  return (doc.familyRatings ?? []) as FamilyMealRating[];
}

export const mealRatingReferences: MemberReferenceDomain = {
  path: 'data/meals.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const votes = checked(doc);
    if (!votes.some((v) => removed.has(v.memberId))) return doc;
    return { ...doc, familyRatings: votes.filter((v) => !removed.has(v.memberId)) };
  },
  planRestore(doc, members) {
    const votes = checked(doc);
    return { missing: votes.flatMap((v) => missingAssignment([v.memberId], `data/meals.json, recipe ${JSON.stringify(v.mealId)}, memberId`, members)), evidence: {} };
  },
};
