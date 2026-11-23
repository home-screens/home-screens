// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen as dom, cleanup, act, fireEvent } from '@testing-library/react';

/**
 * The phone's Back gesture on an open sheet.
 *
 * Back is the first thing a thumb reaches for to leave a sheet, and it used
 * to unload the whole remote and throw away a typed draft that the sheet's
 * own Cancel would have asked about first. Every /remote form is this one
 * component, so both controls now go through the same discard guard, and the
 * sheet gives its history entry back when it closes so Back keeps working
 * normally afterwards.
 */

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));

import FormOverlay from '../FormOverlay';

/** The Back gesture: pop the entry the sheet pushed, and let jsdom deliver it. */
function pressBack() {
  act(() => { window.history.back(); });
  act(() => { vi.advanceTimersByTime(10); });
}

function sheetOwnsAnEntry(): boolean {
  return Boolean((window.history.state as { hsSheets?: string[] } | null)?.hsSheets?.length);
}

describe('FormOverlay and the Back gesture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // A page behind the sheet, the way /remote is reached on a phone.
    window.history.replaceState(null, '', '/remote?tab=chores');
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('takes a history entry while it is open so Back has something to close', () => {
    expect(sheetOwnsAnEntry()).toBe(false);
    render(<FormOverlay title="Add Chore" onBack={() => {}}><p>form</p></FormOverlay>);
    act(() => { vi.advanceTimersByTime(0); });

    expect(sheetOwnsAnEntry()).toBe(true);
    // And it does not touch the address, so a reload lands on the same tab.
    expect(window.location.search).toBe('?tab=chores');
  });

  it('closes a clean sheet on Back rather than leaving the page', () => {
    const onBack = vi.fn();
    render(<FormOverlay title="Add Chore" onBack={onBack}><p>form</p></FormOverlay>);
    act(() => { vi.advanceTimersByTime(0); });

    pressBack();
    expect(dom.queryByTestId('confirm-sheet')).toBeNull();
    // The sheet animates out first, then hands control back to its owner.
    act(() => { vi.advanceTimersByTime(300); });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(sheetOwnsAnEntry()).toBe(false);
  });

  it('asks before throwing away a draft, the same as its own Cancel', () => {
    const onBack = vi.fn();
    render(<FormOverlay title="Add Chore" dirty onBack={onBack}><p>form</p></FormOverlay>);
    act(() => { vi.advanceTimersByTime(0); });

    pressBack();

    expect(dom.getByTestId('confirm-sheet')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(300); });
    expect(onBack).not.toHaveBeenCalled();
    // The sheet stayed, so its history entry has to stay with it.
    expect(sheetOwnsAnEntry()).toBe(true);
  });

  it('treats Back over the discard prompt as keep editing, and asks again next time', () => {
    const onBack = vi.fn();
    render(<FormOverlay title="Add Chore" dirty onBack={onBack}><p>form</p></FormOverlay>);
    act(() => { vi.advanceTimersByTime(0); });

    pressBack();
    expect(dom.getByTestId('confirm-sheet')).toBeTruthy();

    pressBack();
    expect(dom.queryByTestId('confirm-sheet')).toBeNull();
    expect(dom.getByTestId('form-overlay')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();

    pressBack();
    expect(dom.getByTestId('confirm-sheet')).toBeTruthy();
  });

  it('ignores Back while a save is in flight, exactly as the Back control is disabled', () => {
    const onBack = vi.fn();
    render(<FormOverlay title="Add Chore" backDisabled onBack={onBack}><p>form</p></FormOverlay>);
    act(() => { vi.advanceTimersByTime(0); });

    pressBack();
    act(() => { vi.advanceTimersByTime(300); });

    expect(onBack).not.toHaveBeenCalled();
    expect(dom.getByTestId('form-overlay')).toBeTruthy();
    expect(sheetOwnsAnEntry()).toBe(true);
  });

  it('gives the entry back when it closes through its own control', () => {
    const onBack = vi.fn();
    render(<FormOverlay title="Add Chore" onBack={onBack}><p>form</p></FormOverlay>);
    act(() => { vi.advanceTimersByTime(0); });

    act(() => { fireEvent.click(dom.getByRole('button', { name: /actions.back/ })); });
    act(() => { vi.advanceTimersByTime(300); });

    expect(onBack).toHaveBeenCalledTimes(1);
    // Nothing of ours left on the stack: the next Back belongs to the page.
    expect(sheetOwnsAnEntry()).toBe(false);
  });

  it('gives the entry back when the sheet is dismissed by a save', () => {
    const { unmount } = render(<FormOverlay title="Add Chore" onBack={() => {}}><p>form</p></FormOverlay>);
    act(() => { vi.advanceTimersByTime(0); });
    expect(sheetOwnsAnEntry()).toBe(true);

    act(() => { unmount(); });
    act(() => { vi.advanceTimersByTime(10); });

    expect(sheetOwnsAnEntry()).toBe(false);
  });

  /**
   * A sheet dismissed by its own save asks for its entry back a beat later,
   * which is long enough for something else to have started a navigation in
   * the meantime. Travelling then cancels that navigation, and the phone sits
   * on the old page with nothing to say why: a save followed straight away by
   * a tap that leaves /remote went nowhere.
   */
  it('does not travel once the page is on its way somewhere else', () => {
    const back = vi.spyOn(window.history, 'back');
    const { unmount } = render(<FormOverlay title="Add Chore" onBack={() => {}}><p>form</p></FormOverlay>);
    act(() => { vi.advanceTimersByTime(0); });

    // The browser says the document is leaving, then the save lands.
    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    act(() => { unmount(); });
    act(() => { vi.advanceTimersByTime(10); });

    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
    // A page restored from the back/forward cache is alive again and owns its
    // stack, so the next sheet must travel normally.
    act(() => { window.dispatchEvent(new Event('pageshow')); });
  });
});

/**
 * React mounts, unmounts and remounts every effect a second time in
 * development. That second mount must not leave the sheet with two history
 * entries or a traversal in flight: a release started by the first teardown
 * is still travelling when the second mount runs, and it comes back looking
 * exactly like a person pressing Back. Browsers differ in where such a
 * traversal lands, so the sheet must not depend on where it lands: it closed
 * itself a quarter second after opening in Chromium, and swallowed the first
 * Back in jsdom, from the one root cause.
 *
 * The real double-invocation is what these drive, not an imitation of it.
 */
describe('FormOverlay through React development double-mounting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/remote?tab=chores');
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function renderTwiceMounted(props: { dirty?: boolean; onBack: () => void }) {
    return render(
      <StrictMode>
        <FormOverlay title="Add Chore" {...props}><p>form</p></FormOverlay>
      </StrictMode>,
    );
  }

  it('takes one history entry, not one per mount', () => {
    // Push a fresh top of stack first: that truncates anything an earlier
    // test left ahead of us, so the count below is this sheet's alone.
    window.history.pushState(null, '', '/remote?tab=chores');
    const before = window.history.length;
    renderTwiceMounted({ onBack: () => {} });
    act(() => { vi.advanceTimersByTime(0); });

    expect(window.history.length - before).toBe(1);
    expect(sheetOwnsAnEntry()).toBe(true);
  });

  it('stays open: the remount must not read its own release as a Back', () => {
    const onBack = vi.fn();
    renderTwiceMounted({ onBack });

    // Well past the sheet's own 250ms exit animation.
    act(() => { vi.advanceTimersByTime(1000); });

    expect(dom.getByTestId('form-overlay')).toBeTruthy();
    expect(dom.queryByTestId('confirm-sheet')).toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('starts no history traversal at all, so no browser can deliver one late', () => {
    // The engine-independent half of this. Where a traversal lands when
    // something pushed onto the stack while it was travelling is up to the
    // browser, and Chromium and jsdom answer differently. A remount that
    // travels nowhere cannot be got wrong by either of them.
    const back = vi.spyOn(window.history, 'back');
    const onBack = vi.fn();
    renderTwiceMounted({ onBack });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(back).not.toHaveBeenCalled();

    // And the spy is watching the right thing: closing for real still travels.
    act(() => { fireEvent.click(dom.getByRole('button', { name: /actions.back/ })); });
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('closes on the first Back, not the second', () => {
    const onBack = vi.fn();
    renderTwiceMounted({ onBack });
    act(() => { vi.advanceTimersByTime(0); });

    pressBack();
    act(() => { vi.advanceTimersByTime(300); });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(sheetOwnsAnEntry()).toBe(false);
  });

  it('still asks before throwing away a draft', () => {
    const onBack = vi.fn();
    renderTwiceMounted({ dirty: true, onBack });
    act(() => { vi.advanceTimersByTime(0); });

    pressBack();

    expect(dom.getByTestId('confirm-sheet')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(300); });
    expect(onBack).not.toHaveBeenCalled();
    expect(sheetOwnsAnEntry()).toBe(true);
  });

  it('still leaves nothing behind when it is dismissed by a save', () => {
    const { unmount } = renderTwiceMounted({ onBack: () => {} });
    act(() => { vi.advanceTimersByTime(0); });

    act(() => { unmount(); });
    act(() => { vi.advanceTimersByTime(10); });

    expect(sheetOwnsAnEntry()).toBe(false);
  });
});
