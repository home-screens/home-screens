import { describe, it, expect } from 'vitest';
import { targetKeys, agreedValue, LEGACY_KEY } from '../useTargetBrightness';

const displays = [
  { id: 'kitchen', name: 'Kitchen' },
  { id: 'hallway', name: 'Hallway' },
];

describe('targetKeys', () => {
  it('reads the legacy heartbeat when no displays are registered', () => {
    expect(targetKeys(undefined, undefined, [])).toEqual([LEGACY_KEY]);
    expect(targetKeys('all', undefined, [])).toEqual([LEGACY_KEY]);
  });

  it("reads every display for 'all'", () => {
    expect(targetKeys('all', 'kitchen', displays)).toEqual(['kitchen', 'hallway']);
  });

  it('reads the chosen display, or this display when the target is unresolved', () => {
    expect(targetKeys('hallway', 'kitchen', displays)).toEqual(['hallway']);
    expect(targetKeys(undefined, 'kitchen', displays)).toEqual(['kitchen']);
  });

  it('reads nothing when this display is unknown (editor preview)', () => {
    expect(targetKeys(undefined, undefined, displays)).toEqual([]);
  });
});

describe('agreedValue', () => {
  const NOW = 1_800_000_000_000;
  const live = (brightness?: number) => ({ brightness, lastSeen: NOW - 2_000 });

  it('is null with no keys or no report', () => {
    expect(agreedValue([], { kitchen: live(50) })).toBeNull();
    expect(agreedValue(['kitchen'], {})).toBeNull();
  });

  it('is the single reported value', () => {
    expect(agreedValue(['kitchen'], { kitchen: live(40) })).toBe(40);
  });

  it('is the shared value when every display agrees, null when they disagree', () => {
    expect(agreedValue(['kitchen', 'hallway'], { kitchen: live(40), hallway: live(40) })).toBe(40);
    expect(agreedValue(['kitchen', 'hallway'], { kitchen: live(40), hallway: live(90) })).toBeNull();
  });

  it('leaves out a display that stopped answering, as the phone does', () => {
    // Hallway is unplugged: its last report is minutes old and at another level.
    const hallway = { brightness: 90, lastSeen: NOW - 10 * 60_000 };
    expect(agreedValue(['kitchen', 'hallway'], { kitchen: live(40), hallway })).toBe(40);
    // One that has never checked in, or has not reported a level, does not block either.
    expect(agreedValue(['kitchen', 'hallway'], { kitchen: live(40), hallway: { lastSeen: null } })).toBe(40);
    expect(agreedValue(['kitchen', 'hallway'], { kitchen: live(40), hallway: live() })).toBe(40);
    expect(agreedValue(['kitchen', 'hallway'], { kitchen: live(40) })).toBe(40);
  });

  it('measures silence against the newest heartbeat, not this device\'s clock', () => {
    // A kiosk with a wrong clock still reads its own display's level.
    const long_ago = { brightness: 60, lastSeen: 1_000 };
    expect(agreedValue(['kitchen'], { kitchen: long_ago })).toBe(60);
  });
});
