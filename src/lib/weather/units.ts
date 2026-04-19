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

/** mm → mm (metric) or inches (imperial). */
export function mmToPrecipUnit(mm: number, isMetric: boolean): number {
  return isMetric ? mm : mm * 0.0393701;
}
