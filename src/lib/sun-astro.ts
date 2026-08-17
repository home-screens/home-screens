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

/** Circle-view constants (viewBox 250×250). */
const CIRCLE = { cx: 125, cy: 125 } as const;

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
