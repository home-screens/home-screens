import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readMealData, writeMealData, prunePlan } from '@/lib/meal-data';
import { withAuth, withDisplayAuth, guardEmptyOverwrite } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/** GET /api/meals/data — return saved meals + plan + grocery checked state */
export const GET = withDisplayAuth(async () => {
  const data = await readMealData();
  return NextResponse.json(data);
}, 'Failed to read meal data');

/** PUT /api/meals/data — update saved meals + plan (+ optionally groceryChecked) */
export const PUT = withAuth(async (req: NextRequest) => {
  const body = await req.json();
  const { savedMeals, plan, groceryChecked, force } = body;

  if (!Array.isArray(savedMeals) || !Array.isArray(plan)) {
    return NextResponse.json(
      { error: 'savedMeals and plan must be arrays' },
      { status: 400 },
    );
  }

  const existing = await readMealData().catch(() => ({ savedMeals: [], plan: [], groceryChecked: [] as string[] }));

  const guard = await guardEmptyOverwrite(
    [savedMeals, plan],
    async () => [existing.savedMeals, existing.plan],
    'meal',
    force,
  );
  if (guard) return guard;
  const data = {
    savedMeals,
    plan: prunePlan(plan),
    groceryChecked: Array.isArray(groceryChecked) ? groceryChecked : existing.groceryChecked,
  };

  await writeMealData(data);
  return NextResponse.json(data);
}, 'Failed to update meal data');
