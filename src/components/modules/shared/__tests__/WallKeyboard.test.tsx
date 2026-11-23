// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import modules from '@/translations/en-US/modules.json';
import { WALL_KEYBOARD_IDLE_MS, WallKeyboard, type WallKeyboardProps } from '../WallKeyboard';

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
