// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import core from '@/translations/en-US/core.json';
import modules from '@/translations/en-US/modules.json';
import { WallAddSheet, type WallAddResult } from '../WallAddSheet';
import { WALL_KEYBOARD_IDLE_MS } from '../WallKeyboard';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** An Add the test answers when it chooses, like a hub taking its time. */
function slowAdd() {
  let settle: { resolve: (result: WallAddResult) => void; reject: (err: unknown) => void } | null = null;
  const onAdd = vi.fn((_: string) => new Promise<WallAddResult>((resolve, reject) => { settle = { resolve, reject }; }));
  return {
    onAdd,
    land: async (result: WallAddResult) => { await act(async () => { settle?.resolve(result); }); },
    fail: async (err: unknown) => { await act(async () => { settle?.reject(err); }); },
  };
}

function open(onAdd: (text: string) => Promise<WallAddResult>, onClose: () => void = vi.fn()) {
  render(
    <I18nProvider locale="en-US" blob={{ core, modules }}>
      <WallAddSheet listName="Shopping" accent="#3b82f6" onAdd={onAdd} onClose={onClose} />
    </I18nProvider>,
  );
  const keyboard = screen.getByTestId('wall-keyboard');
  const tap = (key: string) => fireEvent.click(within(keyboard).getByText((_, el) => el?.getAttribute('data-key') === key));
  const type = (keys: string[]) => { for (const key of keys) tap(key); };
  const words = () => screen.getByTestId('wall-text-field-words').textContent?.replace(modules.wallAdd.placeholder, '') ?? '';
  return { tap, type, words, onClose };
}

describe('WallAddSheet', () => {
  it('adds what was typed, empties the box and shows it with Undo', async () => {
    const add = slowAdd();
    const { type, tap, words } = open(add.onAdd);
    type(['M', 'i', 'l', 'k']);
    tap('action');
    expect(add.onAdd).toHaveBeenCalledWith('Milk');
    await add.land({ outcome: 'added', text: 'Milk', undo: async () => {} });
    expect(words()).toBe('');
    expect(screen.getByTestId('wall-add-chip').textContent).toContain('Milk');
    expect(screen.getByTestId('wall-add-undo')).toBeTruthy();
  });

  it('holds the keys while an Add is on its way, so nothing typed then is wiped with the box', async () => {
    const add = slowAdd();
    const { type, tap, words } = open(add.onAdd);
    type(['M', 'i', 'l', 'k']);
    tap('action');
    type(['e', 'g']);
    tap('delete');
    expect(words()).toBe('Milk');
    await add.land({ outcome: 'added', text: 'Milk' });
    expect(words()).toBe('');
    // The keys work again for the next thing.
    type(['E', 'g', 'g', 's']);
    expect(words()).toBe('Eggs');
    expect(add.onAdd).toHaveBeenCalledTimes(1);
  });

  it('says what went wrong with an Add even when keys were tapped while it was on its way', async () => {
    const add = slowAdd();
    const { type, tap, words } = open(add.onAdd);
    type(['M', 'i', 'l', 'k']);
    tap('action');
    type(['e', 'g']);
    await add.fail(new Error('nope'));
    expect(words()).toBe('Milk');
    expect(screen.getByTestId('wall-add-problem').textContent).toBe(modules.wallAdd.failed);
    // The message goes once the words change, as before.
    tap('s');
    expect(screen.queryByTestId('wall-add-problem')).toBeNull();
  });

  it('sends the words once for two quick taps on Add', async () => {
    const add = slowAdd();
    const { type, tap } = open(add.onAdd);
    type(['M', 'i', 'l', 'k']);
    tap('action');
    tap('action');
    expect(add.onAdd).toHaveBeenCalledTimes(1);
    await add.land({ outcome: 'added', text: 'Milk' });
  });

  it('stays open while it is being touched anywhere, and closes a minute after the last touch', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { type, tap } = open(async (text) => ({ outcome: 'added', text, undo: async () => {} }), onClose);
    type(['M', 'i', 'l', 'k']);
    await act(async () => { tap('action'); });
    expect(screen.getByTestId('wall-add-chip')).toBeTruthy();

    // A touch that is not a key (reading the chips, reaching for Undo) counts.
    act(() => { vi.advanceTimersByTime(WALL_KEYBOARD_IDLE_MS - 5_000); });
    fireEvent.pointerDown(screen.getByTestId('wall-add-chips'));
    act(() => { vi.advanceTimersByTime(6_000); });
    expect(onClose).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(WALL_KEYBOARD_IDLE_MS - 6_000); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
