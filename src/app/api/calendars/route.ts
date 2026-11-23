import { NextResponse } from 'next/server';
import { getAuthenticatedClient, loadTokens } from '@/lib/google-auth';
import { withAuth } from '@/lib/api-utils';
import { calendarApi, isWritableRole } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    // Determine why auth failed so the user gets actionable info
    const tokens = await loadTokens();
    let reason = 'Not authenticated with Google';
    if (!tokens) {
      reason = 'No Google tokens found. Please sign in with Google in Settings > Calendar.';
    } else if (!tokens.refresh_token) {
      reason = 'Google did not provide a refresh token. Try revoking access at myaccount.google.com/permissions, then sign in again.';
    } else {
      reason = 'Google token refresh failed. Your authorization may have been revoked. Please sign in again.';
    }
    return NextResponse.json({ error: reason }, { status: 403 });
  }

  const calendar = calendarApi(auth);
  const res = await calendar.calendarList.list();
  const items = res.data.items ?? [];

  const calendars = items.map((cal) => ({
    id: cal.id ?? '',
    summary: cal.summary ?? '(Untitled)',
    backgroundColor: cal.backgroundColor ?? '#3b82f6',
    primary: cal.primary ?? false,
    // Settings > Calendar offers only these for adding events.
    writable: isWritableRole(cal.accessRole),
  }));

  return NextResponse.json(calendars);
}, 'Failed to list calendars');
