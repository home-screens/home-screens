import { NextResponse } from 'next/server';
import { withAuth, parseJsonBody, SMALL_BODY_BYTES } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

/**
 * Probe an iCal / ICS link before the editor saves it, so a wrong paste (a
 * school portal's login page, a link missing `.ics`) is caught in the Add
 * form instead of sitting silently on the Calendar page until the next
 * display fetch. Runs the same fetch + parse the display uses. Editor
 * session only: the reply carries upstream error text.
 *
 * `homeNetwork` mirrors the toggle on the feed being added, so a self-hosted
 * calendar can be checked before it is saved. It is honoured only for an
 * editor session, which could grant the same consent by saving the feed
 * anyway; without it the check is held to the strict rule, so this route
 * cannot be used to look around the home network.
 */
export const POST = withAuth(async (request) => {
  const body = await parseJsonBody<{ url?: string; homeNetwork?: boolean }>(request, { maxBytes: SMALL_BODY_BYTES });
  if (body instanceof NextResponse) return body;
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ error: 'Missing required field: url' }, { status: 400 });
  }
  // Lazy-import so the route still loads when node-ical isn't installed.
  const { checkICalUrl } = await import('@/lib/ical-calendar');
  return NextResponse.json(await checkICalUrl(url, { homeNetwork: body.homeNetwork === true }));
}, 'Failed to check the calendar link');
