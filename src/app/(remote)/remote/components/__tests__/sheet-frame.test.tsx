// @vitest-environment jsdom

/**
 * The frame every phone sheet is drawn in, and the layer scale it stands on.
 * The sheets used to disagree on the way out (a 40px X, a round X, "Done",
 * "Cancel", or nothing), on width, on room for the home bar, and on their
 * stacking number, which put the grown-up code pad and error toasts under the
 * sheets they answered.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Check } from 'lucide-react';

vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));
vi.mock('@/hooks/useCustomIcons', () => ({ useCustomIcons: () => ({ icons: [], byId: new Map(), loaded: true }) }));

let asker: ((why: string) => Promise<boolean>) | null = null;
vi.mock('@/lib/grown-up-client', async (original) => ({
  ...(await original<typeof import('@/lib/grown-up-client')>()),
  registerGrownUpAsker: (next: (why: string) => Promise<boolean>) => {
    asker = next;
    return () => { asker = null; };
  },
}));

import SheetFrame from '../SheetFrame';
import BottomSheet from '../BottomSheet';
import TallSheet from '../TallSheet';
import ConfirmSheet from '../ConfirmSheet';
import ChoreActionSheet from '../ChoreActionSheet';
import DayCompleteSheet from '../DayCompleteSheet';
import RemoteToast from '../RemoteToast';
import { GrownUpSheetLayer } from '../GrownUpSheet';
import { REMOTE_LAYERS } from '../remote-layers';
import { dismissToast, showToast } from '../../remote-toast';

/** The fixed layer a sheet's panel stands in. */
function layerOf(dialog: HTMLElement): number {
  return Number(dialog.parentElement!.style.zIndex);
}

beforeEach(() => {
  window.history.replaceState(null, '', '/remote');
});
afterEach(() => {
  cleanup();
  act(() => dismissToast());
});

describe('SheetFrame', () => {
  it('has one way out: a 44px close control that gives feedback when pressed', () => {
    const onClose = vi.fn();
    render(<BottomSheet title="New list" onClose={onClose}><input aria-label="Name" /></BottomSheet>);
    const close = screen.getByTestId('sheet-close');
    expect(close.style.width).toBe('44px');
    expect(close.style.height).toBe('44px');
    expect(close.className).toContain('press-btn');
    expect(close.getAttribute('aria-label')).toBe('actions.close');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives the tall sheets the same title row and close control', () => {
    const onClose = vi.fn();
    render(<TallSheet label="Dinner, Thursday" title="Dinner" subtitle="Thursday" onClose={onClose}><p>body</p></TallSheet>);
    expect(screen.getByRole('heading', { name: 'Dinner' })).toBeTruthy();
    expect(screen.getByText('Thursday')).toBeTruthy();
    fireEvent.click(screen.getByTestId('sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drops the chore menu’s second Cancel, leaving the one close control', () => {
    render(
      <ChoreActionSheet
        title="Dishes"
        subtitle="Today"
        actions={[{ id: 'tick', label: 'Done for Avery', icon: Check, onSelect: () => {} }]}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByTestId('sheet-close')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'actions.cancel' })).toBeNull();
  });

  it('is no wider than the page, the questions on a family tablet included', () => {
    // (The home bar's room is `max(…, env(safe-area-inset-bottom))`, which
    // jsdom's style parser drops; a browser keeps it.)
    render(<ConfirmSheet title="Delete it?" description="Gone for good." confirmLabel="Delete" onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Delete it?' }).style.maxWidth).toBe('640px');
  });

  it('closes from the dimmed area, and not while it says it cannot be closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(<SheetFrame layer="sheet" label="Your icon" title="Dino" onClose={onClose}><span /></SheetFrame>);
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Busy keeping something: no way out until it is done.
    rerender(<SheetFrame layer="sheet" label="Your icon" title="Dino"><span /></SheetFrame>);
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect((screen.getByTestId('sheet-close') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a tap on the dimmed area that comes as it opens', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<SheetFrame layer="grownUp" label="Grown-up code" onClose={onClose} settleMs={300}><span /></SheetFrame>);
      fireEvent.click(screen.getByTestId('sheet-backdrop'));
      expect(onClose).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(400); });
      fireEvent.click(screen.getByTestId('sheet-backdrop'));
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves focus on a field that focused itself as the sheet opened', () => {
    render(
      <BottomSheet title="New list" onClose={() => {}}>
        <input aria-label="Name" autoFocus />
      </BottomSheet>,
    );
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }));
  });

  it('draws through a portal at the end of the page and still holds focus there', async () => {
    const onClose = vi.fn();
    const { container } = render(<SheetFrame layer="sheetOverSheet" portal label="Your icon" onClose={onClose}><button type="button">Save</button></SheetFrame>);
    const dialog = await screen.findByRole('dialog', { name: 'Your icon' });
    expect(container.contains(dialog)).toBe(false);
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('the all done sheet', () => {
  const wren = { id: 'm-wren', name: 'Wren', emoji: '', color: '#4ade80', createdAt: '', updatedAt: '' };

  it('is a sheet like the others: over the sheets, closed by Escape and the dimmed area', () => {
    const onClose = vi.fn();
    render(<DayCompleteSheet member={wren} done={3} total={3} tickets={5} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'choresTab.dayComplete.title' });
    expect(dialog.getAttribute('data-testid')).toBe('day-complete-sheet');
    expect(dialog.className).toContain('hs-pop-in');
    expect(layerOf(dialog)).toBe(REMOTE_LAYERS.sheetOverSheet);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('leaves the page live on the grown-up phone: nothing dimmed, taps beside it reach the page', () => {
    render(<DayCompleteSheet member={wren} done={3} total={3} tickets={5} onClose={() => {}} modal={false} />);
    const dialog = screen.getByRole('dialog');
    expect(screen.queryByTestId('sheet-backdrop')).toBeNull();
    expect(dialog.parentElement!.style.pointerEvents).toBe('none');
    expect(dialog.style.pointerEvents).toBe('auto');
  });

  it('takes a Back entry, so Back closes it rather than leaving the page', () => {
    const before = window.history.length;
    render(<DayCompleteSheet member={wren} done={1} total={1} tickets={2} onClose={() => {}} />);
    expect(window.history.length).toBeGreaterThan(before);
  });
});

describe('the phone’s layer scale', () => {
  it('ranks each rung over the one before it', () => {
    const order = ['pageChrome', 'form', 'sheet', 'sheetOverSheet', 'confirm', 'grownUp', 'toast'] as const;
    for (let i = 1; i < order.length; i += 1) {
      expect(REMOTE_LAYERS[order[i]]).toBeGreaterThan(REMOTE_LAYERS[order[i - 1]]);
    }
    expect(Object.keys(REMOTE_LAYERS).sort()).toEqual([...order].sort());
  });

  it('opens the grown-up code pad over the question that asked for it', async () => {
    render(
      <>
        <BottomSheet title="Every time?" layer="confirm" onClose={() => {}}><span /></BottomSheet>
        <ConfirmSheet title="Remove Swim?" description="From the family calendar." confirmLabel="Remove" onConfirm={() => {}} onCancel={() => {}} />
        <GrownUpSheetLayer />
      </>,
    );
    let answer: Promise<boolean> | undefined;
    act(() => { answer = asker!('To remove Swim'); });
    const pad = screen.getByTestId('grown-up-sheet');
    expect(layerOf(pad)).toBeGreaterThan(layerOf(screen.getByRole('dialog', { name: 'Remove Swim?' })));
    expect(layerOf(pad)).toBeGreaterThan(layerOf(screen.getByRole('dialog', { name: 'Every time?' })));

    // A real dialog now: Escape is Cancel.
    expect(pad.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(pad, { key: 'Escape' });
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByTestId('grown-up-sheet')).toBeNull();
  });

  it('shows a toast over an open sheet and over the code pad', () => {
    render(
      <>
        <BottomSheet title="Rename folder" onClose={() => {}}><span /></BottomSheet>
        <GrownUpSheetLayer />
        <RemoteToast />
      </>,
    );
    act(() => { void asker!('To rename it'); });
    act(() => showToast("Couldn't rename that folder.", 'error'));
    const toastLayer = Number(screen.getByTestId('remote-toast').parentElement!.style.zIndex);
    expect(toastLayer).toBeGreaterThan(layerOf(screen.getByRole('dialog', { name: 'Rename folder' })));
    expect(toastLayer).toBeGreaterThan(layerOf(screen.getByTestId('grown-up-sheet')));
  });
});
