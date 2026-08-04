import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createPickerSession, getPickerSession, deletePickerSession } from '@/lib/google-picker';
import { withAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/** POST — start a picking session; the editor opens/shows pickerUri. */
export const POST = withAuth(async () => {
  const session = await createPickerSession();
  return NextResponse.json(session);
}, 'Could not start a Google Photos picking session');

/** GET ?id= — poll until the user finishes picking (mediaItemsSet). */
export const GET = withAuth(async (request: NextRequest) => {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const session = await getPickerSession(id);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json(session);
}, 'Could not check the picking session');

/** DELETE ?id= — abandon a session without importing. */
export const DELETE = withAuth(async (request: NextRequest) => {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await deletePickerSession(id);
  return NextResponse.json({ ok: true });
}, 'Could not close the picking session');
