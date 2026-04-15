import { describe, it, expect } from 'vitest';
import type { GlobalSettings } from '@/types/config';
import {
  FORM_DEFAULTS,
  toConfigSettings,
  toFormState,
  type SettingsState,
} from '@/lib/settings-form';

describe('settings-form transforms', () => {
  it('toFormState returns defaults when settings is undefined', () => {
    expect(toFormState(undefined)).toEqual(FORM_DEFAULTS);
  });

  it('round-trips FORM_DEFAULTS (with empty lat/lon normalized to "0")', () => {
    // FORM_DEFAULTS has lat="" / lon="" to mean "not entered yet". Once the
    // user saves, parseFloat("") || 0 persists those as real 0s, and reading
    // them back projects to "0". So the only lossy transform is the empty ↔
    // "0" fold for lat/lon, which is intentional (the config type can't hold
    // `undefined` here).
    const config = toConfigSettings(FORM_DEFAULTS);
    const back = toFormState(config as GlobalSettings);
    expect(back).toEqual({
      ...FORM_DEFAULTS,
      location: { ...FORM_DEFAULTS.location, lat: '0', lon: '0' },
    });
  });

  it('round-trips a non-default form state', () => {
    const custom: SettingsState = {
      display: {
        rotationInterval: 45,
        displayWidth: 1920,
        displayHeight: 1080,
        displayTransform: 'normal',
        cursorHideSeconds: 5,
        transitionEffect: 'slide',
        transitionDuration: 1.2,
        fullscreenTheme: 'dark',
        pauseEnabled: false,
        pauseTimeoutSeconds: 600,
      },
      location: { lat: '44.7133', lon: '-93.4227', locationName: 'Prior Lake, MN', timezone: 'America/Chicago' },
      weather: { provider: 'openweathermap', units: 'metric' },
      calendar: {
        selectedCalendarIds: ['cal-a', 'cal-b'],
        icalSources: [{ id: 'ical-1', type: 'ical', name: 'Holidays', url: 'https://example.com/holidays.ics', color: '#3b82f6', enabled: true }],
        maxEvents: 25,
        daysAhead: 14,
        holidayCountry: 'US',
      },
      sleep: {
        sleepEnabled: true,
        dimAfterMinutes: 5,
        sleepAfterMinutes: 30,
        dimBrightness: 40,
        dimScheduleEnabled: true,
        dimStartTime: '22:30',
        dimEndTime: '05:30',
        sleepScheduleEnabled: true,
        sleepStartTime: '23:30',
        sleepEndTime: '06:30',
        screensaverMode: 'blank',
      },
      alerts: {
        alertsEnabled: false,
        alertsPosition: 'bottom',
        alertsMaxVisible: 5,
        alertsDefaultDuration: 8,
        alertsScale: 1.25,
      },
    };

    const config = toConfigSettings(custom);
    const back = toFormState(config as GlobalSettings);
    expect(back).toEqual(custom);
  });

  it('schedule disabled in form drops the persisted schedule', () => {
    const noSchedule: SettingsState = {
      ...FORM_DEFAULTS,
      sleep: { ...FORM_DEFAULTS.sleep, dimScheduleEnabled: false, sleepScheduleEnabled: false },
    };
    const config = toConfigSettings(noSchedule);
    expect(config.sleep).not.toHaveProperty('dimSchedule');
    expect(config.sleep).not.toHaveProperty('schedule');
  });
});
