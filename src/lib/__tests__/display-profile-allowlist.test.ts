import { describe, it, expect } from 'vitest';
import { collapseAllowlist } from '../display-profile-allowlist';

/**
 * Pure-function tests for the per-display profile allowlist collapse
 * helper. This exists specifically to pin the "user unchecks everything"
 * softlock fix — the original ProfileSubtab only collapsed the all-on
 * case to `undefined`, so toggling every profile off silently persisted
 * `profileIds: []`, which `getDisplayProfiles` in `display-filter.ts`
 * returns as an empty array, leaving the display unable to pick any
 * profile.
 */

describe('collapseAllowlist', () => {
  it('returns undefined when the next set is empty (softlock guard)', () => {
    // This is the load-bearing case — previously the handler stored
    // `[]` and the display ended up with no selectable profiles.
    expect(collapseAllowlist([], 3)).toBeUndefined();
  });

  it('returns undefined when the next set contains every profile in the pool', () => {
    // "Allowlist contains everything" is semantically identical to
    // "no allowlist," so we prefer the shorter on-disk shape.
    expect(collapseAllowlist(['a', 'b', 'c'], 3)).toBeUndefined();
  });

  it('returns a copy of the next set for a real subset', () => {
    const next = ['a', 'c'];
    const result = collapseAllowlist(next, 3);
    expect(result).toEqual(['a', 'c']);
    // Should be a defensive copy, not the same reference — otherwise a
    // caller that mutates `next` afterwards would silently corrupt the
    // stored allowlist.
    expect(result).not.toBe(next);
  });

  it('returns undefined for both empty collapse cases when pool is empty', () => {
    // Edge case: a display whose parent config has zero profiles.
    // next.length === 0 and poolLength === 0 both fire, but either
    // branch reaches the same `undefined` answer first, so the result
    // is deterministic.
    expect(collapseAllowlist([], 0)).toBeUndefined();
  });

  it('returns a real subset when only one profile in a pool of many is checked', () => {
    // This is the case the old handler also got right; pinning it so
    // a future refactor doesn't regress the "normal" path while
    // fixing the softlock.
    expect(collapseAllowlist(['a'], 4)).toEqual(['a']);
  });
});
