import { NextResponse } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { readMealData } from '@/lib/meal-data';
import { getWeekRange, filterPlanToWeek, fromISODate } from '@/lib/meal-constants';
import { householdToday } from '@/lib/household-day';
import { weekGroceryList } from '@/lib/grocery-utils';
import { groceryChecksForWeek } from '@/lib/grocery-checks';
import { readMealieShopping } from '@/lib/mealie-shopping';
import { mealieFailureResponse } from '@/lib/mealie-api';
import { shoppingCounts, shoppingListByName } from '@/lib/shopping-list';
import { groceryExtrasItems } from '@/lib/grocery-wall';
import { groceryAddListId } from '@/lib/todo-wall';
import { readTodoData } from '@/lib/todo-data';

export const dynamic = 'force-dynamic';

/**
 * The resolved grocery list for the current week. `GET /api/meals/grocery`
 * only returns the checked state — the list itself (ingredients aggregated
 * from the week's planned meals, grouped by aisle) has always been computed
 * client-side in /remote and the editor. This endpoint runs the same
 * canonical generator (weekGroceryList) server-side so external callers
 * — the Home Assistant voice package's "what's on the grocery list?" — see
 * exactly what the Grocery tab shows. "Current week" follows the shared
 * weekStartDay meal setting, same as every meal surface, and starts from the
 * household's today (Settings time zone), not the hub's clock: a Pi on UTC
 * would otherwise answer with next week's list from Saturday evening. The
 * checked state is that week's ticks only. The family's list for the other
 * things to buy, when one is picked (`MealSettings.groceryExtrasListId`),
 * comes last as its own category named after the list, with what is still on
 * it and what was ticked this week, as the Grocery tab and the wall show it.
 *
 * While the plan lives in Mealie the list does too: the answer is the Mealie
 * list the family shops from, one category per Mealie label (`category` is
 * the label's name, null for items with none), one item per thing as the
 * line says it ("eggs"), with the food's own name as `alsoCalled` when it
 * differs ("egg"), so the voice reply matches the Grocery tab. Two lines of
 * one thing (flour for two recipes) are one name to say, but `total` and
 * `checked` count lines, the way the Grocery tab counts them.
 */
export const GET = withDisplayAuth(async () => {
  const data = await readMealData();
  const { start, end } = getWeekRange(fromISODate(await householdToday()), data.settings.weekStartDay);
  if (data.settings.planSource === 'mealie') {
    const result = await readMealieShopping(data.mealieShoppingList);
    if (result.status === 'failed') return mealieFailureResponse(result.failure);
    const categories = result.list
      ? shoppingListByName(result.list).map((g) => ({
        category: g.label,
        items: g.items.map((i) => ({ name: i.name, ...(i.alsoCalled ? { alsoCalled: i.alsoCalled } : {}), amount: '', checked: i.checked })),
      }))
      : [];
    const counts = result.list ? shoppingCounts(result.list) : { total: 0, got: 0 };
    return NextResponse.json({
      week: { start, end },
      categories,
      total: counts.total,
      checked: counts.got,
      source: 'mealie',
      list: result.list ? { id: result.list.id, name: result.list.name } : null,
    });
  }
  const weekPlan = filterPlanToWeek(data.plan, start, end);
  const { list, counts } = weekGroceryList(weekPlan, data.savedMeals, groceryChecksForWeek(data.groceryChecked, start));
  const categories: Array<{ category: string; items: Array<{ name: string; amount: string; checked: boolean }> }> =
    Array.from(list.entries()).map(([category, { items }]) => ({ category, items }));
  let total = counts.total;
  let checked = counts.checked;
  const extrasId = groceryAddListId(data.settings);
  const extras = extrasId ? (await readTodoData()).lists.find((l) => l.id === extrasId) : undefined;
  const extraItems = extras ? groceryExtrasItems(extras, start) : [];
  if (extras && extraItems.length > 0) {
    categories.push({ category: extras.name, items: extraItems.map((it) => ({ name: it.text, amount: '', checked: it.completed })) });
    total += extraItems.length;
    checked += extraItems.filter((it) => it.completed).length;
  }

  return NextResponse.json({ week: { start, end }, categories, total, checked });
}, 'Failed to build the grocery list');
