import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';

// Only the network is faked. The resolver caches, the JSON store and the date
// maths are the real ones, so the caching and offline paths are actually run.
vi.mock('@/lib/api-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-utils')>();
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  };
});

let householdZone: string | undefined;
vi.mock('@/lib/config-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/config-cache')>()),
  readConfigCached: vi.fn(async () => ({ settings: { timezone: householdZone } })),
}));

import { fetchWithTimeout } from '@/lib/api-utils';
import {
  clearSchoolHolidayCaches,
  currentSchoolYear,
  getPublicHolidays,
  getSchoolDayInfo,
  getSchoolHolidays,
  getSubdivisions,
  pickLocalizedName,
  schoolYearOf,
  SchoolHolidaysError,
  type LocalizedText,
} from '@/lib/school-holidays';

const mockFetch = vi.mocked(fetchWithTimeout);

// ---------------------------------------------------------------------------
// Test data, shaped like the live openholidaysapi.org rows
// ---------------------------------------------------------------------------

const de = (text: string): LocalizedText => ({ language: 'DE', text });
const en = (text: string): LocalizedText => ({ language: 'EN', text });

interface RowExtras {
  temporalScope?: string;
  tags?: string[];
  groups?: { code: string; shortName: string }[];
  comment?: LocalizedText[];
}

function schoolRow(id: string, startDate: string, endDate: string, name: LocalizedText[], extras: RowExtras = {}) {
  return { id, startDate, endDate, type: 'School', name, temporalScope: 'FullDay', ...extras };
}

function publicRow(id: string, date: string, name: LocalizedText[]) {
  return { id, startDate: date, endDate: date, type: 'Public', name, temporalScope: 'FullDay' };
}

/** North Rhine-Westphalia, school year 2026/27, trimmed to what the tests use. */
const NRW_SCHOOL = [
  // The previous year's summer break, which every window starting 1 September
  // still catches because its last day is that very day.
  schoolRow('nrw-sommer-25', '2026-07-20', '2026-09-01', [de('Sommerferien'), en('Summer Holidays')]),
  schoolRow('nrw-herbst', '2026-10-17', '2026-10-31', [de('Herbstferien'), en('Autumn Holidays')]),
  schoolRow('nrw-weihnachten', '2026-12-23', '2027-01-06', [de('Weihnachtsferien'), en('Christmas Holidays')]),
  schoolRow('nrw-pfingsten', '2027-05-18', '2027-05-18', [de('Pfingstferien'), en('Whitsun Holidays')]),
];

const NRW_PUBLIC = [
  publicRow('de-einheit', '2026-10-03', [de('Tag der Deutschen Einheit'), en('Day of German Unity')]),
  publicRow('de-allerheiligen', '2026-11-01', [de('Allerheiligen'), en("All Saints' Day")]),
  publicRow('de-pfingstmontag', '2027-05-17', [de('Pfingstmontag'), en('Whit Monday')]),
  publicRow('de-fronleichnam', '2027-05-27', [de('Fronleichnam'), en('Corpus Christi')]),
];

/** Every row of a country carries the same word for what it is. */
const BUNDESLAND = [de('Bundesland'), en('federal state')];

const DE_SUBDIVISIONS = [
  {
    code: 'DE-NW',
    isoCode: 'DE-NW',
    shortName: 'NW',
    category: BUNDESLAND,
    name: [de('Nordrhein-Westfalen'), en('North Rhine-Westphalia')],
    children: [{
      code: 'DE-NW-DU',
      isoCode: '',
      shortName: 'NW-DU',
      category: [de('Stadt'), en('city')],
      name: [en('Duisburg')],
    }],
  },
  { code: 'DE-BE', isoCode: 'DE-BE', shortName: 'BE', category: BUNDESLAND, name: [de('Berlin'), en('Berlin')] },
  { code: 'DE-BY', isoCode: 'DE-BY', shortName: 'BY', category: BUNDESLAND, name: [de('Bayern'), en('Bavaria')] },
];

interface Bodies {
  school?: unknown;
  public?: unknown;
  subdivisions?: unknown;
}

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) } as Response;
}

/** Answer each endpoint from `bodies`; anything else is a test bug. */
function respond(bodies: Bodies) {
  mockFetch.mockImplementation((url) => {
    const href = String(url);
    if (href.includes('/SchoolHolidays')) return Promise.resolve(jsonResponse(bodies.school ?? []));
    if (href.includes('/PublicHolidays')) return Promise.resolve(jsonResponse(bodies.public ?? []));
    if (href.includes('/Subdivisions')) return Promise.resolve(jsonResponse(bodies.subdivisions ?? []));
    return Promise.reject(new Error(`Unexpected request: ${href}`));
  });
}

function requestedUrls(): string[] {
  return mockFetch.mock.calls.map((call) => String(call[0]));
}

const storeFile = () => path.join(process.cwd(), 'data', 'school-holidays.json');

beforeEach(async () => {
  vi.clearAllMocks();
  clearSchoolHolidayCaches();
  await fs.rm(storeFile(), { force: true });
});

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

describe('getSchoolHolidays requests', () => {
  it('asks for one school year, with no language filter', async () => {
    respond({ school: NRW_SCHOOL, public: NRW_PUBLIC });
    await getSchoolHolidays('DE-NW', 2026);

    const urls = requestedUrls();
    expect(urls).toHaveLength(2);
    for (const url of urls) {
      const params = new URL(url).searchParams;
      expect(params.get('countryIsoCode')).toBe('DE');
      expect(params.get('subdivisionCode')).toBe('DE-NW');
      expect(params.get('validFrom')).toBe('2026-09-01');
      expect(params.get('validTo')).toBe('2027-08-31');
      // Omitting the language is what makes one cached payload serve every
      // display language.
      expect(params.has('languageIsoCode')).toBe(false);
    }
    expect(urls.some((u) => u.includes('/SchoolHolidays'))).toBe(true);
    expect(urls.some((u) => u.includes('/PublicHolidays'))).toBe(true);
  });

  it('sends no region for a country that has no regions', async () => {
    respond({ school: NRW_SCHOOL, public: NRW_PUBLIC });
    await getSchoolHolidays('LU', 2026);
    for (const url of requestedUrls()) {
      expect(new URL(url).searchParams.has('subdivisionCode')).toBe(false);
    }
  });

  it('accepts a region however it is typed', async () => {
    respond({ school: NRW_SCHOOL, public: NRW_PUBLIC });
    const result = await getSchoolHolidays('  de-nw ', 2026);
    expect(result.region).toBe('DE-NW');
    expect(new URL(requestedUrls()[0]).searchParams.get('subdivisionCode')).toBe('DE-NW');
  });

  it('refuses anything that is not a region code, without calling out', async () => {
    for (const bad of ['', 'D', 'DE-', 'DE NW', 'DE-NORDRHEIN', '../../etc', 'DE-NW?x=1']) {
      await expect(getSchoolHolidays(bad, 2026)).rejects.toBeInstanceOf(SchoolHolidaysError);
    }
    await expect(getSchoolHolidays('DE-NW', 1900)).rejects.toBeInstanceOf(SchoolHolidaysError);
    await expect(getSubdivisions('XXX')).rejects.toBeInstanceOf(SchoolHolidaysError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a bad region as something the caller sent', async () => {
    await expect(getSchoolHolidays('nonsense', 2026)).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------------------
// Shaping the rows
// ---------------------------------------------------------------------------

describe('getSchoolHolidays results', () => {
  it('keeps the last day of a holiday and the break that runs into the window', async () => {
    respond({ school: NRW_SCHOOL, public: NRW_PUBLIC });
    const result = await getSchoolHolidays('DE-NW', 2026);

    expect(result.ok).toBe(true);
    expect(result.schoolHolidays.map((h) => [h.startDate, h.endDate])).toEqual([
      ['2026-07-20', '2026-09-01'],
      ['2026-10-17', '2026-10-31'],
      ['2026-12-23', '2027-01-06'],
      ['2027-05-18', '2027-05-18'],
    ]);

    // The end date is inclusive: 31 October is still a day off, 1 November is
    // no longer part of the autumn break.
    expect(getSchoolDayInfo('2026-10-31', result).holiday?.id).toBe('nrw-herbst');
    expect(getSchoolDayInfo('2026-11-01', result).holiday).toBeNull();
    expect(getSchoolDayInfo('2026-09-01', result).holiday?.id).toBe('nrw-sommer-25');
  });

  it('drops rows that only apply to a few islands', async () => {
    // Schleswig-Holstein publishes the islands' own dates alongside the state's,
    // and they overlap, so a wall would show two autumn breaks at once.
    const schleswig = [
      schoolRow('sh-herbst-islands', '2026-10-05', '2026-10-24', [de('Herbstferien'), en('Autumn Holidays')], {
        tags: ['Exception'],
        comment: [de('Inseln Sylt, Föhr, Amrum, Helgoland und die Halligen')],
      }),
      schoolRow('sh-herbst', '2026-10-12', '2026-10-24', [de('Herbstferien'), en('Autumn Holidays')]),
      schoolRow('sh-sommer', '2027-07-03', '2027-08-14', [de('Sommerferien'), en('Summer Holidays')]),
      schoolRow('sh-sommer-islands', '2027-07-03', '2027-08-07', [de('Sommerferien'), en('Summer Holidays')], {
        tags: ['Exception'],
      }),
    ];
    respond({ school: schleswig, public: [] });

    const result = await getSchoolHolidays('DE-SH', 2026);
    expect(result.schoolHolidays.map((h) => h.id)).toEqual(['sh-herbst', 'sh-sommer']);
    expect(result.schoolHolidays[0].startDate).toBe('2026-10-12');
  });

  it('joins a holiday that a state splits by school type', async () => {
    // Mecklenburg-Vorpommern runs separate dates for general and vocational
    // schools, so the two rows become the longest break either school gets.
    const mecklenburg = [
      schoolRow('mv-herbst-abs', '2026-10-15', '2026-10-24', [de('Herbstferien'), en('Autumn Holidays')], {
        groups: [{ code: 'DE-MV-ABS', shortName: 'MV-ABS' }],
      }),
      schoolRow('mv-herbst-bbs', '2026-10-19', '2026-10-24', [de('Herbstferien'), en('Autumn Holidays')], {
        groups: [{ code: 'DE-MV-BBS', shortName: 'MV-BBS' }],
      }),
      schoolRow('mv-extra', '2026-11-26', '2026-11-26', [de('Zusätzlicher Ferientag'), en('Additional day off')], {
        groups: [{ code: 'DE-MV-ABS', shortName: 'MV-ABS' }, { code: 'DE-MV-BBS', shortName: 'MV-BBS' }],
      }),
    ];
    respond({ school: mecklenburg, public: [] });

    const result = await getSchoolHolidays('DE-MV', 2026);
    expect(result.schoolHolidays.map((h) => [h.startDate, h.endDate])).toEqual([
      ['2026-10-15', '2026-10-24'],
      ['2026-11-26', '2026-11-26'],
    ]);
  });

  it('leaves out markers that are not time off', async () => {
    respond({
      school: [
        { ...schoolRow('ch-start', '2026-08-17', '2026-08-17', [en('Start of the school year')]), type: 'BackToSchool' },
        { ...schoolRow('fr-end', '2027-07-03', '2027-07-03', [en('End of lessons')]), type: 'EndOfLessons' },
        schoolRow('fr-herbst', '2026-10-17', '2026-11-02', [en('Autumn Holidays')]),
      ],
      public: [],
    });

    const result = await getSchoolHolidays('FR-IF', 2026);
    expect(result.schoolHolidays.map((h) => h.id)).toEqual(['fr-herbst']);
  });

  it('keeps a half day as a school day', async () => {
    respond({
      school: [schoolRow('li-half', '2027-04-02', '2027-04-02', [de('Schulfrei'), en('No lessons')], {
        temporalScope: 'HalfDay',
        comment: [de('Ab Mittag'), en('From noon')],
      })],
      public: [],
    });

    const result = await getSchoolHolidays('LI', 2026);
    const info = getSchoolDayInfo('2027-04-02', result);
    expect(result.schoolHolidays[0].halfDay).toBe(true);
    expect(result.schoolHolidays[0].notes?.[0].text).toBe('Ab Mittag');
    expect(info.schoolDay).toBe(true);
    expect(info.backToSchool).toBeNull();
  });

  it('answers with an empty list for a country the data does not cover', async () => {
    respond({ school: [], public: [] });
    const result = await getSchoolHolidays('US', 2026);

    expect(result.ok).toBe(true);
    expect(result.messageKey).toBeUndefined();
    expect(result.schoolHolidays).toEqual([]);
    expect(result.publicHolidays).toEqual([]);
  });

  it('hands back only the public holidays when that is all the caller wants', async () => {
    respond({ school: NRW_SCHOOL, public: NRW_PUBLIC });
    const days = await getPublicHolidays('DE-NW', 2026);
    expect(days.map((d) => d.date)).toEqual(['2026-10-03', '2026-11-01', '2027-05-17', '2027-05-27']);
  });
});

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

describe('pickLocalizedName', () => {
  const names = [de('Herbstferien'), en('Autumn Holidays')];

  it('uses the display language when the row has it', () => {
    expect(pickLocalizedName(names, 'de-DE')).toBe('Herbstferien');
    expect(pickLocalizedName(names, 'de')).toBe('Herbstferien');
  });

  it('falls back to English for a language the row does not carry', () => {
    // German holidays only ship German and English text.
    expect(pickLocalizedName(names, 'fr-FR')).toBe('Autumn Holidays');
    expect(pickLocalizedName(names, 'da-DK')).toBe('Autumn Holidays');
  });

  it('falls back to the first name when there is no English either', () => {
    expect(pickLocalizedName([{ language: 'NL', text: 'Herfstvakantie' }], 'de-DE')).toBe('Herfstvakantie');
  });

  it('is empty rather than broken when a row has no name at all', () => {
    expect(pickLocalizedName([], 'de-DE')).toBe('');
    expect(pickLocalizedName(undefined, 'de-DE')).toBe('');
  });

  it('keeps every name on the holiday so one cached copy serves every language', async () => {
    respond({ school: NRW_SCHOOL, public: NRW_PUBLIC });
    const result = await getSchoolHolidays('DE-NW', 2026);
    const herbst = result.schoolHolidays[1];
    expect(pickLocalizedName(herbst.names, 'de-DE')).toBe('Herbstferien');
    expect(pickLocalizedName(herbst.names, 'en-US')).toBe('Autumn Holidays');
  });
});

// ---------------------------------------------------------------------------
// School days
// ---------------------------------------------------------------------------

describe('getSchoolDayInfo', () => {
  async function nrw() {
    respond({ school: NRW_SCHOOL, public: NRW_PUBLIC });
    return getSchoolHolidays('DE-NW', 2026);
  }

  it('says school is back on the Monday after the autumn break', async () => {
    const data = await nrw();
    // The break ends on Saturday 31 October 2026 and the Sunday after it is
    // Allerheiligen, so the first day back is Monday 2 November.
    const info = getSchoolDayInfo('2026-10-26', data);
    expect(info.schoolDay).toBe(false);
    expect(info.holiday?.id).toBe('nrw-herbst');
    expect(info.backToSchool).toBe('2026-11-02');
    expect(getSchoolDayInfo('2026-10-31', data).backToSchool).toBe('2026-11-02');
    expect(getSchoolDayInfo('2026-11-01', data).backToSchool).toBe('2026-11-02');
  });

  it('counts a public holiday on a school day as a day off', async () => {
    const data = await nrw();
    // Fronleichnam is a Thursday, so school is back on the Friday.
    const info = getSchoolDayInfo('2027-05-27', data);
    expect(info.schoolDay).toBe(false);
    expect(info.publicHoliday?.id).toBe('de-fronleichnam');
    expect(info.holiday).toBeNull();
    expect(info.backToSchool).toBe('2027-05-28');
  });

  it('runs a public holiday and the break after it together', async () => {
    const data = await nrw();
    // Pfingstmontag is followed by a single day of Pfingstferien.
    expect(getSchoolDayInfo('2027-05-17', data).backToSchool).toBe('2027-05-19');
  });

  it('says nothing is coming up on an ordinary school day', async () => {
    const data = await nrw();
    const info = getSchoolDayInfo('2026-10-16', data);
    expect(info.schoolDay).toBe(true);
    expect(info.holiday).toBeNull();
    expect(info.publicHoliday).toBeNull();
    expect(info.backToSchool).toBeNull();
  });

  it('skips the weekend from a Saturday', async () => {
    const data = await nrw();
    expect(getSchoolDayInfo('2026-09-05', data).backToSchool).toBe('2026-09-07');
  });

  it('refuses a date it cannot read', async () => {
    const data = await nrw();
    expect(() => getSchoolDayInfo('26.10.2026', data)).toThrow(SchoolHolidaysError);
    expect(() => getSchoolDayInfo('2026-99-99', data)).toThrow(SchoolHolidaysError);
  });
});

// ---------------------------------------------------------------------------
// The saved copy
// ---------------------------------------------------------------------------

describe('the saved copy', () => {
  it('serves the last good copy when the fetch fails', async () => {
    respond({ school: NRW_SCHOOL, public: NRW_PUBLIC });
    const first = await getSchoolHolidays('DE-NW', 2026);
    expect(first.ok).toBe(true);

    clearSchoolHolidayCaches();
    mockFetch.mockRejectedValue(new Error('offline'));

    const offline = await getSchoolHolidays('DE-NW', 2026);
    expect(offline.ok).toBe(false);
    expect(offline.messageKey).toBe('schoolHolidaysStale');
    expect(offline.fetchedAt).toBe(first.fetchedAt);
    expect(offline.schoolHolidays.map((h) => h.id)).toEqual(first.schoolHolidays.map((h) => h.id));
    // Still enough to keep the wall right while the network is down.
    expect(getSchoolDayInfo('2026-10-26', offline).backToSchool).toBe('2026-11-02');
  });

  it('says so plainly when there is nothing saved to fall back on', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const result = await getSchoolHolidays('DE-NW', 2026);

    expect(result.ok).toBe(false);
    expect(result.messageKey).toBe('schoolHolidaysUnavailable');
    expect(result.fetchedAt).toBeNull();
    expect(result.schoolHolidays).toEqual([]);
  });

  it('treats an upstream error like an outage, not like a missing region', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject() } as unknown as Response);
    const result = await getSchoolHolidays('DE-NW', 2026);
    expect(result.ok).toBe(false);
    expect(result.messageKey).toBe('schoolHolidaysUnavailable');
  });

  it('keeps one copy per region and school year', async () => {
    respond({ school: NRW_SCHOOL, public: NRW_PUBLIC });
    await getSchoolHolidays('DE-NW', 2026);
    await getSchoolHolidays('DE-BY', 2026);

    const saved = JSON.parse(await fs.readFile(storeFile(), 'utf-8'));
    expect(Object.keys(saved.entries).sort()).toEqual(['DE-BY:2026', 'DE-NW:2026']);
  });
});

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

describe('getSubdivisions', () => {
  it('lists the regions a country can be asked about', async () => {
    respond({ subdivisions: DE_SUBDIVISIONS, school: NRW_SCHOOL });
    const result = await getSubdivisions('de');

    expect(result.country).toBe('DE');
    expect(result.hasSchoolHolidays).toBe(true);
    expect(result.subdivisions.map((r) => r.code)).toEqual(['DE-BY', 'DE-BE', 'DE-NW']);
    expect(result.subdivisions.map((r) => r.label)).toEqual(['Bavaria', 'Berlin', 'North Rhine-Westphalia']);
    // Names ride along so a German display can show "Nordrhein-Westfalen".
    expect(pickLocalizedName(result.subdivisions[2].names, 'de-DE')).toBe('Nordrhein-Westfalen');
  });

  it('leaves out towns and departments nested under a region', async () => {
    respond({ subdivisions: DE_SUBDIVISIONS, school: NRW_SCHOOL });
    const result = await getSubdivisions('DE');
    expect(result.subdivisions.some((r) => r.code === 'DE-NW-DU')).toBe(false);
  });

  it('says a country has no school holidays instead of offering an empty picker', async () => {
    // Spain lists regions but publishes no school holidays at all.
    respond({ subdivisions: [{ code: 'ES-MD', shortName: 'MD', name: [en('Madrid')] }], school: [] });
    const result = await getSubdivisions('ES');
    expect(result.subdivisions).toHaveLength(1);
    expect(result.hasSchoolHolidays).toBe(false);
  });

  it('answers for a country the data does not cover at all', async () => {
    respond({ subdivisions: [], school: [] });
    const result = await getSubdivisions('US');
    expect(result.subdivisions).toEqual([]);
    expect(result.hasSchoolHolidays).toBe(false);
    expect(result.regionCategory).toEqual([]);
  });

  it('carries the word the country uses for a region, so a picker can ask for one by name', async () => {
    respond({ subdivisions: DE_SUBDIVISIONS, school: NRW_SCHOOL });
    const result = await getSubdivisions('DE');

    // A German household picks a Bundesland and a Spanish one a comunidad
    // autónoma. Every row of a country says the same thing, so the first
    // region settles it, and a town nested under one never gets a say.
    expect(pickLocalizedName(result.regionCategory, 'en-US')).toBe('federal state');
    expect(pickLocalizedName(result.regionCategory, 'de-DE')).toBe('Bundesland');
  });

  it('leaves the word out when the rows carry none', async () => {
    respond({ subdivisions: [{ code: 'ES-MD', shortName: 'MD', name: [en('Madrid')] }], school: [] });
    const result = await getSubdivisions('ES');
    expect(result.regionCategory).toEqual([]);
  });

  it('asks the current school year when checking for school holidays', async () => {
    respond({ subdivisions: DE_SUBDIVISIONS, school: NRW_SCHOOL });
    await getSubdivisions('DE');

    const probe = new URL(requestedUrls().find((u) => u.includes('/SchoolHolidays'))!);
    expect(probe.searchParams.get('countryIsoCode')).toBe('DE');
    expect(probe.searchParams.has('subdivisionCode')).toBe(false);
    expect(probe.searchParams.get('validFrom')).toBe(`${await currentSchoolYear()}-09-01`);
  });
});

// ---------------------------------------------------------------------------
// The fixture the display tests render
// ---------------------------------------------------------------------------

describe('the North Rhine-Westphalia fixture', () => {
  // Real 2026/27 dates, so a change to the shape this library hands out shows
  // up here rather than as a quietly wrong wall in the display tests. The
  // fixture is the route's whole answer, one entry per region asked about, so
  // the region is picked out of it the way the wall picks its own.
  const fixture = (JSON.parse(
    readFileSync(path.resolve(__dirname, '../../../e2e/fixtures/module-data/school-holidays-de-nw.json'), 'utf-8'),
  ) as { regions: Record<string, Awaited<ReturnType<typeof getSchoolHolidays>>> }).regions['DE-NW'];

  it('carries a whole school year in the shape this library hands out', () => {
    expect(fixture.region).toBe('DE-NW');
    expect(fixture.year).toBe(2026);
    expect(fixture.ok).toBe(true);
    expect(fixture.schoolHolidays).toHaveLength(6);
    expect(fixture.publicHolidays).toHaveLength(11);
    expect(pickLocalizedName(fixture.schoolHolidays[1].names, 'de-DE')).toBe('Herbstferien');
  });

  it('reads the way the verified dates say it should', () => {
    expect(getSchoolDayInfo('2026-10-26', fixture).backToSchool).toBe('2026-11-02');
    expect(getSchoolDayInfo('2027-05-06', fixture).publicHoliday?.names[0].text).toBe('Christi Himmelfahrt');
    expect(getSchoolDayInfo('2026-10-16', fixture).schoolDay).toBe(true);
  });
});

describe('schoolYearOf', () => {
  it('starts a new school year in September', () => {
    expect(schoolYearOf('2026-08-31')).toBe(2025);
    expect(schoolYearOf('2026-09-01')).toBe(2026);
    expect(schoolYearOf('2027-01-15')).toBe(2026);
  });
});

describe('currentSchoolYear', () => {
  afterEach(() => {
    vi.useRealTimers();
    householdZone = undefined;
  });

  it('counts from the household day, not the hub clock', async () => {
    // 00:30 on Sep 1 in Berlin is still Aug 31 in UTC.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-31T22:30:00Z'));
    householdZone = 'Europe/Berlin';
    expect(await currentSchoolYear()).toBe(2026);
    // 7 pm on Aug 31 in Chicago is already Sep 1 in UTC.
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    householdZone = 'America/Chicago';
    expect(await currentSchoolYear()).toBe(2025);
  });
});
