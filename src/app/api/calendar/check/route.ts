import { NextResponse } from 'next/server';
import { withAuth, parseJsonBody } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Probe an iCal / ICS link before the editor saves it, so a wrong paste (a
 * school portal's login page, a link missing `.ics`) is caught in the Add
 * form instead of sitting silently on the Calendar page until the next
 * display fetch. Runs the same fetch + parse the display uses. Editor
 * session only: the reply carries upstream error text.
 */
export const POST = withAuth(async (request) => {
  const body = await parseJsonBody<{ url?: string }>(request, { maxBytes: MAX_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ error: 'Missing required field: url' }, { status: 400 });
  }
  // Lazy-import so the route still loads when node-ical isn't installed.
  const { checkICalUrl } = await import('@/lib/ical-calendar');
  return NextResponse.json(await checkICalUrl(url));
}, 'Failed to check the calendar link');
