import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readMealData, writeMealData } from '@/lib/meal-data';
import { withDisplayAuth, parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/** GET /api/meals/grocery — return grocery checked state */
export const GET = withDisplayAuth(async () => {
  const data = await readMealData();
  return NextResponse.json({ groceryChecked: data.groceryChecked });
}, 'Failed to read grocery data');

/** POST /api/meals/grocery — toggle a grocery item checked state.
 *  Display-token auth (not session-only) so LAN callers like Home Assistant
 *  voice commands can check items off — a low-risk flip, matching the
 *  sibling chore toggle endpoint's posture. */
export const POST = withDisplayAuth(async (req: NextRequest) => {
  const body = await parseJsonBody<{ item?: unknown }>(req);
  if (body instanceof NextResponse) return body;
  const { item } = body;

  if (typeof item !== 'string' || !item.trim()) {
    return NextResponse.json(
      { error: 'item must be a non-empty string' },
      { status: 400 },
    );
  }

  const data = await readMealData();
  const idx = data.groceryChecked.indexOf(item);

  if (idx >= 0) {
    data.groceryChecked.splice(idx, 1);
  } else {
    data.groceryChecked.push(item);
  }

  await writeMealData(data);
  return NextResponse.json({ groceryChecked: data.groceryChecked });
}, 'Failed to toggle grocery item');
