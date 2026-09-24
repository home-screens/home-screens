import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { parseJsonBody, withAuth } from '@/lib/api-utils';
import { writeChoreSettings } from '@/lib/chore-data';
import { parseChoreSettings, readChoreSettings } from '@/lib/chore-bonus';

export const dynamic = 'force-dynamic';

/**
 * Save the household chore settings. They are read with the chores
 * (`GET /api/chores/data`), and saved here on their own so a settings change
 * never collides with a chore list being edited on another phone.
 */
export const PUT = withAuth(async (request: NextRequest) => {
  const body = await parseJsonBody<unknown>(request);
  if (body instanceof NextResponse) return body;
  const settings = parseChoreSettings(body);
  if (!settings) {
    return NextResponse.json({ error: 'Choose how many can be grabbed at once and how long a grab lasts.' }, { status: 400 });
  }
  const saved = await writeChoreSettings(settings);
  return NextResponse.json({ settings: readChoreSettings(saved.settings) });
}, 'Failed to save the chore settings');
