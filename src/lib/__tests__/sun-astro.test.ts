import { describe, expect, it } from 'vitest';
import SunCalc from 'suncalc';
import {
  astroDarkWindow,
  circleAngle,
  circleArcPath,
  circleLabelPos,
  circlePoint,
  hoursInTZ,
  polarKind,
  SKY_STAR_SEED,
  SKY_THEME_COLORS,
  skyStarScatter,
  skyStarPoint,
  skyThemeAnchors,
  skyThemeColorAt,
} from '../sun-astro';

const FRANKFURT = { lat: 50.1109, lon: 8.6821 };
const COPENHAGEN = { lat: 55.676, lon: 12.568 };
const TROMSO = { lat: 69.6492, lon: 18.9553 };

describe('astroDarkWindow', () => {
  it('returns tonight’s window pairing today’s night with next day’s nightEnd', () => {
    const times = SunCalc.getTimes(new Date('2026-08-16T10:00:00Z'), FRANKFURT.lat, FRANKFURT.lon);
    const next = SunCalc.getTimes(new Date('2026-08-17T10:00:00Z'), FRANKFURT.lat, FRANKFURT.lon);
    const w = astroDarkWindow(times, next);
    expect(w).not.toBeNull();
    // ~5h05m dark that night (computed with suncalc; sanity band, not exact ms)
    expect(w!.lengthMs).toBeGreaterThan(4.5 * 3600_000);
    expect(w!.lengthMs).toBeLessThan(5.5 * 3600_000);
    expect(w!.begins.getTime()).toBe(times.night.getTime());
    expect(w!.ends.getTime()).toBe(next.nightEnd.getTime());
    expect(w!.ends.getTime()).toBeGreaterThan(w!.begins.getTime());
  });

  it('handles a dark window that begins after midnight', () => {
    const times = SunCalc.getTimes(new Date('2026-07-25T10:00:00Z'), FRANKFURT.lat, FRANKFURT.lon);
    const next = SunCalc.getTimes(new Date('2026-07-26T10:00:00Z'), FRANKFURT.lat, FRANKFURT.lon);
    const w = astroDarkWindow(times, next);
    expect(w).not.toBeNull();
    // dark 12:13 AM → 2:56 AM, ~2h43m
    expect(w!.lengthMs).toBeGreaterThan(2 * 3600_000);
    expect(w!.lengthMs).toBeLessThan(3 * 3600_000);
  });

  it('returns null when there is no astrodark (high-latitude summer)', () => {
    const times = SunCalc.getTimes(new Date('2026-06-21T10:00:00Z'), COPENHAGEN.lat, COPENHAGEN.lon);
    const next = SunCalc.getTimes(new Date('2026-06-22T10:00:00Z'), COPENHAGEN.lat, COPENHAGEN.lon);
    expect(astroDarkWindow(times, next)).toBeNull();
  });
});

describe('polarKind', () => {
  it('is null on ordinary days with a sunrise and sunset', () => {
    const times = SunCalc.getTimes(new Date('2026-08-16T10:00:00Z'), FRANKFURT.lat, FRANKFURT.lon);
    expect(polarKind(times, FRANKFURT.lat, FRANKFURT.lon)).toBeNull();
  });

  it('detects polar night in Tromsø at the winter solstice', () => {
    const times = SunCalc.getTimes(new Date('2026-12-21T10:00:00Z'), TROMSO.lat, TROMSO.lon);
    expect(polarKind(times, TROMSO.lat, TROMSO.lon)).toBe('night');
    // the astrodark window still exists during polar night — the views must not drop it
    const next = SunCalc.getTimes(new Date('2026-12-22T10:00:00Z'), TROMSO.lat, TROMSO.lon);
    expect(astroDarkWindow(times, next)).not.toBeNull();
  });

  it('detects midnight sun in Tromsø at the summer solstice', () => {
    const times = SunCalc.getTimes(new Date('2026-06-21T10:00:00Z'), TROMSO.lat, TROMSO.lon);
    expect(polarKind(times, TROMSO.lat, TROMSO.lon)).toBe('day');
  });
});

describe('circle geometry (250×250 viewBox, center 125,125)', () => {
  it('maps clock hours clockwise from top: noon top, midnight bottom, 06:00 left, 18:00 right', () => {
    expect(circleAngle(12)).toBeCloseTo(0);
    expect(circleAngle(18)).toBeCloseTo(90);
    expect(circleAngle(0)).toBeCloseTo(180);
    expect(circleAngle(6)).toBeCloseTo(270);
    expect(circleAngle(24)).toBeCloseTo(180); // wraps
    expect(circleAngle(28.5)).toBeCloseTo(247.5); // post-midnight wrap (4:30 AM next day)
  });

  it('places points at the cardinal spots for r=82', () => {
    expect(circlePoint(0, 82)).toEqual([125, 43]);
    expect(circlePoint(90, 82)).toEqual([207, 125]);
    expect(circlePoint(180, 82)).toEqual([125, 207]);
    expect(circlePoint(270, 82)).toEqual([43, 125]);
  });

  it('places outside labels side-anchored, sliding corner cases off the equator', () => {
    // top (noon): centered above the ring
    expect(circleLabelPos(0)).toEqual({ x: 125, y: 29, anchor: 'middle' });
    // bottom (midnight): centered, clamped below the ring
    expect(circleLabelPos(180)).toEqual({ x: 125, y: 222, anchor: 'middle' });
    // 3 o'clock (18:00): within 10° of horizontal → slides into the right corner
    expect(circleLabelPos(90)).toEqual({ x: 214, y: 113, anchor: 'start' });
    // 9 o'clock (06:00): slides into the left corner
    expect(circleLabelPos(270)).toEqual({ x: 36, y: 137, anchor: 'end' });
  });

  it('builds arc paths with the right large-arc flag', () => {
    // Frankfurt Aug 16 daylight spans ~217° → large arc
    const sr = hoursInTZ(new Date('2026-08-16T04:17:00Z'), 'Europe/Berlin'); // 06:17
    const ss = hoursInTZ(new Date('2026-08-16T18:44:00Z'), 'Europe/Berlin'); // 20:44
    expect(circleArcPath(sr, ss, 82)).toBe('M 43.2 118.9 A 82 82 0 1 1 186.9 178.8');
    // a short twilight arc (sunset → dark begins) → small arc
    const db = hoursInTZ(new Date('2026-08-16T20:59:00Z'), 'Europe/Berlin'); // 22:59
    expect(circleArcPath(ss, db, 82)).toBe('M 186.9 178.8 A 82 82 0 0 1 146.6 204.1');
  });
});

describe('hoursInTZ', () => {
  it('converts an instant to decimal local hours', () => {
    expect(hoursInTZ(new Date('2026-08-16T13:00:00Z'), 'Europe/Berlin')).toBeCloseTo(15);
    expect(hoursInTZ(new Date('2026-08-16T13:00:00Z'), 'UTC')).toBeCloseTo(13);
  });
});

describe('sky theme anchors', () => {
  // A representative mid-latitude day: sunrise 06:10, solar noon 13:15, golden hour 19:20,
  // sunset 20:20, dark begins 22:20, dark ends 04:15 (all decimal hours).
  const HOURS = {
    sunrise: 6 + 10 / 60,
    solarNoon: 13.25,
    goldenHour: 19 + 20 / 60,
    sunset: 20 + 20 / 60,
    darkBegins: 22 + 20 / 60,
    darkEnds: 4 + 15 / 60,
  };

  it('builds one anchor per event plus the derived ±90 min stops, sorted by hour', () => {
    const anchors = skyThemeAnchors(HOURS);
    expect(anchors.map((a) => a.c)).toEqual([
      SKY_THEME_COLORS.darkEnds, // 04:15
      SKY_THEME_COLORS.sunrise, // 06:10
      SKY_THEME_COLORS.morning, // 07:40
      SKY_THEME_COLORS.noon, // 13:15
      SKY_THEME_COLORS.evening, // 18:50
      SKY_THEME_COLORS.goldenHour, // 19:20
      SKY_THEME_COLORS.sunset, // 20:20
      SKY_THEME_COLORS.darkBegins, // 22:20
    ]);
    expect(anchors[2].h).toBeCloseTo(7 + 40 / 60); // sunrise + 90 min
    expect(anchors[4].h).toBeCloseTo(18 + 50 / 60); // sunset − 90 min
  });

  it('drops null hours so polar nights degrade to the dark anchors only', () => {
    const anchors = skyThemeAnchors({
      sunrise: null, solarNoon: null, goldenHour: null, sunset: null,
      darkBegins: 20, darkEnds: 4,
    });
    expect(anchors).toEqual([
      { h: 4, c: SKY_THEME_COLORS.darkEnds },
      { h: 20, c: SKY_THEME_COLORS.darkBegins },
    ]);
  });

  it('wraps a sunset before 01:30 into the previous evening', () => {
    // sunset 00:30 → evening stop 23:00, sunrise 11:00 → morning stop 12:30
    const anchors = skyThemeAnchors({ ...HOURS, sunrise: 11, sunset: 0.5 });
    expect(anchors.map((a) => a.h)).toEqual([0.5, 4.25, 11, 12.5, 13.25, 19 + 20 / 60, 22 + 20 / 60, 23]);
  });

  it('adds a dark-begins anchor at the night’s clockwise midpoint when there is no astrodark', () => {
    // An ordinary high-summer night: sunset 22:00, sunrise 04:30 → midpoint 01:15.
    const anchors = skyThemeAnchors({
      sunrise: 4.5, solarNoon: 13, goldenHour: 21, sunset: 22, darkBegins: null, darkEnds: null,
    });
    expect(anchors.find((a) => a.c === SKY_THEME_COLORS.darkBegins)?.h).toBeCloseTo(1.25);
  });

  it('keeps the night-midpoint anchor inside the night when sunset lands just after midnight', () => {
    // 66°N in July: sunset 00:06, sunrise 03:04 — the night straddles midnight and
    // sunset’s hour is numerically SMALLER than sunrise’s. The midpoint must sit in
    // that short night (01:35), never at the middle of the day where a naive
    // (sunrise + sunset + 24) / 2 would put it (13:35, on the noon notch).
    const anchors = skyThemeAnchors({
      sunrise: 3 + 4 / 60, solarNoon: 13.58, goldenHour: 23.7, sunset: 0.1, darkBegins: null, darkEnds: null,
    });
    const mid = anchors.find((a) => a.c === SKY_THEME_COLORS.darkBegins);
    expect(mid?.h).toBeCloseTo(1 + 35 / 60, 2);
    expect(anchors.some((a) => a.c === SKY_THEME_COLORS.darkBegins && Math.abs(a.h - 13.58) < 1)).toBe(false);
  });

  it('adds no night-midpoint anchor when a real dark window exists', () => {
    const anchors = skyThemeAnchors({ sunrise: 6, solarNoon: 13, goldenHour: 19.5, sunset: 20.5, darkBegins: 22, darkEnds: 4 });
    expect(anchors.filter((a) => a.c === SKY_THEME_COLORS.darkBegins)).toEqual([
      { h: 22, c: SKY_THEME_COLORS.darkBegins },
    ]);
  });
});

describe('skyThemeColorAt', () => {
  const anchors = skyThemeAnchors({
    sunrise: 6, solarNoon: 13, goldenHour: 19.5, sunset: 20.5, darkBegins: 22, darkEnds: 4,
  });

  it('returns the exact anchor color at each anchor hour', () => {
    for (const a of anchors) expect(skyThemeColorAt(a.h, anchors)).toBe(a.c);
  });

  it('blends linearly between neighbors and wraps past midnight', () => {
    // 09:30 is 4/11 of the way from the +90m stop (07:30, #9f8dfc) to noon (13:00, #868efe)
    expect(skyThemeColorAt(9.5, anchors)).toBe('#968dfd');
    // 23:00 is 1/6 into the wrap segment 22:00→28:00 (darkBegins #0a0b3d → darkEnds #0a0a3c)
    expect(skyThemeColorAt(23, anchors)).toBe('#0a0b3d');
    // 02:00 is 2/3 through the same segment — the night visibly grades
    expect(skyThemeColorAt(2, anchors)).toBe('#0a0a3c');
    expect(skyThemeColorAt(23, anchors)).not.toBe(skyThemeColorAt(2, anchors));
  });

  it('resolves every hour to a color, including duplicates and single anchors', () => {
    for (let h = 0; h < 24; h += 0.25) expect(skyThemeColorAt(h, anchors)).toMatch(/^#[0-9a-f]{6}$/);
    expect(skyThemeColorAt(3, [{ h: 1, c: '#123456' }])).toBe('#123456');
    expect(skyThemeColorAt(3, [{ h: 2, c: '#111111' }, { h: 2, c: '#222222' }])).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('sky star scatter', () => {
  it('is deterministic: the same seed always produces the same 30 stars', () => {
    const a = skyStarScatter();
    const b = skyStarScatter();
    expect(a).toEqual(b);
    expect(a).not.toEqual(skyStarScatter(SKY_STAR_SEED + 1));
    expect(a).toHaveLength(30);
  });

  it('keeps fractions, offsets, and opacities in their intended bands', () => {
    for (const s of skyStarScatter()) {
      expect(s.f).toBeGreaterThanOrEqual(0);
      expect(s.f).toBeLessThan(1);
      expect(Math.abs(s.rOff)).toBeLessThanOrEqual(3.2);
      expect(s.o).toBeGreaterThanOrEqual(0.25);
      expect(s.o).toBeLessThanOrEqual(0.8);
    }
  });

  it('places every star inside the dark window’s angular span', () => {
    // dark 22:20 → 04:15 wraps midnight: angles 153.5°…243.75° (clockwise from top)
    const db = 22 + 20 / 60;
    const de = 4 + 15 / 60;
    for (const star of skyStarScatter()) {
      const [x, y] = skyStarPoint(star, db, de);
      const deg = ((Math.atan2(x - 125, 125 - y) * 180) / Math.PI + 360) % 360;
      expect(deg).toBeGreaterThanOrEqual(153.5);
      expect(deg).toBeLessThanOrEqual(243.8);
      const r = Math.hypot(x - 125, y - 125);
      expect(r).toBeGreaterThan(82 - 3.3);
      expect(r).toBeLessThan(82 + 3.3);
    }
  });
});
