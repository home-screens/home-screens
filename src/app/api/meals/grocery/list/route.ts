import { NextResponse } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { readMealData } from '@/lib/meal-data';
import { getWeekRange, filterPlanToWeek } from '@/lib/meal-constants';
import { generateGroceryList } from '@/lib/grocery-utils';

export const dynamic = 'force-dynamic';

/**
 * The resolved grocery list for the current week. `GET /api/meals/grocery`
 * only returns the checked state — the list itself (ingredients aggregated
 * from the week's planned meals, grouped by aisle) has always been computed
 * client-side in /remote and the editor. This endpoint runs the same
 * canonical generator (generateGroceryList) server-side so external callers
 * — the Home Assistant voice package's "what's on the grocery list?" — see
 * exactly what the Grocery tab shows. "Current week" follows the shared
 * weekStartDay meal setting, same as every meal surface.
 */
export const GET = withDisplayAuth(async () => {
  const data = await readMealData();
  const { start, end } = getWeekRange(new Date(), data.settings.weekStartDay);
  const weekPlan = filterPlanToWeek(data.plan, start, end);
  const list = generateGroceryList(weekPlan, data.savedMeals, data.groceryChecked);

  const categories = Array.from(list.entries()).map(([category, { items }]) => ({
    category,
    items,
  }));
  const all = categories.flatMap((c) => c.items);

  return NextResponse.json({
    week: { start, end },
    categories,
    total: all.length,
    checked: all.filter((i) => i.checked).length,
  });
}, 'Failed to build the grocery list');
