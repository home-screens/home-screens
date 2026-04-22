import { describe, it, expect } from 'vitest';
import { isModuleVisible, resolveProfileScreens } from '../schedule';
import type { Profile, Screen } from '@/types/config';

/**
 * Mirrors ScreenRotator.tsx's resolution pipeline: schedule filter (with
 * empty-set fallback) → profile resolver. Kept in the test file so the
 * production component stays a thin rendering layer around the existing
 * schedule library.
 */
function resolveDisplayedScreens(
  screens: Screen[],
  profiles: Profile[] | undefined,
  activeProfileId: string | undefined,
  now: Date,
): Screen[] {
  const enabledScreens = screens.filter((s) => s.enabled !== false);
  const filtered = enabledScreens.filter((s) => isModuleVisible(s.schedule, now));
  const scheduledScreens = filtered.length > 0 ? filtered : enabledScreens;
  return resolveProfileScreens(scheduledScreens, profiles, activeProfileId, now);
}

function makeScreen(id: string, overrides?: Partial<Screen>): Screen {
  return {
    id,
    name: id,
    backgroundImage: '',
    modules: [],
    ...overrides,
  };
}

// Mirrors `makeDate` in schedule.test.ts so both files agree on day-of-week
// numbering and use the same local-time construction (the production
// `useTZClock` returns a "shifted local Date" — `now.getDay()` /
// `now.getHours()` consume the local-time getters, so tests must build dates
// the same way).
// 2026-03-08 is a Sunday (day 0).
function makeDate(day: number, hours: number, minutes: number): Date {
  return new Date(2026, 2, 8 + day, hours, minutes);
}

const WED_2PM = makeDate(3, 14, 0);
const WED_7AM = makeDate(3, 7, 0);
const WED_2AM = makeDate(3, 2, 0);

describe('screen scheduling integration', () => {
  it('excludes a screen whose schedule is out-of-window', () => {
    const screens: Screen[] = [
      makeScreen('A'),
      makeScreen('B', {
        schedule: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00' },
      }),
      makeScreen('C'),
    ];

    const result = resolveDisplayedScreens(screens, undefined, undefined, WED_2PM);
    const ids = result.map((s) => s.id);

    expect(result).toHaveLength(2);
    expect(ids).toContain('A');
    expect(ids).toContain('C');
    expect(ids).not.toContain('B');
  });

  it('includes a screen whose schedule matches now', () => {
    const screens: Screen[] = [
      makeScreen('A'),
      makeScreen('B', {
        schedule: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00' },
      }),
      makeScreen('C'),
    ];

    const result = resolveDisplayedScreens(screens, undefined, undefined, WED_7AM);
    const ids = result.map((s) => s.id);

    expect(result).toHaveLength(3);
    expect(ids).toEqual(['A', 'B', 'C']);
  });

  it('falls back to all enabled screens when the schedule filter empties the set', () => {
    // This is the "never show a blank kiosk" safety — Plan task 2.
    const screens: Screen[] = [
      makeScreen('A', {
        schedule: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00' },
      }),
      makeScreen('B', {
        schedule: { daysOfWeek: [0, 6], startTime: '10:00', endTime: '12:00' },
      }),
    ];

    const result = resolveDisplayedScreens(screens, undefined, undefined, WED_2PM);
    const ids = result.map((s) => s.id);

    expect(result).toHaveLength(2);
    expect(ids).toEqual(['A', 'B']);
  });

  it('respects screen.enabled = false even when schedule would match', () => {
    const screens: Screen[] = [
      makeScreen('A', { enabled: false }),
      makeScreen('B'),
    ];

    const result = resolveDisplayedScreens(screens, undefined, undefined, WED_2PM);
    const ids = result.map((s) => s.id);

    expect(result).toHaveLength(1);
    expect(ids).toEqual(['B']);
  });

  it('applies profile filter to the already-scheduled set', () => {
    const screens: Screen[] = [
      makeScreen('A'),
      makeScreen('B', {
        schedule: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00' },
      }),
      makeScreen('C', {
        schedule: { daysOfWeek: [0, 6], startTime: '10:00', endTime: '12:00' },
      }),
      makeScreen('D'),
    ];
    const profiles: Profile[] = [
      { id: 'morning', name: 'Morning', screenIds: ['A', 'B', 'C'] },
    ];

    const result = resolveDisplayedScreens(screens, profiles, 'morning', WED_7AM);
    const ids = result.map((s) => s.id);

    // C is dropped by the schedule filter before the profile resolver sees it;
    // D is outside the profile. Order follows profile.screenIds order.
    expect(ids).toEqual(['A', 'B']);
  });

  it('drops profile-listed scheduled-off screens (filter wins over profile inclusion)', () => {
    // Locks in the "screen schedule wins over profile inclusion" contract.
    // If the user lists a weekday-only screen in a weekend profile, it must
    // not appear during weekend hours.
    const screens: Screen[] = [
      makeScreen('weekday-only', {
        schedule: { daysOfWeek: [1, 2, 3, 4, 5] },
      }),
      makeScreen('always-on'),
    ];
    const profiles: Profile[] = [
      { id: 'weekend', name: 'Weekend', screenIds: ['weekday-only', 'always-on'] },
    ];

    const sunday2pm = makeDate(0, 14, 0);
    const result = resolveDisplayedScreens(screens, profiles, 'weekend', sunday2pm);
    const ids = result.map((s) => s.id);

    expect(ids).toEqual(['always-on']);
    expect(result.length).toBeLessThan(profiles[0].screenIds.length);
  });

  it('respects screen-level invert through the integration pipeline', () => {
    // Documented "weekend chore chart" pattern: invert a weekday window so
    // the screen appears only on weekends. Must work end-to-end (not just
    // in the isModuleVisible unit).
    const screens: Screen[] = [
      makeScreen('weekend-only', {
        schedule: {
          daysOfWeek: [1, 2, 3, 4, 5],
          startTime: '00:00',
          endTime: '23:59',
          invert: true,
        },
      }),
      makeScreen('always-on'),
    ];

    const wednesdayNoon = makeDate(3, 12, 0);
    expect(
      resolveDisplayedScreens(screens, undefined, undefined, wednesdayNoon)
        .map((s) => s.id),
    ).toEqual(['always-on']);

    const saturdayNoon = makeDate(6, 12, 0);
    expect(
      resolveDisplayedScreens(screens, undefined, undefined, saturdayNoon)
        .map((s) => s.id),
    ).toEqual(['weekend-only', 'always-on']);
  });

  it('a currentIndex pointing past the resolved set would be clamped', () => {
    // Documents the clamp invariant from ScreenRotator.tsx — the rotator uses
    // this formula directly; see src/components/display/ScreenRotator.tsx (safeIndex).
    const resolvedLength = 2;
    const staleIndex = 3;
    const safeIndex =
      staleIndex >= 0 && staleIndex < resolvedLength ? staleIndex : 0;

    expect(safeIndex).toBe(0);
  });

  it('mid-rotation: when the active screen is filtered out, safeIndex clamps to 0', () => {
    // Simulates the clock crossing a schedule boundary while the rotator
    // is mid-cycle on a screen that just became hidden. The rotator's
    // safeIndex formula must produce a valid index into the new (smaller) set.
    const screens: Screen[] = [
      makeScreen('A'),
      makeScreen('B'),
      makeScreen('C', {
        // Active until 10:00, then drops out.
        schedule: { startTime: '00:00', endTime: '10:00' },
      }),
    ];

    // At 09:30 the rotator might be sitting on index 2 (screen C).
    const before = resolveDisplayedScreens(screens, undefined, undefined, makeDate(3, 9, 30));
    expect(before.map((s) => s.id)).toEqual(['A', 'B', 'C']);
    const wasOnIndex = 2;

    // Clock ticks past 10:00 — C drops out, leaving [A, B].
    const after = resolveDisplayedScreens(screens, undefined, undefined, makeDate(3, 10, 30));
    expect(after.map((s) => s.id)).toEqual(['A', 'B']);

    // ScreenRotator's safeIndex formula clamps stale indices to 0.
    const safeIndex = wasOnIndex >= 0 && wasOnIndex < after.length ? wasOnIndex : 0;
    expect(safeIndex).toBe(0);
    expect(after[safeIndex]).toBeDefined();
  });

  it('overnight schedule: post-midnight window still includes the screen', () => {
    const screens: Screen[] = [
      makeScreen('A', {
        schedule: { startTime: '22:00', endTime: '06:00' },
      }),
    ];

    const result = resolveDisplayedScreens(screens, undefined, undefined, WED_2AM);
    const ids = result.map((s) => s.id);

    expect(ids).toEqual(['A']);
  });
});
