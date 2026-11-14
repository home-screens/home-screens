import { NextResponse, type NextRequest } from 'next/server';
import { parseJsonBody, withDisplayAuth } from '@/lib/api-utils';
import { updateMealData } from '@/lib/meal-data';
import { readFamilyData } from '@/lib/family-data';
import { withDataTransaction } from '@/lib/data-transaction';
import { claimsMealieId, parseMealieMealId } from '@/lib/mealie-map';
import { getMealieRecipe } from '@/lib/mealie';
import { withMealieErrors } from '@/lib/mealie-api';
import { setFamilyMealRating, validMealVote } from '@/lib/meal-ratings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/meals/ratings: one person's stars for one recipe, or `rating:
 * null` to take them back. The wall may send it (a display token), so it
 * sits in the display tier like ticking a to-do. The votes themselves are
 * read with the rest of the meals (`GET /api/meals/data`).
 */
export const POST = withDisplayAuth(withMealieErrors(async (req: NextRequest) => {
  const body = await parseJsonBody<{ mealId?: unknown; memberId?: unknown; rating?: unknown }>(req);
  if (body instanceof NextResponse) return body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'A rating must be an object.' }, { status: 400 });
  const { mealId, memberId, rating } = body;
  if (typeof mealId !== 'string' || !mealId || mealId.length > 200
    || typeof memberId !== 'string' || !memberId || memberId.length > 200
    || (rating !== null && !validMealVote(rating))) {
    return NextResponse.json({ error: 'Choose a meal, a family member and 1 to 5 stars (or null to clear).' }, { status: 400 });
  }
  // Keep Mealie requests outside the data lock; clearing a vote still works while it is offline.
  if (claimsMealieId(mealId)) {
    const id = parseMealieMealId(mealId);
    if (!id) return NextResponse.json({ error: 'Unknown recipe' }, { status: 400 });
    if (rating !== null) await getMealieRecipe(id);
  }
  return withDataTransaction(async () => {
    const family = await readFamilyData();
    if (!family.members.some((m) => m.id === memberId)) return NextResponse.json({ error: 'This person is no longer in the family.' }, { status: 404 });
    // Merge one person's vote into the latest file instead of replacing concurrent edits.
    const data = await updateMealData((current) => {
      if (!claimsMealieId(mealId) && !current.savedMeals.some((m) => m.id === mealId)) {
        throw NextResponse.json({ error: 'This saved meal no longer exists.' }, { status: 404 });
      }
      const votes = current.familyRatings ?? [];
      const next = setFamilyMealRating(votes, mealId, memberId, rating, new Date().toISOString());
      return next === votes ? current : { ...current, familyRatings: next };
    });
    return NextResponse.json({ ratings: data.familyRatings ?? [] });
  });
}), 'Failed to save meal rating');
