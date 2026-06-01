import { describe, it, expect } from 'vitest';
import { isModuleEnabled, isModuleVisible, resolveProfileScreens } from '../schedule';
import type { ModuleInstance, Screen, Profile } from '@/types/config';

// Helper: create a Date for a specific day/time
// day: 0=Sun, 1=Mon, ... 6=Sat
function makeDate(day: number, hours: number, minutes: number): Date {
  // 2026-03-08 is a Sunday (day 0)
  const d = new Date(2026, 2, 8 + day, hours, minutes);
  return d;
}

describe('isModuleVisible', () => {
  it('returns true when no schedule is set', () => {
    expect(isModuleVisible(undefined, new Date())).toBe(true);
  });

  it('returns true when schedule is empty object', () => {
    expect(isModuleVisible({}, new Date())).toBe(true);
  });

  // Day-of-week filtering
  describe('daysOfWeek', () => {
    it('shows module on matching day', () => {
      const monday = makeDate(1, 12, 0);
      expect(isModuleVisible({ daysOfWeek: [1, 2, 3, 4, 5] }, monday)).toBe(true);
    });

    it('hides module on non-matching day', () => {
      const sunday = makeDate(0, 12, 0);
      expect(isModuleVisible({ daysOfWeek: [1, 2, 3, 4, 5] }, sunday)).toBe(false);
    });

    it('treats empty daysOfWeek as every day', () => {
      const sunday = makeDate(0, 12, 0);
      expect(isModuleVisible({ daysOfWeek: [] }, sunday)).toBe(true);
    });
  });

  // Time window filtering
  describe('time window', () => {
    it('shows module within time window', () => {
      const at7am = makeDate(1, 7, 0);
      expect(isModuleVisible({ startTime: '06:00', endTime: '09:00' }, at7am)).toBe(true);
    });

    it('hides module outside time window', () => {
      const at10am = makeDate(1, 10, 0);
      expect(isModuleVisible({ startTime: '06:00', endTime: '09:00' }, at10am)).toBe(false);
    });

    it('endTime is exclusive', () => {
      const at9am = makeDate(1, 9, 0);
      expect(isModuleVisible({ startTime: '06:00', endTime: '09:00' }, at9am)).toBe(false);
    });

    it('handles startTime only (until end of day)', () => {
      const at11pm = makeDate(1, 23, 0);
      expect(isModuleVisible({ startTime: '18:00' }, at11pm)).toBe(true);

      const at5am = makeDate(1, 5, 0);
      expect(isModuleVisible({ startTime: '18:00' }, at5am)).toBe(false);
    });

    it('handles endTime only (from midnight)', () => {
      const at5am = makeDate(1, 5, 0);
      expect(isModuleVisible({ endTime: '09:00' }, at5am)).toBe(true);

      const at10am = makeDate(1, 10, 0);
      expect(isModuleVisible({ endTime: '09:00' }, at10am)).toBe(false);
    });

    it('handles overnight window (e.g., 22:00-06:00)', () => {
      const at11pm = makeDate(1, 23, 0);
      const at2am = makeDate(2, 2, 0);
      const at10am = makeDate(1, 10, 0);

      const schedule = { startTime: '22:00', endTime: '06:00' };
      expect(isModuleVisible(schedule, at11pm)).toBe(true);
      expect(isModuleVisible(schedule, at2am)).toBe(true);
      expect(isModuleVisible(schedule, at10am)).toBe(false);
    });
  });

  // Combined day + time
  describe('day + time combined', () => {
    it('requires both day and time to match', () => {
      const mondayAt7am = makeDate(1, 7, 0);
      const sundayAt7am = makeDate(0, 7, 0);
      const mondayAt10am = makeDate(1, 10, 0);

      const schedule = { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00' };
      expect(isModuleVisible(schedule, mondayAt7am)).toBe(true);
      expect(isModuleVisible(schedule, sundayAt7am)).toBe(false);
      expect(isModuleVisible(schedule, mondayAt10am)).toBe(false);
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('startTime is inclusive', () => {
      const atExact6am = makeDate(1, 6, 0);
      expect(isModuleVisible({ startTime: '06:00', endTime: '09:00' }, atExact6am)).toBe(true);
    });

    it('handles Saturday (day 6)', () => {
      const saturday = makeDate(6, 12, 0);
      expect(isModuleVisible({ daysOfWeek: [6] }, saturday)).toBe(true);
      expect(isModuleVisible({ daysOfWeek: [0, 1, 2, 3, 4, 5] }, saturday)).toBe(false);
    });

    it('equal start and end time produces zero-width window (always hidden)', () => {
      const at6am = makeDate(1, 6, 0);
      const at12pm = makeDate(1, 12, 0);
      expect(isModuleVisible({ startTime: '06:00', endTime: '06:00' }, at6am)).toBe(false);
      expect(isModuleVisible({ startTime: '06:00', endTime: '06:00' }, at12pm)).toBe(false);
    });

    it('rejects out-of-range times (treats as no constraint)', () => {
      const at12pm = makeDate(1, 12, 0);
      // Invalid times should be parsed as null, falling back to defaults
      expect(isModuleVisible({ startTime: '25:00', endTime: '09:00' }, at12pm)).toBe(false);
      expect(isModuleVisible({ startTime: '06:00', endTime: '25:00' }, at12pm)).toBe(true);
    });

    it('invert with no constraints hides always', () => {
      expect(isModuleVisible({ invert: true }, makeDate(1, 12, 0))).toBe(false);
      expect(isModuleVisible({ invert: true }, makeDate(0, 0, 0))).toBe(false);
    });

    it('overnight window + daysOfWeek uses previous day for post-midnight portion', () => {
      // Saturday-only schedule with overnight window 22:00–06:00
      // At Saturday 23:00 → day=6 matches, time matches → visible
      const saturdayAt11pm = makeDate(6, 23, 0);
      const schedule = { daysOfWeek: [6], startTime: '22:00', endTime: '06:00' };
      expect(isModuleVisible(schedule, saturdayAt11pm)).toBe(true);

      // At Sunday 02:00 → post-midnight portion of overnight window,
      // so we check yesterday (Saturday=6) which IS in daysOfWeek → visible
      const sundayAt2am = makeDate(0, 2, 0);
      expect(isModuleVisible(schedule, sundayAt2am)).toBe(true);

      // At Sunday 10:00 → not in time window at all → not visible
      const sundayAt10am = makeDate(0, 10, 0);
      expect(isModuleVisible(schedule, sundayAt10am)).toBe(false);

      // At Friday 23:00 → day=5 not in [6], time matches but day doesn't → not visible
      const fridayAt11pm = makeDate(5, 23, 0);
      expect(isModuleVisible(schedule, fridayAt11pm)).toBe(false);
    });
  });

  // Invert
  describe('invert', () => {
    it('hides module during window when inverted', () => {
      const mondayAt7am = makeDate(1, 7, 0);
      const schedule = { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00', invert: true };
      expect(isModuleVisible(schedule, mondayAt7am)).toBe(false);
    });

    it('shows module outside window when inverted', () => {
      const mondayAt10am = makeDate(1, 10, 0);
      const schedule = { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00', invert: true };
      expect(isModuleVisible(schedule, mondayAt10am)).toBe(true);
    });

    it('shows module on non-matching day when inverted', () => {
      const sundayAt7am = makeDate(0, 7, 0);
      const schedule = { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00', invert: true };
      expect(isModuleVisible(schedule, sundayAt7am)).toBe(true);
    });
  });
});

describe('isModuleEnabled', () => {
  const baseMod: ModuleInstance = {
    id: 'm1',
    type: 'clock',
    position: { x: 0, y: 0 },
    size: { w: 100, h: 100 },
    zIndex: 0,
    config: {},
    style: {
      opacity: 1, borderRadius: 0, padding: 0,
      backgroundColor: '#000', textColor: '#fff', fontFamily: 'sans',
      fontSize: 16, backdropBlur: 0, borderWidth: 0, borderColor: '#000', shadowSize: 0,
    },
  };

  it('treats omitted enabled as on', () => {
    expect(isModuleEnabled(baseMod)).toBe(true);
  });

  it('treats enabled: true as on', () => {
    expect(isModuleEnabled({ ...baseMod, enabled: true })).toBe(true);
  });

  it('treats enabled: false as off', () => {
    expect(isModuleEnabled({ ...baseMod, enabled: false })).toBe(false);
  });
});

// ── resolveProfileScreens ──────────────────────────────────────

function makeScreen(id: string, name?: string): Screen {
  return { id, name: name ?? id, backgroundImage: '', modules: [] };
}

describe('resolveProfileScreens', () => {
  const screenA = makeScreen('a', 'Screen A');
  const screenB = makeScreen('b', 'Screen B');
  const screenC = makeScreen('c', 'Screen C');
  const allScreens = [screenA, screenB, screenC];

  it('returns all screens when no profiles exist', () => {
    expect(resolveProfileScreens(allScreens, undefined, undefined, new Date())).toEqual(allScreens);
    expect(resolveProfileScreens(allScreens, [], undefined, new Date())).toEqual(allScreens);
  });

  it('returns all screens when profiles exist but none active', () => {
    const profiles: Profile[] = [{ id: 'p1', name: 'Morning', screenIds: ['a'] }];
    expect(resolveProfileScreens(allScreens, profiles, undefined, new Date())).toEqual(allScreens);
  });

  it('filters screens by manually active profile', () => {
    const profiles: Profile[] = [{ id: 'p1', name: 'Morning', screenIds: ['a', 'c'] }];
    const result = resolveProfileScreens(allScreens, profiles, 'p1', new Date());
    expect(result).toEqual([screenA, screenC]);
  });

  it('falls back to all screens if active profile references invalid ID', () => {
    const profiles: Profile[] = [{ id: 'p1', name: 'Morning', screenIds: ['a'] }];
    expect(resolveProfileScreens(allScreens, profiles, 'nonexistent', new Date())).toEqual(allScreens);
  });

  it('falls back to all screens if profile has empty screenIds', () => {
    const profiles: Profile[] = [{ id: 'p1', name: 'Empty', screenIds: [] }];
    expect(resolveProfileScreens(allScreens, profiles, 'p1', new Date())).toEqual(allScreens);
  });

  it('falls back to all screens if profile references only nonexistent screens', () => {
    const profiles: Profile[] = [{ id: 'p1', name: 'Bad', screenIds: ['x', 'y'] }];
    expect(resolveProfileScreens(allScreens, profiles, 'p1', new Date())).toEqual(allScreens);
  });

  it('scheduled profile takes priority over manually active profile', () => {
    const mondayAt7am = makeDate(1, 7, 0);
    const profiles: Profile[] = [
      { id: 'morning', name: 'Morning', screenIds: ['a'], schedule: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00' } },
      { id: 'default', name: 'Default', screenIds: ['b', 'c'] },
    ];
    const result = resolveProfileScreens(allScreens, profiles, 'default', mondayAt7am);
    expect(result).toEqual([screenA]);
  });

  it('falls back to active profile when scheduled profile does not match', () => {
    const mondayAt10am = makeDate(1, 10, 0);
    const profiles: Profile[] = [
      { id: 'morning', name: 'Morning', screenIds: ['a'], schedule: { daysOfWeek: [1, 2, 3, 4, 5], startTime: '06:00', endTime: '09:00' } },
      { id: 'default', name: 'Default', screenIds: ['b', 'c'] },
    ];
    const result = resolveProfileScreens(allScreens, profiles, 'default', mondayAt10am);
    expect(result).toEqual([screenB, screenC]);
  });

  it('first matching scheduled profile wins', () => {
    const mondayAt7am = makeDate(1, 7, 0);
    const profiles: Profile[] = [
      { id: 'early', name: 'Early', screenIds: ['a'], schedule: { startTime: '06:00', endTime: '08:00' } },
      { id: 'morning', name: 'Morning', screenIds: ['b'], schedule: { startTime: '06:00', endTime: '10:00' } },
    ];
    const result = resolveProfileScreens(allScreens, profiles, undefined, mondayAt7am);
    expect(result).toEqual([screenA]);
  });

  it('respects profile screenIds order', () => {
    const profiles: Profile[] = [{ id: 'p1', name: 'Reversed', screenIds: ['c', 'a'] }];
    const result = resolveProfileScreens(allScreens, profiles, 'p1', new Date());
    // Order follows profile's screenIds (c, a), not allScreens (a, c)
    expect(result).toEqual([screenC, screenA]);
  });

  it('ignores profiles without schedule for auto-activation', () => {
    const profiles: Profile[] = [
      { id: 'p1', name: 'No Schedule', screenIds: ['a'] },
      { id: 'p2', name: 'Has Schedule', screenIds: ['b'], schedule: { startTime: '06:00', endTime: '09:00' } },
    ];
    const mondayAt7am = makeDate(1, 7, 0);
    const result = resolveProfileScreens(allScreens, profiles, undefined, mondayAt7am);
    expect(result).toEqual([screenB]);
  });

  it('scheduled profile with stale screens falls through to active profile', () => {
    const mondayAt7am = makeDate(1, 7, 0);
    const profiles: Profile[] = [
      { id: 'stale', name: 'Stale', screenIds: ['x', 'y'], schedule: { startTime: '06:00', endTime: '09:00' } },
      { id: 'fallback', name: 'Fallback', screenIds: ['b'] },
    ];
    // Schedule matches but all screenIds are gone → falls through to manual active
    const result = resolveProfileScreens(allScreens, profiles, 'fallback', mondayAt7am);
    expect(result).toEqual([screenB]);
  });

  it('first scheduled profile stale falls through to second scheduled profile', () => {
    const mondayAt7am = makeDate(1, 7, 0);
    const profiles: Profile[] = [
      { id: 'stale-sched', name: 'Stale Scheduled', screenIds: ['x'], schedule: { startTime: '06:00', endTime: '09:00' } },
      { id: 'valid-sched', name: 'Valid Scheduled', screenIds: ['b'], schedule: { startTime: '06:00', endTime: '10:00' } },
    ];
    // First schedule matches but screens are stale → falls through to second scheduled profile
    const result = resolveProfileScreens(allScreens, profiles, undefined, mondayAt7am);
    expect(result).toEqual([screenB]);
  });

  it('all profiles stale falls back to all screens', () => {
    const mondayAt7am = makeDate(1, 7, 0);
    const profiles: Profile[] = [
      { id: 'stale', name: 'Stale', screenIds: ['x'], schedule: { startTime: '06:00', endTime: '09:00' } },
      { id: 'also-stale', name: 'Also Stale', screenIds: ['y', 'z'] },
    ];
    const result = resolveProfileScreens(allScreens, profiles, 'also-stale', mondayAt7am);
    expect(result).toEqual(allScreens);
  });

  it('overnight scheduled profile stays active past midnight', () => {
    // Friday-only profile scheduled 22:00–06:00
    const profiles: Profile[] = [
      { id: 'night', name: 'Night', screenIds: ['a'], schedule: { daysOfWeek: [5], startTime: '22:00', endTime: '06:00' } },
    ];
    // Saturday 02:00 — post-midnight portion uses Friday (day 5) → matches
    const saturdayAt2am = makeDate(6, 2, 0);
    expect(resolveProfileScreens(allScreens, profiles, undefined, saturdayAt2am)).toEqual([screenA]);

    // Saturday 10:00 — outside time window entirely
    const saturdayAt10am = makeDate(6, 10, 0);
    expect(resolveProfileScreens(allScreens, profiles, undefined, saturdayAt10am)).toEqual(allScreens);
  });
});
