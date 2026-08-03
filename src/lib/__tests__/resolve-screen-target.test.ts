import { describe, it, expect } from 'vitest';
import { resolveScreenTargetIndex } from '../resolve-screen-target';

const screens = [
  { id: 'screen-1', name: 'Calendar' },
  { id: 'screen-2', name: 'Photo Wall' },
  { id: 'screen-3', name: 'calendar' },
];

describe('resolveScreenTargetIndex', () => {
  it('matches an exact screen id', () => {
    expect(resolveScreenTargetIndex(screens, 'screen-2')).toBe(1);
  });

  it('matches a name case-insensitively', () => {
    expect(resolveScreenTargetIndex(screens, 'photo wall')).toBe(1);
    expect(resolveScreenTargetIndex(screens, 'PHOTO WALL')).toBe(1);
  });

  it('trims surrounding whitespace on the target and the screen name', () => {
    expect(resolveScreenTargetIndex(screens, '  Photo Wall  ')).toBe(1);
    expect(
      resolveScreenTargetIndex([{ id: 'x', name: '  Spaced  ' }], 'spaced'),
    ).toBe(0);
  });

  it('prefers an id match over a name match', () => {
    // 'screen-3' is both an id and could shadow a name — id wins.
    expect(
      resolveScreenTargetIndex(
        [
          { id: 'a', name: 'screen-3' },
          { id: 'screen-3', name: 'Other' },
        ],
        'screen-3',
      ),
    ).toBe(1);
  });

  it('id matching is case-sensitive; the name fallback then applies', () => {
    // 'SCREEN-1' is not an id match (ids are exact) but also not a name match.
    expect(resolveScreenTargetIndex(screens, 'SCREEN-1')).toBe(-1);
  });

  it('returns the first name match in rotation order for duplicate names', () => {
    expect(resolveScreenTargetIndex(screens, 'Calendar')).toBe(0);
  });

  it('returns -1 for an unknown target', () => {
    expect(resolveScreenTargetIndex(screens, 'garage')).toBe(-1);
  });

  it('returns -1 for an empty or whitespace-only target', () => {
    expect(resolveScreenTargetIndex(screens, '')).toBe(-1);
    expect(resolveScreenTargetIndex(screens, '   ')).toBe(-1);
  });

  it('returns -1 against an empty screen list', () => {
    expect(resolveScreenTargetIndex([], 'Calendar')).toBe(-1);
  });
});
