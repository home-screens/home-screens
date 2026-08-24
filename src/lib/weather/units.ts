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
