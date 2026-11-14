import { FamilyError } from '@/lib/family-errors';
import { normalizeFamilyMealRatings } from '@/lib/meal-ratings';
import { missingAssignment, type Doc, type MemberReferenceDomain } from './contract';
import type { FamilyMealRating } from '@/types/meal-ratings';

function votesIn(doc: Doc): FamilyMealRating[] {
  // A file that is not the meal store's at all is refused, as every domain
  // refuses a document it cannot reason about.
  if (!Array.isArray(doc.savedMeals) || !Array.isArray(doc.plan)) throw new FamilyError('family.dataInvalid', 'The saved meals are invalid.', { status: 409 });
  // The votes are read as the meal store reads them: a row that is not a vote
  // names nobody, so it never stands in the way of removing a person.
  return normalizeFamilyMealRatings(doc.familyRatings);
}

export const mealRatingReferences: MemberReferenceDomain = {
  path: 'data/meals.json',
  unreadable: 'refuse',
  removeMembers(doc, removed) {
    const votes = votesIn(doc);
    if (!votes.some((v) => removed.has(v.memberId))) return doc;
    return { ...doc, familyRatings: votes.filter((v) => !removed.has(v.memberId)) };
  },
  planRestore(doc, members) {
    const votes = votesIn(doc);
    return { missing: votes.flatMap((v) => missingAssignment([v.memberId], `data/meals.json, recipe ${JSON.stringify(v.mealId)}, memberId`, members)), evidence: {} };
  },
};
