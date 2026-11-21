import { describe, it, expect } from 'vitest';
import { recipeWallTarget, resolveTimerTargets } from '../display-target';

describe('resolveTimerTargets', () => {
  const displays = [
    { id: 'main', name: 'Main' },
    { id: 'kitchen', name: 'Kitchen' },
  ];

  it('broadcasts to all when nothing is selected', () => {
    expect(resolveTimerTargets([], displays)).toBe('all');
  });

  it('returns a partial selection as ids', () => {
    expect(resolveTimerTargets(['kitchen'], displays)).toEqual(['kitchen']);
  });

  it('collapses a full selection to all', () => {
    // 'all' rather than an enumerated list: the displays array is a
    // page-load snapshot, so the broadcast keyword also covers displays
    // adopted after the page loaded, and the running card gets the
    // translated "On all displays" label.
    expect(resolveTimerTargets(['kitchen', 'main'], displays)).toBe('all');
  });

  it('passes unknown ids through untouched', () => {
    // Ids are not validated against the registry (a display deleted while
    // /remote is open can still be addressed; the session then matches no
    // display, which is harmless). This pins that the resolver does not
    // silently rewrite the user's selection.
    expect(resolveTimerTargets(['gone'], displays)).toEqual(['gone']);
  });

  it('broadcasts in single-display mode regardless of selection', () => {
    expect(resolveTimerTargets(['anything'], [])).toBe('all');
  });
});

describe('recipeWallTarget', () => {
  const two = [{ id: 'main' }, { id: 'kitchen' }];

  it('sends to the wall picked at the top of the remote', () => {
    expect(recipeWallTarget('kitchen', two, 'main')).toBe('kitchen');
  });

  it('keeps a single-display home and a home with one wall as they were', () => {
    expect(recipeWallTarget(undefined, [], null)).toBeUndefined();
    expect(recipeWallTarget('all', [{ id: 'main' }], null)).toBe('all');
  });

  it('with All and two walls, sends to the wall this phone chose for recipes', () => {
    expect(recipeWallTarget('all', two, 'kitchen')).toBe('kitchen');
  });

  it('with All and two walls, asks when nothing is remembered or the wall is gone', () => {
    expect(recipeWallTarget('all', two, null)).toBeNull();
    expect(recipeWallTarget('all', two, 'garage')).toBeNull();
  });
});
