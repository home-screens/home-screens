/**
 * Weather facts published on the shared-state bus, so modules and display
 * rules can react to the sky: "show the Rain Map only when rain is likely
 * today", a Text token like `{weather.temperature}`, a rule that jumps to a
 * weather screen when a storm is coming.
 *
 * Published by `useSharedDisplayData`, the display-level fetch, from the
 * household's default weather provider. That fetch already runs on every
 * display with a location (the event bus needs it), so the values exist
 * whether or not a weather module is placed and survive screen rotation. A
 * module pointed at a different provider is a render-time choice and
 * deliberately does not change what is published, for the same reason the
 * calendar producer ignores per-module filters: two producers would disagree
 * about what "today's chance of rain" is.
 *
 * Lifecycle, same as `calendar-state.ts`: while weather is being fetched,
 * EVERY key is published on every tick, blank when the provider does not
 * send the field it comes from. Publishing blank rather than clearing keeps
 * display rules armed (`advanceRuleEngine` refuses an `unknown -> true` edge
 * on a key that only just became known). A blank value fails a numeric
 * condition, which is what "the provider gave no chance of rain" should do.
 *
 * Clearing is reserved for "nothing is fetched": no location configured,
 * so there is no payload at all.
 */

import { WEATHER_PROVIDER_CAPS, WEATHER_PROVIDER_IDS } from '@/lib/weather-providers';
import type { ForecastDay, HourlyWeather, WeatherAlert } from '@/lib/weather/types';
import { activeAlerts, mapDescriptionToCondition, mapSeverity, type AlertSeverity } from '@/lib/weather/derive';
import type { ProvidedStateKey } from '@/lib/shared-state-types';
import type { TranslateFn } from '@/i18n';
import { isoDateInTZ } from '@/lib/timezone';

/** Bus keys, in the order the editor's picker lists them. */
export const WEATHER_STATE_KEYS = {
  /** One of `clear`, `clouds`, `rain`, `drizzle`, `snow`, `thunderstorm`, `fog`, `wind`. */
  condition: 'weather.condition',
  /** Current reading in the household's unit, rounded to a whole degree. */
  temperature: 'weather.temperature',
  /** 0 to 100 for the current hour. */
  precipChanceNow: 'weather.precip_chance_now',
  /** 0 to 100, the highest chance over the next `NEXT_HOURS_WINDOW` hours. */
  precipChanceNextHours: 'weather.precip_chance_next_6h',
  /** 0 to 100, the highest chance for the rest of today in the display zone. */
  precipChanceToday: 'weather.precip_chance_today',
  /** `true` while a weather warning that has not expired is in force, else `false`. */
  alertActive: 'weather.alert_active',
  /** `minor`, `moderate`, `severe` or `extreme` for the most serious active warning; blank when none. */
  alertSeverity: 'weather.alert_severity',
  /** The most serious active warning's name ("Winter Storm Warning"); blank when none. */
  alertTitle: 'weather.alert_title',
} as const;

/** Every key this producer owns, for the caller's clear path. */
export const WEATHER_STATE_KEY_LIST: readonly string[] = Object.values(WEATHER_STATE_KEYS);

/** How far ahead `precip_chance_next_6h` looks. The key name carries it. */
export const NEXT_HOURS_WINDOW = 6;

/**
 * How far behind `now` an hourly row may sit and still count as current.
 * Providers stamp a row with the start of its hour (or three-hour slot), so
 * at 12:40 the row that describes the present reads 12:00.
 */
const CURRENT_ROW_GRACE_MS = 3 * 60 * 60 * 1000;

export interface WeatherStatePayload {
  hourly?: HourlyWeather[];
  forecast?: ForecastDay[];
  /** Only providers with warnings send this (Pirate Weather, NOAA). */
  alerts?: WeatherAlert[];
}

/**
 * The most serious warning still in force (see `activeAlerts` for the rule).
 * `alert_active` is `false` rather than blank when a provider sends no
 * warnings at all, so "no warning" conditions hold on every provider.
 */
function activeAlert(alerts: WeatherAlert[] | undefined, nowMs: number): { severity: AlertSeverity; title: string } | null {
  const first = activeAlerts(alerts, nowMs)[0];
  if (!first) return null;
  return { severity: mapSeverity(first.severity), title: typeof first.title === 'string' ? first.title : '' };
}

export interface WeatherStateOptions {
  /** Display timezone; "today" is read on its wall clock. */
  timezone?: string;
}

function percent(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
}

function maxPercent(values: (number | undefined)[]): string {
  let max: number | undefined;
  for (const v of values) {
    const p = percent(v);
    if (p !== undefined && (max === undefined || p > max)) max = p;
  }
  return max === undefined ? '' : String(max);
}

/**
 * Derive the bus values from the default provider's payload. Always returns
 * every key; a key is blank when nothing in the payload can feed it (see the
 * lifecycle note above).
 *
 * `now` is the real current instant. Hourly rows carry real instants too, so
 * the next-hours window is plain arithmetic; "today" is the display zone's
 * calendar day, matched row by row through `isoDateInTZ`, so a hub in one
 * zone driving a display in another still buckets the evening's rain into the
 * display's day. The forecast's first row joins "today" only when its own
 * date is today: late in the evening some providers have already moved on to
 * tomorrow.
 */
export function deriveWeatherState(
  payload: WeatherStatePayload | null | undefined,
  now: Date,
  opts: WeatherStateOptions = {},
): Record<string, string> {
  const hourly = Array.isArray(payload?.hourly) ? payload.hourly : [];
  const forecast = Array.isArray(payload?.forecast) ? payload.forecast : [];
  const current = hourly[0];

  const nowMs = now.getTime();
  const earliest = nowMs - CURRENT_ROW_GRACE_MS;
  const windowEnd = nowMs + NEXT_HOURS_WINDOW * 60 * 60 * 1000;
  const today = isoDateInTZ(now, opts.timezone);

  const nextHours: (number | undefined)[] = [];
  const todayRows: (number | undefined)[] = [];
  for (const row of hourly) {
    const t = new Date(row.time).getTime();
    if (!Number.isFinite(t) || t < earliest) continue;
    if (t < windowEnd) nextHours.push(row.precipProbability);
    if (isoDateInTZ(new Date(t), opts.timezone) === today) todayRows.push(row.precipProbability);
  }
  const todayForecast = forecast[0]?.date === today ? forecast[0].precipProbability : undefined;
  const alert = activeAlert(payload?.alerts, nowMs);

  return {
    [WEATHER_STATE_KEYS.condition]: current ? mapDescriptionToCondition(current.description ?? '') : '',
    [WEATHER_STATE_KEYS.temperature]: current && Number.isFinite(current.temp) ? String(Math.round(current.temp)) : '',
    [WEATHER_STATE_KEYS.precipChanceNow]: maxPercent([current?.precipProbability]),
    [WEATHER_STATE_KEYS.precipChanceNextHours]: maxPercent(nextHours),
    [WEATHER_STATE_KEYS.precipChanceToday]: maxPercent([...todayRows, todayForecast]),
    [WEATHER_STATE_KEYS.alertActive]: String(alert !== null),
    [WEATHER_STATE_KEYS.alertSeverity]: alert?.severity ?? '',
    [WEATHER_STATE_KEYS.alertTitle]: alert?.title ?? '',
  };
}

/**
 * The providers whose payload can carry warnings (they implement
 * `getAlerts`). The warning keys are published on every provider, `false`
 * and blank elsewhere, but the editor only offers them when the household's
 * default provider is one of these, so nobody builds a rule that can never
 * fire. Read off the `alerts` flag in the one provider table;
 * `weather-state.test.ts` checks it against the provider classes, so adding
 * `getAlerts` to a provider fails the test until its flag is set.
 */
export const WEATHER_ALERT_PROVIDERS: readonly string[] = WEATHER_PROVIDER_IDS.filter(
  (id) => WEATHER_PROVIDER_CAPS[id].alerts,
);

export function providerSendsWeatherAlerts(provider: string | undefined): boolean {
  return provider !== undefined && WEATHER_ALERT_PROVIDERS.includes(provider);
}

/**
 * The keys the editor's condition picker, rules editor and Text-token picker
 * offer for the weather. Labels are household wording and translated; the
 * sample values show the machine words `condition` carries, which are
 * English identifiers rather than text to put on a wall. The warning keys
 * are listed only when `alerts` is true (see `WEATHER_ALERT_PROVIDERS`).
 */
export function weatherProvidedStateKeys(t: TranslateFn, opts: { alerts: boolean } = { alerts: true }): ProvidedStateKey[] {
  const chance: ProvidedStateKey[] = [
    {
      key: WEATHER_STATE_KEYS.condition,
      label: t('stateKeys.weather.condition'),
      sampleValues: ['clear', 'rain', 'snow'],
    },
    { key: WEATHER_STATE_KEYS.temperature, label: t('stateKeys.weather.temperature'), sampleValues: ['72', '-3'] },
    { key: WEATHER_STATE_KEYS.precipChanceNow, label: t('stateKeys.weather.precipChanceNow'), sampleValues: ['0', '80'] },
    {
      key: WEATHER_STATE_KEYS.precipChanceNextHours,
      label: t('stateKeys.weather.precipChanceNext6h'),
      sampleValues: ['0', '80'],
    },
    { key: WEATHER_STATE_KEYS.precipChanceToday, label: t('stateKeys.weather.precipChanceToday'), sampleValues: ['0', '80'] },
  ];
  if (!opts.alerts) return chance;
  return [
    ...chance,
    { key: WEATHER_STATE_KEYS.alertActive, label: t('stateKeys.weather.alertActive'), sampleValues: ['true', 'false'] },
    {
      key: WEATHER_STATE_KEYS.alertSeverity,
      label: t('stateKeys.weather.alertSeverity'),
      sampleValues: ['minor', 'severe'],
    },
    { key: WEATHER_STATE_KEYS.alertTitle, label: t('stateKeys.weather.alertTitle'), sampleValues: ['Winter Storm Warning'] },
  ];
}
