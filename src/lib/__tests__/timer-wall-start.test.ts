import { describe, it, expect } from 'vitest';
import { QUICK_TIMER_PRESETS_SEC, routineTotalSec, wallTimerTargets } from '@/lib/timer-logic';

describe('starting a timer from the wall', () => {
  it('shows it on the display it was started on when the hub lists its displays', () => {
    expect(wallTimerTargets('kitchen', true)).toEqual(['kitchen']);
  });

  it('shows it everywhere on a hub with one display, or a display with no id of its own', () => {
    expect(wallTimerTargets(undefined, false)).toBe('all');
    expect(wallTimerTargets('main', false)).toBe('all');
    expect(wallTimerTargets(undefined, true)).toBe('all');
  });

  it('offers the phone\'s six quick lengths, shortest first', () => {
    expect([...QUICK_TIMER_PRESETS_SEC]).toEqual([30, 60, 120, 300, 600, 900]);
  });

  it('adds up a routine\'s steps', () => {
    expect(routineTotalSec({ steps: [] })).toBe(0);
    expect(routineTotalSec({
      steps: [
        { id: 'a', label: 'A', icon: '⏱️', durationSec: 90 },
        { id: 'b', label: 'B', icon: '⏱️', durationSec: 30, waitForTap: true },
      ],
    })).toBe(120);
  });
});
