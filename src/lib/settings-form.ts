import type { CalendarPerson, GlobalSettings, ICalSource, ICloudSource, ScreensaverSettings, SleepSettings } from '@/types/config';
import { DEFAULT_WAKE_HOLD_MINUTES } from '@/lib/sleep-timeline';

/**
 * Form state ↔ GlobalSettings transforms for the Defaults settings page.
 *
 * `toFormState` projects the persisted `GlobalSettings` shape (seconds stored
 * as milliseconds, optional schedules, nested provider objects) into a flat
 * form state suitable for controlled inputs. `toConfigSettings` inverts the
 * projection. The two are intentional mirrors — when adding a new default
 * setting, update both along with `FORM_DEFAULTS`, and the round-trip test
 * in `__tests__/settings-form.test.ts` will catch drift.
 */

export interface DisplayState {
  displayWidth: number;
  displayHeight: number;
  displayTransform: string;
  rotationInterval: number;
  cursorHideSeconds: number;
  transitionEffect: string;
  transitionDuration: number;
  fullscreenTheme: string;
  pauseEnabled: boolean;
  pauseTimeoutSeconds: number;
  swipeEnabled: boolean;
  setupHintEnabled: boolean;
  showRotationProgress: boolean;
}

export interface LocationState {
  lat: string;
  lon: string;
  locationName: string | null;
  timezone: string;
}

export interface WeatherState {
  provider: string;
  units: string;
}

export interface CalendarState {
  selectedCalendarIds: string[];
  icalSources: ICalSource[];
  icloudSources: ICloudSource[];
  people: CalendarPerson[];
  daysAhead: number;
  holidayCountry: string;
  hideDeclined: boolean;
}

export interface SleepState {
  sleepEnabled: boolean;
  idleDimEnabled: boolean;
  dimAfterMinutes: number;
  sleepAfterMinutes: number;
  dimBrightness: number;
  dimScheduleEnabled: boolean;
  dimStartTime: string;
  dimEndTime: string;
  sleepScheduleEnabled: boolean;
  sleepStartTime: string;
  sleepEndTime: string;
  wakeHoldMinutes: number;
  screensaverMode: string;
}

export interface AlertState {
  alertsEnabled: boolean;
  alertsPosition: string;
  alertsMaxVisible: number;
  alertsDefaultDuration: number;
  alertsScale: number;
}

export interface SettingsState {
  display: DisplayState;
  location: LocationState;
  weather: WeatherState;
  calendar: CalendarState;
  sleep: SleepState;
  alerts: AlertState;
}

export const FORM_DEFAULTS: SettingsState = {
  display: {
    rotationInterval: 30,
    displayWidth: 1080,
    displayHeight: 1920,
    displayTransform: '90',
    cursorHideSeconds: 3,
    transitionEffect: 'fade',
    transitionDuration: 0.6,
    fullscreenTheme: 'linen',
    pauseEnabled: true,
    pauseTimeoutSeconds: 300,
    swipeEnabled: true,
    setupHintEnabled: true,
    showRotationProgress: true,
  },
  location: { lat: '', lon: '', locationName: null, timezone: '' },
  weather: { provider: 'weatherapi', units: 'imperial' },
  calendar: { selectedCalendarIds: [], icalSources: [], icloudSources: [], people: [], daysAhead: 7, holidayCountry: '', hideDeclined: false },
  sleep: {
    sleepEnabled: false,
    idleDimEnabled: true,
    dimAfterMinutes: 10,
    sleepAfterMinutes: 0,
    dimBrightness: 20,
    dimScheduleEnabled: false,
    dimStartTime: '23:00',
    dimEndTime: '06:00',
    sleepScheduleEnabled: false,
    sleepStartTime: '23:00',
    sleepEndTime: '06:00',
    wakeHoldMinutes: DEFAULT_WAKE_HOLD_MINUTES,
    screensaverMode: 'clock',
  },
  alerts: { alertsEnabled: true, alertsPosition: 'top', alertsMaxVisible: 3, alertsDefaultDuration: 0, alertsScale: 1 },
};

/**
 * Sleep + screensaver halves of the form transforms, exported separately
 * because `SleepSubtab` (the per-display whole-block override) needs exactly
 * this pair without the rest of `SettingsState`. Keeping one implementation
 * matters beyond tidiness: `idleDimEnabled` is optional on `SleepSettings`,
 * so a forked copy that forgot the field would typecheck and silently reset
 * the user's choice to true on every per-display save.
 */
export function sleepConfigToForm(
  sleep: SleepSettings | undefined,
  screensaver: ScreensaverSettings | undefined,
): SleepState {
  return {
    sleepEnabled: sleep?.enabled ?? false,
    idleDimEnabled: sleep?.idleDimEnabled ?? true,
    dimAfterMinutes: sleep?.dimAfterMinutes ?? FORM_DEFAULTS.sleep.dimAfterMinutes,
    sleepAfterMinutes: sleep?.sleepAfterMinutes ?? FORM_DEFAULTS.sleep.sleepAfterMinutes,
    dimBrightness: sleep?.dimBrightness ?? FORM_DEFAULTS.sleep.dimBrightness,
    dimScheduleEnabled: !!sleep?.dimSchedule,
    dimStartTime: sleep?.dimSchedule?.startTime ?? FORM_DEFAULTS.sleep.dimStartTime,
    dimEndTime: sleep?.dimSchedule?.endTime ?? FORM_DEFAULTS.sleep.dimEndTime,
    sleepScheduleEnabled: !!sleep?.schedule,
    sleepStartTime: sleep?.schedule?.startTime ?? FORM_DEFAULTS.sleep.sleepStartTime,
    sleepEndTime: sleep?.schedule?.endTime ?? FORM_DEFAULTS.sleep.sleepEndTime,
    wakeHoldMinutes: sleep?.wakeHoldMinutes ?? DEFAULT_WAKE_HOLD_MINUTES,
    screensaverMode: screensaver?.mode ?? FORM_DEFAULTS.sleep.screensaverMode,
  };
}

export function sleepFormToConfig(sleep: SleepState): {
  sleep: SleepSettings;
  screensaver: ScreensaverSettings;
} {
  return {
    sleep: {
      enabled: sleep.sleepEnabled,
      idleDimEnabled: sleep.idleDimEnabled,
      dimAfterMinutes: sleep.dimAfterMinutes,
      sleepAfterMinutes: sleep.sleepAfterMinutes,
      dimBrightness: sleep.dimBrightness,
      ...(sleep.dimScheduleEnabled ? { dimSchedule: { startTime: sleep.dimStartTime, endTime: sleep.dimEndTime } } : {}),
      ...(sleep.sleepScheduleEnabled ? { schedule: { startTime: sleep.sleepStartTime, endTime: sleep.sleepEndTime } } : {}),
      wakeHoldMinutes: sleep.wakeHoldMinutes,
    },
    screensaver: {
      mode: sleep.screensaverMode as ScreensaverSettings['mode'],
    },
  };
}

export function toFormState(s: GlobalSettings | undefined): SettingsState {
  if (!s) return FORM_DEFAULTS;
  return {
    display: {
      rotationInterval: s.rotationIntervalMs / 1000,
      displayWidth: s.displayWidth,
      displayHeight: s.displayHeight,
      displayTransform: s.displayTransform ?? FORM_DEFAULTS.display.displayTransform,
      cursorHideSeconds: s.cursorHideSeconds ?? FORM_DEFAULTS.display.cursorHideSeconds,
      transitionEffect: s.transitionEffect ?? FORM_DEFAULTS.display.transitionEffect,
      transitionDuration: s.transitionDuration ?? FORM_DEFAULTS.display.transitionDuration,
      fullscreenTheme: s.fullscreenTheme ?? FORM_DEFAULTS.display.fullscreenTheme,
      pauseEnabled: s.pauseEnabled ?? FORM_DEFAULTS.display.pauseEnabled,
      pauseTimeoutSeconds: s.pauseTimeoutSeconds ?? FORM_DEFAULTS.display.pauseTimeoutSeconds,
      swipeEnabled: s.swipeEnabled ?? FORM_DEFAULTS.display.swipeEnabled,
      setupHintEnabled: s.setupHintEnabled ?? FORM_DEFAULTS.display.setupHintEnabled,
      showRotationProgress: s.showRotationProgress ?? FORM_DEFAULTS.display.showRotationProgress,
    },
    location: {
      lat: (s.latitude ?? s.weather.latitude)?.toString() ?? '',
      lon: (s.longitude ?? s.weather.longitude)?.toString() ?? '',
      locationName: s.locationName ?? null,
      timezone: s.timezone ?? '',
    },
    weather: {
      provider: s.weather.provider,
      units: s.weather.units,
    },
    calendar: {
      selectedCalendarIds: s.calendar.googleCalendarIds ?? (s.calendar.googleCalendarId ? [s.calendar.googleCalendarId] : []),
      icalSources: s.calendar.icalSources ?? [],
      icloudSources: s.calendar.icloudSources ?? [],
      people: s.calendar.people ?? [],
      daysAhead: s.calendar.daysAhead ?? FORM_DEFAULTS.calendar.daysAhead,
      holidayCountry: s.calendar.holidayCountry ?? '',
      hideDeclined: s.calendar.hideDeclined ?? false,
    },
    sleep: sleepConfigToForm(s.sleep, s.screensaver),
    alerts: {
      alertsEnabled: s.alerts?.enabled ?? FORM_DEFAULTS.alerts.alertsEnabled,
      alertsPosition: s.alerts?.position ?? FORM_DEFAULTS.alerts.alertsPosition,
      alertsMaxVisible: s.alerts?.maxVisible ?? FORM_DEFAULTS.alerts.alertsMaxVisible,
      alertsDefaultDuration: (s.alerts?.defaultDuration ?? 0) / 1000,
      alertsScale: s.alerts?.scale ?? FORM_DEFAULTS.alerts.alertsScale,
    },
  };
}

export function toConfigSettings(state: SettingsState): Partial<GlobalSettings> {
  const { display, location, weather, calendar, sleep, alerts } = state;
  const parsedLat = parseFloat(location.lat) || 0;
  const parsedLon = parseFloat(location.lon) || 0;

  return {
    rotationIntervalMs: display.rotationInterval * 1000,
    displayWidth: display.displayWidth,
    displayHeight: display.displayHeight,
    displayTransform: display.displayTransform as 'normal' | '90' | '180' | '270',
    cursorHideSeconds: display.cursorHideSeconds,
    transitionEffect: display.transitionEffect as GlobalSettings['transitionEffect'],
    transitionDuration: display.transitionDuration,
    fullscreenTheme: display.fullscreenTheme,
    pauseEnabled: display.pauseEnabled,
    pauseTimeoutSeconds: display.pauseTimeoutSeconds,
    swipeEnabled: display.swipeEnabled,
    setupHintEnabled: display.setupHintEnabled,
    showRotationProgress: display.showRotationProgress,
    latitude: parsedLat,
    longitude: parsedLon,
    locationName: location.locationName ?? undefined,
    timezone: location.timezone || undefined,
    weather: {
      provider: weather.provider as GlobalSettings['weather']['provider'],
      latitude: parsedLat,
      longitude: parsedLon,
      units: weather.units as 'metric' | 'imperial',
    },
    calendar: {
      googleCalendarId: calendar.selectedCalendarIds[0] ?? '',
      googleCalendarIds: calendar.selectedCalendarIds,
      icalSources: calendar.icalSources,
      icloudSources: calendar.icloudSources,
      // Omitted while empty so a household that never set people up keeps
      // the exact settings shape it had before the field existed.
      ...(calendar.people.length > 0 ? { people: calendar.people } : {}),
      daysAhead: calendar.daysAhead,
      ...(calendar.holidayCountry ? { holidayCountry: calendar.holidayCountry } : {}),
      hideDeclined: calendar.hideDeclined,
    },
    ...sleepFormToConfig(sleep),
    alerts: {
      enabled: alerts.alertsEnabled,
      position: alerts.alertsPosition as 'top' | 'bottom',
      maxVisible: alerts.alertsMaxVisible,
      defaultDuration: alerts.alertsDefaultDuration * 1000,
      scale: alerts.alertsScale,
    },
  };
}
