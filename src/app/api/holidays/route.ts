import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { fetchAvailableCountries, fetchHolidayEvents } from '@/lib/holidays';
import { withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;

  // Return available countries list
  if (searchParams.has('countries')) {
    const countries = await fetchAvailableCountries();
    return NextResponse.json(countries);
  }

  // Return holidays for a specific country/year
  const country = searchParams.get('country');
  if (!country || !/^[A-Z]{2}$/i.test(country)) {
    return NextResponse.json({ error: 'Missing or invalid country parameter' }, { status: 400 });
  }

  const year = parseInt(searchParams.get('year') ?? new Date().getFullYear().toString(), 10);
  if (!Number.isFinite(year)) {
    return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 });
  }
  const timeMin = `${year}-01-01`;
  const timeMax = `${year}-12-31`;

  const events = await fetchHolidayEvents(country, timeMin, timeMax);
  return NextResponse.json(events);
}, 'Failed to fetch holidays');
