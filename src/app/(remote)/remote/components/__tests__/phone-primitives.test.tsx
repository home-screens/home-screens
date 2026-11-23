// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { ListTodo } from 'lucide-react';
import core from '@/translations/en-US/core.json';
import remote from '@/translations/en-US/remote.json';
import { I18nProvider } from '@/i18n/provider';
import SegmentedTabs from '../SegmentedTabs';
import TickRow, { TICK_DONE_OPACITY } from '../TickRow';
import { LoadFailed } from '../RetryButton';
import EmptyState from '../EmptyState';
import ChipButton from '../ChipButton';
import IconButton from '../IconButton';
import TabHeader, { GearButton } from '../TabHeader';
import SquareAddButton from '../SquareAddButton';
import { REMOTE_ACCENT } from '../remote-styles';

/**
 * The phone's shared pieces: what a screen reader hears from each, and the
 * 44 px a finger gets. jsdom does no layout, so sizes are read off the
 * inline styles.
 */

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider locale="en-US" blob={{ core, remote }}>{children}</I18nProvider>;
}

afterEach(() => cleanup());

function tapHeight(el: HTMLElement): number {
  return parseFloat(el.style.minHeight || el.style.height || '0');
}

function Pages() {
  const [page, setPage] = useState<'week' | 'plan' | 'grocery'>('week');
  return (
    <SegmentedTabs
      ariaLabel="Meals"
      value={page}
      onChange={setPage}
      tabs={[
        { id: 'week', label: 'Week' },
        { id: 'plan', label: 'Plan', count: 3 },
        { id: 'grocery', label: 'Grocery' },
      ]}
    />
  );
}

describe('SegmentedTabs', () => {
  it('is a tab list that says which page is on, at 44 px a tab', () => {
    render(<Pages />);
    expect(screen.getByRole('tablist', { name: 'Meals' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    for (const tab of tabs) expect(tapHeight(tab)).toBeGreaterThanOrEqual(44);
    // Only the page on now is in the tab order; the arrows reach the rest.
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole('tab', { name: 'Plan 3' })).toBeTruthy();
  });

  it('moves with a tap, the arrow keys, Home and End', () => {
    render(<Pages />);
    fireEvent.click(screen.getByRole('tab', { name: 'Grocery' }));
    expect(screen.getByRole('tab', { name: 'Grocery' }).getAttribute('aria-selected')).toBe('true');

    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Week' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Week' }));
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Grocery' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Week' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Grocery' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('TickRow', () => {
  it('is a checkbox with its state, a 24 px box, and the one done fade', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<TickRow label="Milk" trailing={<span>2 cups</span>} checked={false} onToggle={onToggle} />);
    const row = screen.getByRole('checkbox', { name: /^Milk\s*2 cups$/ });
    expect(row.getAttribute('aria-checked')).toBe('false');
    expect(row.style.opacity).toBe('1');
    expect(tapHeight(row)).toBeGreaterThanOrEqual(44);
    fireEvent.click(row);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<TickRow label="Milk" checked onToggle={onToggle} />);
    const done = screen.getByRole('checkbox', { name: 'Milk' });
    expect(done.getAttribute('aria-checked')).toBe('true');
    expect(Number(done.style.opacity)).toBe(TICK_DONE_OPACITY);
    const box = done.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(box.style.width).toBe('24px');
  });

  it('keeps its own name when asked, and says a tick still on its way is busy', () => {
    render(<TickRow label="Oat milk" ariaLabel="Oat milk" trailing={<span>Today</span>} pending checked={false} onToggle={() => {}} />);
    const row = screen.getByRole('checkbox', { name: 'Oat milk' });
    expect(row.getAttribute('aria-busy')).toBe('true');
  });
});

describe('LoadFailed', () => {
  it('says why and shows the retry under way on the button', async () => {
    let finish: () => void = () => {};
    const onRetry = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<LoadFailed testId="lists-failed" message="Couldn't load your lists." onRetry={onRetry} />, { wrapper });
    expect(screen.getByRole('alert').textContent).toBe("Couldn't load your lists.");
    const button = screen.getByRole('button', { name: remote.loadFailed.retry });
    expect(tapHeight(button)).toBeGreaterThanOrEqual(44);

    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    await act(async () => finish());
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('EmptyState', () => {
  it('draws the title, the line under it and the action', () => {
    render(<EmptyState testId="empty" icon={ListTodo} title="Nothing here yet" body="Add the first one below." action={<button type="button">Add</button>} />);
    const empty = screen.getByTestId('empty');
    expect(empty.textContent).toContain('Nothing here yet');
    expect(empty.textContent).toContain('Add the first one below.');
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });
});

describe('ChipButton and IconButton', () => {
  it('reserve 44 px around a 36 px chip, and a toggle says whether it is on', () => {
    render(
      <>
        <ChipButton selected onClick={() => {}}>Favorites</ChipButton>
        <ChipButton onClick={() => {}}>Select</ChipButton>
      </>,
    );
    const toggle = screen.getByRole('button', { name: 'Favorites' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(tapHeight(toggle)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(toggle.style.minWidth)).toBeGreaterThanOrEqual(44);
    expect((toggle.firstElementChild as HTMLElement).style.height).toBe('36px');
    expect(screen.getByRole('button', { name: 'Select' }).hasAttribute('aria-pressed')).toBe(false);
  });

  it('give an icon its name and a 44 px square', () => {
    render(<IconButton label="Close" onClick={() => {}}><span /></IconButton>);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.style.width).toBe('44px');
    expect(close.style.height).toBe('44px');
  });
});

describe('TabHeader', () => {
  it('puts the eyebrow over a heading and the gear beside it at 44 px', () => {
    render(<TabHeader eyebrow="Monday" title="Meals" actions={<GearButton label="Meal settings" onClick={() => {}} />} />);
    expect(screen.getByRole('heading', { name: 'Meals' })).toBeTruthy();
    expect(screen.getByText('Monday')).toBeTruthy();
    const gear = screen.getByRole('button', { name: 'Meal settings' });
    expect(gear.style.width).toBe('44px');
    expect(gear.style.height).toBe('44px');
  });
});

describe('SquareAddButton', () => {
  function amber(el: HTMLElement): boolean {
    const probe = document.createElement('div');
    probe.style.background = REMOTE_ACCENT;
    return el.style.background === probe.style.background;
  }

  it('is a named 48 px amber submit square, quiet while nothing is typed', () => {
    const { rerender } = render(<form><SquareAddButton label="Add to Groceries" /></form>);
    const add = screen.getByRole('button', { name: 'Add to Groceries' });
    expect(add.getAttribute('type')).toBe('submit');
    expect(add.style.width).toBe('48px');
    expect(add.style.height).toBe('48px');
    expect(amber(add)).toBe(true);

    rerender(<form><SquareAddButton label="Add to Groceries" idle disabled /></form>);
    expect(amber(add)).toBe(false);
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });

  it('says an add on its way is busy, and can be a plain button that opens a form', () => {
    const onClick = vi.fn();
    const { rerender } = render(<SquareAddButton label="Add a note" busy />);
    const add = screen.getByRole('button', { name: 'Add a note' });
    expect(add.getAttribute('aria-busy')).toBe('true');

    rerender(<SquareAddButton label="Add a note" type="button" onClick={onClick} />);
    expect(add.getAttribute('type')).toBe('button');
    expect(add.hasAttribute('aria-busy')).toBe(false);
    fireEvent.click(add);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
