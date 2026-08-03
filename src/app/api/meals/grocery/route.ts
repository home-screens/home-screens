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
 *  sibling chore toggle endpoint's posture.
 *
 *  `item` is normalized to trimmed lowercase — the checked store has always
 *  held lowercase names (every existing client lowercases before posting),
 *  so normalizing here lets callers send the display-cased name instead.
 *
 *  `direction` ('check' | 'uncheck', optional) makes the call idempotent:
 *  omitted it stays the historical flip; set, the call only ever moves the
 *  item in that direction and no-ops when it's already there — so a
 *  repeated voice "check off milk" can never silently un-check it. The
 *  response's `changed` reports whether this call actually flipped anything. */
export const POST = withDisplayAuth(async (req: NextRequest) => {
  const body = await parseJsonBody<{ item?: unknown; direction?: unknown }>(req);
  if (body instanceof NextResponse) return body;
  const { item, direction } = body;

  if (typeof item !== 'string' || !item.trim()) {
    return NextResponse.json(
      { error: 'item must be a non-empty string' },
      { status: 400 },
    );
  }
  if (direction !== undefined && direction !== 'check' && direction !== 'uncheck') {
    return NextResponse.json(
      { error: 'direction must be "check" or "uncheck" when provided' },
      { status: 400 },
    );
  }

  const normalized = item.trim().toLowerCase();
  const data = await readMealData();
  const idx = data.groceryChecked.indexOf(normalized);

  let changed = false;
  if (idx >= 0 && direction !== 'check') {
    data.groceryChecked.splice(idx, 1);
    changed = true;
  } else if (idx < 0 && direction !== 'uncheck') {
    data.groceryChecked.push(normalized);
    changed = true;
  }

  if (changed) await writeMealData(data);
  return NextResponse.json({ groceryChecked: data.groceryChecked, changed });
}, 'Failed to toggle grocery item');
