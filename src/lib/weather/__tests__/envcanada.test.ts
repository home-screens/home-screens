import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EnvCanadaProvider,
  findNearestStation,
  haversineKm,
  iconCodeToIcon,
  MAX_DISTANCE_KM,
} from '../envcanada';
import { ECCC_STATIONS } from '../eccc-stations';

describe('envcanada: station data', () => {
  it('ships a non-empty frozen station table', () => {
    expect(ECCC_STATIONS.length).toBeGreaterThan(500);
    expect(Object.isFrozen(ECCC_STATIONS)).toBe(true);
  });

  it('covers every province/territory', () => {
    const provs = new Set(ECCC_STATIONS.map((s) => s.prov));
    for (const p of ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']) {
      expect(provs).toContain(p);
    }
  });
});

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(43.65, -79.38, 43.65, -79.38)).toBe(0);
  });

  it('computes Toronto → Ottawa at ~350km (real-world reference)', () => {
    const d = haversineKm(43.6532, -79.3832, 45.4215, -75.6972);
    expect(d).toBeGreaterThan(340);
    expect(d).toBeLessThan(360);
  });
});

describe('findNearestStation', () => {
  it('picks a Toronto-area station for Toronto coordinates', () => {
    const result = findNearestStation(43.6532, -79.3832);
    expect(result).not.toBeNull();
    expect(result!.station.prov).toBe('ON');
    expect(result!.distanceKm).toBeLessThan(30);
  });

  it('picks a Vancouver-area station for Vancouver coordinates', () => {
    const result = findNearestStation(49.2827, -123.1207);
    expect(result).not.toBeNull();
    expect(result!.station.prov).toBe('BC');
    expect(result!.distanceKm).toBeLessThan(30);
  });

  it('returns a far-away station for non-Canadian coordinates (caller must check distance)', () => {
    const result = findNearestStation(48.8566, 2.3522);
    expect(result).not.toBeNull();
    expect(result!.distanceKm).toBeGreaterThan(MAX_DISTANCE_KM);
  });
});

describe('EnvCanadaProvider coverage guard', () => {
  const provider = new EnvCanadaProvider();

  it('rejects locations more than MAX_DISTANCE_KM from any station', async () => {
    await expect(provider.getHourly(48.8566, 2.3522, 'metric')).rejects.toThrow(
      /no station within/i,
    );
  });

  it('rejects Prior Lake, MN (US, far from nearest station)', async () => {
    await expect(provider.getHourly(44.7133, -93.4227, 'metric')).rejects.toThrow(
      /no station within/i,
    );
  });
});

describe('iconCodeToIcon', () => {
  it('maps clear day to sun, clear night to moon', () => {
    expect(iconCodeToIcon(0)).toBe('sun');
    expect(iconCodeToIcon(30)).toBe('moon');
  });

  it('maps partly cloudy day vs night', () => {
    expect(iconCodeToIcon(2)).toBe('cloud-sun');
    expect(iconCodeToIcon(32)).toBe('cloud-moon');
  });

  it('maps rain, snow, thunder, fog', () => {
    expect(iconCodeToIcon(12)).toBe('cloud-rain');
    expect(iconCodeToIcon(16)).toBe('snowflake');
    expect(iconCodeToIcon(19)).toBe('cloud-lightning');
    expect(iconCodeToIcon(24)).toBe('cloud-fog');
  });

  it('falls back for unknown or missing codes', () => {
    expect(iconCodeToIcon(undefined)).toBe('thermometer');
    expect(iconCodeToIcon(999)).toBe('thermometer');
    expect(iconCodeToIcon(29)).toBe('thermometer');
  });
});

// ── XML parsing tests ───────────────────────────────────────────────
// Mock `globalThis.fetch` per-URL: directory URLs ending in `/` return an
// HTML listing, site URLs ending in `.xml` return an ECCC citypage feed.
// Toronto (s0000458/ON) is used throughout because it's the canonical
// test fixture in ECCC's public docs.

const TORONTO_SITE = 's0000458';
const TORONTO_LAT = 43.6532;
const TORONTO_LON = -79.3832;

function directoryHtml(site: string, timestamps: string[]): string {
  const links = timestamps
    .map(
      (t) =>
        `<a href="${t}_MSC_CitypageWeather_${site}_en.xml">${t}_MSC_CitypageWeather_${site}_en.xml</a>`,
    )
    .join('\n');
  return `<html><body>${links}</body></html>`;
}

interface ForecastBlockFixture {
  name: string;
  high?: number;
  low?: number;
  iconCode?: number;
  condition?: string;
  pop?: number;
  windKmh?: number;
  humidity?: number;
}

interface HourlyFixture {
  dateTimeUTC: string;
  tempC: number;
  iconCode?: number;
  condition?: string;
  lop?: number;
  windKmh?: number;
  humidity?: number;
}

function buildXml(opts: {
  localZone?: string;
  utcOffset?: number;
  localYear?: string;
  localMonth?: string;
  localDay?: string;
  forecasts?: ForecastBlockFixture[];
  hourly?: HourlyFixture[];
}): string {
  const zone = opts.localZone ?? 'EST';
  const offset = opts.utcOffset ?? -5;
  const y = opts.localYear ?? '2026';
  const mo = opts.localMonth ?? '04';
  const d = opts.localDay ?? '18';

  const forecastBlocks = (opts.forecasts ?? [])
    .map((f) => {
      const tempLines: string[] = [];
      if (f.high != null) tempLines.push(`<temperature class="high" units="C">${f.high}</temperature>`);
      if (f.low != null) tempLines.push(`<temperature class="low" units="C">${f.low}</temperature>`);
      const popLine = f.pop != null ? `<pop units="%">${f.pop}</pop>` : '';
      const iconLine = f.iconCode != null ? `<iconCode format="png">${String(f.iconCode).padStart(2, '0')}</iconCode>` : '';
      const windLine = f.windKmh != null
        ? `<winds><wind index="1"><speed units="km/h">${f.windKmh}</speed></wind></winds>`
        : '';
      const humidityLine = f.humidity != null
        ? `<relativeHumidity units="%">${f.humidity}</relativeHumidity>`
        : '';
      return `
<forecast>
  <period textForecastName="${f.name}">${f.name}</period>
  <temperatures>
    ${tempLines.join('\n    ')}
  </temperatures>
  <abbreviatedForecast>
    ${iconLine}
    <textSummary>${f.condition ?? ''}</textSummary>
    ${popLine}
  </abbreviatedForecast>
  ${windLine}
  ${humidityLine}
</forecast>`;
    })
    .join('');

  const hourlyBlocks = (opts.hourly ?? [])
    .map((h) => {
      const iconLine = h.iconCode != null ? `<iconCode>${String(h.iconCode).padStart(2, '0')}</iconCode>` : '';
      const lopLine = h.lop != null ? `<lop units="%">${h.lop}</lop>` : '';
      const windLine = h.windKmh != null ? `<wind><speed units="km/h">${h.windKmh}</speed></wind>` : '';
      const humidityLine = h.humidity != null
        ? `<relativeHumidity units="%">${h.humidity}</relativeHumidity>`
        : '';
      return `
<hourlyForecast dateTimeUTC="${h.dateTimeUTC}">
  <condition>${h.condition ?? ''}</condition>
  <temperature units="C">${h.tempC}</temperature>
  ${iconLine}
  ${lopLine}
  ${windLine}
  ${humidityLine}
</hourlyForecast>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<siteData>
  <dateTime name="xmlCreation" zone="${zone}" UTCOffset="${offset}">
    <year>${y}</year>
    <month name="April">${mo}</month>
    <day name="Saturday">${d}</day>
    <hour>12</hour>
    <minute>00</minute>
  </dateTime>
  <forecastGroup>${forecastBlocks}</forecastGroup>
  <hourlyForecastGroup>${hourlyBlocks}</hourlyForecastGroup>
</siteData>`;
}

function installFetchMock(xml: string, timestamps = ['20260418T120000.000Z']) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL | Request).toString();
    if (url.endsWith('.xml')) {
      return new Response(xml, { status: 200 });
    }
    return new Response(directoryHtml(TORONTO_SITE, timestamps), { status: 200 });
  });
}

describe('EnvCanadaProvider.getHourly (parsing)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
    // Clear per-test caches so fetch mocks aren't bypassed by a prior test's XML.
    // Static Maps persist across the module; use the public API to flush.
    // @ts-expect-error - private static, intentionally reached in tests
    EnvCanadaProvider.xmlCache?.clear();
    // @ts-expect-error - private static, intentionally reached in tests
    EnvCanadaProvider.stationCache?.clear();
    // @ts-expect-error - private static, intentionally reached in tests
    EnvCanadaProvider.inFlight?.clear();
  });

  it('extracts temp, humidity, wind (km/h in metric), precip, icon, description', async () => {
    const xml = buildXml({
      hourly: [
        {
          dateTimeUTC: '202604181700',
          tempC: 12,
          iconCode: 2,
          condition: 'Partly cloudy',
          lop: 20,
          windKmh: 18,
          humidity: 60,
        },
      ],
    });
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getHourly(TORONTO_LAT, TORONTO_LON, 'metric');

    expect(out).toHaveLength(1);
    expect(out[0].time).toBe('2026-04-18T17:00:00Z');
    expect(out[0].temp).toBe(12);
    expect(out[0].humidity).toBe(60);
    expect(out[0].icon).toBe('cloud-sun');
    expect(out[0].description).toBe('Partly cloudy');
    expect(out[0].precipProbability).toBe(20);
    expect(out[0].windSpeed).toBe(18); // km/h unchanged in metric
  });

  it('converts units to imperial (°F, mph)', async () => {
    const xml = buildXml({
      hourly: [
        { dateTimeUTC: '202604181700', tempC: 0, windKmh: 100 }, // 0°C = 32°F, 100 km/h ≈ 62.1 mph
      ],
    });
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getHourly(TORONTO_LAT, TORONTO_LON, 'imperial');

    expect(out[0].temp).toBe(32);
    expect(out[0].windSpeed).toBe(62);
  });

  it('caps output at 48 entries', async () => {
    const hourly: HourlyFixture[] = [];
    for (let h = 0; h < 60; h++) {
      hourly.push({
        dateTimeUTC: `202604${String(18 + Math.floor(h / 24)).padStart(2, '0')}${String(h % 24).padStart(2, '0')}00`,
        tempC: 10 + h,
      });
    }
    const xml = buildXml({ hourly });
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getHourly(TORONTO_LAT, TORONTO_LON, 'metric');
    expect(out).toHaveLength(48);
  });

  it('returns an empty array when no hourlyForecastGroup is present', async () => {
    const xml = buildXml({ hourly: [] }).replace(
      /<hourlyForecastGroup>[\s\S]*?<\/hourlyForecastGroup>/,
      '',
    );
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getHourly(TORONTO_LAT, TORONTO_LON, 'metric');
    expect(out).toEqual([]);
  });
});

describe('EnvCanadaProvider.getForecast (parsing)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
    // @ts-expect-error - private static, intentionally reached in tests
    EnvCanadaProvider.xmlCache?.clear();
    // @ts-expect-error - private static, intentionally reached in tests
    EnvCanadaProvider.stationCache?.clear();
    // @ts-expect-error - private static, intentionally reached in tests
    EnvCanadaProvider.inFlight?.clear();
  });

  it('pairs Today + Tonight into a single ForecastDay with high/low', async () => {
    const xml = buildXml({
      forecasts: [
        { name: 'Today', high: 15, iconCode: 1, condition: 'Sunny', pop: 0, windKmh: 10, humidity: 45 },
        { name: 'Tonight', low: 4, iconCode: 31, condition: 'Clear' },
        { name: 'Sunday', high: 18, iconCode: 2, condition: 'Partly cloudy', windKmh: 20 },
        { name: 'Sunday night', low: 6, iconCode: 32 },
      ],
    });
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getForecast(TORONTO_LAT, TORONTO_LON, 'metric');

    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 15,
      low: 4,
      icon: 'sun',
      description: 'Sunny',
      humidity: 45,
      windSpeed: 10,
    });
    expect(out[1]).toMatchObject({
      date: '2026-04-19',
      high: 18,
      low: 6,
      icon: 'cloud-sun',
    });
  });

  it('handles evening-run feed (leading Tonight) with high === low for today', async () => {
    const xml = buildXml({
      forecasts: [
        { name: 'Tonight', low: 4, iconCode: 31, condition: 'Clear', windKmh: 8 },
        { name: 'Sunday', high: 18, iconCode: 2, condition: 'Partly cloudy', windKmh: 20 },
        { name: 'Sunday night', low: 6, iconCode: 32 },
      ],
    });
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getForecast(TORONTO_LAT, TORONTO_LON, 'metric');

    expect(out).toHaveLength(2);
    // Today (partial): high === low drawn from the night block, not fabricated from hourly data.
    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 4,
      low: 4,
      icon: 'moon',
      description: 'Clear',
      windSpeed: 8,
    });
    expect(out[1].date).toBe('2026-04-19');
  });

  it('does not borrow the next day block as night (omitted Tonight)', async () => {
    // If ECCC omits Tonight (e.g. late-morning feed where the night half hasn't
    // been issued yet), the block after "Today" is the *next day* — Sunday.
    // Today's low/pop/wind must NOT be pulled from Sunday's data.
    const xml = buildXml({
      forecasts: [
        { name: 'Today', high: 20, iconCode: 1, pop: 10, windKmh: 15 },
        // No "Tonight" block
        { name: 'Sunday', high: 25, iconCode: 2, pop: 90, windKmh: 50 }, // precip/wind that should NOT leak into Today
        { name: 'Sunday night', low: 12, iconCode: 32 },
      ],
    });
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getForecast(TORONTO_LAT, TORONTO_LON, 'metric');

    expect(out[0]).toMatchObject({
      date: '2026-04-18',
      high: 20,
      // No Sunday low/pop/wind must appear on today's row.
      precipProbability: 10,
      windSpeed: 15,
    });
    // Today has no low; the fallback reuses the available temperature (high).
    expect(out[0].low).toBe(20);
    expect(out[1]).toMatchObject({
      date: '2026-04-19',
      high: 25,
      low: 12,
      precipProbability: 90,
      windSpeed: 50,
    });
  });

  it('falls back to night wind when day block has no wind', async () => {
    const xml = buildXml({
      forecasts: [
        { name: 'Today', high: 15, iconCode: 1 }, // no windKmh
        { name: 'Tonight', low: 4, iconCode: 31, windKmh: 12 },
      ],
    });
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getForecast(TORONTO_LAT, TORONTO_LON, 'metric');

    expect(out[0].windSpeed).toBe(12);
  });

  it('converts forecast wind to mph in imperial units', async () => {
    const xml = buildXml({
      forecasts: [
        { name: 'Today', high: 0, windKmh: 100, iconCode: 1 }, // 100 km/h ≈ 62.1 mph
        { name: 'Tonight', low: -5, iconCode: 31 },
      ],
    });
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getForecast(TORONTO_LAT, TORONTO_LON, 'imperial');

    expect(out[0].high).toBe(32); // 0°C = 32°F
    expect(out[0].low).toBe(23); // -5°C = 23°F
    expect(out[0].windSpeed).toBe(62);
  });

  it('uses max(day, night) pop for precipProbability', async () => {
    const xml = buildXml({
      forecasts: [
        { name: 'Today', high: 15, pop: 30, iconCode: 1 },
        { name: 'Tonight', low: 4, pop: 80, iconCode: 31 },
      ],
    });
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getForecast(TORONTO_LAT, TORONTO_LON, 'metric');

    expect(out[0].precipProbability).toBe(80);
  });

  it('uses the XML local-creation date as the anchor (not UTC)', async () => {
    // Local creation date is 2026-04-18 in a western-Canada timezone (UTC-7).
    // UTC at query time could be 2026-04-19 — we want the forecast dates to
    // track the station's local calendar, not the server's UTC moment.
    const xml = buildXml({
      localZone: 'MST',
      utcOffset: -7,
      localYear: '2026',
      localMonth: '04',
      localDay: '18',
      forecasts: [
        { name: 'Today', high: 10, iconCode: 1 },
        { name: 'Tonight', low: 2, iconCode: 31 },
        { name: 'Sunday', high: 14, iconCode: 1 },
        { name: 'Sunday night', low: 3, iconCode: 31 },
      ],
    });
    fetchSpy = installFetchMock(xml);

    const provider = new EnvCanadaProvider();
    const out = await provider.getForecast(TORONTO_LAT, TORONTO_LON, 'metric');

    expect(out[0].date).toBe('2026-04-18');
    expect(out[1].date).toBe('2026-04-19');
  });
});
