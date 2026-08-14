import { describe, it, expect } from 'vitest';
import {
  computeRestartAdvised,
  hourInTimezone,
  resolveDisplayRestartInputs,
} from '@/lib/kiosk-restart-advice';
import type { ScreenConfiguration } from '@/types/config';

/** A config skeleton with only the fields the advice logic reads. */
function makeConfig(overrides: Partial<ScreenConfiguration> = {}): ScreenConfiguration {
  return {
    screens: [],
    settings: { timezone: 'America/Chicago' },
    ...overrides,
  } as unknown as ScreenConfiguration;
}

/** 03:30 US Central on a fixed date, expressed as the UTC instant. */
const QUIET_UTC = new Date('2026-08-13T08:30:00.000Z');
/** 19:00 US Central — prime family-in-the-kitchen time. */
const EVENING_UTC = new Date('2026-08-14T00:00:00.000Z');

describe('computeRestartAdvised', () => {
  it('always allows a restart while the display is asleep', () => {
    // The screen is already dark, so there is nothing to flash.
    expect(
      computeRestartAdvised({
        displayState: 'asleep',
        hasSleepSchedule: true,
        now: EVENING_UTC,
        timezone: 'America/Chicago',
      }),
    ).toBe(true);
  });

  it('refuses mid-evening on a display with no sleep schedule', () => {
    expect(
      computeRestartAdvised({
        displayState: 'active',
        hasSleepSchedule: false,
        now: EVENING_UTC,
        timezone: 'America/Chicago',
      }),
    ).toBe(false);
  });

  it('allows the small hours on a display with no sleep schedule', () => {
    expect(
      computeRestartAdvised({
        displayState: 'active',
        hasSleepSchedule: false,
        now: QUIET_UTC,
        timezone: 'America/Chicago',
      }),
    ).toBe(true);
  });

  it('gives a scheduled display no quiet-hours fallback', () => {
    // A display awake at 3am despite having a sleep schedule is awake on
    // purpose. Its own sleep window is the moment to restart, not ours.
    expect(
      computeRestartAdvised({
        displayState: 'active',
        hasSleepSchedule: true,
        now: QUIET_UTC,
        timezone: 'America/Chicago',
      }),
    ).toBe(false);
  });

  it('treats a dimmed display as in use', () => {
    // Dimmed means idle, not off — someone walking past still sees it.
    expect(
      computeRestartAdvised({
        displayState: 'dimmed',
        hasSleepSchedule: true,
        now: EVENING_UTC,
        timezone: 'America/Chicago',
      }),
    ).toBe(false);
  });

  it('falls back to quiet hours when the display has never reported', () => {
    expect(
      computeRestartAdvised({
        displayState: null,
        hasSleepSchedule: false,
        now: QUIET_UTC,
        timezone: 'America/Chicago',
      }),
    ).toBe(true);
  });

  it('evaluates the window in the display timezone, not the hub host', () => {
    // The same instant is 03:30 in Chicago and 08:30 in London.
    const input = { displayState: 'active' as const, hasSleepSchedule: false, now: QUIET_UTC };
    expect(computeRestartAdvised({ ...input, timezone: 'America/Chicago' })).toBe(true);
    expect(computeRestartAdvised({ ...input, timezone: 'Europe/London' })).toBe(false);
  });
});

describe('hourInTimezone', () => {
  it('reads the hour in the requested zone', () => {
    expect(hourInTimezone(QUIET_UTC, 'America/Chicago')).toBe(3);
    expect(hourInTimezone(QUIET_UTC, 'UTC')).toBe(8);
  });

  it('degrades to the host hour rather than throwing on a bad zone', () => {
    // A bad timezone string should cost the restart window, not take down
    // the API route that calls this.
    expect(hourInTimezone(QUIET_UTC, 'Not/AZone')).toBe(QUIET_UTC.getHours());
  });
});

describe('resolveDisplayRestartInputs', () => {
  it('finds a global sleep schedule', () => {
    const config = makeConfig({
      settings: {
        timezone: 'Europe/Berlin',
        sleep: {
          enabled: true,
          dimAfterMinutes: 5,
          sleepAfterMinutes: 15,
          dimBrightness: 30,
          schedule: { startTime: '23:00', endTime: '06:00' },
        },
      },
    } as unknown as Partial<ScreenConfiguration>);
    expect(resolveDisplayRestartInputs(config, 'kitchen')).toEqual({
      hasSleepSchedule: true,
      timezone: 'Europe/Berlin',
    });
  });

  it('does not count a disabled sleep block as a schedule', () => {
    const config = makeConfig({
      settings: {
        timezone: 'UTC',
        sleep: {
          enabled: false,
          dimAfterMinutes: 5,
          sleepAfterMinutes: 15,
          dimBrightness: 30,
          schedule: { startTime: '23:00', endTime: '06:00' },
        },
      },
    } as unknown as Partial<ScreenConfiguration>);
    expect(resolveDisplayRestartInputs(config, 'kitchen').hasSleepSchedule).toBe(false);
  });

  it('lets a per-display sleep block replace the global one outright', () => {
    // Per-display `sleep` is full-replacement, not deep-merged — a display
    // that turns sleep off must not inherit the global schedule.
    const config = makeConfig({
      settings: {
        timezone: 'UTC',
        sleep: {
          enabled: true,
          dimAfterMinutes: 5,
          sleepAfterMinutes: 15,
          dimBrightness: 30,
          schedule: { startTime: '23:00', endTime: '06:00' },
        },
      },
      displays: [
        {
          id: 'kitchen',
          name: 'Kitchen',
          screens: [],
          settings: {
            sleep: {
              enabled: false,
              dimAfterMinutes: 5,
              sleepAfterMinutes: 15,
              dimBrightness: 30,
            },
          },
        },
      ],
    } as unknown as Partial<ScreenConfiguration>);
    expect(resolveDisplayRestartInputs(config, 'kitchen').hasSleepSchedule).toBe(false);
  });

  it('treats a sleep block with no schedule as unscheduled', () => {
    const config = makeConfig({
      settings: {
        timezone: 'UTC',
        sleep: {
          enabled: true,
          dimAfterMinutes: 5,
          sleepAfterMinutes: 15,
          dimBrightness: 30,
        },
      },
    } as unknown as Partial<ScreenConfiguration>);
    expect(resolveDisplayRestartInputs(config, 'kitchen').hasSleepSchedule).toBe(false);
  });
});
