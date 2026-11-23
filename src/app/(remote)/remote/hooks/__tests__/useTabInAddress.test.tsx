// @vitest-environment jsdom

/**
 * The tab in the address, beside the history entries the phone's overlays
 * hold. A card that leaves the page live (the grown-up's "all done" card on
 * a tablet) can still be up when a tab is tapped. Writing the new tab into
 * the address then must not wipe the card's entry off the history state, or
 * the entry is never given back and the next Back does nothing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));

import SheetFrame from '../../components/SheetFrame';
import { useTabInAddress } from '../useTabInAddress';

/** The overlays standing on the entry the page is on, bottom first. */
function stack(): string[] {
  return (window.history.state as { hsSheets?: string[] } | null)?.hsSheets ?? [];
}

/** Let every queued give-back and traversal run. */
function settle() {
  for (let i = 0; i < 4; i += 1) act(() => { vi.advanceTimersByTime(10); });
}

const address = () => window.location.pathname + window.location.search;

/** Two tabs; Chores can draw a card that leaves the tab bar live. */
function Remote({ card = false }: { card?: boolean }) {
  const [tab, setTab] = useState('chores');
  useTabInAddress(tab);
  return (
    <>
      {tab === 'chores' && card && (
        <SheetFrame layer="sheetOverSheet" label="All done" dim={false} onClose={() => {}}><p>All done!</p></SheetFrame>
      )}
      <p>showing {tab}</p>
      {['control', 'chores', 'photos'].map((id) => (
        <button key={id} type="button" onClick={() => setTab(id)}>{id}</button>
      ))}
    </>
  );
}

let popped: number;
const countPop = () => { popped += 1; };

beforeEach(() => {
  vi.useFakeTimers();
  popped = 0;
  // An entry of its own to start from, so a Back that leaves the remote is one the test can see land.
  window.history.pushState(null, '', '/before-the-remote');
  window.history.pushState(null, '', '/remote?tab=chores');
  window.addEventListener('popstate', countPop);
});
afterEach(() => {
  window.removeEventListener('popstate', countPop);
  cleanup();
  vi.useRealTimers();
});

describe('the tab in the address', () => {
  it('follows plain tab changes without adding or dropping a history entry', () => {
    render(<Remote />);
    settle();
    const entries = window.history.length;

    fireEvent.click(screen.getByRole('button', { name: 'photos' }));
    settle();
    expect(address()).toBe('/remote?tab=photos');
    fireEvent.click(screen.getByRole('button', { name: 'control' }));
    settle();
    expect(address()).toBe('/remote');
    fireEvent.click(screen.getByRole('button', { name: 'chores' }));
    settle();
    expect(address()).toBe('/remote?tab=chores');

    expect(window.history.length).toBe(entries);
    expect(popped).toBe(0);

    // One Back leaves the remote: no tab change left a step behind.
    act(() => { window.history.back(); });
    settle();
    expect(address()).toBe('/before-the-remote');
  });

  it('keeps whatever else the history entry holds', () => {
    window.history.replaceState({ kept: 'by the page' }, '', '/remote?tab=chores');
    render(<Remote />);
    fireEvent.click(screen.getByRole('button', { name: 'photos' }));
    settle();
    expect(window.history.state).toEqual({ kept: 'by the page' });
  });

  it('gives back the entry of a card that was up when the tab changed, so the next Back leaves the remote', () => {
    render(<Remote card />);
    settle();
    expect(stack()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'photos' }));
    settle();
    expect(screen.queryByRole('dialog', { name: 'All done' })).toBeNull();
    expect(screen.getByText('showing photos')).toBeTruthy();
    // The card's entry went with it, in one step back that nobody pressed.
    expect(stack()).toHaveLength(0);
    expect(popped).toBe(1);
    // The entry it landed on was written for the Chores tab: the address follows the tab showing.
    expect(address()).toBe('/remote?tab=photos');

    act(() => { window.history.back(); });
    settle();
    expect(address()).toBe('/before-the-remote');
  });

  it('stops following Back once the page is gone', () => {
    const { unmount } = render(<Remote />);
    fireEvent.click(screen.getByRole('button', { name: 'photos' }));
    settle();
    // Two entries on the remote's own page, neither naming the tab that was showing.
    window.history.replaceState(null, '', '/remote?tab=chores');
    window.history.pushState(null, '', '/remote');
    unmount();
    act(() => { window.history.back(); });
    settle();
    expect(popped).toBe(1);
    expect(address()).toBe('/remote?tab=chores');
  });
});
