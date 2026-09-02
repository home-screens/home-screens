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
  it('is null with no keys or no report', () => {
    expect(agreedValue([], { kitchen: 50 })).toBeNull();
    expect(agreedValue(['kitchen'], {})).toBeNull();
  });

  it('is the single reported value', () => {
    expect(agreedValue(['kitchen'], { kitchen: 40 })).toBe(40);
  });

  it('is the shared value when every display agrees, null when they disagree or one is missing', () => {
    expect(agreedValue(['kitchen', 'hallway'], { kitchen: 40, hallway: 40 })).toBe(40);
    expect(agreedValue(['kitchen', 'hallway'], { kitchen: 40, hallway: 90 })).toBeNull();
    expect(agreedValue(['kitchen', 'hallway'], { kitchen: 40 })).toBeNull();
  });
});
