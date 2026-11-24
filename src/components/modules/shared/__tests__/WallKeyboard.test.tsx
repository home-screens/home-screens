// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import modules from '@/translations/en-US/modules.json';
import { DELETE_HOLD_MS, DELETE_REPEAT_MS, WALL_KEYBOARD_IDLE_MS, WallKeyboard, type WallKeyboardProps } from '../WallKeyboard';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function keyboard(locale: string, props: Partial<WallKeyboardProps> = {}) {
  const onKey = vi.fn();
  render(
    <I18nProvider locale={locale} blob={{ modules }}>
      <WallKeyboard P={(n) => n} onKey={onKey} onDelete={() => {}} onAction={() => {}} {...props} />
    </I18nProvider>,
  );
  const root = screen.getByTestId('wall-keyboard');
  const key = (name: string) => root.querySelector<HTMLElement>(`[data-key="${name}"]`);
  const accents = () => [...root.querySelectorAll('[data-row="accents"] [data-key]')].map((el) => el.getAttribute('data-key')).join('');
  return { onKey, root, key, accents };
}

describe('WallKeyboard accent row', () => {
  it('draws the language\'s accented letters on a text keyboard, and types them', () => {
    const { onKey, key, accents } = keyboard('pt-BR', { kind: 'text' });
    expect(accents()).toBe('áâãàéêíóôõú');
    fireEvent.click(key('ã')!);
    expect(onKey).toHaveBeenCalledWith('ã');
  });

  it('makes capitals of them while Shift is lit', () => {
    const { onKey, key, accents } = keyboard('fr-FR', { kind: 'text', shift: true });
    expect(accents()).toBe('ÂÊÎÔÛÙËÏŒ');
    fireEvent.click(key('Œ')!);
    expect(onKey).toHaveBeenCalledWith('Œ');
  });

  it('keeps the row, as small letters, on the 123 page so the keyboard keeps its height', () => {
    const { root, key, accents } = keyboard('es-ES', { kind: 'text', shift: true });
    fireEvent.click(key('numbers')!);
    expect(root.getAttribute('data-page')).toBe('numbers');
    expect(accents()).toBe('áéíóúü');
  });

  it('has no such row where the letters already spell the language', () => {
    for (const locale of ['en-US', 'de-DE', 'da-DK']) {
      const { root } = keyboard(locale, { kind: 'text' });
      expect(root.querySelector('[data-row="accents"]')).toBeNull();
      cleanup();
    }
  });

  it('leaves the recipe search keyboard as it was', () => {
    const { root, key } = keyboard('pt-BR');
    expect(root.querySelector('[data-row="accents"]')).toBeNull();
    expect(key('ã')).toBeNull();
    expect(key('ç')).not.toBeNull();
  });
});

describe('WallKeyboard idle minute', () => {
  it('standing alone, says so a minute after the last key', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const { key } = keyboard('en-US', { onIdle });
    act(() => { vi.advanceTimersByTime(WALL_KEYBOARD_IDLE_MS - 1_000); });
    fireEvent.click(key('a')!);
    act(() => { vi.advanceTimersByTime(WALL_KEYBOARD_IDLE_MS - 1_000); });
    expect(onIdle).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('counts nothing when the sheet around it does the closing', () => {
    vi.useFakeTimers();
    keyboard('en-US', { kind: 'text' });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('WallKeyboard under two hands', () => {
  const finger = (id: number, x = 10, y = 10) => ({ pointerId: id, pointerType: 'touch', clientX: x, clientY: y });

  it('types a key whose finger landed before the last one lifted, where the browser makes no click', () => {
    const { onKey, key } = keyboard('en-US', { kind: 'text' });
    fireEvent.pointerDown(key('a')!, finger(1));
    fireEvent.pointerDown(key('b')!, finger(2));
    fireEvent.pointerUp(key('a')!, finger(1));
    fireEvent.pointerUp(key('b')!, finger(2));
    expect(onKey.mock.calls.map(([k]) => k)).toEqual(['a', 'b']);
  });

  it('types one letter for one tap when the click follows the finger, and two for a double letter', () => {
    const { onKey, key } = keyboard('en-US', { kind: 'text' });
    for (let tap = 0; tap < 2; tap++) {
      fireEvent.pointerDown(key('l')!, finger(1));
      fireEvent.pointerUp(key('l')!, finger(1));
      fireEvent.click(key('l')!);
    }
    expect(onKey.mock.calls.map(([k]) => k)).toEqual(['l', 'l']);
  });

  it('types nothing for a finger that slid off, and still answers a mouse or a keyboard click', () => {
    const { onKey, key } = keyboard('en-US', { kind: 'text' });
    fireEvent.pointerDown(key('a')!, finger(1, 10, 10));
    fireEvent.pointerUp(key('a')!, finger(1, 90, 10));
    expect(onKey).not.toHaveBeenCalled();
    fireEvent.click(key('a')!);
    expect(onKey).toHaveBeenCalledWith('a');
  });
});

describe('WallKeyboard with two fingers on one key', () => {
  it('types a letter for each finger', () => {
    const { onKey, key } = keyboard('en-US', { kind: 'text' });
    const finger = (id: number) => ({ pointerId: id, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerDown(key('z')!, finger(1));
    fireEvent.pointerDown(key('z')!, finger(2));
    fireEvent.pointerUp(key('z')!, finger(1));
    fireEvent.pointerUp(key('z')!, finger(2));
    expect(onKey.mock.calls.map(([k]) => k)).toEqual(['z', 'z']);
  });
});

describe('WallKeyboard delete', () => {
  const finger = { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 };

  it('takes one letter for a tap', () => {
    vi.useFakeTimers();
    const onDelete = vi.fn();
    const { key } = keyboard('en-US', { kind: 'text', onDelete });
    fireEvent.pointerDown(key('delete')!, finger);
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.pointerUp(key('delete')!, finger);
    fireEvent.click(key('delete')!);
    act(() => { vi.advanceTimersByTime(DELETE_HOLD_MS * 3); });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps taking letters while it is held, stops when the finger lifts, and the lift takes no more', () => {
    vi.useFakeTimers();
    const onDelete = vi.fn();
    const { key } = keyboard('en-US', { kind: 'text', onDelete });
    fireEvent.pointerDown(key('delete')!, finger);
    act(() => { vi.advanceTimersByTime(DELETE_HOLD_MS - 10); });
    expect(onDelete).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(10 + DELETE_REPEAT_MS * 5); });
    expect(onDelete).toHaveBeenCalledTimes(6);
    fireEvent.pointerUp(key('delete')!, finger);
    fireEvent.click(key('delete')!);
    act(() => { vi.advanceTimersByTime(DELETE_REPEAT_MS * 10); });
    expect(onDelete).toHaveBeenCalledTimes(6);
    // The next tap is a plain tap again.
    fireEvent.click(key('delete')!);
    expect(onDelete).toHaveBeenCalledTimes(7);
  });

  it('stops when the finger slides off the key', () => {
    vi.useFakeTimers();
    const onDelete = vi.fn();
    const { key } = keyboard('en-US', { kind: 'text', onDelete });
    fireEvent.pointerDown(key('delete')!, finger);
    act(() => { vi.advanceTimersByTime(DELETE_HOLD_MS + DELETE_REPEAT_MS); });
    fireEvent.pointerLeave(key('delete')!, finger);
    const taken = onDelete.mock.calls.length;
    act(() => { vi.advanceTimersByTime(DELETE_REPEAT_MS * 10); });
    expect(onDelete).toHaveBeenCalledTimes(taken);
  });
});
