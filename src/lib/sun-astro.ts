/**
 * Pure helpers for the sunrise-sunset module: tonight's astrodark window
 * and the 24h-circle view geometry.
 */
import SunCalc from 'suncalc';

type Times = ReturnType<typeof SunCalc.getTimes>;

/** Tonight's astronomical-darkness window. Null when the sun never reaches 18° below. */
export interface AstroDarkWindow {
  begins: Date; // today's suncalc `night`
  ends: Date; // NEXT solar day's `nightEnd` (same-day nightEnd is this morning's)
  lengthMs: number;
}

const isDate = (d: Date | undefined | null): d is Date => !!d && !isNaN(d.getTime());

export function astroDarkWindow(times: Times, nextDayTimes: Times): AstroDarkWindow | null {
  if (!isDate(times.night) || !isDate(nextDayTimes.nightEnd)) return null;
  const begins = times.night;
  const ends = nextDayTimes.nightEnd;
  const lengthMs = ends.getTime() - begins.getTime();
  if (lengthMs <= 0) return null;
  return { begins, ends, lengthMs };
}

/**
 * Distinguish polar day from polar night when the sun never crosses the horizon.
 * SunCalc returns Invalid Date for BOTH sunrise and sunset in either case; the
 * sun's altitude at solar noon (always a valid instant) tells them apart.
 */
export function polarKind(times: Times, latitude: number, longitude: number): 'day' | 'night' | null {
  if (isDate(times.sunrise) || isDate(times.sunset)) return null;
  return SunCalc.getPosition(times.solarNoon, latitude, longitude).altitude > 0 ? 'day' : 'night';
}

/** Circle-view geometry. Every literal the view draws with derives from these. */
export const CIRCLE = { cx: 125, cy: 125, size: 250 } as const;
export const CIRCLE_R = 82; // dial ring radius
export const CIRCLE_LABEL_R = 96; // outside-label radius

/** Angle in degrees, clockwise from top (noon). 12h → 0°, 18h → 90°, 0h/24h → 180°, 6h → 270°. */
export function circleAngle(hoursSinceLocalMidnight: number): number {
  return (((hoursSinceLocalMidnight - 12) * 15) % 360 + 360) % 360;
}

/** Point on the circle for an angle (deg clockwise from top) at radius r. Coordinates rounded to 0.1 viewBox units. */
export function circlePoint(angleDeg: number, r: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [
    Math.round((CIRCLE.cx + r * Math.sin(rad)) * 10) / 10,
    Math.round((CIRCLE.cy - r * Math.cos(rad)) * 10) / 10,
  ];
}

/** Outside-label placement at CIRCLE_LABEL_R, side-anchored; near 3/9-o'clock slide toward the corners. */
export function circleLabelPos(angleDeg: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const rad = (angleDeg * Math.PI) / 180;
  const s = Math.sin(rad);
  const c = Math.cos(rad);
  let [x, y] = circlePoint(angleDeg, CIRCLE_LABEL_R);
  const anchor = Math.abs(s) < 0.35 ? 'middle' : s > 0 ? 'start' : 'end';
  if (anchor !== 'middle' && Math.abs(c) < 0.17) {
    // within ~10° of the horizontal: labels would clip; slide away from the equator into the corners
    y = y + (c > 0 ? -12 : 12);
    x = anchor === 'end' ? CIRCLE.cx - 89 : CIRCLE.cx + 89;
  }
  if (anchor === 'middle' && y > CIRCLE.cy + 65) y = CIRCLE.cy + 97; // bottom labels clear the ring
  return { x, y, anchor };
}

/** SVG arc path along the circle from local hour h1 to h2 (clockwise), radius r. */
export function circleArcPath(h1: number, h2: number, r: number): string {
  const a1 = circleAngle(h1);
  const a2 = circleAngle(h2);
  const span = (((a2 - a1) % 360) + 360) % 360;
  const large = span > 180 ? 1 : 0;
  const [x1, y1] = circlePoint(a1, r);
  const [x2, y2] = circlePoint(a2, r);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** Decimal hours since local midnight in the given IANA timezone. Falls back to local time when the timezone is absent or unknown. */
export function hoursInTZ(date: Date, timezone?: string): number {
  const localHours = () => date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  if (!timezone) return localHours();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return get('hour') + get('minute') / 60 + get('second') / 3600;
  } catch {
    return localHours();
  }
}

/** Sky-theme ring palette (tuned in the docs/sun-ring-colors.html playground): one
 *  anchor color per sun event. morning/evening are the derived stops
 *  90 min after sunrise / 90 min before sunset; sunDisc drives the now-marker disc and
 *  its daylight glow rather than the ring. */
export const SKY_THEME_COLORS = {
  sunrise: '#ffc229',
  morning: '#9f8dfc',
  noon: '#868efe',
  evening: '#6c7dfe',
  goldenHour: '#ff7b00',
  sunset: '#ff2e2e',
  darkBegins: '#0a0b3d',
  darkEnds: '#0a0a3c',
  sunDisc: '#fbbf24',
} as const;

export interface SkyThemeAnchor {
  h: number;
  c: string;
}

/** Gradient anchors for the sky ring: one per event hour plus the derived ±90 min stops,
 *  sorted by hour. Null hours (polar days, missing events) are dropped so the ring degrades
 *  to whatever anchors exist. */
export function skyThemeAnchors(hours: {
  sunrise: number | null;
  solarNoon: number | null;
  goldenHour: number | null;
  sunset: number | null;
  darkBegins: number | null;
  darkEnds: number | null;
}): SkyThemeAnchor[] {
  const c = SKY_THEME_COLORS;
  const anchors: SkyThemeAnchor[] = [];
  if (hours.sunrise != null) {
    anchors.push({ h: hours.sunrise, c: c.sunrise });
    anchors.push({ h: (hours.sunrise + 1.5) % 24, c: c.morning });
  }
  if (hours.solarNoon != null) anchors.push({ h: hours.solarNoon, c: c.noon });
  if (hours.sunset != null) {
    anchors.push({ h: (hours.sunset - 1.5 + 24) % 24, c: c.evening });
    anchors.push({ h: hours.sunset, c: c.sunset });
  }
  if (hours.goldenHour != null) anchors.push({ h: hours.goldenHour, c: c.goldenHour });
  if (hours.darkBegins != null) anchors.push({ h: hours.darkBegins, c: c.darkBegins });
  if (hours.darkEnds != null) anchors.push({ h: hours.darkEnds, c: c.darkEnds });
  // No astrodark but a real night: the night's halfway point takes the dark-begins
  // color, so high-summer rings still dip dark around solar midnight. The night runs
  // sunset → sunrise CLOCKWISE (mod 24 — near the polar circles sunset itself lands
  // just after 00:00, and a naive sunrise+24−sunset midpoint would point at midday).
  if (hours.darkBegins == null && hours.darkEnds == null && hours.sunrise != null && hours.sunset != null) {
    const span = clockwiseSpanHours(hours.sunset, hours.sunrise);
    if (span !== 0) anchors.push({ h: (hours.sunset + span / 2) % 24, c: c.darkBegins });
  }
  return anchors.sort((a, b) => a.h - b.h);
}

/** Clockwise hours from h1 to h2 on the 24h dial — the span of a night that may straddle midnight. */
export function clockwiseSpanHours(h1: number, h2: number): number {
  return (((h2 - h1) % 24) + 24) % 24;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `#${ca
    .map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Linear-RGB blend between neighboring anchors around the dial (wrap at 24h). With fewer
 *  than two anchors every hour resolves to the single color. */
export function skyThemeColorAt(h: number, anchors: SkyThemeAnchor[]): string {
  const n = anchors.length;
  if (n === 0) return SKY_THEME_COLORS.darkBegins;
  if (n === 1) return anchors[0].c;
  let hh = ((h % 24) + 24) % 24;
  if (hh < anchors[0].h) hh += 24;
  for (let i = 0; i < n; i++) {
    const h1 = anchors[i].h;
    const h2 = i + 1 < n ? anchors[i + 1].h : anchors[0].h + 24;
    if (h2 <= h1) continue; // duplicate anchor hours
    if (hh >= h1 && hh < h2) {
      return lerpHex(anchors[i].c, anchors[i + 1 < n ? i + 1 : 0].c, (hh - h1) / (h2 - h1));
    }
  }
  return anchors[n - 1].c;
}

/** Deterministic PRNG (mulberry32). The star scatter must render identically on every
 *  device and reload, so it is seeded from a constant instead of Math.random(). */
export const SKY_STAR_SEED = 20260820;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SkyStar {
  f: number; // fraction along the dark window, 0–1
  rOff: number; // offset from the ring radius, −3.2…3.2 (inside the 8-unit stroke)
  o: number; // opacity, 0.25–0.8
}

/** 30 stars from the fixed seed: positions as dark-window fractions so a changing dark
 *  window remaps them without regenerating the scatter. */
export function skyStarScatter(seed = SKY_STAR_SEED): SkyStar[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: 30 }, () => ({
    f: rnd(),
    rOff: rnd() * 6.4 - 3.2,
    o: 0.25 + rnd() * 0.55,
  }));
}

/** A star's on-dial point for the dark window spanning [darkBegins, darkEnds] (decimal
 *  hours; darkEnds may wrap past midnight, i.e. be numerically smaller). */
export function skyStarPoint(star: SkyStar, darkBegins: number, darkEnds: number): [number, number] {
  const span = (((darkEnds - darkBegins) % 24) + 24) % 24 || 24;
  return circlePoint(circleAngle(darkBegins + star.f * span), CIRCLE_R + star.rOff);
}
