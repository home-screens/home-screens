import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { readMealData, writeMealData } from '@/lib/meal-data';
import { withAuth, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/** GET /api/meals/grocery — return grocery checked state */
export const GET = withDisplayAuth(async () => {
  const data = await readMealData();
  return NextResponse.json({ groceryChecked: data.groceryChecked });
}, 'Failed to read grocery data');

/** POST /api/meals/grocery — toggle a grocery item checked state */
export const POST = withAuth(async (req: NextRequest) => {
  const { item } = await req.json();

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
