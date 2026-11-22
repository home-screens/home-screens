import { NextResponse } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { calendarEntryInfo } from '@/lib/calendar-event-writes';

export const dynamic = 'force-dynamic';

/**
 * GET: what the phone and the wall need to offer adding events
 * (`CalendarEntryInfo`): whether it is on, where Google's sign-in stands,
 * the calendars a new event can go on with their names and colors, the
 * usual length and the household's clock.
 */
export const GET = withDisplayAuth(async () => NextResponse.json(await calendarEntryInfo()), 'Failed to read calendar settings');
