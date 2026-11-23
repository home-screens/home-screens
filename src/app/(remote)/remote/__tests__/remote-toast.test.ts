import { describe, expect, it } from 'vitest';
import { holdToastAtTop, toastHeldAtTop, toastPlacement } from '../remote-toast';

/**
 * Where the phone's toast sits. Above the tab bar it lands on an open
 * sheet's own rows (the meal sheet's serving time), and its Undo button then
 * takes the tap meant for the row under it.
 */
describe('toastPlacement', () => {
  it('sits above the tab bar while nothing is over the page', () => {
    expect(toastPlacement({ floor: null, heldAtTop: false, raisedBy: 0 }))
      .toEqual({ bottom: 'calc(5.75rem + 0px + env(safe-area-inset-bottom))' });
  });

  it('rises with a tab’s own pinned bar', () => {
    expect(toastPlacement({ floor: null, heldAtTop: false, raisedBy: 64 }))
      .toEqual({ bottom: 'calc(5.75rem + 64px + env(safe-area-inset-bottom))' });
  });

  it('goes to the top of the screen while a sheet holds it there, whatever bar the tab pins', () => {
    const top = { top: 'calc(env(safe-area-inset-top, 0px) + 12px)' };
    expect(toastPlacement({ floor: null, heldAtTop: true, raisedBy: 0 })).toEqual(top);
    expect(toastPlacement({ floor: null, heldAtTop: true, raisedBy: 64 })).toEqual(top);
  });

  it('stays just above the photo viewer’s panel, held or not', () => {
    expect(toastPlacement({ floor: 180, heldAtTop: false, raisedBy: 0 })).toEqual({ bottom: '192px' });
    expect(toastPlacement({ floor: 180, heldAtTop: true, raisedBy: 0 })).toEqual({ bottom: '192px' });
  });
});

describe('holdToastAtTop', () => {
  it('holds while any sheet still does, and lets go with the last one', () => {
    expect(toastHeldAtTop()).toBe(false);
    const mealSheet = holdToastAtTop();
    const picker = holdToastAtTop();
    expect(toastHeldAtTop()).toBe(true);
    picker();
    expect(toastHeldAtTop()).toBe(true);
    mealSheet();
    expect(toastHeldAtTop()).toBe(false);
  });

  it('counts a sheet’s release once, however often it is called', () => {
    const first = holdToastAtTop();
    const second = holdToastAtTop();
    first();
    first();
    expect(toastHeldAtTop()).toBe(true);
    second();
    expect(toastHeldAtTop()).toBe(false);
  });
});
