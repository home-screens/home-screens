import type { HourlyWeather, ForecastDay, WeatherProvider } from './types';
import { fetchWithTimeout, createTTLCache } from '@/lib/api-utils';
import type { WeatherIconName } from './icons';
import { FALLBACK_ICON } from './icons';
import { celsiusToUnit, kmhToWindUnit } from './units';
import { ECCC_STATIONS, type EcccStation } from './eccc-stations';

// ── Environment and Climate Change Canada (citypage_weather) ─────────
// https://eccc-msc.github.io/open-data/msc-datamart/readme_en/
// Coverage: Canada only (844 named city sites).
//
// Why lookup-by-lat/lon: ECCC's XML feed is addressed by siteCode + provCode,
// not coordinates. Exposing that through WeatherSettings would pollute the
// shared provider contract with a one-off config shape, so this provider
// bundles the station list (src/lib/weather/eccc-stations.ts, regenerated
// via scripts/fetch-eccc-stations.mjs) and picks the nearest station by
// great-circle distance. Kept hidden inside this file so the rest of the
// system keeps talking lat/lon like every other provider.
//
// Why directory scraping: ECCC publishes each site's XML under
//   /today/citypage_weather/{PROV}/{HH}/{timestamp}_MSC_CitypageWeather_{site}_en.xml
// with no canonical "latest" URL. The hourly directory is the cheapest way
// to find the newest file. Matches MagicMirror's approach.

const ECCC_BASE = 'https://dd.weather.gc.ca/today/citypage_weather';
const STATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const XML_CACHE_TTL_MS = 10 * 60 * 1000;
// Proximity guard, not a citizenship check: this lets US border towns near a
// Canadian station (Detroit↔Windsor, Buffalo↔Hamilton, Blaine↔Surrey) pass
// through and get a reasonable nearby forecast. Users well outside the zone
// (e.g. Paris, Prior Lake MN) get a clear rejection instead of a silent
// "nearest Canadian station is 4000km away" answer.
export const MAX_DISTANCE_KM = 200;
const EARTH_RADIUS_KM = 6371;

// ── ECCC iconCode (0-48) → shared icon vocabulary ────────────────────
// Codes encode day/night distinction themselves: 0-29 are day, 30-39 are
// night, 40-48 are severe. No external isDay swap needed.

const ICON_CODE_TO_ICON: Record<number, WeatherIconName> = {
  0: 'sun',              // Sunny
  1: 'sun',              // Mainly sunny
  2: 'cloud-sun',        // Partly cloudy (day)
  3: 'cloud-sun',        // Mostly cloudy (day)
  4: 'cloud-sun',        // Increasing cloudiness
  5: 'cloud-sun',        // Decreasing cloudiness
  6: 'cloud-drizzle',    // Light rain
  7: 'cloud-rain',       // Rain showers (day)
  8: 'snowflake',        // Light snow
  9: 'cloud-lightning',  // Thunderstorm (day)
  10: 'cloud',           // Cloudy
  11: 'cloud-rain',      // Showers
  12: 'cloud-rain',      // Rain
  13: 'cloud-rain',      // Heavy rain
  14: 'cloud-hail',      // Freezing rain
  15: 'cloud-hail',      // Rain and snow
  16: 'snowflake',       // Snow
  17: 'snowflake',       // Snow showers
  18: 'snowflake',       // Heavy snow
  19: 'cloud-lightning', // Thunderstorm with rain
  20: 'cloud',           // Mostly cloudy
  21: 'cloud',           // Cloudy periods
  22: 'cloud-sun',       // Mainly sunny (alt)
  23: 'cloud-fog',       // Haze
  24: 'cloud-fog',       // Fog
  25: 'snowflake',       // Drifting snow
  26: 'cloud-hail',      // Ice pellets
  27: 'cloud-hail',      // Ice pellet showers
  28: 'cloud-rain',      // Drizzle
  29: FALLBACK_ICON,     // Not available
  30: 'moon',            // Clear (night)
  31: 'moon',            // Mainly clear (night)
  32: 'cloud-moon',      // Partly cloudy (night)
  33: 'cloud-moon',      // Mostly cloudy (night)
  34: 'cloud-moon',      // Increasing cloudiness (night)
  35: 'cloud-moon',      // Decreasing cloudiness (night)
  36: 'cloud-rain',      // Rain showers (night)
  37: 'cloud-hail',      // Freezing rain (night)
  38: 'snowflake',       // Snow showers (night)
  39: 'cloud-lightning', // Thunderstorm (night)
  40: 'snowflake',       // Blowing snow
  41: 'cloud-lightning', // Funnel cloud
  42: 'cloud-lightning', // Tornado
  43: 'cloud',           // Windy
  44: 'cloud-fog',       // Smoke
  45: 'cloud-fog',       // Dust / sandstorm
  46: 'cloud-lightning', // Thunderstorm with hail
  47: 'cloud-lightning', // Thunderstorm with heavy rain
  48: 'cloud-lightning', // Thunderstorm with tornado
};

export function iconCodeToIcon(code: number | undefined): WeatherIconName {
  if (code == null) return FALLBACK_ICON;
  return ICON_CODE_TO_ICON[code] ?? FALLBACK_ICON;
}

// ── Haversine nearest-station lookup ─────────────────────────────────

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in km — matters at Canadian latitudes where
 *  planar distance would be noticeably wrong. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function findNearestStation(
  lat: number,
  lon: number,
): { station: EcccStation; distanceKm: number } | null {
  let best: EcccStation | null = null;
  let bestDist = Infinity;
  for (const s of ECCC_STATIONS) {
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  if (!best) return null;
  return { station: best, distanceKm: bestDist };
}

// ── XML helpers ──────────────────────────────────────────────────────
// Regex-based. Same approach as MagicMirror's envcanada provider — the
// schema is narrow and well-known, and pulling in a full XML parser for
// a handful of leaf lookups isn't worth the bundle cost.

function extractFirst(xml: string, pattern: RegExp): string | null {
  const m = pattern.exec(xml);
  return m ? m[1].trim() : null;
}

function parseTimeStamp14(ts: string | null): string | null {
  // ECCC format: "202604190200" (YYYYMMDDHHMM) or "20260419020000"
  if (!ts || ts.length < 12) return null;
  const y = ts.slice(0, 4);
  const mo = ts.slice(4, 6);
  const d = ts.slice(6, 8);
  const h = ts.slice(8, 10);
  const mi = ts.slice(10, 12);
  return `${y}-${mo}-${d}T${h}:${mi}:00Z`;
}

// ── Provider ─────────────────────────────────────────────────────────

/** @internal */
export class EnvCanadaProvider implements WeatherProvider {
  // Per-(lat,lon) nearest-station resolution. Same shape as NOAAProvider's
  // gridCache — resolve once, reuse for a day.
  private static stationCache = createTTLCache<EcccStation>(STATION_CACHE_TTL_MS);

  // Per-siteCode XML cache. ECCC refreshes each site roughly every 10 minutes.
  private static xmlCache = createTTLCache<string>(XML_CACHE_TTL_MS);

  // Coalesce concurrent XML fetches for the same site so we issue one upstream
  // call instead of one per caller when the hourly + forecast paths race.
  private static inFlight = new Map<string, Promise<string>>();

  // No API key needed — ECCC is free, no key, no registration.
  constructor() {}

  private resolveStation(lat: number, lon: number): EcccStation {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = EnvCanadaProvider.stationCache.get(key);
    if (cached) return cached;

    const nearest = findNearestStation(lat, lon);
    if (!nearest) {
      throw new Error('Environment Canada station list is empty');
    }
    if (nearest.distanceKm > MAX_DISTANCE_KM) {
      throw new Error(
        `Environment Canada has no station within ${MAX_DISTANCE_KM}km of ` +
          `${lat.toFixed(3)},${lon.toFixed(3)} (nearest: ${nearest.station.name}, ` +
          `${Math.round(nearest.distanceKm)}km). Choose a Canadian lat/lon or ` +
          `pick a different weather provider.`,
      );
    }

    EnvCanadaProvider.stationCache.set(key, nearest.station);
    return nearest.station;
  }

  private async fetchText(url: string): Promise<string> {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Environment Canada API error ${res.status}: ${body.slice(0, 200)}`,
      );
    }
    return res.text();
  }

  /** Scan the given hourly directory and return the newest XML filename for
   *  this station, or null if none is published yet. */
  private async findLatestXmlFilename(
    prov: string,
    site: string,
    hour: string,
  ): Promise<string | null> {
    const dirUrl = `${ECCC_BASE}/${prov}/${hour}/`;
    const html = await this.fetchText(dirUrl);
    const re = new RegExp(
      `href="(\\d{8}T\\d{6}\\.\\d{3}Z_MSC_CitypageWeather_${site}_en\\.xml)"`,
      'g',
    );
    let latest: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      // Filenames sort lexicographically by ISO timestamp — the last match wins.
      if (latest == null || m[1] > latest) latest = m[1];
    }
    return latest;
  }

  private async fetchSiteXml(station: EcccStation): Promise<string> {
    const key = station.site;
    const cached = EnvCanadaProvider.xmlCache.get(key);
    if (cached != null) return cached;

    const existing = EnvCanadaProvider.inFlight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      // Try the current UTC hour first. Early in the hour (before ECCC's
      // crawl drops the first file) we fall back to the previous hour.
      // At the UTC day boundary (00:00 → prevHour = "23") this reads from
      // yesterday's "23" directory — safe because ECCC's HH subdirectories
      // are flat (no date segment) and each holds the latest file for that
      // hour, so the lexicographic timestamp compare in findLatestXmlFilename
      // still picks the newest publication.
      const now = new Date();
      const curHour = String(now.getUTCHours()).padStart(2, '0');
      const prev = new Date(now.getTime() - 60 * 60 * 1000);
      const prevHour = String(prev.getUTCHours()).padStart(2, '0');

      // ECCC can 404 the current-hour directory during the first few minutes
      // after a UTC hour rolls over (before the crawl lands). Treat a fetch
      // error the same as "no matching file" so the previous-hour fallback
      // still runs — otherwise we surface a spurious error every hour boundary.
      let filename = await this.findLatestXmlFilename(
        station.prov,
        station.site,
        curHour,
      ).catch(() => null);
      let hour = curHour;
      if (!filename) {
        filename = await this.findLatestXmlFilename(
          station.prov,
          station.site,
          prevHour,
        ).catch(() => null);
        hour = prevHour;
      }
      if (!filename) {
        throw new Error(
          `Environment Canada: no forecast file found for ${station.site} ` +
            `in ${station.prov}/{${curHour},${prevHour}}`,
        );
      }

      const xmlUrl = `${ECCC_BASE}/${station.prov}/${hour}/${filename}`;
      const xml = await this.fetchText(xmlUrl);
      EnvCanadaProvider.xmlCache.set(key, xml);
      return xml;
    })().finally(() => {
      EnvCanadaProvider.inFlight.delete(key);
    });

    EnvCanadaProvider.inFlight.set(key, promise);
    return promise;
  }

  async getHourly(lat: number, lon: number, units: string): Promise<HourlyWeather[]> {
    const station = this.resolveStation(lat, lon);
    const xml = await this.fetchSiteXml(station);
    const isMetric = units === 'metric';

    // Scope to the <hourlyForecastGroup> block so we never pick up daily
    // forecast fields with the same tag names.
    const group = extractFirst(xml, /<hourlyForecastGroup>([\s\S]*?)<\/hourlyForecastGroup>/);
    if (!group) return [];

    // ECCC's dateTimeUTC is always 12 digits (YYYYMMDDHHMM) per the schema.
    const re = /<hourlyForecast\s+dateTimeUTC="(\d{12})">([\s\S]*?)<\/hourlyForecast>/g;
    const out: HourlyWeather[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(group)) !== null) {
      const time = parseTimeStamp14(m[1]);
      if (!time) continue;
      const body = m[2];

      const tempStr = extractFirst(body, /<temperature[^>]*>(-?\d+(?:\.\d+)?)<\/temperature>/);
      const iconStr = extractFirst(body, /<iconCode[^>]*>(\d+)<\/iconCode>/);
      const condStr = extractFirst(body, /<condition>([^<]+)<\/condition>/);
      const lopStr = extractFirst(body, /<lop[^>]*>(\d+(?:\.\d+)?)<\/lop>/);
      const windSpeedStr = extractFirst(body, /<speed[^>]*>(\d+(?:\.\d+)?)<\/speed>/);
      // The real ECCC <hourlyForecast> block has no <relativeHumidity> — it's
      // only published under <currentConditions> and the daily <forecast>
      // blocks. This extraction is defensive: if ECCC ever adds it, we'll
      // start surfacing the value with no code change. In practice today the
      // field is always undefined for hourly entries.
      const humidityStr = extractFirst(body, /<relativeHumidity[^>]*>(\d+(?:\.\d+)?)<\/relativeHumidity>/);

      const tempC = tempStr != null ? parseFloat(tempStr) : undefined;
      const iconCode = iconStr != null ? parseInt(iconStr, 10) : undefined;
      const lop = lopStr != null ? parseFloat(lopStr) : undefined;
      const windKmh = windSpeedStr != null ? parseFloat(windSpeedStr) : undefined;

      out.push({
        time,
        temp: tempC != null ? Math.round(celsiusToUnit(tempC, isMetric) * 10) / 10 : 0,
        humidity: humidityStr != null ? parseFloat(humidityStr) : undefined,
        icon: iconCodeToIcon(iconCode),
        description: condStr ?? '',
        windSpeed: windKmh != null
          ? Math.round(kmhToWindUnit(windKmh, isMetric))
          : undefined,
        precipProbability: lop,
      });

      if (out.length >= 48) break;
    }
    return out;
  }

  async getForecast(lat: number, lon: number, units: string): Promise<ForecastDay[]> {
    const station = this.resolveStation(lat, lon);
    const xml = await this.fetchSiteXml(station);
    const isMetric = units === 'metric';

    // ECCC's <forecastGroup> interleaves day and night blocks. Pair them by
    // "textForecastName" — for a given date we expect either "Today"/"Tonight"
    // or "<Day>"/"<Day> night". First entry may be "Tonight" if it's late.
    const group = extractFirst(xml, /<forecastGroup>([\s\S]*?)<\/forecastGroup>/);
    if (!group) return [];

    interface ForecastBlock {
      name: string;
      temps: Array<{ value: number; cls: string }>;
      precipProb: number | null;
      iconCode: number | null;
      condition: string;
      windKmh: number | null;
      humidity: number | null;
    }

    const blocks: ForecastBlock[] = [];
    const re = /<forecast>([\s\S]*?)<\/forecast>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(group)) !== null) {
      const body = m[1];
      const name = extractFirst(body, /<period[^>]*textForecastName="([^"]*)"/) ?? '';
      const condition = extractFirst(body, /<abbreviatedForecast>[\s\S]*?<textSummary>([^<]*)<\/textSummary>/) ?? '';
      const iconStr = extractFirst(body, /<abbreviatedForecast>[\s\S]*?<iconCode[^>]*>(\d+)<\/iconCode>/);
      const popStr = extractFirst(body, /<abbreviatedForecast>[\s\S]*?<pop[^>]*>(\d+(?:\.\d+)?)<\/pop>/);
      const tempReStr = /<temperature[^>]*class="(high|low)"[^>]*>(-?\d+(?:\.\d+)?)<\/temperature>/g;
      const temps: Array<{ value: number; cls: string }> = [];
      let tm: RegExpExecArray | null;
      while ((tm = tempReStr.exec(body)) !== null) {
        temps.push({ value: parseFloat(tm[2]), cls: tm[1] });
      }
      const windSpeedStr = extractFirst(body, /<winds>[\s\S]*?<speed[^>]*>(\d+(?:\.\d+)?)<\/speed>/);
      const humidityStr = extractFirst(body, /<relativeHumidity[^>]*>(\d+(?:\.\d+)?)<\/relativeHumidity>/);

      blocks.push({
        name,
        temps,
        precipProb: popStr != null ? parseFloat(popStr) : null,
        iconCode: iconStr != null ? parseInt(iconStr, 10) : null,
        condition,
        windKmh: windSpeedStr != null ? parseFloat(windSpeedStr) : null,
        humidity: humidityStr != null ? parseFloat(humidityStr) : null,
      });
    }

    // ECCC's forecastGroup interleaves day and night blocks:
    //   [Today, Tonight, Sunday, Sunday night, Monday, ...]      ← daytime run
    //   [Tonight, Sunday, Sunday night, Monday, ...]             ← evening run (no "Today")
    // We pair a day block with the night block that follows it and emit one
    // ForecastDay per pair. When the feed starts with a lone Tonight block,
    // we emit today as a partial day with high === low drawn from the night
    // block — same contract NOAA uses for post-sunset "tonight only" fetches.
    const isNightName = (name: string) => /night|tonight/i.test(name);

    // Station UTC offset (hours). Used to anchor the local date when the XML
    // creation-time block is malformed/unparseable — see baseDate fallback below.
    const utcOffsetMatch = xml.match(
      /<dateTime name="xmlCreation" zone="(?!UTC)[^"]+" UTCOffset="(-?\d+(?:\.\d+)?)"/,
    );
    const utcOffsetHours = utcOffsetMatch ? parseFloat(utcOffsetMatch[1]) : 0;

    // Anchor date: use the XML's local-timezone creation date if available,
    // otherwise derive today-in-station-local-time from utcOffsetHours.
    // Using raw UTC midnight would drift a full day for Pacific-zone stations
    // queried between 00:00 UTC and local midnight.
    const localDateMatch = xml.match(
      /<dateTime name="xmlCreation" zone="(?!UTC)[^"]+"[^>]*>[\s\S]*?<year>(\d{4})<\/year>[\s\S]*?<month[^>]*>(\d{2})<\/month>[\s\S]*?<day[^>]*>(\d{2})<\/day>/,
    );
    let baseDate: Date;
    if (localDateMatch) {
      baseDate = new Date(
        Date.UTC(+localDateMatch[1], +localDateMatch[2] - 1, +localDateMatch[3]),
      );
    } else {
      const localNow = new Date(Date.now() + utcOffsetHours * 3600_000);
      baseDate = new Date(
        Date.UTC(
          localNow.getUTCFullYear(),
          localNow.getUTCMonth(),
          localNow.getUTCDate(),
        ),
      );
    }

    const days: ForecastDay[] = [];
    let i = 0;
    let dayOffset = 0;

    // Special case: feed begins with a lone night block — that's "tonight"
    // attached to today's date. The day half has already passed; we emit a
    // partial day with high === low (matching NOAA's forecast[0] contract for
    // post-sunset fetches) rather than fabricating a high from downstream data.
    if (blocks.length > 0 && isNightName(blocks[0].name)) {
      const nightBlock = blocks[0];
      const nightLow = nightBlock.temps.find((t) => t.cls === 'low');
      const date = new Date(baseDate.getTime() + dayOffset * 86400000)
        .toISOString()
        .slice(0, 10);

      const lowC = nightLow?.value ?? 0;

      days.push({
        date,
        high: Math.round(celsiusToUnit(lowC, isMetric)),
        low: Math.round(celsiusToUnit(lowC, isMetric)),
        icon: iconCodeToIcon(nightBlock.iconCode ?? undefined),
        description: nightBlock.condition,
        precipProbability: nightBlock.precipProb ?? undefined,
        humidity: nightBlock.humidity ?? undefined,
        windSpeed: nightBlock.windKmh != null
          ? Math.round(kmhToWindUnit(nightBlock.windKmh, isMetric))
          : undefined,
      });
      i = 1;
      dayOffset = 1;
    }

    // Walk remaining blocks in day/night pairs.
    while (i < blocks.length && days.length < 7) {
      const dayBlock = blocks[i];
      if (isNightName(dayBlock.name)) {
        i++;
        continue;
      }
      // Pair with the following block only if it's actually a night block —
      // otherwise we'd borrow the next *day's* low/pop/wind as if it were the
      // paired night. Happens when ECCC omits a Tonight block entirely (e.g.
      // [Today, Sunday, Sunday night, …]).
      const rawNext = blocks[i + 1];
      const nightBlock = rawNext && isNightName(rawNext.name) ? rawNext : null;

      const high = dayBlock.temps.find((t) => t.cls === 'high');
      const low = (nightBlock?.temps.find((t) => t.cls === 'low'))
        ?? dayBlock.temps.find((t) => t.cls === 'low');

      const date = new Date(baseDate.getTime() + dayOffset * 86400000)
        .toISOString()
        .slice(0, 10);

      const nightPop = nightBlock?.precipProb ?? null;
      const dayPop = dayBlock.precipProb ?? null;
      const precipProb = nightPop != null && dayPop != null
        ? Math.max(nightPop, dayPop)
        : (dayPop ?? nightPop ?? undefined);

      // Wind: prefer the day half, fall back to the paired night half so an
      // early-morning fetch where ECCC hasn't posted daytime winds yet still
      // surfaces something instead of a blank field.
      const windKmh = dayBlock.windKmh ?? nightBlock?.windKmh ?? null;

      // Temperature fallback: if either half is missing, reuse the present
      // one rather than emitting a 0°/32°F that reads like a real reading.
      // ForecastDay requires numeric high/low, so we can't emit undefined.
      const highC = high?.value ?? low?.value;
      const lowC = low?.value ?? high?.value;

      days.push({
        date,
        high: highC != null ? Math.round(celsiusToUnit(highC, isMetric)) : 0,
        low: lowC != null ? Math.round(celsiusToUnit(lowC, isMetric)) : 0,
        icon: iconCodeToIcon(dayBlock.iconCode ?? undefined),
        description: dayBlock.condition,
        precipProbability: precipProb ?? undefined,
        humidity: dayBlock.humidity ?? undefined,
        windSpeed: windKmh != null
          ? Math.round(kmhToWindUnit(windKmh, isMetric))
          : undefined,
      });

      i += nightBlock ? 2 : 1;
      dayOffset++;
    }

    // ECCC's citypage feed doesn't expose a precipitation amount — only
    // probability. `precipAmount` stays undefined rather than faking it.
    return days;
  }
}

