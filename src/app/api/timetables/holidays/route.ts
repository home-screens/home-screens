import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { TIMETABLE_LIMITS } from '@/types/timetables';
import {
  SchoolHolidaysError,
  currentSchoolYear,
  getSchoolHolidays,
  getSubdivisions,
  type SchoolHolidaysResult,
} from '@/lib/school-holidays';

export const dynamic = 'force-dynamic';

/**
 * A wall can show children at schools in several places at once, and holidays
 * belong to the school. One document cannot hold more schools than this, so
 * neither can one request.
 */
const MAX_REGIONS = TIMETABLE_LIMITS.maxSchools;

/**
 * The regions one request is asking about, deduped and in a settled order.
 *
 * Repeated (`?region=DE-NW&region=DE-BY`) and comma-separated
 * (`?region=DE-NW,DE-BY`) both read, because the wall builds one and a person
 * reaching for the route by hand writes the other. Sorted so the same two
 * schools are one cached question however the cards happen to be ordered.
 */
function askedRegions(params: URLSearchParams): string[] {
  const codes = params.getAll('region').flatMap((value) => value.split(','));
  const wanted = new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean));
  return [...wanted].sort();
}

/**
 * School and public holidays, for the wall and for the editor.
 *
 * `?region=DE-NW&year=2026` answers with that school year, September 2026 to
 * August 2027; leaving the year off asks about the one running now. Several
 * regions can be named at once, and the answer is always a map keyed by region
 * so a reader never branches on how many it asked for. A failed lookup is not
 * an error here: the saved copy comes back with `ok: false` so an offline
 * display keeps showing the right thing.
 *
 * `?country=DE` answers with the regions to choose from and whether the
 * country has school holidays at all, so the editor can say so instead of
 * showing an empty picker. A region wins when both are asked for.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const regions = askedRegions(params);
  const country = params.get('country');

  try {
    if (regions.length > 0) {
      if (regions.length > MAX_REGIONS) {
        return NextResponse.json({ error: `Ask about up to ${MAX_REGIONS} regions at a time` }, { status: 400 });
      }
      const year = params.get('year');
      const schoolYear = year === null ? await currentSchoolYear() : Number(year);
      // In parallel because they are independent lookups and the library
      // caches each region on its own, so a second school in a region a card
      // already asked about costs nothing.
      const answers = await Promise.all(regions.map((region) => getSchoolHolidays(region, schoolYear)));
      const byRegion: Record<string, SchoolHolidaysResult> = {};
      // Keyed by the normalized code the library answers with, not by what was
      // asked, so a lower-case code in the query still finds its answer.
      for (const answer of answers) byRegion[answer.region] = answer;
      return NextResponse.json({ regions: byRegion });
    }
    if (country) return NextResponse.json(await getSubdivisions(country));
  } catch (error) {
    if (error instanceof SchoolHolidaysError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  return NextResponse.json({ error: 'Say which region or country to look up' }, { status: 400 });
}, 'School holidays could not be loaded. Try again in a moment.');
