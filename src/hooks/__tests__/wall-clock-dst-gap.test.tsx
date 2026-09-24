// @vitest-environment jsdom

/**
 * Schedule, sleep, profile and `time` condition checks must read the
 * household's wall clock even for the hour the evaluating machine's own zone
 * skips. On 2026-03-08 Chicago springs forward at 02:00 local, while London
 * (still on GMT) reads 02:30 at 02:30 UTC. A Chicago laptop editing a London
 * household used to rebuild that reading as a local Date, which Chicago has no
 * 02:30 for, so every check saw 03:30: a module scheduled to end at 03:00 read
 * as "waiting" an hour early.
 *
 * Run under `TZ=America/Chicago` to exercise the gap; every other zone must
 * give the same answers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Profile, Screen, VisibilityCondition } from '@/types/config';
import { useWallClock } from '@/hooks/useTZClock';
import { useConditionClock } from '@/hooks/useConditionClock';
import { isInScheduleWindow } from '@/hooks/useSleepManager';
import { isModuleVisible, resolveProfileScreens } from '@/lib/schedule';
import { conditionsVerdict } from '@/lib/condition-verdicts';
import { evaluateRuleCondition } from '@/lib/display-rules';
import { wallClockParts } from '@/lib/timezone';

const LONDON = 'Europe/London';
// 02:30 GMT in London, which falls in Chicago's skipped hour that night.
const GAP_INSTANT = new Date('2026-03-08T02:30:00Z');

const beforeThree = { daysOfWeek: [0], startTime: '00:00', endTime: '03:00' };
const timeCondition: VisibilityCondition = { kind: 'time', ...beforeThree };

describe('wall clock inside the machine zone’s spring-forward gap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(GAP_INSTANT);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the household day and minute straight from the zone', () => {
    expect(wallClockParts(GAP_INSTANT, LONDON)).toEqual({ dayOfWeek: 0, minuteOfDay: 150, isoDate: '2026-03-08' });
    // Chicago itself is still on Saturday evening, CST.
    expect(wallClockParts(GAP_INSTANT, 'America/Chicago')).toEqual({ dayOfWeek: 6, minuteOfDay: 20 * 60 + 30, isoDate: '2026-03-07' });
  });

  it('keeps a module scheduled until 03:00 showing at 02:30', () => {
    const { result } = renderHook(() => useWallClock(LONDON));
    expect(result.current.minuteOfDay).toBe(150);
    expect(isModuleVisible(beforeThree, result.current)).toBe(true);
  });

  it('meets a time condition in the editor verdict chip', () => {
    const { result } = renderHook(() => useConditionClock([timeCondition], LONDON));
    expect(conditionsVerdict([timeCondition], new Map(), result.current)).toBe('met');
  });

  it('keeps a sleep window open and a rule true', () => {
    const now = wallClockParts(new Date(), LONDON);
    expect(isInScheduleWindow({ startTime: '01:00', endTime: '03:00' }, new Date(), LONDON)).toBe(true);
    expect(
      evaluateRuleCondition(
        { id: 'r', name: 'r', when: [timeCondition], action: { kind: 'wake' } },
        new Map(),
        now,
      ),
    ).toBe(true);
  });

  it('keeps the scheduled profile active', () => {
    const screens = [{ id: 'night' }, { id: 'day' }] as Screen[];
    const profiles: Profile[] = [{ id: 'p', name: 'Night', screenIds: ['night'], schedule: beforeThree }];
    const { result } = renderHook(() => useWallClock(LONDON));
    expect(resolveProfileScreens(screens, profiles, undefined, result.current).map((s) => s.id)).toEqual(['night']);
  });
});
