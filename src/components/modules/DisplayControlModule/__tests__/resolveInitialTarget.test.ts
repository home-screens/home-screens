import { describe, it, expect } from 'vitest';
import { resolveInitialTarget } from '../resolveInitialTarget';

describe('resolveInitialTarget', () => {
  const displays = [
    { id: 'kitchen', name: 'Kitchen' },
    { id: 'hallway', name: 'Hallway' },
  ];

  it("resolves 'self' to the render display id", () => {
    expect(resolveInitialTarget('self', 'kitchen', displays)).toBe('kitchen');
  });

  it("resolves 'self' to undefined when render display id is undefined (legacy)", () => {
    expect(resolveInitialTarget('self', undefined, displays)).toBeUndefined();
  });

  it("returns 'all' as-is", () => {
    expect(resolveInitialTarget('all', 'kitchen', displays)).toBe('all');
  });

  it('returns a known display id as-is', () => {
    expect(resolveInitialTarget('hallway', 'kitchen', displays)).toBe('hallway');
  });

  it("falls back to 'self' when the configured id was removed", () => {
    expect(resolveInitialTarget('bedroom', 'kitchen', displays)).toBe('kitchen');
  });

  it('falls back to undefined when configured id removed and renderDisplayId undefined', () => {
    expect(resolveInitialTarget('bedroom', undefined, displays)).toBeUndefined();
  });

  it('returns undefined when displays list is empty and target is "all"', () => {
    expect(resolveInitialTarget('all', undefined, [])).toBe('all');
  });

  it("never returns the literal 'self' (invariant)", () => {
    const cases: Array<Parameters<typeof resolveInitialTarget>> = [
      ['self', 'kitchen', displays],
      ['self', undefined, displays],
      ['all', 'kitchen', displays],
      ['all', undefined, []],
      ['kitchen', 'hallway', displays],
      ['bedroom', 'kitchen', displays],
      ['bedroom', undefined, displays],
      ['bedroom', undefined, []],
    ];
    for (const args of cases) {
      expect(resolveInitialTarget(...args)).not.toBe('self');
    }
  });
});
