/**
 * Unit conversions used by providers whose APIs only return SI/metric.
 * `units === 'metric'` keeps the SI value; `imperial` converts to °F / mph / inches.
 */
export function celsiusToUnit(c: number, isMetric: boolean): number {
  return isMetric ? c : c * 9 / 5 + 32;
}

/** m/s → km/h (metric) or mph (imperial). Matches the convention used by NOAA/Open-Meteo. */
export function msToWindUnit(ms: number, isMetric: boolean): number {
  return isMetric ? ms * 3.6 : ms * 2.23694;
}

/** km/h → km/h (metric) or mph (imperial). For providers (e.g. ECCC) that already report km/h. */
export function kmhToWindUnit(kmh: number, isMetric: boolean): number {
  return isMetric ? kmh : kmh * 0.621371;
}

/** The 16 compass points, clockwise from north, 22.5 degrees apart. */
const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

/**
 * Compass text ("NW", "nne") → degrees the wind blows from, 0 = north and
 * 90 = east. For providers (NOAA, ECCC) that only give direction as text.
 * Anything outside the 16-point rose, including blank and "VRB" (variable),
 * is `undefined`.
 */
export function compassToDegrees(text: string): number | undefined {
  const idx = (COMPASS_POINTS as readonly string[]).indexOf(text.trim().toUpperCase());
  return idx === -1 ? undefined : idx * 22.5;
}

/** The nearest of the 16 compass points for a direction in degrees ("W" for 265). */
export function compassLabel(deg: number): string {
  const i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_POINTS[i];
}

/**
 * A compass point in the household's language ("NW", or "NO" in German).
 * Each letter of the 16-point label is translated on its own, which gives
 * the right abbreviation in every shipped language: "WSW" is "OSO" in French
 * and "VSV" in Danish. `t` takes a full `modules` key.
 */
export function localizedCompassLabel(deg: number, t: (key: string) => string): string {
  return compassLabel(deg).split('').map((letter) => t(`fullscreen-weather.compass.${letter.toLowerCase()}`)).join('');
}

/** mm → mm (metric) or inches (imperial). */
export function mmToPrecipUnit(mm: number, isMetric: boolean): number {
  return isMetric ? mm : mm * 0.0393701;
}

/**
 * The label beside a wind speed. Every provider normalises wind to km/h
 * (metric) or mph (imperial) before it reaches a module, so the label depends
 * on the unit setting alone.
 */
export function windUnitLabel(units: 'metric' | 'imperial'): string {
  return units === 'metric' ? 'km/h' : 'mph';
}

/**
 * A pressure reading as text plus its label. Every provider reports hPa;
 * imperial households read a barometer in inches of mercury, which only
 * means something to two decimals (29.92), so it is not rounded to a whole.
 */
export function pressureForUnits(hPa: number, units: 'metric' | 'imperial', locale = 'en-US'): { value: string; unit: string } {
  return units === 'metric'
    ? { value: String(Math.round(hPa)), unit: 'hPa' }
    : { value: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(hPa * 0.02953), unit: 'inHg' };
}
