import { NextRequest, NextResponse } from 'next/server';
import { fetchAvailableCountries, fetchHolidayEvents } from '@/lib/holidays';
import { errorResponse, withDisplayAuth } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

export const GET = withDisplayAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;

  // Return available countries list
  if (searchParams.has('countries')) {
    try {
      const countries = await fetchAvailableCountries();
      return NextResponse.json(countries);
    } catch (error) {
      return errorResponse(error, 'Failed to fetch available countries');
    }
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

  try {
    const events = await fetchHolidayEvents(country, timeMin, timeMax);
    return NextResponse.json(events);
  } catch (error) {
    return errorResponse(error, 'Failed to fetch holidays');
  }
}, 'Failed to fetch holidays');
