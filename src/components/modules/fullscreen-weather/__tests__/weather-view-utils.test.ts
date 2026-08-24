import { describe, it, expect } from 'vitest';
import type { HourlyWeather, MinutelyPrecip, ForecastDay } from '@/lib/weather';
import {
  nowcastVerdict, hoursWithin, hourLabel, isNightHour, timelineHours, labelStride, spanHours,
  timelineMarks, temperatureAxis, weekRange, clampDaysToShow, meteogramColumnPx, valueLabelled, hourLabelled,
  tzDayKey, CANVAS_PAD_X_U, CARD_PAD_X_U,
  type SunTimes,
} from '../weather-view-utils';

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

function minutes(intensities: number[]): MinutelyPrecip[] {
  return intensities.map((intensity, i) => ({ time: i * 60, intensity, probability: intensity > 0 ? 80 : 0 }));
}

describe('nowcastVerdict', () => {
  it('returns null with no minutely data, which hides the strip', () => {
    expect(nowcastVerdict([], 'imperial', t)).toBeNull();
  });

  it('normalises intensity against the unit the provider reports in', () => {
    // 0.5 mm/h is a light drizzle in metric and would saturate the bar if the
    // imperial threshold (0.4 in/h) were applied to it.
    const drizzle = minutes(Array(60).fill(0.5));
    const metric = nowcastVerdict(drizzle, 'metric', t)!;
    const imperial = nowcastVerdict(drizzle, 'imperial', t)!;
    expect(metric.series[0]).toBeCloseTo(0.05, 5);
    expect(imperial.series[0]).toBe(1);
  });

  it('caps the bar at a downpour in either unit', () => {
    expect(nowcastVerdict(minutes([25]), 'metric', t)!.series[0]).toBe(1);
    expect(nowcastVerdict(minutes([1]), 'imperial', t)!.series[0]).toBe(1);
  });

  it('says when rain starts and when it eases off', () => {
    const startsLater = minutes([...Array(20).fill(0), ...Array(40).fill(0.2)]);
    expect(nowcastVerdict(startsLater, 'imperial', t)!.text).toBe('fullscreen-weather.nowcast.startsIn:{"minutes":20}');

    const easesOff = minutes([...Array(15).fill(0.2), ...Array(45).fill(0)]);
    expect(nowcastVerdict(easesOff, 'imperial', t)!.text).toBe('fullscreen-weather.nowcast.stopsIn:{"minutes":15}');

    const allHour = minutes(Array(60).fill(0.2));
    expect(nowcastVerdict(allHour, 'imperial', t)!.text).toBe('fullscreen-weather.nowcast.continues');

    expect(nowcastVerdict(minutes(Array(60).fill(0)), 'metric', t)!.text).toBe('fullscreen-weather.nowcast.dry');
  });
});

function hourlyAt(stepHours: number, count: number): HourlyWeather[] {
  const base = Date.UTC(2026, 0, 1, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => ({
    time: new Date(base + i * stepHours * 3600_000).toISOString(),
    temp: 50, feelsLike: 50, humidity: 50, icon: 'sun', description: '', windSpeed: 0, precipProbability: 0,
  }));
}

describe('hoursWithin', () => {
  it('takes twelve entries from an hourly source', () => {
    expect(hoursWithin(hourlyAt(1, 48), 12)).toHaveLength(12);
  });

  it('takes only the entries inside the window from a 3-hourly source', () => {
    // 0h, 3h, 6h, 9h fall inside [0h, 12h); 12h does not.
    expect(hoursWithin(hourlyAt(3, 40), 12)).toHaveLength(4);
  });

  it('prefers timeEpoch over the wall-clock string when present', () => {
    const rows = hourlyAt(1, 5).map((h, i) => ({ ...h, time: 'not a date', timeEpoch: 1_700_000_000 + i * 3600 }));
    expect(hoursWithin(rows, 3)).toHaveLength(3);
  });

  it('is empty for an empty source', () => {
    expect(hoursWithin([], 12)).toEqual([]);
  });
});

describe('hourLabel', () => {
  it('formats 12-hour labels compactly', () => {
    expect(hourLabel(0)).toBe('12a');
    expect(hourLabel(9)).toBe('9a');
    expect(hourLabel(12)).toBe('12p');
    expect(hourLabel(13)).toBe('1p');
  });

  it('follows the household 24-hour setting', () => {
    expect(hourLabel(0, '24h')).toBe('00');
    expect(hourLabel(13, '24h')).toBe('13');
  });
});

describe('isNightHour', () => {
  const day = (sunriseHour: number, sunsetHour: number): SunTimes => ({
    sunrise: new Date(), sunset: new Date(), sunriseHour, sunsetHour, isNight: false, dayLengthMs: 1,
  });

  it('marks hours outside the daylight window as night', () => {
    const sun = day(6.5, 20);
    expect(isNightHour(3, sun)).toBe(true);
    expect(isNightHour(6.5, sun)).toBe(false);
    expect(isNightHour(19.9, sun)).toBe(false);
    expect(isNightHour(20, sun)).toBe(true);
  });

  it('holds the whole day when the sun never crosses the horizon', () => {
    const polarNight: SunTimes = { sunrise: null, sunset: null, sunriseHour: 0, sunsetHour: 24, isNight: true, dayLengthMs: 0 };
    const polarDay: SunTimes = { ...polarNight, isNight: false, dayLengthMs: 86_400_000 };
    expect(isNightHour(12, polarNight)).toBe(true);
    expect(isNightHour(0, polarDay)).toBe(false);
  });
});

function hourlyEvery(stepHours: number, count: number): HourlyWeather[] {
  return Array.from({ length: count }, (_, i) => ({
    time: new Date(Date.UTC(2099, 6, 7, i * stepHours)).toISOString(),
    temp: 70, icon: 'sun', description: 'Sunny',
  }));
}

describe('timelineHours', () => {
  it('takes the next 24 hours from an hourly source', () => {
    expect(timelineHours(hourlyEvery(1, 48))).toHaveLength(24);
  });

  it('widens to 48 hours when the provider steps every 3 hours', () => {
    // OpenWeatherMap: 24h at 3h steps is eight rows, which is not a list.
    expect(timelineHours(hourlyEvery(3, 40))).toHaveLength(16);
  });

  it('leaves a short hourly source alone rather than widening into nothing', () => {
    expect(timelineHours(hourlyEvery(1, 6))).toHaveLength(6);
  });

  it('is empty without data', () => {
    expect(timelineHours([])).toEqual([]);
  });
});

describe('labelStride', () => {
  it('labels every column while the label fits the column', () => {
    expect(labelStride(72, 40)).toBe(1);
  });

  it('skips columns once the label outgrows the pitch', () => {
    expect(labelStride(72, 80)).toBe(2);
    expect(labelStride(72, 170)).toBe(3);
  });

  it('never returns less than one', () => {
    expect(labelStride(0, 40)).toBe(1);
  });
});

/**
 * OpenWeatherMap's list: a live observation at `offsetMin` minutes before the
 * first 3-hourly slot, then slots on the UTC grid (00/03/06Z...).
 */
function owmHourly(offsetMin: number, slots: number, startHourUtc = 15): HourlyWeather[] {
  const firstSlot = Date.UTC(2099, 6, 7, startHourUtc);
  const row = (ms: number): HourlyWeather => ({ time: new Date(ms).toISOString(), temp: 70, icon: 'sun', description: 'Sunny' });
  return [row(firstSlot - offsetMin * 60_000), ...Array.from({ length: slots }, (_, i) => row(firstSlot + i * 3 * 3600_000))];
}

describe('spanHours', () => {
  it('counts the last entry\'s own step, so 24 hourly readings are 24 hours', () => {
    expect(spanHours(hourlyEvery(1, 24))).toBe(24);
    expect(spanHours(hourlyEvery(1, 48))).toBe(48);
  });

  it('follows the provider step', () => {
    expect(spanHours(hourlyEvery(3, 16))).toBe(48);
  });

  it('does not wobble with the observation time on a 3-hourly source', () => {
    // The first step is observation-to-slot and can be anything up to three
    // hours; a header that counted it read 45..51 across one afternoon.
    const spans = [5, 30, 60, 120, 175].map((offset) => spanHours(timelineHours(owmHourly(offset, 40))));
    expect(spans).toEqual([48, 48, 48, 48, 48]);
    // Panorama's ribbon takes the first 48 entries: 41 on OWM, five days.
    const ribbon = [5, 30, 60, 120, 175].map((offset) => spanHours(owmHourly(offset, 40).slice(0, 48)));
    expect(ribbon).toEqual([120, 120, 120, 120, 120]);
  });

  it('degrades to the entry count below two entries', () => {
    expect(spanHours([])).toBe(0);
    expect(spanHours(hourlyEvery(1, 1))).toBe(1);
  });
});

describe('timelineMarks', () => {
  const marks = (hrs: HourlyWeather[], tz: string) => timelineMarks(hrs, tz);
  const midnights = (hrs: HourlyWeather[], tz: string) => marks(hrs, tz).map((m, i) => (m.midnight ? i : -1)).filter((i) => i >= 0);

  it('finds one day boundary per calendar day on an OpenWeatherMap grid in a zone with no 00:00 slot', () => {
    // 15Z..15Z+48h at 3h steps. Chicago (UTC-5) never has a local-midnight
    // entry (slots land on 1am, 4am, ...) and neither does Berlin (UTC+2);
    // the day still turns between 22:00 and 01:00 / 23:00 and 02:00.
    const hrs = timelineHours(owmHourly(20, 40));
    expect(hrs.length).toBeGreaterThanOrEqual(16);
    const chicago = midnights(hrs, 'America/Chicago');
    const berlin = midnights(hrs, 'Europe/Berlin');
    expect(chicago).toHaveLength(2);
    expect(berlin).toHaveLength(2);
    // Each boundary is the first entry after the local day changed.
    for (const i of chicago) expect(tzDayKey(new Date(hrs[i].time), 'America/Chicago')).not.toBe(tzDayKey(new Date(hrs[i - 1].time), 'America/Chicago'));
    // And no entry actually sits at hour 0, which is what the old detection needed.
    expect(marks(hrs, 'America/Chicago').some((m) => Math.floor(m.hour) === 0)).toBe(false);
  });

  it('marks the 00:00 entry on an hourly source, never the first entry', () => {
    // 14:00 Chicago start (19Z) for 24 hours: row 10 is 00:00 the next day.
    const start = Date.UTC(2099, 6, 7, 19);
    const hrs: HourlyWeather[] = Array.from({ length: 24 }, (_, i) => ({ time: new Date(start + i * 3600_000).toISOString(), temp: 70, icon: 'sun', description: '' }));
    expect(midnights(hrs, 'America/Chicago')).toEqual([10]);
    expect(marks(hrs, 'America/Chicago')[10].hour).toBe(0);

    const fromMidnight = hrs.map((h, i) => ({ ...h, time: new Date(start + (10 + i) * 3600_000).toISOString() }));
    expect(marks(fromMidnight, 'America/Chicago')[0].midnight).toBe(false);
  });

  it('is empty for no entries', () => {
    expect(timelineMarks([], 'UTC')).toEqual([]);
  });
});

describe('temperatureAxis', () => {
  it('positions temperatures between the run\'s extremes', () => {
    const axis = temperatureAxis([50, 60, 70]);
    expect(axis.min).toBe(50);
    expect(axis.max).toBe(70);
    expect(axis.k(60)).toBeCloseTo(0.5);
  });

  it('puts a flat run at zero rather than dividing by zero', () => {
    const axis = temperatureAxis([64, 64, 64]);
    expect(axis.k(64)).toBe(0);
    expect(Number.isNaN(axis.k(64))).toBe(false);
  });
});

function forecastDays(n: number, high = (i: number) => 80 + i, low = (i: number) => 60 + i): ForecastDay[] {
  return Array.from({ length: n }, (_, i) => ({ date: `2099-07-${String(7 + i).padStart(2, '0')}`, high: high(i), low: low(i), icon: 'sun', description: 'Sunny' }));
}
const weekProps = (forecast: ForecastDay[], daysToShow?: number, nowTemp?: number) => ({
  forecast,
  hourly: nowTemp == null ? [] : [{ time: '2099-07-07T12:00:00Z', temp: nowTemp, icon: 'sun', description: '' }],
  config: { view: 'week' as const, daysToShow },
});

describe('weekRange', () => {
  it('trims to daysToShow and scales the bars to the week', () => {
    const r = weekRange(weekProps(forecastDays(7), 3, 75));
    expect(r.days).toHaveLength(3);
    expect(r.weekMin).toBe(60);
    expect(r.weekMax).toBe(82);
    expect(r.pct(60)).toBe(0);
    expect(r.pct(82)).toBe(100);
    expect(r.pct(71)).toBeCloseTo(50);
    expect(r.nowTemp).toBe(75);
  });

  it('clamps a current temperature outside the week\'s range onto the track', () => {
    const r = weekRange(weekProps(forecastDays(7), 7, 120));
    expect(r.pct(120)).toBe(100);
    expect(r.pct(-40)).toBe(0);
  });

  it('survives a flat week', () => {
    const r = weekRange(weekProps(forecastDays(5, () => 70, () => 70)));
    expect(r.weekMin).toBe(70);
    expect(r.weekMax).toBe(70);
    expect(r.pct(70)).toBe(0);
    expect(Number.isNaN(r.pct(70))).toBe(false);
  });

  it('is empty, with no current temperature, when there is no forecast', () => {
    const r = weekRange(weekProps([]));
    expect(r.days).toEqual([]);
    expect(r.nowTemp).toBeUndefined();
  });
});

describe('clampDaysToShow', () => {
  it('defaults to 7 and clamps to 3..7', () => {
    expect(clampDaysToShow(undefined)).toBe(7);
    expect(clampDaysToShow(Number.NaN)).toBe(7);
    expect(clampDaysToShow(1)).toBe(3);
    expect(clampDaysToShow(5)).toBe(5);
    expect(clampDaysToShow(30)).toBe(7);
  });
});

describe('meteogram label thinning', () => {
  it('derives the column pitch from the canvas less the padding and gutter', () => {
    const u = 10;
    const width = 1920;
    const gutter = 40;
    const expected = (width - u * CANVAS_PAD_X_U * 2 - u * CARD_PAD_X_U * 2 - gutter) / 24;
    expect(meteogramColumnPx(width, u, gutter, 24)).toBeCloseTo(expected);
    expect(meteogramColumnPx(width, u, gutter, 0)).toBe(0);
  });

  it('labels every column at stride 1', () => {
    const midnight = Array(24).fill(false);
    for (let i = 0; i < 24; i++) {
      expect(valueLabelled(i, 1)).toBe(true);
      expect(hourLabelled(i, 1, midnight)).toBe(true);
    }
  });

  it('always shows "Now" and the day name, and clears their neighbours when thinned', () => {
    const midnight = Array(24).fill(false);
    midnight[10] = true;
    // Stride 2: even columns carry values; 10 is even and a day name, so 8 and 12 stay,
    // but with stride 3 the neighbours 9 and 11 would be labelled and must yield.
    expect(hourLabelled(0, 2, midnight)).toBe(true);
    expect(hourLabelled(10, 2, midnight)).toBe(true);
    expect(hourLabelled(1, 2, midnight)).toBe(false);
    expect(hourLabelled(8, 2, midnight)).toBe(true);

    const m3 = Array(24).fill(false);
    m3[10] = true;
    expect(valueLabelled(9, 3)).toBe(true);
    expect(hourLabelled(9, 3, m3)).toBe(false);
    expect(hourLabelled(10, 3, m3)).toBe(true);
    expect(hourLabelled(12, 3, m3)).toBe(true);
    expect(hourLabelled(11, 3, m3)).toBe(false);
  });
});
